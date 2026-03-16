// lobbyManager.js
const mongoose = require("mongoose");
const gameSessionManager = require("../game/gameSessionManager");
const { clearActiveTimer, proceedToNextRound } = require("../game/gameSocket");

// In-memory room state: roomId => { hostId, settings, teams, chat }
const rooms = {};

function createLobbyManager(io, UserModel) {
  // Helper: find a socket by userId
  function findSocketByUserId(userId) {
    for (let [, s] of io.sockets.sockets) {
      if (s.userId === userId) return s;
    }
    return null;
  }

  async function forceLeaveRoom(userId, roomId, currentSocket = null) {
      const room = rooms[roomId];
      if (!room) return;
      
      let userDisplayName = "A player";
      if (userId.startsWith("guest_")) {
        userDisplayName = currentSocket?.displayName || "Guest";
      } else if (mongoose.Types.ObjectId.isValid(userId)) {
        const user = await UserModel.findById(userId);
        if (user) userDisplayName = user.displayName;
      }

      // Clear 10s disconnect timers
      if (room.hostDisconnectTimeout && room.hostId === userId) {
         clearTimeout(room.hostDisconnectTimeout);
         room.hostDisconnectTimeout = null;
      }
      if (room.playerDisconnectTimeouts?.[userId]) {
         clearTimeout(room.playerDisconnectTimeouts[userId]);
         delete room.playerDisconnectTimeouts[userId];
      }

      const session = gameSessionManager.getSession(roomId);

      // host force leave
      // delete the room, and disconnect all other players
      if (room.hostId === userId) {
         console.log(`[forceLeaveRoom] Host ${userId} leaving ${roomId}. Kicking everyone.`);
         io.to(roomId).emit("hostDisconnectedOthers", { hostName: userDisplayName, hostId: userId });
         if (session) {
             gameSessionManager.deleteSession(roomId);
         }
         delete rooms[roomId];
         
         const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
         if (socketsInRoom) {
            for (const sid of socketsInRoom) {
               const s = io.sockets.sockets.get(sid);
               if (s) {
                 s.leave(roomId);
                 if (s.roomId === roomId) s.roomId = null;
               }
            }
         }
      } 
      // player force leave
      // remove player from game, and update teams and turn order
      else {
         console.log(`[forceLeaveRoom] Player ${userId} leaving ${roomId}.`);
         if (session) {
            const kickResult = gameSessionManager.kickPlayer(roomId, userId);
            if (kickResult) {
                const { isCurrentDrawer, kickedPlayer } = kickResult;
                io.to(roomId).emit("playerRemoved", { userId, displayName: kickedPlayer.displayName });
                io.to(roomId).emit("updatePlayers", gameSessionManager.getPlayersWithScores(roomId));
                if (isCurrentDrawer) {
                    clearActiveTimer(roomId);
                    proceedToNextRound(io, roomId, kickedPlayer);
                }
            }
         }
         room.teams.Red = room.teams.Red.filter((id) => id !== userId);
         room.teams.Blue = room.teams.Blue.filter((id) => id !== userId);
         io.to(roomId).emit("teamsUpdate", room.teams);
         io.to(roomId).emit("userLeftLobby", { userId });

         const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
         if (socketsInRoom) {
            for (const sid of socketsInRoom) {
               const s = io.sockets.sockets.get(sid);
               if (s && s.userId === userId) {
                 s.leave(roomId);
                 if (s.roomId === roomId) s.roomId = null;
               }
            }
         }
      }
  }

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // CREATE ROOM
    socket.on("createRoom", async ({ userId, roomId, displayName }) => {
      // create room if not existing
      if (!rooms[roomId]) {
        rooms[roomId] = {
          hostId: userId,
          settings: { rounds: 1, timer: 30, difficulty: "Easy", guesses: 3 },
          teams: { Red: [], Blue: [] },
          chat: [],
        };
        console.log(`Room ${roomId} is created by ${displayName}`);
      } else {
        console.log("Room is already created! Navigating to the lobby");
      }
    });

    // --- REGISTER LOBBY ---
    socket.on("registerLobby", async ({ userId, roomId, displayName }) => {
      socket.userId = userId;
      socket.displayName = displayName; // Store for guests

      // Before joining the new room, leave any other rooms
      for (const existingRoomId of Object.keys(rooms)) {
        if (existingRoomId !== roomId) {
          const r = rooms[existingRoomId];
          const session = gameSessionManager.getSession(existingRoomId);
          const inTeam = r.teams.Red.includes(userId) || r.teams.Blue.includes(userId);
          const isHost = r.hostId === userId;
          const inSession = session && session.players.some(p => p.userId === userId);

          if (inTeam || isHost || inSession) {
             console.log(`[registerLobby] User ${userId} is joining ${roomId} but was in ${existingRoomId}. Forcing leave.`);
             await forceLeaveRoom(userId, existingRoomId, socket);
          }
        }
      }

      socket.roomId = roomId;
      socket.join(roomId);

      // create room if missing
      // if (!rooms[roomId]) {
      //   rooms[roomId] = {
      //     hostId: userId,
      //     settings: { rounds: 3, timer: 60, difficulty: "Medium", guesses: 4 },
      //     teams: { Red: [], Blue: [] },
      //     chat: [],
      //   };
      if (rooms[roomId].hostId === userId && rooms[roomId].hostDisconnectTimeout) {
        // Host returned before the 10-second timeout expired
        clearTimeout(rooms[roomId].hostDisconnectTimeout);
        rooms[roomId].hostDisconnectTimeout = null;
        console.log(`[registerLobby] Host ${userId} returned to ${roomId}. Resuming game.`);
        io.to(roomId).emit("gameResumed", { hostName: displayName || "Host" });
        gameSessionManager.resumeTimer(roomId);
      } else if (rooms[roomId]?.playerDisconnectTimeouts?.[userId]) {
        // Player returned before the 10-second timeout expired
        clearTimeout(rooms[roomId].playerDisconnectTimeouts[userId]);
        delete rooms[roomId].playerDisconnectTimeouts[userId];
        console.log(`[registerLobby] Player ${userId} returned to ${roomId} in time.`);
        io.to(roomId).emit("playerReconnected", { userId, displayName });
        gameSessionManager.resumeTimer(roomId);
      }

      // broadcast current room state (host, teams, settings)
      io.to(roomId).emit("hostSet", rooms[roomId].hostId);
      io.to(roomId).emit("teamsUpdate", rooms[roomId].teams);
      io.to(roomId).emit("gameSettingsUpdate", rooms[roomId].settings);

      // Handle both guests and registered users
      if (userId.startsWith("guest_")) {
        // Guest user - use provided displayName
        console.log(`[registerLobby] Guest ${userId} joined: ${displayName}`);

        io.to(roomId).emit("userJoinedLobby", {
          userId: userId,
          displayName: displayName || "Guest",
          avatarSeed: displayName || "guest",
          avatarStyle: "funEmoji",
          avatarData: null,
        });
      } else {
        // Registered user - fetch from MongoDB
        if (mongoose.Types.ObjectId.isValid(userId)) {
          const user = await UserModel.findByIdAndUpdate(
            userId,
            { isOnline: true },
            { new: true },
          );
          if (user) {
            io.to(roomId).emit("userJoinedLobby", {
              userId: user._id.toString(),
              displayName: user.displayName,
              avatarSeed: user.avatarSeed,
              avatarStyle: user.avatarStyle,
              avatarData: user.avatarData,
            });
          }
        }
      }
    });

    // --- JOIN TEAM ---
    socket.on("joinTeam", ({ roomId, teamColor, userId }) => {
      const room = rooms[roomId];
      if (!room || !["Red", "Blue"].includes(teamColor)) return;

      room.teams.Red = room.teams.Red.filter((id) => id !== userId);
      room.teams.Blue = room.teams.Blue.filter((id) => id !== userId);
      room.teams[teamColor].push(userId);

      io.to(roomId).emit("teamsUpdate", room.teams);
    });

    // --- LEAVE TEAM ---
    socket.on("leaveTeam", ({ roomId, userId }) => {
      const room = rooms[roomId];
      if (!room) return;

      room.teams.Red = room.teams.Red.filter(
        (id) => String(id) !== String(userId),
      );
      room.teams.Blue = room.teams.Blue.filter(
        (id) => String(id) !== String(userId),
      );

      io.to(roomId).emit("teamsUpdate", room.teams);
      socket.emit("leftTeam", { ok: true });
    });

    // --- REQUEST USERS IN LOBBY ---
    socket.on("requestLobbyUsers", async ({ roomId }) => {
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      const users = [];
      if (socketsInRoom) {
        for (const sid of socketsInRoom) {
          const s = io.sockets.sockets.get(sid);
          if (s?.userId) {
            // Handle guests
            if (s.userId.startsWith("guest_")) {
              // Guest user - use socket data
              users.push({
                userId: s.userId,
                displayName: s.displayName || "Guest",
                avatarSeed: s.displayName || "guest",
                avatarStyle: "funEmoji",
                avatarData: null,
              });
            } else if (mongoose.Types.ObjectId.isValid(s.userId)) {
              // Registered user - fetch from MongoDB
              const user = await UserModel.findById(s.userId);
              if (user) {
                users.push({
                  userId: user._id.toString(),
                  displayName: user.displayName,
                  avatarSeed: user.avatarSeed,
                  avatarStyle: user.avatarStyle,
                  avatarData: user.avatarData,
                });
              }
            }
          }
        }
      }
      socket.emit("lobbyUsers", users);
    });

    // --- GET HOST (explicit fetch to avoid race) ---
    socket.on("getHost", ({ roomId }) => {
      if (rooms[roomId]) {
        socket.emit("hostSet", rooms[roomId].hostId);
      }
    });

    // --- TEAM INVITES (kept) ---
    socket.on("createTeam", ({ roomId, teamName }) => {
      io.to(roomId).emit("teamCreated", { teamName, by: socket.userId });
    });

    socket.on("inviteToTeam", ({ targetUserId, teamName }) => {
      const target = findSocketByUserId(targetUserId);
      if (target) {
        target.emit("teamInviteReceived", {
          fromUserId: socket.userId,
          teamName,
        });
      } else {
        socket.emit("inviteFailed", { targetUserId });
      }
    });

    socket.on("acceptTeamInvite", ({ roomId, teamName }) => {
      io.to(roomId).emit("userJoinedTeam", {
        userId: socket.userId,
        teamName,
      });
    });

    // --- PROFILE UPDATES (kept) ---
    socket.on(
      "updateProfile",
      async ({ displayName, avatarSeed, avatarStyle }) => {
        try {
          if (!socket.userId) return;
          await UserModel.findByIdAndUpdate(socket.userId, {
            ...(displayName && { displayName }),
            ...(avatarSeed && { avatarSeed }),
            ...(avatarStyle && { avatarStyle }),
            ...(avatarData && { avatarData }),
          });
          const payload = {
            userId: socket.userId,
            ...(displayName && { displayName }),
            ...(avatarSeed && { avatarSeed }),
            ...(avatarStyle && { avatarStyle }),
            ...(avatarData && { avatarData }),
          };
          if (socket.roomId) {
            io.to(socket.roomId).emit("profileUpdated", payload);
          } else {
            socket.emit("profileUpdated", payload);
          }
        } catch (e) {
          console.error("updateProfile error", e);
        }
      },
    );

    // --- HOST SETTINGS (kept, event name aligned with client) ---
    socket.on("updateGameSettings", ({ roomId, newSettings }) => {
      const room = rooms[roomId];
      if (room && socket.userId === room.hostId) {
        room.settings = { ...room.settings, ...newSettings };
        io.to(roomId).emit("gameSettingsUpdate", room.settings);
      }
    });

    // --- START GAME (added minimal flow to avoid "blank page") ---
    socket.on(
      "startGame",
      async ({ gameId, totalRounds, timer, difficulty }) => {
        const room = rooms[gameId];
        if (
          !room ||
          socket.userId !== room.hostId ||
          room.teams.Red.length < 2 ||
          room.teams.Blue.length < 2
        ) {
          io.to(socket.id).emit("startGameError", {
            message:
              "Only the host can start, and both teams must have at least 2 players.",
          });
          return;
        }

        // persist chosen settings
        room.settings = {
          rounds: totalRounds ?? room.settings.rounds,
          timer: timer ?? room.settings.timer,
          difficulty: difficulty ?? room.settings.difficulty,
        };
        io.to(gameId).emit("gameSettingsUpdate", room.settings);

        // choose first player (very simple demo logic)
        const firstPlayerId =
          (room.teams.Red && room.teams.Red[0]) ||
          (room.teams.Blue && room.teams.Blue[0]);

        let currentPlayerName = firstPlayerId;
        if (firstPlayerId && mongoose.Types.ObjectId.isValid(firstPlayerId)) {
          try {
            const u =
              await UserModel.findById(firstPlayerId).select("displayName");
            if (u?.displayName) currentPlayerName = u.displayName;
          } catch {
            /* ignore */
          }
        }

        // tell clients to enter play screen
        io.to(gameId).emit("roundStarted", {
          currentRound: 1,
          currentPlayer: currentPlayerName,
          timer: room.settings.timer,
        });

        // kick off a room timer broadcast (client shows countdown)
        io.to(gameId).emit("startTimer", { duration: room.settings.timer });
      },
    );

    // --- RESET / RANDOMIZE / KICK (kept) ---
    socket.on("resetTeams", ({ roomId }) => {
      const room = rooms[roomId];
      if (room && socket.userId === room.hostId) {
        room.teams.Red = [];
        room.teams.Blue = [];
        io.to(roomId).emit("teamsUpdate", room.teams);
      }
    });

    socket.on("randomizeTeams", ({ roomId }) => {
      const room = rooms[roomId];
      if (room && socket.userId === room.hostId) {
        const userIds = Array.from(io.sockets.adapter.rooms.get(roomId) || [])
          .map((sid) => io.sockets.sockets.get(sid))
          .filter((s) => s && s.userId)
          .map((s) => s.userId);

        const shuffled = userIds.slice().sort(() => Math.random() - 0.5);
        const mid = Math.ceil(shuffled.length / 2);
        room.teams.Red = shuffled.slice(0, mid);
        room.teams.Blue = shuffled.slice(mid);
        io.to(roomId).emit("teamsUpdate", room.teams);
      }
    });

    // --- CHAT (kept) ---
    socket.on("chat", ({ roomId, userId, displayName, team, message }) => {
      if (!rooms[roomId]) {
        rooms[roomId] = { chat: [], teams: { Red: [], Blue: [] } };
      }
      if (!rooms[roomId].chat) rooms[roomId].chat = [];
      const msgObj = {
        userId,
        displayName,
        team,
        message,
        timestamp: new Date().toISOString(),
      };
      rooms[roomId].chat.push(msgObj);
      io.to(roomId).emit("chat", msgObj);
    });

    socket.on("getChatHistory", ({ roomId }) => {
      socket.emit("chatHistory", rooms[roomId]?.chat || []);
    });

    socket.on("leaveLobby", async ({ roomId, userId }) => {
      const finalUserId = userId || socket.userId;
      const finalRoomId = roomId || socket.roomId;
      
      if (!finalRoomId || !finalUserId) return;

      await forceLeaveRoom(finalUserId, finalRoomId, socket);

      // Only mark registered users offline in DB if explicitly leaving
      if (
        !finalUserId.startsWith("guest_") &&
        mongoose.Types.ObjectId.isValid(finalUserId)
      ) {
        await UserModel.findByIdAndUpdate(finalUserId, { isOnline: false });
      }
    });

    // --- DISCONNECT ---
    const handleDisconnect = async (socketInput) => {
      const { userId, roomId } = socketInput;
      const room = rooms[roomId];
      if (!roomId || !userId || !room) return;

      // Get user display name
      let userDisplayName = "A player";
      if (userId.startsWith("guest_")) {
        userDisplayName = socket.displayName || "Guest";
      } else if (mongoose.Types.ObjectId.isValid(userId)) {
        const user = await UserModel.findById(userId);
        if (user) userDisplayName = user.displayName;
      }

      if (room.hostId === userId) {
        // Check if a game is in progress for this room
        const session = gameSessionManager.getSession(roomId);
        if (session) {
          console.log(
            `[disconnect] Host ${userId} disconnected, but game ${roomId} is in progress. Pausing for 10s.`,
          );
          
          io.to(roomId).emit("gamePaused", { hostName: userDisplayName });
          gameSessionManager.pauseTimer(roomId);

          room.hostDisconnectTimeout = setTimeout(async () => {
            console.log(`[disconnect] Host ${userId} did not return to ${roomId} within 10s. Kicking everyone.`);
            io.to(roomId).emit("hostDisconnectedOthers", { hostName: userDisplayName, hostId: userId });
            gameSessionManager.deleteSession(roomId);
            delete rooms[roomId];

            const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
            if (socketsInRoom) {
              for (const sid of socketsInRoom) {
                const s = io.sockets.sockets.get(sid);
                if (s && s.id !== socketInput.id) {
                  s.leave(roomId);
                  s.roomId = null;

                  // Only mark registered users offline
                  if (
                    s.userId &&
                    !s.userId.startsWith("guest_") &&
                    mongoose.Types.ObjectId.isValid(s.userId)
                  ) {
                    await UserModel.findByIdAndUpdate(s.userId, {
                      isOnline: false,
                    });
                  }
                }
              }
            }
          }, 10000); // 10 seconds

          return;
        }

        console.log(
          `[disconnect] Host ${userId} disconnected - kicking everyone from ${roomId}`,
        );

        io.to(roomId).emit("hostDisconnectedOthers", {
          hostName: userDisplayName,
          hostId: userId,
        });

        delete rooms[roomId];

        const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
        if (socketsInRoom) {
          for (const sid of socketsInRoom) {
            const s = io.sockets.sockets.get(sid);
            if (s && s.id !== socket.id) {
              s.leave(roomId);
              s.roomId = null;

              // Only mark registered users offline
              if (
                s.userId &&
                !s.userId.startsWith("guest_") &&
                mongoose.Types.ObjectId.isValid(s.userId)
              ) {
                await UserModel.findByIdAndUpdate(s.userId, {
                  isOnline: false,
                });
              }
            }
          }
        }
      } else {
        console.log(`[disconnect] Player ${userDisplayName} disconnected from ${roomId}`);

        const session = gameSessionManager.getSession(roomId);
        if (session) {
          io.to(roomId).emit("playerDisconnected", { 
            userId, 
            displayName: userDisplayName,
            reconnectWindow: 10 
          });

          room.playerDisconnectTimeouts = room.playerDisconnectTimeouts || {};
          room.playerDisconnectTimeouts[userId] = setTimeout(async () => {
            console.log(`[disconnect] Player ${userId} did not return to ${roomId} within 10s. Kicking.`);

            const kickResult = gameSessionManager.kickPlayer(roomId, userId);
            if (!kickResult) return;
            const { isCurrentDrawer, kickedPlayer } = kickResult;

            gameSessionManager.resumeTimer(roomId);

            io.to(roomId).emit("playerKicked", { userId, displayName: userDisplayName });
            io.to(roomId).emit("updatePlayers", gameSessionManager.getPlayersWithScores(roomId));

            if (isCurrentDrawer) {
              clearActiveTimer(roomId);
              proceedToNextRound(io, roomId, kickedPlayer);
            }

            delete room.playerDisconnectTimeouts[userId];

            if (!userId.startsWith("guest_") && mongoose.Types.ObjectId.isValid(userId)) {
              await UserModel.findByIdAndUpdate(userId, { isOnline: false });
            }
          }, 10000);

          return; // don't mark offline yet
        }
      }

      // Only mark registered users offline
      if (
        userId &&
        !userId.startsWith("guest_") &&
        mongoose.Types.ObjectId.isValid(userId)
      ) {
        await UserModel.findByIdAndUpdate(userId, { isOnline: false });
      }

      console.log("❌ Socket disconnected:", socketInput.id);
    };

    socket.on("disconnect", () => handleDisconnect(socket));
    socket.on("manualDisconnect", () => handleDisconnect(socket));

    socket.on("deleteRoom", ({ roomId }) => {
      if (rooms[roomId]) {
        delete rooms[roomId];
        console.log(`[Lobby] Deleted room ${roomId}`);
      }
    });
  });

  return { findSocketByUserId, rooms };
}

module.exports = createLobbyManager;

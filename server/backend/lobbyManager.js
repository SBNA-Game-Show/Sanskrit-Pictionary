// lobbyManager.js
const mongoose = require("mongoose");

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

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // --- REGISTER LOBBY ---
    socket.on("registerLobby", async ({ userId, roomId /*, displayName*/ }) => {
      socket.userId = userId;
      socket.roomId = roomId;
      socket.join(roomId);

      // create room if missing
      if (!rooms[roomId]) {
        rooms[roomId] = {
          hostId: userId,
          settings: { rounds: 3, timer: 60, difficulty: "Medium" },
          teams: { Red: [], Blue: [] },
          chat: [],
        };
      }

      // broadcast current room state (host, teams, settings)
      io.to(roomId).emit("hostSet", rooms[roomId].hostId);
      io.to(roomId).emit("teamsUpdate", rooms[roomId].teams);
      io.to(roomId).emit("gameSettingsUpdate", rooms[roomId].settings);

      // mark user online in DB and tell lobby
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const user = await UserModel.findByIdAndUpdate(
          userId,
          { isOnline: true },
          { new: true }
        );
        if (user) {
          io.to(roomId).emit("userJoinedLobby", {
            userId: user._id.toString(),
            displayName: user.displayName,
            avatarSeed: user.avatarSeed,
            avatarStyle: user.avatarStyle,
          });
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

      room.teams.Red = room.teams.Red.filter((id) => String(id) !== String(userId));
      room.teams.Blue = room.teams.Blue.filter((id) => String(id) !== String(userId));

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
          if (s?.userId && mongoose.Types.ObjectId.isValid(s.userId)) {
            const user = await UserModel.findById(s.userId);
            if (user) {
              users.push({
                userId: user._id.toString(),
                displayName: user.displayName,
                avatarSeed: user.avatarSeed,
                avatarStyle: user.avatarStyle,
              });
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
    socket.on("updateProfile", async ({ displayName, avatarSeed, avatarStyle }) => {
      try {
        if (!socket.userId) return;
        await UserModel.findByIdAndUpdate(socket.userId, {
          ...(displayName && { displayName }),
          ...(avatarSeed && { avatarSeed }),
          ...(avatarStyle && { avatarStyle }),
        });
        const payload = {
          userId: socket.userId,
          ...(displayName && { displayName }),
          ...(avatarSeed && { avatarSeed }),
          ...(avatarStyle && { avatarStyle }),
        };
        if (socket.roomId) {
          io.to(socket.roomId).emit("profileUpdated", payload);
        } else {
          socket.emit("profileUpdated", payload);
        }
      } catch (e) {
        console.error("updateProfile error", e);
      }
    });

    // --- HOST SETTINGS (kept, event name aligned with client) ---
    socket.on("updateGameSettings", ({ roomId, newSettings }) => {
      const room = rooms[roomId];
      if (room && socket.userId === room.hostId) {
        room.settings = { ...room.settings, ...newSettings };
        io.to(roomId).emit("gameSettingsUpdate", room.settings);
      }
    });

    // --- START GAME (added minimal flow to avoid "blank page") ---
    socket.on("startGame", async ({ gameId, totalRounds, timer, difficulty }) => {
      const room = rooms[gameId];
      if (
        !room ||
        socket.userId !== room.hostId ||
        room.teams.Red.length < 2 ||
        room.teams.Blue.length < 2
      ) {
        io.to(socket.id).emit("startGameError", {
          message: "Only the host can start, and both teams must have at least 2 players.",
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
          const u = await UserModel.findById(firstPlayerId).select("displayName");
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
    });

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

    socket.on("kickUser", ({ roomId, targetUserId }) => {
      const room = rooms[roomId];
      if (!room) return;

      if (socket.userId === room.hostId && targetUserId) {
        room.teams.Red = room.teams.Red.filter((id) => id !== targetUserId);
        room.teams.Blue = room.teams.Blue.filter((id) => id !== targetUserId);
        io.to(roomId).emit("userKicked", { userId: targetUserId });

        const targetSocket = findSocketByUserId(targetUserId);
        if (targetSocket) {
          targetSocket.emit("kicked");
          targetSocket.leave(roomId);
          targetSocket.roomId = null;
        }
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

    // --- LEAVE LOBBY ---
    socket.on("leaveLobby", async () => {
      const { userId, roomId } = socket;
      const room = rooms[roomId];
      if (!roomId || !userId || !room) return;

      // remove from teams and broadcast
      room.teams.Red = room.teams.Red.filter((id) => id !== userId);
      room.teams.Blue = room.teams.Blue.filter((id) => id !== userId);
      io.to(roomId).emit("teamsUpdate", room.teams);
      io.to(roomId).emit("userLeftLobby", { userId });

      // host handoff / cleanup
      if (room.hostId === userId) {
        const sockets = io.sockets.adapter.rooms.get(roomId);
        let newHostId = null;
        if (sockets && sockets.size > 0) {
          for (const sid of sockets) {
            const s = io.sockets.sockets.get(sid);
            if (s && s.userId && s.userId !== userId) {
              newHostId = s.userId;
              break;
            }
          }
          if (newHostId) {
            room.hostId = newHostId;
            io.to(roomId).emit("hostSet", newHostId);
          } else {
            delete rooms[roomId];
          }
        } else {
          delete rooms[roomId];
        }
      }

      socket.leave(roomId);
      socket.roomId = null;

      if (mongoose.Types.ObjectId.isValid(userId)) {
        await UserModel.findByIdAndUpdate(userId, { isOnline: false });
      }
    });

    // --- DISCONNECT ---
    socket.on("disconnect", async () => {
      const { userId, roomId } = socket;
      const room = rooms[roomId];
      if (!roomId || !userId || !room) return;

      io.to(roomId).emit("userLeftLobby", { userId });

      room.teams.Red = room.teams.Red.filter((id) => id !== userId);
      room.teams.Blue = room.teams.Blue.filter((id) => id !== userId);
      io.to(roomId).emit("teamsUpdate", room.teams);

      // host handoff / cleanup
      if (room.hostId === userId) {
        const sockets = io.sockets.adapter.rooms.get(roomId);
        let newHostId = null;
        if (sockets && sockets.size > 0) {
          for (const sid of sockets) {
            const s = io.sockets.sockets.get(sid);
            if (s && s.userId && s.userId !== userId) {
              newHostId = s.userId;
              break;
            }
          }
          if (newHostId) {
            room.hostId = newHostId;
            io.to(roomId).emit("hostSet", newHostId);
          } else {
            delete rooms[roomId];
          }
        } else {
          delete rooms[roomId];
        }
      }

      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        await UserModel.findByIdAndUpdate(userId, { isOnline: false });
      }
      console.log("❌ Socket disconnected:", socket.id);
    });
  });

  return { findSocketByUserId };
}

module.exports = createLobbyManager;

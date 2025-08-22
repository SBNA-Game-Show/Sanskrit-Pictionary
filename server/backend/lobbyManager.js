// lobbyManager.js
const mongoose = require("mongoose");
const rooms = {}; // roomId => {hostId, settings, teams, chat}

function createLobbyManager(io, UserModel) {
  // Helper: find socket by userId
  function findSocketByUserId(userId) {
    for (let [, s] of io.sockets.sockets) if (s.userId === userId) return s;
    return null;
  }

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // --- REGISTER LOBBY ---
    socket.on("registerLobby", async ({ userId, roomId }) => {
      socket.userId = userId;
      socket.roomId = roomId;
      socket.join(roomId);

      if (!rooms[roomId]) {
        rooms[roomId] = {
          hostId: userId,
          settings: { rounds: 3, timer: 60, difficulty: "Medium" },
          teams: { Red: [], Blue: [] },
          chat: [],
        };
      }

      io.to(roomId).emit("hostSet", rooms[roomId].hostId);
      io.to(roomId).emit("teamsUpdate", rooms[roomId].teams);

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
      if (!rooms[roomId] || !["Red", "Blue"].includes(teamColor)) return;
      rooms[roomId].teams.Red = rooms[roomId].teams.Red.filter((id) => id !== userId);
      rooms[roomId].teams.Blue = rooms[roomId].teams.Blue.filter((id) => id !== userId);
      rooms[roomId].teams[teamColor].push(userId);
      io.to(roomId).emit("teamsUpdate", rooms[roomId].teams);
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

    socket.on("getHost", ({ roomId }) => {
      if (rooms[roomId]) socket.emit("hostSet", rooms[roomId].hostId);
    });

    // --- TEAM INVITES ---
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

    // --- PROFILE UPDATES ---
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
        if (socket.roomId) io.to(socket.roomId).emit("profileUpdated", payload);
        else socket.emit("profileUpdated", payload);
      } catch (e) {
        console.error("updateProfile error", e);
      }
    });

    // --- LEAVE LOBBY ---
    socket.on("leaveLobby", async () => {
      const { userId, roomId } = socket;
      if (roomId && userId) {
        if (rooms[roomId]) {
          rooms[roomId].teams.Red = rooms[roomId].teams.Red.filter((id) => id !== userId);
          rooms[roomId].teams.Blue = rooms[roomId].teams.Blue.filter((id) => id !== userId);
          io.to(roomId).emit("teamsUpdate", rooms[roomId].teams);
        }
        io.to(roomId).emit("userLeftLobby", { userId });

        if (rooms[roomId] && rooms[roomId].hostId === userId) {
          const sockets = io.sockets.adapter.rooms.get(roomId);
          let newHostId = null;
          if (sockets && sockets.size > 0) {
            for (const sid of sockets) {
              const s = io.sockets.sockets.get(sid);
              if (s && s.userId && s.userId !== userId) { newHostId = s.userId; break; }
            }
            if (newHostId) { rooms[roomId].hostId = newHostId; io.to(roomId).emit("hostSet", newHostId); }
            else { delete rooms[roomId]; }
          } else { delete rooms[roomId]; }
        }

        socket.leave(roomId);
        socket.roomId = null;
      }
      if (socket.userId && mongoose.Types.ObjectId.isValid(socket.userId)) {
        await UserModel.findByIdAndUpdate(socket.userId, { isOnline: false });
      }
    });

    // --- DISCONNECT ---
    socket.on("disconnect", async () => {
      const { userId, roomId } = socket;
      if (roomId && userId) {
        io.to(roomId).emit("userLeftLobby", { userId });
        if (rooms[roomId]) {
          rooms[roomId].teams.Red = rooms[roomId].teams.Red.filter((id) => id !== userId);
          rooms[roomId].teams.Blue = rooms[roomId].teams.Blue.filter((id) => id !== userId);
          io.to(roomId).emit("teamsUpdate", rooms[roomId].teams);
        }
        if (rooms[roomId] && rooms[roomId].hostId == userId) {
          const sockets = io.sockets.adapter.rooms.get(roomId);
          let newHostId = null;
          if (sockets && sockets.size > 0) {
            for (const sid of sockets) {
              const s = io.sockets.sockets.get(sid);
              if (s && s.userId && s.userId !== userId) { newHostId = s.userId; break; }
            }
            if (newHostId) { rooms[roomId].hostId = newHostId; io.to(roomId).emit("hostSet", newHostId); }
            else { delete rooms[roomId]; }
          } else { delete rooms[roomId]; }
        }
      }
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        await UserModel.findByIdAndUpdate(userId, { isOnline: false });
      }
      console.log("❌ Socket disconnected:", socket.id);
    });

    // --- HOST CONTROLS ---
    socket.on("resetTeams", ({ roomId }) => {
      if (rooms[roomId] && rooms[roomId].teams && socket.userId === rooms[roomId].hostId) {
        rooms[roomId].teams.Red = [];
        rooms[roomId].teams.Blue = [];
        io.to(roomId).emit("teamsUpdate", rooms[roomId].teams);
      }
    });

    socket.on("randomizeTeams", ({ roomId }) => {
      if (rooms[roomId] && rooms[roomId].teams && socket.userId === rooms[roomId].hostId) {
        const userIds = Array.from(io.sockets.adapter.rooms.get(roomId) || [])
          .map((sid) => io.sockets.sockets.get(sid))
          .filter((s) => s && s.userId)
          .map((s) => s.userId);
        let shuffled = userIds.slice().sort(() => Math.random() - 0.5);
        const mid = Math.ceil(shuffled.length / 2);
        rooms[roomId].teams.Red = shuffled.slice(0, mid);
        rooms[roomId].teams.Blue = shuffled.slice(mid);
        io.to(roomId).emit("teamsUpdate", rooms[roomId].teams);
      }
    });

    socket.on("kickUser", ({ roomId, targetUserId }) => {
      if (!rooms[roomId] || !rooms[roomId].teams) return;
      if (socket.userId === rooms[roomId].hostId && targetUserId) {
        rooms[roomId].teams.Red = rooms[roomId].teams.Red.filter((id) => id !== targetUserId);
        rooms[roomId].teams.Blue = rooms[roomId].teams.Blue.filter((id) => id !== targetUserId);
        io.to(roomId).emit("userKicked", { userId: targetUserId });

        const targetSocket = findSocketByUserId(targetUserId);
        if (targetSocket) {
          targetSocket.emit("kicked");
          targetSocket.leave(roomId);
          targetSocket.roomId = null;
        }
      }
    });

    // --- HOST SETTINGS ---
    socket.on("updateGameSettings", ({ roomId, newSettings }) => {
      if (rooms[roomId] && socket.userId === rooms[roomId].hostId) {
        rooms[roomId].settings = { ...rooms[roomId].settings, ...newSettings };
        io.to(roomId).emit("gameSettingsUpdate", rooms[roomId].settings);
      }
    });

    // --- GAME START VALIDATION ---
    socket.on("startGame", ({ gameId, totalRounds, timer, difficulty }) => {
      if (
        !rooms[gameId] ||
        socket.userId !== rooms[gameId].hostId ||
        rooms[gameId].teams.Red.length === 0 ||
        rooms[gameId].teams.Blue.length === 0
      ) {
        io.to(socket.id).emit("startGameError", {
          message: "Only the host can start, and both teams must have players.",
        });
        return;
      }
      // TODO: start game logic here
    });

    // --- CHAT ---
    socket.on("chat", ({ roomId, userId, displayName, team, message }) => {
      if (!rooms[roomId]) rooms[roomId] = { chat: [], teams: { Red: [], Blue: [] } };
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
  });

  return { findSocketByUserId };
}

module.exports = createLobbyManager;

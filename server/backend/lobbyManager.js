const mongoose = require("mongoose");
const rooms = {}; // roomId => {hostId, settings, teams}

function createLobbyManager(io, UserModel) {
  function findSocketByUserId(userId) {
    for (let [, s] of io.sockets.sockets) if (s.userId === userId) return s;
    return null;
  }

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("registerLobby", async ({ userId, roomId }) => {
      socket.userId = userId;
      socket.roomId = roomId;
      socket.join(roomId);

      if (!rooms[roomId]) {
        rooms[roomId] = {
          hostId: userId,
          settings: { rounds: 3, timer: 60, difficulty: "Medium" },
          teams: { Red: [], Blue: [] },
        };
      }

      io.to(roomId).emit("hostSet", rooms[roomId].hostId);
      io.to(roomId).emit("teamsUpdate", rooms[roomId].teams);

      if (mongoose.Types.ObjectId.isValid(userId)) {
        const user = await UserModel.findByIdAndUpdate(userId, { isOnline: true }, { new: true });
        if (user) {
          io.to(roomId).emit("userJoinedLobby", {
            userId: user._id.toString(),
            displayName: user.displayName,
            avatarSeed:  user.avatarSeed,
            avatarStyle: user.avatarStyle,
          });
        }
      }
    });

    socket.on("joinTeam", ({ roomId, teamColor, userId }) => {
      if (!rooms[roomId] || !['Red', 'Blue'].includes(teamColor)) return;
      rooms[roomId].teams.Red  = rooms[roomId].teams.Red.filter(id => id !== userId);
      rooms[roomId].teams.Blue = rooms[roomId].teams.Blue.filter(id => id !== userId);
      rooms[roomId].teams[teamColor].push(userId);
      io.to(roomId).emit("teamsUpdate", rooms[roomId].teams);
    });

    socket.on("leaveTeam", ({ roomId, userId }) => {
  const room = rooms[roomId];
  if (!room) return;
  room.teams.Red  = room.teams.Red.filter(id  => String(id) !== String(userId));
  room.teams.Blue = room.teams.Blue.filter(id => String(id) !== String(userId));
  io.to(roomId).emit("teamsUpdate", room.teams);
  socket.emit("leftTeam", { ok: true }); // optional ack
});


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
                avatarSeed:  user.avatarSeed,
                avatarStyle: user.avatarStyle,
              });
            }
          }
        }
      }
      socket.emit("lobbyUsers", users);
    });

    // live profile changes while in a lobby
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

    socket.on("leaveLobby", async () => {
      const { userId, roomId } = socket;
      if (roomId && userId) {
        if (rooms[roomId]) {
          rooms[roomId].teams.Red  = rooms[roomId].teams.Red.filter(id => id !== userId);
          rooms[roomId].teams.Blue = rooms[roomId].teams.Blue.filter(id => id !== userId);
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

    socket.on("disconnect", async () => {
      const { userId, roomId } = socket;
      if (roomId && userId) {
        io.to(roomId).emit("userLeftLobby", { userId });
        if (rooms[roomId]) {
          rooms[roomId].teams.Red  = rooms[roomId].teams.Red.filter(id => id !== userId);
          rooms[roomId].teams.Blue = rooms[roomId].teams.Blue.filter(id => id !== userId);
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

    // (randomize, kick, settings, chat — unchanged)
  });

  return { findSocketByUserId };
}

module.exports = createLobbyManager;

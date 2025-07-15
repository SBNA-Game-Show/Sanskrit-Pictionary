const mongoose = require("mongoose");

function createLobbyManager(io, UserModel) {
  function findSocketByUserId(userId) {
    for (let [, socket] of io.sockets.sockets) {
      if (socket.userId === userId) return socket;
    }
    return null;
  }

  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);

    socket.on("registerLobby", async ({ userId, roomId }) => {
      socket.userId = userId;
      socket.roomId = roomId;
      socket.join(roomId);

      if (mongoose.Types.ObjectId.isValid(userId)) {
        const user = await UserModel.findByIdAndUpdate(
          userId,
          { isOnline: true },
          { new: true }
        );

        if (user) {
          io.to(roomId).emit("userJoinedLobby", {
            userId: user._id,
            displayName: user.displayName,
          });
        } else {
          console.warn("⚠️ User not found with ID:", userId);
        }
      } else {
        console.warn("❌ Invalid userId received:", userId);
      }
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
                userId: user._id,
                displayName: user.displayName,
              });
            }
          }
        }
      }

      console.log(`[LOBBY] Room ${roomId} → Users:`, users);
      socket.emit("lobbyUsers", users);
    });

    socket.on("createTeam", ({ roomId, teamName }) => {
      io.to(roomId).emit("teamCreated", {
        teamName,
        by: socket.userId,
      });
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

    socket.on("disconnect", async () => {
      const { userId, roomId } = socket;
      if (roomId && userId) {
        io.to(roomId).emit("userLeftLobby", { userId });
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

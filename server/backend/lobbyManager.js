function createLobbyManager(io, UserModel) {
  function findSocketByUserId(userId) {
    for (let [id, socket] of io.sockets.sockets) {
      if (socket.userId === userId) return socket;
    }
    return null;
  }

  io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id);

    socket.on('registerLobby', async ({ userId, roomId }) => {
      socket.userId = userId;
      socket.roomId = roomId;
      socket.join(roomId);

      const isValid = require("mongoose").Types.ObjectId.isValid;

      if (isValid(userId)) {
        await UserModel.findByIdAndUpdate(userId, { isOnline: true });
      } else {
        console.warn("❌ Invalid userId received in lobby:", userId);
      }

      io.to(roomId).emit('userJoinedLobby', { userId });
    });

    socket.on('requestLobbyUsers', async ({ roomId }) => {
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      const users = [];
      if (socketsInRoom) {
        for (const sid of socketsInRoom) {
          const s = io.sockets.sockets.get(sid);
          if (s?.userId) users.push(s.userId);
        }
      }
      console.log(`[LOBBY] Room: ${roomId} → Users:`, users);
      socket.emit('lobbyUsers', users);
    });

    socket.on('createTeam', ({ roomId, teamName }) => {
      io.to(roomId).emit('teamCreated', { teamName, by: socket.userId });
    });

    socket.on('inviteToTeam', ({ targetUserId, teamName, roomId }) => {
      const target = findSocketByUserId(targetUserId);
      if (target) {
        target.emit('teamInviteReceived', {
          fromUserId: socket.userId,
          teamName,
        });
      } else {
        socket.emit('inviteFailed', { targetUserId });
      }
    });

    socket.on('acceptTeamInvite', ({ roomId, teamName }) => {
      io.to(roomId).emit('userJoinedTeam', {
        userId: socket.userId,
        teamName,
      });
    });

    socket.on('disconnect', async () => {
      const { userId, roomId } = socket;
      if (roomId && userId) {
        io.to(roomId).emit('userLeftLobby', { userId });
      }
      if (userId) {
        await UserModel.findByIdAndUpdate(userId, { isOnline: false });
      }
      console.log('❌ Socket disconnected:', socket.id);
    });
  });

  return { findSocketByUserId };
}

module.exports = createLobbyManager;

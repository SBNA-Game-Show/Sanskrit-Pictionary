const mongoose = require("mongoose");
const rooms = {}; // Map of roomId => {hostId: ..., settings: {...}, teams: {Red: [...], Blue: [...]} }

function createLobbyManager(io, UserModel) {
  // Find a socket by userId
  function findSocketByUserId(userId) {
    for (let [, socket] of io.sockets.sockets) {
      if (socket.userId === userId) return socket;
    }
    return null;
  }

  //SOCKET IO LOGIC HERE (EVERYTHING IS INSIDE THIS BLOCK)
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // 1. User joins a lobby
    socket.on("registerLobby", async ({ userId, roomId }) => {
      socket.userId = userId;
      socket.roomId = roomId;
      socket.join(roomId);

      // Room host logic and setup
      if (!rooms[roomId]) {
        rooms[roomId] = {
          hostId: userId,
          settings: { rounds: 3, timer: 60, difficulty: "Medium" },
          teams: { Red: [], Blue: [] }
        };
      }

      io.to(roomId).emit("hostSet", rooms[roomId].hostId);

      io.to(roomId).emit("teamsUpdate", {
        Red: rooms[roomId].teams.Red,
        Blue: rooms[roomId].teams.Blue
      });

      // Database: mark user as online
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
          });
        } else {
          console.warn("⚠️ User not found with ID:", userId);
        }
      } else {
        console.warn("❌ Invalid userId received:", userId);
      }
    });

    // 2. User picks a team
    socket.on("joinTeam", ({ roomId, teamColor, userId }) => {
      if (!rooms[roomId] || !['Red', 'Blue'].includes(teamColor)) return;
      rooms[roomId].teams.Red = rooms[roomId].teams.Red.filter(uid => uid !== userId);
      rooms[roomId].teams.Blue = rooms[roomId].teams.Blue.filter(uid => uid !== userId);
      rooms[roomId].teams[teamColor].push(userId);
      io.to(roomId).emit("teamsUpdate", {
        Red: rooms[roomId].teams.Red,
        Blue: rooms[roomId].teams.Blue
      });
    });

    // 3. Return the current users in the lobby
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
              });
            }
          }
        }
      }
      console.log(`[LOBBY] Room ${roomId} → Users:`, users);
      socket.emit("lobbyUsers", users);
    });

    // 4. Allow frontend to ask who is host
    socket.on("getHost", ({ roomId }) => {
      if (rooms[roomId]) {
        socket.emit("hostSet", rooms[roomId].hostId);
      }
    });

    // Team and invite logic 
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

    // 5. Leave Lobby event - supports explicit user logout in SPA
    socket.on("leaveLobby", async () => {
      const { userId, roomId } = socket;
      if (roomId && userId) {
        // Remove user from teams
        if (rooms[roomId]) {
          rooms[roomId].teams.Red = rooms[roomId].teams.Red.filter(uid => uid !== userId);
          rooms[roomId].teams.Blue = rooms[roomId].teams.Blue.filter(uid => uid !== userId);
          io.to(roomId).emit("teamsUpdate", {
            Red: rooms[roomId].teams.Red,
            Blue: rooms[roomId].teams.Blue
          });
        }
        // Notify all others and clean up room
        io.to(roomId).emit("userLeftLobby", { userId });
        // Host transfer logic (same as disconnect)
        if (rooms[roomId] && rooms[roomId].hostId === userId) {
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
              rooms[roomId].hostId = newHostId;
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
      }
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        await UserModel.findByIdAndUpdate(userId, { isOnline: false });
      }
    });


    // 6. Standard disconnect fallback (e.g. user closes tab)
    socket.on("disconnect", async () => {
      const { userId, roomId } = socket;
      if (roomId && userId) {
        io.to(roomId).emit("userLeftLobby", { userId });
        // Remove from teams
        if (rooms[roomId]) {
          rooms[roomId].teams.Red = rooms[roomId].teams.Red.filter(uid => uid !== userId);
          rooms[roomId].teams.Blue = rooms[roomId].teams.Blue.filter(uid => uid !== userId);
          io.to(roomId).emit("teamsUpdate", {
            Red: rooms[roomId].teams.Red,
            Blue: rooms[roomId].teams.Blue
          });
        }
        // HOST TRANSFER LOGIC
        if (rooms[roomId] && rooms[roomId].hostId == userId) {
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
              rooms[roomId].hostId = newHostId;
              io.to(roomId).emit("hostSet", newHostId);
            } else {
              delete rooms[roomId];
            }
          } else {
            delete rooms[roomId];
          }
        }
      }
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        await UserModel.findByIdAndUpdate(userId, { isOnline: false });
      }
      console.log("❌ Socket disconnected:", socket.id);
    });

    
    // --- HOST-ONLY: TEAM/USER/SETTINGS CONTROLS ---
    // HOST can reset teams (move everyone to "USERS ONLINE")
    socket.on("resetTeams", ({ roomId }) => {
    if (rooms[roomId] && socket.userId === rooms[roomId].hostId) {// check if its host
       rooms[roomId].teams.Red = []; //empty the rooms
       rooms[roomId].teams.Blue = [];
       io.to(roomId).emit("teamsUpdate", {
        Red: [],
        Blue: []
      });
     }
  });


    // HOST can randomize teams (even split)
    socket.on("randomizeTeams", ({ roomId }) => {
      if (rooms[roomId] && socket.userId === rooms[roomId].hostId) {
        // Get all present users (from sockets in room)
        const userIds = Array.from(io.sockets.adapter.rooms.get(roomId) || [])
          .map(sid => io.sockets.sockets.get(sid))
          .filter(s => s && s.userId)
          .map(s => s.userId);
        // Shuffle and split
        let shuffled = userIds.slice().sort(() => Math.random() - 0.5);
        const mid = Math.ceil(shuffled.length / 2);
        rooms[roomId].teams.Red = shuffled.slice(0, mid);
        rooms[roomId].teams.Blue = shuffled.slice(mid);
        io.to(roomId).emit("teamsUpdate", {
          Red: rooms[roomId].teams.Red,
          Blue: rooms[roomId].teams.Blue
        });
      }
    });


    // HOST can kick a user by ID
    socket.on("kickUser", ({ roomId, targetUserId }) => {
      if (rooms[roomId] && socket.userId === rooms[roomId].hostId && targetUserId) {
        rooms[roomId].teams.Red = rooms[roomId].teams.Red.filter(uid => uid !== targetUserId);
        rooms[roomId].teams.Blue = rooms[roomId].teams.Blue.filter(uid => uid !== targetUserId);
        io.to(roomId).emit("userKicked", { userId: targetUserId });

        const targetSocket = findSocketByUserId(targetUserId);
        if (targetSocket) {
          targetSocket.emit("kicked");
          targetSocket.leave(roomId);
          targetSocket.roomId = null;
        }
      }
    });

    // HOST can edit settings (like rounds, timer, difficulty)
    socket.on("updateGameSettings", ({ roomId, newSettings }) => {
      if (rooms[roomId] && socket.userId === rooms[roomId].hostId) {
        rooms[roomId].settings = { ...rooms[roomId].settings, ...newSettings };
        io.to(roomId).emit("gameSettingsUpdate", rooms[roomId].settings);
      }
    });

    //CHAT (all users)
    socket.on("chat", ({ roomId, userId, displayName, message }) => {
      io.to(roomId).emit("chat", {
      userId,
      displayName,
      message,
      timestamp: new Date().toISOString()
    });
  });

});

  return { findSocketByUserId };
}

module.exports = createLobbyManager;

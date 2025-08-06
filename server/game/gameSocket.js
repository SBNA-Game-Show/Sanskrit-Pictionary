const gameSessionManager = require('../game/gameSessionManager');

const activeTimers = {}; // { [gameId]: { intervalId, secondsLeft } }

function createGameSocket(io) {
  io.on('connection', (socket) => {
    console.log(`🟢 New socket connected: ${socket.id}`);
    
    //Register the user to enter the lobby and save the user information
    socket.on('registerLobby', ({ userId, displayName, roomId }) => {
      socket.userId = userId;
      socket.displayName = displayName;
      socket.join(roomId);
      console.log(`[registerLobby] ${userId} joined room ${roomId}`);
    });

    //Get all user information in the room
    socket.on('getRoomPlayers', ({ roomId }) => {
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      const players = [];

      if (socketsInRoom) {
        for (const sid of socketsInRoom) {
          const s = io.sockets.sockets.get(sid);
          if (s?.userId && s?.displayName) {
            players.push({
              userId: s.userId,
              name: s.displayName,
              points: 0,
              imageSrc: '', // 可改为头像路径
            });
          }
        }
      }
      socket.emit('roomPlayers', { players });
    });
  

    // Start the game
    socket.on('startGame', ({ gameId, totalRounds, timer, difficulty }) => {
      console.log("🔵 [startGame] received params:", { gameId, totalRounds, timer, difficulty });

      if (!gameId || !totalRounds || !timer || !difficulty) {
        console.log("[startGame] missing params!");
        return;
      }

      // Collect players in the room
      const players = [];
      const socketsInRoom = io.sockets.adapter.rooms.get(gameId);

      if (socketsInRoom) {
        for (const sid of socketsInRoom) {
          const s = io.sockets.sockets.get(sid);
          if (s?.userId && s?.displayName) {
            players.push({ userId: s.userId, displayName: s.displayName });
          }
        }
      }

      console.log(`[startGame] players found:`, players);

      // Create game session
      gameSessionManager.createSession(gameId, players, totalRounds, timer, difficulty);

      // Start first round
      const roundInfo = gameSessionManager.nextRound(gameId);
      if (roundInfo) {
        console.log("[startGame] first round started:", roundInfo);

        io.to(gameId).emit('roundStarted', roundInfo);
        io.to(gameId).emit('startTimer', { duration: roundInfo.timer });

        const playerListWithScores = gameSessionManager.getPlayersWithScores(gameId);
        io.to(gameId).emit('updatePlayers', playerListWithScores);
        startSynchronizedTimer(io, gameId, roundInfo.timer);
      }
      });


      socket.on("getRoomPlayers", ({ roomId }) => {
        console.log(`🟡 [getRoomPlayers] request for room: ${roomId}`);

        const players = [];

        const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
        if (socketsInRoom) {
          for (const sid of socketsInRoom) {
            const s = io.sockets.sockets.get(sid);
            if (s?.userId && s?.displayName) {
              players.push({ userId: s.userId, displayName: s.displayName, points: 0 });
            }
          }
        }
      console.log(`🟡 [getRoomPlayers] players:`, players);
      io.to(roomId).emit("roomPlayers", { players });
    });

    socket.on("startRound", async ({ roomId }) => {
    await gameSessionManager.startRound(roomId, io);
    });



    // Proceed to next round (manual trigger)
    socket.on('nextRound', ({ gameId }) => {
      console.log("[nextRound] received:", { gameId });

      const roundInfo = gameSessionManager.nextRound(gameId);
      if (roundInfo) {
        console.log("[nextRound] starting round:", roundInfo);

        io.to(gameId).emit('roundStarted', roundInfo);
        io.to(gameId).emit('startTimer', { duration: roundInfo.timer });

        startSynchronizedTimer(io, gameId, roundInfo.timer);
      } else {
        console.log("[nextRound] no more rounds, game ended!");
        io.to(gameId).emit('gameEnded');
        clearActiveTimer(gameId);
      }
    });
    
    // Handle answer submission
    socket.on("submitAnswer", ({ gameId, userId, answer }) => {
      console.log(`[submitAnswer] From ${userId} in ${gameId}: ${answer}`);
      gameSessionManager.handleAnswer(gameId, userId, answer, io);
  });

    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected:", socket.id);
    });
  });
}

// Start synchronization countdown
function startSynchronizedTimer(io, gameId, duration) {
  clearActiveTimer(gameId); 

  let secondsLeft = duration;

  const intervalId = setInterval(() => {
    secondsLeft--;

    io.to(gameId).emit("timerUpdate", { secondsLeft });

    if (secondsLeft <= 0) {
      clearInterval(intervalId);
      delete activeTimers[gameId];

      console.log(`[TIMER] ⏰ Time's up for room ${gameId}`);
      io.to(gameId).emit('roundTimeUp');

      // Proceed to next round automatically
      const nextRoundInfo = gameSessionManager.nextRound(gameId);
      if (nextRoundInfo) {
        io.to(gameId).emit('roundStarted', nextRoundInfo);
        io.to(gameId).emit('startTimer', { duration: nextRoundInfo.timer });

        startSynchronizedTimer(io, gameId, nextRoundInfo.timer);
      } else {
        io.to(gameId).emit('gameEnded');
      }
    }
  }, 1000);

  activeTimers[gameId] = { intervalId, secondsLeft };
}

// clear active timer for a game session
function clearActiveTimer(gameId) {
  if (activeTimers[gameId]) {
    clearInterval(activeTimers[gameId].intervalId);
    delete activeTimers[gameId];
  }
}

module.exports = createGameSocket;

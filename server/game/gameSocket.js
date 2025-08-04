const gameSessionManager = require('../game/gameSessionManager');

function createGameSocket(io) {
  io.on('connection', (socket) => {
    console.log(`New socket connected: ${socket.id}`);

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

        // Set up timer for automatic round switch
        setTimeout(() => {
          console.log("[startGame] round time up!");
          io.to(gameId).emit('roundTimeUp');

          const nextRoundInfo = gameSessionManager.nextRound(gameId);
          if (nextRoundInfo) {
            console.log("[startGame] next round:", nextRoundInfo);
            io.to(gameId).emit('roundStarted', nextRoundInfo);
            io.to(gameId).emit('startTimer', { duration: nextRoundInfo.timer });
          } else {
            console.log("[startGame] game ended!");
            io.to(gameId).emit('gameEnded');
          }
        }, roundInfo.timer * 1000);
      } else {
        console.log("[startGame] roundInfo is null, game not started!");
      }
    });

    // Proceed to next round (manual trigger)
    socket.on('nextRound', ({ gameId }) => {
      console.log("[nextRound] received:", { gameId });

      const roundInfo = gameSessionManager.nextRound(gameId);
      if (roundInfo) {
        console.log("[nextRound] starting round:", roundInfo);

        io.to(gameId).emit('roundStarted', roundInfo);
        io.to(gameId).emit('startTimer', { duration: roundInfo.timer });

        setTimeout(() => {
          console.log("[nextRound] round time up!");
          io.to(gameId).emit('roundTimeUp');

          const nextRoundInfo = gameSessionManager.nextRound(gameId);
          if (nextRoundInfo) {
            console.log("[nextRound] next round:", nextRoundInfo);
            io.to(gameId).emit('roundStarted', nextRoundInfo);
            io.to(gameId).emit('startTimer', { duration: nextRoundInfo.timer });
          } else {
            console.log("[nextRound] game ended!");
            io.to(gameId).emit('gameEnded');
          }
        }, roundInfo.timer * 1000);
      } else {
        console.log("[nextRound] no more rounds, game ended!");
        io.to(gameId).emit('gameEnded');
      }
    });
  });
}

module.exports = createGameSocket;

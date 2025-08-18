const gameSessionManager = require('../game/gameSessionManager');
const activeTimers = {};
const advancingRounds = new Set();      

function createGameSocket(io) {
  io.on('connection', (socket) => {
    socket.on('registerLobby', ({ userId, displayName, roomId }) => {
      socket.userId = userId;
      socket.displayName = displayName;
      socket.join(roomId);
    });

    socket.on('getGameState', ({ roomId }) => {
      const session = gameSessionManager.getSession(roomId);
      if (session) {
        const { players, currentPlayerIndex, currentRound, totalRounds, timer, currentFlashcard, scores } = session;
        const drawer = players[currentPlayerIndex];
        socket.emit('gameState', {
          players,
          currentPlayerIndex,
          drawer,
          currentRound,
          totalRounds,
          timer,
          currentFlashcard,
          scores,
        });
      }
    });

    socket.on('startGame', ({ gameId, totalRounds, timer, difficulty }) => {
      const players = [];
      const socketsInRoom = io.sockets.adapter.rooms.get(gameId);
      if (socketsInRoom) {
        for (const sid of socketsInRoom) {
          const s = io.sockets.sockets.get(sid);
          if (s?.userId && s?.displayName) {
            players.push({
              userId: s.userId,
              displayName: s.displayName,
              socketId: s.id
            });
          }
        }
      }
      gameSessionManager.createSession(gameId, players, totalRounds, timer, difficulty);
      gameSessionManager.startRound(gameId, io);
      io.to(gameId).emit('updatePlayers', gameSessionManager.getPlayersWithScores(gameId));
      startSynchronizedTimer(io, gameId, timer);
    });

    socket.on('drawing-data', ({ gameId, userId, data }) => {
      const session = gameSessionManager.getSession(gameId);
      if (!session) return;
      const drawerId = session.players[session.currentPlayerIndex]?.userId;
      if (userId !== drawerId) return;
      socket.to(gameId).emit('drawing-data', data);
    });

    socket.on("submitAnswer", ({ gameId, userId, answer }) => {
      const session = gameSessionManager.getSession(gameId);
      if (!session) return;
      const drawer = session.players[session.currentPlayerIndex];
      const player = session.players.find(p => p.userId === userId);
      if (!player) return;
      if (player.team !== drawer.team || player.userId === drawer.userId) {
        socket.emit('answerRejected', { message: "It's not your team's turn to guess!" });
        return;
      }
      const remainingSeconds = activeTimers[gameId]?.secondsLeft ?? 0;
      
      //If all players on the same team have submitted their guesses, the current round ends immediately and the next round begins.
      const result = gameSessionManager.handleAnswer(gameId, userId, answer, io, remainingSeconds);
      if (result?.allSubmitted) {
         clearActiveTimer(gameId);
         proceedToNextRound(io, gameId);
        }
    });

    socket.on('nextRound', ({ gameId }) => {
      clearActiveTimer(gameId);
      proceedToNextRound(io, gameId);
    });

    socket.on("startRound", async ({ roomId }) => {
      await gameSessionManager.startRound(roomId, io);
    });

    socket.on("getRoomPlayers", ({ roomId }) => { // for scoreboard consistency
      const session = gameSessionManager.getSession(roomId);
      if (session) {
        io.to(roomId).emit('roomPlayers', { players: session.players });
      }
    });

    socket.on("disconnect", () => {});
  });
}

function startSynchronizedTimer(io, gameId, duration) {
  clearActiveTimer(gameId);

  let secondsLeft = Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0;

  const intervalId = setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);
    io.to(gameId).emit("timerUpdate", { secondsLeft });

    if (secondsLeft <= 0) {
      clearInterval(intervalId);
      delete activeTimers[gameId];

      // Timer reaches zero → proceed to next round
      proceedToNextRound(io, gameId);
    }
  }, 1000);

  activeTimers[gameId] = { intervalId, secondsLeft };
}

function clearActiveTimer(gameId) {
  if (activeTimers[gameId]) {
    clearInterval(activeTimers[gameId].intervalId);
    delete activeTimers[gameId];
  }
}

function proceedToNextRound(io, gameId) {
  if (advancingRounds.has(gameId)) return; // Already advancing, avoid duplication
  advancingRounds.add(gameId);

  try {
    const nextRoundInfo = gameSessionManager.nextRound(gameId);

    if (nextRoundInfo) {
      const drawerPlayer = nextRoundInfo.currentPlayer;

      io.to(gameId).emit('drawerChanged', {
        userId: drawerPlayer.userId,
        displayName: drawerPlayer.displayName,
        team: drawerPlayer.team,
      });

      io.to(gameId).emit('roundStarted', nextRoundInfo);
      io.to(gameId).emit('startTimer', { duration: nextRoundInfo.timer });

      startSynchronizedTimer(io, gameId, nextRoundInfo.timer);

      // Start new round (if nextRound didn't automatically draw a new topic, this is handled by startRound)
      gameSessionManager.startRound(gameId, io);
    } else {
      io.to(gameId).emit('gameEnded');
      clearActiveTimer(gameId);
    }
  } finally {
    advancingRounds.delete(gameId);
  }
}

module.exports = createGameSocket;

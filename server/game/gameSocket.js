const gameSessionManager = require('../game/gameSessionManager');
const activeTimers = {};

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
      gameSessionManager.handleAnswer(gameId, userId, answer, io);
    });

    socket.on('nextRound', ({ gameId }) => {
      const roundInfo = gameSessionManager.nextRound(gameId);
      if (roundInfo) {
        const drawerPlayer = roundInfo.currentPlayer;
        io.to(gameId).emit('drawerChanged', {
          userId: drawerPlayer.userId,
          displayName: drawerPlayer.displayName,
          team: drawerPlayer.team,
        });
        io.to(gameId).emit('roundStarted', roundInfo);
        io.to(gameId).emit('startTimer', { duration: roundInfo.timer });
        startSynchronizedTimer(io, gameId, roundInfo.timer);
      } else {
        io.to(gameId).emit('gameEnded');
        clearActiveTimer(gameId);
      }
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
  let secondsLeft = duration;
  const intervalId = setInterval(() => {
    secondsLeft--;
    io.to(gameId).emit("timerUpdate", { secondsLeft });
    if (secondsLeft <= 0) {
      clearInterval(intervalId);
      delete activeTimers[gameId];
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
      } else {
        io.to(gameId).emit('gameEnded');
      }
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

module.exports = createGameSocket;

const gameSessionManager = require("../game/gameSessionManager");

const activeTimers = {};
const advancingRounds = new Set(); //Prevent repeated entry into the next round

function createGameSocket(io) {
  io.on("connection", (socket) => {
    // ---- register / state ----
    socket.on("registerLobby", ({ userId, displayName, roomId }) => {
      console.log("[socket] registerLobby:", { socketId: socket.id, userId, displayName, roomId });
      socket.userId = userId;
      socket.displayName = displayName;
      socket.join(roomId);
    });

    socket.on("getGameState", ({ roomId }) => {
      const session = gameSessionManager.getSession(roomId);
      if (session) {
        const {
          players, currentPlayerIndex, currentRound, totalRounds, timer, currentFlashcard, scores
        } = session;
        const drawer = players[currentPlayerIndex];
        socket.emit("gameState", {
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

    // ---- start game ----
    socket.on("startGame", ({ gameId, totalRounds, timer, difficulty }) => {
      console.log("[socket] startGame:", { gameId, totalRounds, timer, difficulty, by: socket.id, userId: socket.userId });

      const players = [];
      const socketsInRoom = io.sockets.adapter.rooms.get(gameId);
      if (socketsInRoom) {
        for (const sid of socketsInRoom) {
          const s = io.sockets.sockets.get(sid);
          if (s?.userId && s?.displayName) {
            players.push({ userId: s.userId, displayName: s.displayName, socketId: s.id });
          }
        }
      }

      gameSessionManager.createSession(gameId, players, totalRounds, timer, difficulty);
      gameSessionManager.startRound(gameId, io);

      io.to(gameId).emit("updatePlayers", gameSessionManager.getPlayersWithScores(gameId));
      io.to(gameId).emit("startTimer", { duration: timer });
      startSynchronizedTimer(io, gameId, timer);
    });

    // ---- drawing relay (only drawer can broadcast) ----
    socket.on("drawing-data", ({ gameId, userId, data }) => {
      const session = gameSessionManager.getSession(gameId);
      if (!session) return;
      const drawerId = session.players[session.currentPlayerIndex]?.userId;
      if (userId !== drawerId) return;
      socket.to(gameId).emit("drawing-data", data);
    });

    // ---- submit answer ----
    socket.on("submitAnswer", ({ gameId, userId, answer }) => {
      const session = gameSessionManager.getSession(gameId);
      if (!session) return;

      const drawer = session.players[session.currentPlayerIndex];
      const player = session.players.find((p) => p.userId === userId);
      if (!player) return;

      // Only allow teammates of the drawer to answer, and not the drawer themselves
      if (player.team !== drawer.team || player.userId === drawer.userId) {
        socket.emit("answerRejected", { message: "It's not your team's turn to guess!" });
        return;
      }

      // Read the current remaining seconds for speed scoring
      const remainingSeconds = activeTimers[gameId]?.secondsLeft ?? 0;

      const result = gameSessionManager.handleAnswer(
        gameId,
        userId,
        answer,
        io,
        remainingSeconds
      );

      // All teammates answered correctly -> immediately proceed to the next round
      if (result?.allSubmitted) {
        clearActiveTimer(gameId);
        proceedToNextRound(io, gameId);
      }
    });

    // ---- manual nextRound ----
    socket.on("nextRound", ({ gameId }) => {
      clearActiveTimer(gameId);
      proceedToNextRound(io, gameId);
    });

    socket.on("startRound", async ({ roomId }) => {
      await gameSessionManager.startRound(roomId, io);
    });

    socket.on("getRoomPlayers", ({ roomId }) => {
      const session = gameSessionManager.getSession(roomId);
      if (session) io.to(roomId).emit("roomPlayers", { players: session.players });
    });

    socket.on("disconnect", () => {});
  });
}

/** Synchronize timer to all clients and write remaining seconds back to activeTimers for scoring */
function startSynchronizedTimer(io, gameId, duration) {
  clearActiveTimer(gameId);

  let secondsLeft = Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0;

  // Write initial state first, so it's immediately readable from the outside
  activeTimers[gameId] = { intervalId: null, secondsLeft };

  const intervalId = setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);

    // Write back every second, submit answer to get real-time remaining time
    if (activeTimers[gameId]) {
      activeTimers[gameId].secondsLeft = secondsLeft;
    }

    io.to(gameId).emit("timerUpdate", { secondsLeft });

    if (secondsLeft <= 0) {
      clearInterval(intervalId);
      io.to(gameId).emit("clear-canvas");
      delete activeTimers[gameId];

      // Time's up → proceed to the next round
      proceedToNextRound(io, gameId);
    }
  }, 1000);

  activeTimers[gameId].intervalId = intervalId;
}

function clearActiveTimer(gameId) {
  if (activeTimers[gameId]) {
    clearInterval(activeTimers[gameId].intervalId);
    delete activeTimers[gameId];
  }
}

/** Proceed to the next round: switch drawer, draw new card, start new timer */
function proceedToNextRound(io, gameId) {
  if (advancingRounds.has(gameId)) return; // Prevent repeated entry into the next round
  advancingRounds.add(gameId);

  try {
    const nextRoundInfo = gameSessionManager.nextRound(gameId);

    if (nextRoundInfo) {
      // startRound is responsible for: sending a new Flashcard to the questioner, broadcasting drawerChanged/roundStarted, and updating gameState
      gameSessionManager.startRound(gameId, io);

      io.to(gameId).emit("startTimer", { duration: nextRoundInfo.timer });
      startSynchronizedTimer(io, gameId, nextRoundInfo.timer);
    } else {
      io.to(gameId).emit("gameEnded");
      clearActiveTimer(gameId);
    }
  } finally {
    advancingRounds.delete(gameId);
  }
}

module.exports = createGameSocket;

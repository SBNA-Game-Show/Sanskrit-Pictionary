const gameSessionManager = require("../game/gameSessionManager");

const activeTimers = {};
const advancingRounds = new Set(); //Prevent repeated entry into the next round

function createGameSocket(io) {
  io.on("connection", (socket) => {
    // ---- register / state ----
    socket.on("registerLobby", ({ userId, displayName, roomId }) => {
      console.log("[socket] registerLobby:", {
        socketId: socket.id,
        userId,
        displayName,
        roomId,
      });

      socket.userId = userId;
      socket.displayName = displayName;
      socket.join(roomId);

      // Check if this user is reconnecting to an active game
      const session = gameSessionManager.getSession(roomId);
      if (session) {
        const reconnected = gameSessionManager.markPlayerReconnected(
          roomId,
          userId,
          socket.id,
        );

        if (reconnected) {
          console.log(
            `[socket] Player ${userId} reconnected to active game ${roomId}`,
          );

          // Get canvas data BEFORE sending gameState
          const canvasData = gameSessionManager.getCanvasData(roomId);

          // Send current game state to reconnected player
          socket.emit("gameState", {
            players: session.players,
            hostData: session.hostData,
            currentPlayerIndex: session.currentPlayerIndex,
            drawer: session.players[session.currentPlayerIndex],
            currentRound: session.currentRound,
            totalRounds: session.totalRounds,
            timer: activeTimers[roomId]?.secondsLeft || session.timer,
            currentFlashcard: session.currentFlashcard,
            scores: session.scores,
            canvasData: canvasData,
          });

          // Notify others that player reconnected
          socket.to(roomId).emit("playerReconnected", {
            userId,
            displayName,
          });
        }
      }
    });

    socket.on("getGameState", ({ roomId }) => {
      const session = gameSessionManager.getSession(roomId);
      if (session) {
        const {
          players,
          hostData,
          currentPlayerIndex,
          currentRound,
          totalRounds,
          timer,
          currentFlashcard,
          scores,
        } = session;
        const drawer = players[currentPlayerIndex];
        const canvasData = gameSessionManager.getCanvasData(roomId);
        socket.emit("gameState", {
          players,
          hostData,
          currentPlayerIndex,
          drawer,
          currentRound,
          totalRounds,
          timer,
          currentFlashcard,
          scores,
          canvasData: canvasData,
        });
      }
    });

    // ---- start game ----
    socket.on("startGame", ({ gameId, totalRounds, timer, difficulty, hostData, teams }) => {
      console.log("[socket] startGame:", { gameId, totalRounds, timer, difficulty, by: socket.id, userId: socket.userId });
      const players = [];
      const socketsInRoom = io.sockets.adapter.rooms.get(gameId);
      if (socketsInRoom) {
        for (const sid of socketsInRoom) {
          const s = io.sockets.sockets.get(sid);
          if (s?.userId && s?.displayName && s.userId !== hostData.hostId) {
            players.push({ userId: s.userId, displayName: s.displayName, socketId: s.id });
          }
        }
      }

      gameSessionManager.createSession(gameId, players, totalRounds, timer, difficulty, teams, hostData);
      gameSessionManager.startRound(gameId, io);

      io.to(gameId).emit(
        "updatePlayers",
        gameSessionManager.getPlayersWithScores(gameId),
      );
      io.to(gameId).emit("startTimer", { duration: timer });
      startSynchronizedTimer(io, gameId, timer);
    });

    // ---- drawing relay (only drawer can broadcast) ----
    socket.on("drawing-data", ({ gameId, userId, data }) => {
      const session = gameSessionManager.getSession(gameId);
      if (!session) return;
      const drawerId = session.players[session.currentPlayerIndex]?.userId;
      if (userId !== drawerId) return;
      // Store the latest canvas data
      gameSessionManager.updateCanvasData(gameId, data);

      // Broadcast to others
      socket.to(gameId).emit("drawing-data", data);
    });

    // ---- clear board ----
    socket.on("clear-canvas", ({ gameId, userId }) => {
      const session = gameSessionManager.getSession(gameId);
      if (!session) return;
      const drawerId = session.players[session.currentPlayerIndex]?.userId;
      if (userId !== drawerId) return;

      // Clear stored canvas data
      gameSessionManager.clearCanvasData(gameId);
      socket.to(gameId).emit("clear-canvas");
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
        socket.emit("answerRejected", {
          message: "It's not your team's turn to guess!",
        });
        return;
      }

      // Read the current remaining seconds for speed scoring
      const remainingSeconds = activeTimers[gameId]?.secondsLeft ?? 0;

      const result = gameSessionManager.handleAnswer(
        gameId,
        userId,
        answer,
        io,
        remainingSeconds,
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
      if (session)
        io.to(roomId).emit("roomPlayers", { players: session.players });
    });

    // REPLACE the empty disconnect handler with this:
    socket.on("disconnect", (reason) => {
      console.log(
        `[socket] disconnect: ${socket.id}, reason: ${reason}, userId: ${socket.userId}`,
      );

      // If user wasn't registered, nothing to do
      if (!socket.userId) return;

      // Find any game sessions this user was in
      const sessions = gameSessionManager.getAllSessions();

      for (const [roomId, session] of Object.entries(sessions)) {
        const playerIndex = session.players.findIndex(
          (p) => p.userId === socket.userId,
        );

        if (playerIndex !== -1) {
          console.log(`[socket] Player ${socket.userId} was in game ${roomId}`);

          // Mark player as disconnected but keep them in the game
          session.players[playerIndex].disconnected = true;
          session.players[playerIndex].disconnectTime = Date.now();

          // Notify other players
          io.to(roomId).emit("playerDisconnected", {
            userId: socket.userId,
            displayName: session.players[playerIndex].displayName,
          });

          // Auto-remove if disconnected for more than 60 seconds
          setTimeout(() => {
            const currentSession = gameSessionManager.getSession(roomId);
            if (currentSession) {
              const player = currentSession.players.find(
                (p) => p.userId === socket.userId,
              );

              if (player && player.disconnected) {
                console.log(
                  `[socket] Removing ${socket.userId} after 60s disconnect`,
                );

                // Only remove if they're still disconnected after 60s
                const removed = gameSessionManager.removePlayer(
                  roomId,
                  socket.userId,
                );

                if (removed) {
                  io.to(roomId).emit("playerRemoved", {
                    userId: socket.userId,
                    displayName: player.displayName,
                  });

                  // Update players list for everyone
                  io.to(roomId).emit(
                    "updatePlayers",
                    gameSessionManager.getPlayersWithScores(roomId),
                  );
                }
              }
            }
          }, 60000); // 60 seconds grace period
        }
      }
    });
  });
}

/** Synchronize timer to all clients and write remaining seconds back to activeTimers for scoring */
function startSynchronizedTimer(io, gameId, duration) {
  clearActiveTimer(gameId);

  let secondsLeft = Number.isFinite(duration)
    ? Math.max(0, Math.floor(duration))
    : 0;

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
    // Clear canvas data when moving to next round
    gameSessionManager.clearCanvasData(gameId);
    io.to(gameId).emit("clear-canvas");

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

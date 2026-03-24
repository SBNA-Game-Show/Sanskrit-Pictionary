const gameSessionManager = require("../game/gameSessionManager");

const activeTimers = {};
const pendingTimerStarts = {};
const advancingRounds = new Set(); //Prevent repeated entry into the next round

function createGameSocket(io) {
  // Listen for pause/resume events from session manager
  gameSessionManager.on("pauseTimer", (gameId) => {
    pauseActiveTimer(gameId);
  });

  gameSessionManager.on("resumeTimer", (gameId) => {
    resumeActiveTimer(io, gameId);
  });

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

          // If the game is ended, send the final scores without rejoining
          if (session.gameEnded) {
          socket.emit("gameEnded", { 
            finalPlayers: gameSessionManager.getPlayersWithScores(roomId)});
          return; 
          } else {
            socket.emit("gameInProgress", { roomId });
          }

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

          const me = session.players.find((p) => p.userId === userId);
          const myRemainingGuesses = me?.remainingGuesses ?? session.guesses;

          // Send current game state to reconnected player
          socket.emit("gameState", {
            players: gameSessionManager.getPlayersWithScores(roomId),
            hostData: session.hostData,
            currentPlayerIndex: session.currentPlayerIndex,
            drawer: session.players[session.currentPlayerIndex],
            currentRound: session.currentRound,
            totalRounds: session.totalRounds,
            timer: activeTimers[roomId]?.secondsLeft || session.timer,
            guesses: session.guesses,
            currentFlashcard: session.currentFlashcard,
            scores: session.scores,
            canvasData: canvasData,
            remainingGuesses: myRemainingGuesses,
            gameEnded: session.gameEnded, // get game status
          });

          // Notify others that player reconnected
          socket.to(roomId).emit("playerReconnected", {
            userId,
            displayName,
          });
        }
      }
      else {
        socket.emit("newGame", { roomId:roomId });
      }
    });

    socket.on("getGameState", ({ roomId }) => {
      const session = gameSessionManager.getSession(roomId);
      if (session) {
        const {
          hostData,
          currentPlayerIndex,
          currentRound,
          totalRounds,
          timer,
          guesses,
          currentFlashcard,
          scores,
        } = session;
        const players = gameSessionManager.getPlayersWithScores(roomId);
        const drawer = players[currentPlayerIndex];
        const canvasData = gameSessionManager.getCanvasData(roomId);

        const me = session.players.find((p) => p.userId === socket.userId);
        const myRemainingGuesses = me?.remainingGuesses ?? session.guesses;
        socket.emit("gameState", {
          players,
          hostData,
          currentPlayerIndex,
          drawer,
          currentRound,
          totalRounds,
          timer,
          guesses,
          currentFlashcard,
          scores,
          canvasData: canvasData,
          remainingGuesses: myRemainingGuesses,
        });
      }
    });

    // ---- start game ----
    socket.on(
      "startGame",
      async ({ gameId, totalRounds, timer, difficulty, hostData, teams, guesses, isLearningMode }) => {
        console.log("[socket] startGame:", {
          gameId,
          totalRounds,
          timer,
          difficulty,
          guesses,
          by: socket.id,
          userId: socket.userId,
          isLearningMode
        });
        const players = [];
        const socketsInRoom = io.sockets.adapter.rooms.get(gameId);
        if (socketsInRoom) {
          for (const sid of socketsInRoom) {
            const s = io.sockets.sockets.get(sid);
            if (s?.userId && s?.displayName && s.userId !== hostData.hostId) {
              players.push({
                userId: s.userId,
                displayName: s.displayName,
                socketId: s.id,
              });
            }
          }
        }

        await gameSessionManager.createSession(
          gameId,
          players,
          totalRounds,
          timer,
          difficulty,
          teams,
          hostData,
          guesses, // Send guesses to manager
          isLearningMode // Send isLearningMode to manager
        );
        await gameSessionManager.startRound(gameId, io);

        // Give clients a moment to navigate from /lobby to /play and mount listeners.
        await new Promise((resolve) => setTimeout(resolve, 900));

        // Emit drawer countdown after navigation so users can actually see it.
        const session = gameSessionManager.getSession(gameId);
        const currentDrawer = session.players[session.currentPlayerIndex];
        const startingTeam = currentDrawer?.team || "Red";
        
        console.log("🎮 [Backend] Emitting drawerCountdown event:", { 
          drawer: currentDrawer?.displayName, 
          team: startingTeam,
          gameId 
        });
        
        io.to(gameId).emit("drawerCountdown", {
          displayName: currentDrawer?.displayName || "Drawer",
          team: startingTeam,
          message: `${startingTeam === "Red" ? "Red Team / रक्तदल" : "Blue Team / नीलदल"} is Starting!`,
          gameId,
          syncId: scheduleTimerStart(io, gameId, timer, "startGame"),
        });

        io.to(gameId).emit(
          "updatePlayers",
          gameSessionManager.getPlayersWithScores(gameId),
        );

        // Timer now starts when clients report drawer countdown completion.
      },
    );

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

    // ---- warn drawer ----
    socket.on("warnDrawer", ({ gameId, userId }) => {
      const session = gameSessionManager.getSession(gameId);
      const drawerId = session.players[session.currentPlayerIndex]?.userId;
      if (!session) return;
      if (userId !== session.hostData.hostId) return;

      // Clear stored canvas data
      gameSessionManager.clearCanvasData(gameId);

      // Deduct 50 points
      const newScore = gameSessionManager.updatePlayerPoints(gameId, drawerId, -50);

      io.to(gameId).emit("warnDrawer", drawerId, newScore);
    });

    socket.on("forceSkipRound", ({ gameId, userId }) => {
      const session = gameSessionManager.getSession(gameId);
      if (userId !== session.hostData.hostId) return;

      clearActiveTimer(gameId);
      proceedToNextRound(io, gameId);
    });

    // ---- kick user ----
    socket.on("kickUser", ({ roomId, targetUserId }) => {
      const session = gameSessionManager.getSession(roomId);
      if (!session) return; // If game hasn't started, ignore

      // Verify host
      if (socket.userId !== session.hostData.hostId) return;

      const kickResult = gameSessionManager.kickPlayer(roomId, targetUserId);
      if (!kickResult) return;

      const { isCurrentDrawer, kickedPlayer } = kickResult;

      if (kickedPlayer) {
        io.to(roomId).emit("userKicked", kickedPlayer);
      }

      // Emit updated players list so leaderboard updates
      io.to(roomId).emit(
        "updatePlayers",
        gameSessionManager.getPlayersWithScores(roomId),
      );

      if (isCurrentDrawer) {
        clearActiveTimer(roomId);
        proceedToNextRound(io, roomId, kickedPlayer);
      }
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
      // All guesses exhausted -> end round immediately
      else if (result?.guessesExhausted) {
        io.to(gameId).emit("guessesExhausted");
        clearActiveTimer(gameId);
        proceedToNextRound(io, gameId);
      }
    });

    // ---- manual nextRound ----
    socket.on("nextRound", ({ gameId }) => {
      clearActiveTimer(gameId);
      proceedToNextRound(io, gameId);
    });

    socket.on("drawerCountdownComplete", ({ gameId, syncId }) => {
      const pending = pendingTimerStarts[gameId];
      if (!pending) return;
      if (pending.syncId !== syncId) return;
      startPendingTimer(io, gameId, `clientAck:${socket.id}`);
    });

    socket.on("startRound", async ({ roomId }) => {
      await gameSessionManager.startRound(roomId, io);
    });

    socket.on("getRoomPlayers", ({ roomId }) => {
      const session = gameSessionManager.getSession(roomId);
      if (session)
        io.to(roomId).emit("roomPlayers", { players: session.players });
    });

    socket.on("deleteRoom", ({ roomId }) => {
      console.log(`[socket] deleteRoom requested for: ${roomId}`);
      clearPendingTimerStart(roomId);
      gameSessionManager.deleteSession(roomId);
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

    // End game
    socket.on("gameEnded", ({ roomId, reason }) => {
      console.log(`[Socket] Force game end requested for room ${roomId}. Reason: ${reason}`);
      
      const session = gameSessionManager.getSession(roomId);
      if (session) {
        const finalPlayersWithScore = gameSessionManager.getPlayersWithScores(roomId);
        clearActiveTimer(roomId);
        session.gameEnded = true;
        io.to(roomId).emit("gameEnded", { 
          finalPlayers: finalPlayersWithScore,
          reason: "insufficient team member"
         });
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

      // Mark everyone not submited as answered when time's up
      const session = gameSessionManager.getSession(gameId);
      if (session) {
        session.players.forEach((p) => {
          if (!p.hasAnswered) {
            p.hasAnswered = true;
            p.remainingGuesses = 0;
          }
        });

        io.to(gameId).emit(
          "updatePlayers",
          gameSessionManager.getPlayersWithScores(gameId),
        );
      }

      // Time's up → proceed to the next round
      proceedToNextRound(io, gameId);
    }
  }, 1000);

  activeTimers[gameId].intervalId = intervalId;
}

function pauseActiveTimer(gameId) {
  if (activeTimers[gameId] && activeTimers[gameId].intervalId) {
    clearInterval(activeTimers[gameId].intervalId);
    activeTimers[gameId].intervalId = null; // Mark as paused
  }
}

function resumeActiveTimer(io, gameId) {
  if (
    activeTimers[gameId] &&
    activeTimers[gameId].intervalId === null &&
    activeTimers[gameId].secondsLeft > 0
  ) {
    // Restart with remaining time
    startSynchronizedTimer(io, gameId, activeTimers[gameId].secondsLeft);
  }
}

function clearActiveTimer(gameId) {
  clearPendingTimerStart(gameId);
  if (activeTimers[gameId]) {
    clearInterval(activeTimers[gameId].intervalId);
    delete activeTimers[gameId];
  }
}

function createTimerSyncId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clearPendingTimerStart(gameId) {
  if (!pendingTimerStarts[gameId]) return;
  clearTimeout(pendingTimerStarts[gameId].timeoutId);
  delete pendingTimerStarts[gameId];
}

function scheduleTimerStart(io, gameId, duration, source) {
  clearPendingTimerStart(gameId);

  const syncId = createTimerSyncId();
  const safeDuration = Number.isFinite(duration)
    ? Math.max(0, Math.floor(duration))
    : 0;

  pendingTimerStarts[gameId] = {
    syncId,
    duration: safeDuration,
    source,
    timeoutId: setTimeout(() => {
      startPendingTimer(io, gameId, "fallbackTimeout");
    }, 15000),
  };

  return syncId;
}

function startPendingTimer(io, gameId, startReason) {
  const pending = pendingTimerStarts[gameId];
  if (!pending) return false;

  clearTimeout(pending.timeoutId);
  delete pendingTimerStarts[gameId];

  console.log(
    `[timerSync] Starting timer for ${gameId} (${pending.duration}s) source=${pending.source} reason=${startReason}`,
  );
  io.to(gameId).emit("startTimer", { duration: pending.duration });
  startSynchronizedTimer(io, gameId, pending.duration);
  return true;
}

/** Proceed to the next round: switch drawer, draw new card, start new timer */
async function proceedToNextRound(io, gameId, lastDrawerOverride = null) {
  if (advancingRounds.has(gameId)) return; // Prevent repeated entry into the next round
  advancingRounds.add(gameId);

  try {
    // Clear canvas data when moving to next round
    gameSessionManager.clearCanvasData(gameId);
    io.to(gameId).emit("clear-canvas");

    const nextRoundInfo = gameSessionManager.nextRound(gameId, io, lastDrawerOverride);

    // Get latest scores before starting the next round
    const finalPlayersWithScore = gameSessionManager.getPlayersWithScores(gameId);

    if (nextRoundInfo) {
      // Sync scores before starting the next round
      io.to(gameId).emit("updatePlayers", finalPlayersWithScore);

      // Get current and previous team info for team switch countdown
      const session = gameSessionManager.getSession(gameId);
      const lastDrawer = lastDrawerOverride || session.players.find((p) => 
        p === session.players[session.currentPlayerIndex]
      );
      const currentTeam = lastDrawer?.team || "Red";
      const nextTeam = nextRoundInfo.currentPlayer?.team || "Blue";

      // Emit team switch countdown only if teams are different
      if (currentTeam !== nextTeam) {
        const currentTeamLabel = currentTeam === "Red" ? "Red Team / रक्तदल" : "Blue Team / नीलदल";
        const nextTeamLabel = nextTeam === "Red" ? "Red Team / रक्तदल" : "Blue Team / नीलदल";
        const nextDrawerName = nextRoundInfo.currentPlayer?.displayName || "Drawer";

        console.log("🎮 [Backend] Emitting teamSwitchCountdown event:", { 
          currentTeam, 
          nextTeam, 
          nextDrawerName,
          gameId 
        });

        io.to(gameId).emit("teamSwitchCountdown", {
          currentTeam: currentTeam,
          nextTeam: nextTeam,
          currentTeamLabel: currentTeamLabel,
          nextTeamLabel: nextTeamLabel,
          nextDrawerName: nextDrawerName,
        });

        // Wait for team switch countdown to complete (~6.2 seconds)
        // Use 7000ms to be safe
        await new Promise((resolve) => setTimeout(resolve, 7000));
      }

      // startRound is responsible for: sending a new Flashcard to the questioner, 
      // broadcasting drawerChanged/roundStarted, and updating gameState
      await gameSessionManager.startRound(gameId, io);

      // Emit drawer countdown for new drawer
      const newDrawer = session.players[session.currentPlayerIndex];
      const newTeamLabel = newDrawer?.team === "Red" ? "Red Team / रक्तदल" : "Blue Team / नीलदल";
      
      io.to(gameId).emit("drawerCountdown", {
        displayName: newDrawer?.displayName || "Drawer",
        team: newDrawer?.team || "Red",
        message: `${newTeamLabel} Turn - ${newDrawer?.displayName || "Drawer"} is Drawing!`,
        gameId,
        syncId: scheduleTimerStart(
          io,
          gameId,
          nextRoundInfo.timer,
          "proceedToNextRound",
        ),
      });
    } else {
      // Sync scores before emitting gameEnded
      io.to(gameId).emit("updatePlayers", finalPlayersWithScore);
      
      io.to(gameId).emit("gameEnded", { finalPlayers: finalPlayersWithScore });
      clearActiveTimer(gameId);
    }
  } finally {
    advancingRounds.delete(gameId);
  }
}

module.exports = {
  createGameSocket,
  clearActiveTimer,
  proceedToNextRound,
};

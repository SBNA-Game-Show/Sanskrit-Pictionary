const gameSessionManager = require("../gameSessionManager");
const {
  activeTimers,
  pendingTimerStarts,
  clearActiveTimer,
  startSynchronizedTimer,
  startPendingTimer,
  clearPendingTimerStart,
  scheduleTimerStart
} = require("../utils/timer");
const { proceedToNextRound } = require("../utils/roundManager");

function registerStateHandlers(socket, io) {
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
          finalPlayers: gameSessionManager.getPlayersWithScores(roomId),
        });
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
    } else {
      socket.emit("newGame", { roomId: roomId });
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
    async ({
      gameId,
      totalRounds,
      timer,
      difficulty,
      hostData,
      teams,
      guesses,
      isLearningMode,
    }) => {
      console.log("[socket] startGame:", {
        gameId,
        totalRounds,
        timer,
        difficulty,
        guesses,
        by: socket.id,
        userId: socket.userId,
        isLearningMode,
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
        isLearningMode, // Send isLearningMode to manager
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
    },
  );

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
    console.log(
      `[Socket] Force game end requested for room ${roomId}. Reason: ${reason}`,
    );

    const session = gameSessionManager.getSession(roomId);
    if (session) {
      const finalPlayersWithScore =
        gameSessionManager.getPlayersWithScores(roomId);
      clearActiveTimer(roomId);
      session.gameEnded = true;
      io.to(roomId).emit("gameEnded", {
        finalPlayers: finalPlayersWithScore,
        reason: "insufficient team member",
      });
    }
  });
}

module.exports = { registerStateHandlers };

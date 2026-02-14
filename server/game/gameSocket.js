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

    socket.on("getGameState", ({ roomId, userId }) => {
      const session = gameSessionManager.getSession(roomId);
      if (session) {
        // Get player join the room after refresh the page
        socket.join(roomId);

        const {
          players, currentPlayerIndex, currentRound, totalRounds, timer, currentFlashcard, scores, 
          // Added status for recovering game state after refresh
          status
        } = session;

        // Update player's socketId in session in case of refresh
        const player = players.find(p => p.userId === userId);
        if (player) {
          console.log(`[Sync] User ${player.displayName} reconnected. Updating SocketID: ${player.socketId} -> ${socket.id}`);
          player.socketId = socket.id; 
        }
        
        const drawer = session.players[session.currentPlayerIndex];
        const isDrawer = userId === drawer?.userId;

        socket.emit("gameState", {
          // Put scores into players array for recovering after refresh
          players,
          currentPlayerIndex,
          drawer,
          currentRound,
          totalRounds,
          timer,
          // Only render flashcard to the drawer
          currentFlashcard: isDrawer ? session.currentFlashcard : null, 
          scores,
          // Render canvas paths to everyone for recovering after refresh
          canvasPaths: session.canvasPaths || [],
          // Added status for recovering game state after refresh
          status: status || (timer <= 0 && currentRound >= totalRounds ? "ended" : "playing"), 
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

      // Store canvas paths in session for refreshing players
      session.canvasPaths = data;
      socket.to(gameId).emit("drawing-data", data);
    });

    // ---- submit answer ----
    socket.on("submitAnswer", ({ gameId, userId, answer }) => {
      console.log(`[YUE]Answer submitted in game ${gameId} by user ${userId}:`, answer);
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
  if (advancingRounds.has(gameId)) {
    console.log(`[Debug] Blocked by lock for room: ${gameId}`);
    return; 
  } // Prevent repeated entry into the next round
  advancingRounds.add(gameId);

  try {
    const nextRoundInfo = gameSessionManager.nextRound(gameId);

    if (nextRoundInfo) {
      console.log("Next Round Info:", nextRoundInfo);

      // startRound is responsible for: sending a new Flashcard to the questioner, 
      // broadcasting drawerChanged/roundStarted, and updating gameState
      gameSessionManager.startRound(gameId, io);

      io.to(gameId).emit("startTimer", { duration: nextRoundInfo.timer });
      startSynchronizedTimer(io, gameId, nextRoundInfo.timer);
    } else {

      const session = gameSessionManager.getSession(gameId);

      // Added scores into session for recovering game state after refresh
      if (session) {
        session.status = "ended";
        const finalPlayers = session.players.map(p => ({
          ...p,
          points: session.scores[p.userId] || 0
        }));

      // Send gameEnded event with final players and scores for leaderboard display
      // console.log(`[GameEnded] Sending final scores for room ${gameId}`);
      io.to(gameId).emit("gameEnded", finalPlayers); 
      }
      clearActiveTimer(gameId);
    }
  } finally {
    advancingRounds.delete(gameId);
  }
}

module.exports = createGameSocket;

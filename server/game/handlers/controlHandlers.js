const gameSessionManager = require("../gameSessionManager");
const { activeTimers, clearActiveTimer } = require("../utils/timer");
const { proceedToNextRound } = require("../utils/roundManager");

function registerControlHandlers(socket, io, addKickedUser) {
  // ---- force skip round ----
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

    // Prevent kicked user from rejoining this room
    addKickedUser(roomId, targetUserId);

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
}

module.exports = { registerControlHandlers };

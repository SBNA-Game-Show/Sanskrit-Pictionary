const gameSessionManager = require("../gameSessionManager");
const { startSynchronizedTimer, clearActiveTimer } = require("./timer");

const advancingRounds = new Set(); //Prevent repeated entry into the next round

// Proceed to the next round: switch drawer, draw new card, start new timer
async function proceedToNextRound(io, gameId, lastDrawerOverride = null) {
  if (advancingRounds.has(gameId)) return; // Prevent repeated entry into the next round
  advancingRounds.add(gameId);

  try {
    // Clear canvas data when moving to next round
    gameSessionManager.clearCanvasData(gameId);
    io.to(gameId).emit("clear-canvas");

    const nextRoundInfo = gameSessionManager.nextRound(
      gameId,
      io,
      lastDrawerOverride,
    );

    // Get latest scores before starting the next round
    const finalPlayersWithScore =
      gameSessionManager.getPlayersWithScores(gameId);

    if (nextRoundInfo) {
      // Sync scores before starting the next round
      io.to(gameId).emit("updatePlayers", finalPlayersWithScore);

      // startRound is responsible for: sending a new Flashcard to the questioner,
      // broadcasting drawerChanged/roundStarted, and updating gameState
      await gameSessionManager.startRound(gameId, io);

      io.to(gameId).emit("startTimer", { duration: nextRoundInfo.timer });
      startSynchronizedTimer(
        io,
        gameId,
        nextRoundInfo.timer,
        proceedToNextRound,
      );
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
  proceedToNextRound,
};

const gameSessionManager = require("../gameSessionManager");
const { startSynchronizedTimer, clearActiveTimer, scheduleTimerStart } = require("./timer");

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
  proceedToNextRound,
};

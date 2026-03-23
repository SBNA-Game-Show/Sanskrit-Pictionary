const gameSessionManager = require("../gameSessionManager");

const activeTimers = {};

// Synchronize timer to all clients and write remaining seconds back to activeTimers for scoring
function startSynchronizedTimer(io, gameId, duration, onTimeUp) {
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
      onTimeUp(io, gameId);
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

function resumeActiveTimer(io, gameId, onTimeUp) {
  if (
    activeTimers[gameId] &&
    activeTimers[gameId].intervalId === null &&
    activeTimers[gameId].secondsLeft > 0
  ) {
    // Restart with remaining time
    console.log("ACTIVE TIMERS: ", activeTimers);
    startSynchronizedTimer(
      io,
      gameId,
      activeTimers[gameId].secondsLeft,
      onTimeUp,
    );
  }
}

function clearActiveTimer(gameId) {
  if (activeTimers[gameId]) {
    clearInterval(activeTimers[gameId].intervalId);
    delete activeTimers[gameId];
  }
}

module.exports = {
  activeTimers,
  startSynchronizedTimer,
  pauseActiveTimer,
  resumeActiveTimer,
  clearActiveTimer,
};

const gameSessionManager = require("../gameSessionManager");

const activeTimers = {};
const pendingTimerStarts = {};

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
  clearPendingTimerStart(gameId);
  if (activeTimers[gameId]) {
    clearInterval(activeTimers[gameId].intervalId);
    delete activeTimers[gameId];
  }
}

//5s round timer funcs
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

module.exports = {
  activeTimers,
  pendingTimerStarts,
  startSynchronizedTimer,
  pauseActiveTimer,
  resumeActiveTimer,
  clearActiveTimer,
  scheduleTimerStart,
  startPendingTimer,
  clearPendingTimerStart,
};

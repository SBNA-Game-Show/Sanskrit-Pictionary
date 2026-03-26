const gameSessionManager = require("../game/gameSessionManager");
const {
  pauseActiveTimer,
  resumeActiveTimer,
  clearActiveTimer,
} = require("./utils/timer");
const { proceedToNextRound } = require("./utils/roundManager");
const { registerStateHandlers } = require("./handlers/stateHandlers");
const { registerDrawingHandlers } = require("./handlers/drawingHandlers");
const { registerControlHandlers } = require("./handlers/controlHandlers");
const getLobbyManager = () => require("../backend/lobbyManager");

function createGameSocket(io) {
  // Listen for pause/resume events from session manager
  gameSessionManager.on("pauseTimer", (gameId) => {
    pauseActiveTimer(gameId);
  });

  gameSessionManager.on("resumeTimer", (gameId) => {
    resumeActiveTimer(io, gameId, proceedToNextRound);
  });

  io.on("connection", (socket) => {
    registerStateHandlers(socket, io);
    registerDrawingHandlers(socket, io);
    registerControlHandlers(socket, io, getLobbyManager().addKickedUser);
  });
}

module.exports = {
  createGameSocket,
  clearActiveTimer,
  proceedToNextRound,
};

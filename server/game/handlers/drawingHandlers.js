const gameSessionManager = require("../gameSessionManager");

function registerDrawingHandlers(socket, io) {
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
    const newScore = gameSessionManager.updatePlayerPoints(
      gameId,
      drawerId,
      -50,
    );

    io.to(gameId).emit("warnDrawer", drawerId, newScore);
  });
}

module.exports = { registerDrawingHandlers };

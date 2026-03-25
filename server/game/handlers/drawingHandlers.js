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
    // deduct 50 points from drawer
    gameSessionManager.updateScore(gameId, drawerId, -50);
    // update canvas
    io.to(gameId).emit("clear-canvas");
    // display RoundPopup warning
    io.to(gameId).emit("warnDrawer");
    // update player points
    io.to(gameId).emit(
      "updatePlayers",
      gameSessionManager.getPlayersWithScores(gameId),
    );
  });

  // ---- React from non-gueesing players ----
  socket.on("send-reaction", (data) => {
    const { roomId, type, id, left } = data;
    if (!roomId) return;

    // send the reaction to everyone in the room
    io.to(roomId).emit("receive-reaction", {
      type,
      id,
      left
    });
  });
}

module.exports = { registerDrawingHandlers };

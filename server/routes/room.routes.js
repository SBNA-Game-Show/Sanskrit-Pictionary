const express = require("express");
const router = express.Router();
const { isUserKicked } = require("../backend/lobbyManager");

// Import rooms from lobbyManager (we'll need to export it)
let roomsRef = null;

// Function to set rooms reference from lobbyManager
function setRoomsReference(rooms) {
  roomsRef = rooms;
}

// Check if room exists
router.get("/exists/:roomId", (req, res) => {
  const { roomId } = req.params;

  if (!roomId || !roomsRef) {
    return res.status(400).json({ exists: false, error: "Invalid request" });
  }

  const room = roomsRef[roomId];

  if (!room) {
    return res.json({
      exists: false,
      message: "Room not found",
    });
  }

  // Get player count from room
  const playerCount =
    (room.teams?.Red?.length || 0) + (room.teams?.Blue?.length || 0);

  const userId = req.query.userId || null;

  res.json({
    exists: true,
    playerCount,
    hasPassword: false, // For future feature
    isFull: playerCount >= 20, // Max 20 players
    isKicked: userId ? isUserKicked(roomId, userId) : false,
  });
});

module.exports = { router, setRoomsReference };

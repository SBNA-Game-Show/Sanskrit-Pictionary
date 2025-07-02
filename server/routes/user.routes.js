// routes/user.routes.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");

// GET /api/users/online
router.get("/online", async (req, res) => {
  try {
    const onlineUsers = await User.find({ isOnline: true }).select(
      "displayName email"
    );
    res.status(200).json(onlineUsers);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;

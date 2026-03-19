const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const User = require("../models/User");
const Filter = require("leo-profanity");

// GET /api/users/online
router.get("/online", async (req, res) => {
  try {
    const onlineUsers = await User.find({ isOnline: true }).select(
      "displayName email",
    );
    res.status(200).json(onlineUsers);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
router.get("/all", async (req, res) => {
  try {
    const allUsers = await User.find().select("_id displayName email");
    res.status(200).json(allUsers);
  } catch (err) {
    console.error("Error getting all users:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// SECURE PASSWORD CHANGE ENDPOINT
router.post("/change-password", async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ error: "Old password is incorrect" });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Password change error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;

// Add validation endpoint
router.post("/validate-username", (req, res) => {
  try {
    const { displayName } = req.body;

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({
        valid: false,
        error: "Username is required",
      });
    }

    if (Filter.check(displayName)) {
      return res.status(400).json({
        valid: false,
        error:
          "Username contains inappropriate language. Please choose a different name.",
      });
    }

    res.json({ valid: true });
  } catch (error) {
    res.status(500).json({
      valid: false,
      error: "Validation failed",
    });
  }
});

// save displayName + avatar configuration
router.put("/me/profile", async (req, res) => {
  try {
    const { userId, displayName, avatarSeed, avatarStyle } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    // Check for profanity in displayName if it's being updated
    if (displayName && Filter.check(displayName)) {
      return res.status(400).json({
        error:
          "Username contains inappropriate language. Please choose a different name.",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        ...(displayName && { displayName }),
        ...(avatarSeed && { avatarSeed }),
        ...(avatarStyle && { avatarStyle }),
      },
      { new: true },
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      displayName: user.displayName,
      avatarSeed: user.avatarSeed,
      avatarStyle: user.avatarStyle,
    });
  } catch (e) {
    console.error("Profile update error:", e);
    res.status(400).json({ error: "Could not update profile" });
  }
});

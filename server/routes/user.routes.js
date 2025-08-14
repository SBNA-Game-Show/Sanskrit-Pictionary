const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const User = require("../models/User");

// online users (existing)
router.get("/online", async (req, res) => {
  try {
    const onlineUsers = await User.find({ isOnline: true }).select("displayName email");
    res.status(200).json(onlineUsers);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// all users (existing)
router.get("/all", async (req, res) => {
  try {
    const allUsers = await User.find().select("_id displayName email");
    res.status(200).json(allUsers);
  } catch (err) {
    console.error("Error getting all users:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// change password (existing)
router.post("/change-password", async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ error: "Old password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Password change error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// NEW — save displayName + avatar configuration
router.put("/me/profile", async (req, res) => {
  try {
    const { userId, displayName, avatarSeed, avatarStyle } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const user = await User.findByIdAndUpdate(
      userId,
      {
        ...(displayName && { displayName }),
        ...(avatarSeed && { avatarSeed }),
        ...(avatarStyle && { avatarStyle }),
      },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      displayName: user.displayName,
      avatarSeed:  user.avatarSeed,
      avatarStyle: user.avatarStyle,
    });
  } catch (e) {
    console.error("Profile update error:", e);
    res.status(400).json({ error: "Could not update profile" });
  }
});

module.exports = router;

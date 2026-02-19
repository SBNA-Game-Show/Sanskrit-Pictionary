const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.register = async (req, res) => {
  try {
    const { displayName, email, password } = req.body;
    const existing = await User.findOne({
      $or: [{ email }, { displayName }],
    });
    if (existing)
      return res
        .status(400)
        .json({ error: "Email or username already exists" });

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ displayName, email, password: hash });
    await user.save();
    res.status(201).json({ message: "User registered" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    user.isOnline = true;
    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    // Set HTTP-only cookie with cross-origin support
    res.cookie("token", token, {
      httpOnly: true,
      secure: true, // Always true (requires HTTPS)
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // "none" for cross-origin
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      token, // Also send token in response body as fallback
      user: {
        userId: user._id,
        displayName: user.displayName,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Logout endpoint
exports.logout = async (req, res) => {
  try {
    // Clear the cookie with same settings
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// Verify token endpoint
exports.verifyToken = async (req, res) => {
  try {
    // Token already verified by middleware, req.userId is available
    const user = await User.findById(req.userId).select(
      "displayName email _id",
    );

    if (!user) {
      return res.status(404).json({ valid: false, error: "User not found" });
    }

    res.status(200).json({
      valid: true,
      user: {
        userId: user._id,
        displayName: user.displayName,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(500).json({ valid: false, error: "Server error" });
  }
};

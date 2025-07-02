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
      { expiresIn: "1h" }
    );
    res.status(200).json({ token, displayName: user.displayName });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

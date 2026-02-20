const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
  let token = null;

  // Try cookie first
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // Fallback to Authorization header
  if (!token) {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (authHeader) {
      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      } else if (authHeader.startsWith("bearer ")) {
        token = authHeader.substring(7);
      }
    }
  }

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

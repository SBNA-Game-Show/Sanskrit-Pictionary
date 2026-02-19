const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
  console.log("=== VERIFY TOKEN MIDDLEWARE ===");
  console.log("Cookie token:", req.cookies?.token ? "Present" : "Missing");
  console.log("Authorization header:", req.headers.authorization || "Missing");

  let token = null;

  // Try cookie first
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
    console.log("Using token from cookie");
  }

  // Fallback to Authorization header
  if (!token) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    console.log("Checking auth header:", authHeader);

    if (authHeader) {
      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
        console.log("Using token from Authorization header");
      } else if (authHeader.startsWith("bearer ")) {
        token = authHeader.substring(7);
        console.log("Using token from Authorization header (lowercase)");
      }
    }
  }

  if (!token) {
    console.log("No token found anywhere");
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    console.log("Token verified successfully for user:", decoded.userId);
    next();
  } catch (err) {
    console.log("Token verification failed:", err.message);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

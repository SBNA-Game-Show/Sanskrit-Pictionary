// const jwt = require('jsonwebtoken');

// exports.verifyToken = (req, res, next) => {
//   const header = req.headers['authorization'];
//   if (!header) return res.status(401).json({ error: 'No token' });

//   const token = header.split(' ')[1];
//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.userId = decoded.userId;
//     next();
//   } catch (err) {
//     return res.status(403).json({ error: 'Invalid token' });
//   }
// };

const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
  // ✅ Try cookie first (for web browsers), then Authorization header (for API clients)
  let token = req.cookies.token;

  // If no cookie, check Authorization header
  if (!token) {
    const header = req.headers["authorization"];
    if (header) {
      token = header.split(" ")[1]; // Extract token from "Bearer <token>"
    }
  }

  // If still no token found
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email; // Optional: store email too
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

// import { io } from "socket.io-client";
// const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5005";
// export const socket = io(API_BASE);

// socket.on("connect", () => {
//   console.log("🔗 client socket connected:", socket.id);
// });
// socket.on("connect_error", (err) => {
//   console.error("socket connect_error", err);
// });

import { io } from "socket.io-client";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5005";

export const socket = io(API_BASE, {
  // ✅ Enable automatic reconnection
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,

  // ✅ Important for cross-origin
  withCredentials: true,

  // ✅ Transports configuration
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("🔗 Socket connected:", socket.id);
});

socket.on("reconnect", (attemptNumber) => {
  console.log("🔄 Socket reconnected after", attemptNumber, "attempts");
});

socket.on("reconnect_attempt", (attemptNumber) => {
  console.log("🔄 Reconnection attempt:", attemptNumber);
});

socket.on("reconnect_failed", () => {
  console.error("❌ Socket reconnection failed");
});

socket.on("connect_error", (err) => {
  console.error("❌ Socket connection error:", err.message);
});

socket.on("disconnect", (reason) => {
  console.warn("⚠️ Socket disconnected:", reason);
  if (reason === "io server disconnect") {
    // Server disconnected, need to reconnect manually
    socket.connect();
  }
});

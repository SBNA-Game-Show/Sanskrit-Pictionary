import { io } from "socket.io-client";
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5005";
export const socket = io(API_BASE);

socket.on("connect", () => {
  console.log("🔗 client socket connected:", socket.id);
});
socket.on("connect_error", (err) => {
  console.error("socket connect_error", err);
});

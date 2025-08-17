import { io } from "socket.io-client";
export const socket = io("http://localhost:5000");

socket.on("connect", () => {
  console.log("🔗 client socket connected:", socket.id);
});
socket.on("connect_error", (err) => {
  console.error("socket connect_error", err);
});

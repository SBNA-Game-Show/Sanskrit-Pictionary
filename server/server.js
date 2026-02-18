const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const cookieParser = require("cookie-parser");

// DNS override (uncomment if running into querySrv ECONNREFUSED errors)
// const { setServers } = require("node:dns/promises");
// setServers(["1.1.1.1", "8.8.8.8"]);

dotenv.config();

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://sanskrit-pictionary.vercel.app",
      "https://sanskrit-pictionary-3z505xgeb-gita-sbusas-projects.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());
app.use(cookieParser());

const authRoutes = require("./routes/auth.routes");
app.use("/api/auth", authRoutes);

const userRoutes = require("./routes/user.routes");
app.use("/api/users", userRoutes);

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error(err));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://sanskrit-pictionary.vercel.app",
      "https://sanskrit-pictionary-3z505xgeb-gita-sbusas-projects.vercel.app",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const User = require("./models/User");

const createLobbyManager = require("./backend/lobbyManager");
createLobbyManager(io, User);

const createGameSocket = require("./game/gameSocket");
createGameSocket(io);

const PORT = process.env.PORT || 5005;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

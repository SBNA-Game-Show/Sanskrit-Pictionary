const gameSessionManager = require("../game/gameSessionManager");

const activeTimers = {};
const advancingRounds = new Set(); //Prevent repeated entry into the next round

function createGameSocket(io) {
  io.on("connection", (socket) => {
    // ---- register / state ----
    socket.on("registerLobby", ({ userId, displayName, roomId }) => {
      console.log("[socket] registerLobby:", { socketId: socket.id, userId, displayName, roomId });
      socket.userId = userId;
      socket.displayName = displayName;
      socket.join(roomId);
    });

    socket.on("getGameState", ({ roomId, userId }) => {
      const session = gameSessionManager.getSession(roomId);
      if (session) {
        // 【核心修复 1】必须让新 Socket 重新进入房间，否则收不到后续 io.to(gameId).emit 的广播
        socket.join(roomId);

        const {
          players, currentPlayerIndex, currentRound, totalRounds, timer, currentFlashcard, scores, 
          // yue
          status
        } = session;

        // --- 【核心修复：更新 Socket ID】 ---
        // 在 session 的玩家列表里找到当前发请求的人
        const player = players.find(p => p.userId === userId);
        if (player) {
          console.log(`[Sync] User ${player.displayName} reconnected. Updating SocketID: ${player.socketId} -> ${socket.id}`);
          player.socketId = socket.id; // 更新为当前最新的 Socket ID
        }
        // ----------------------------------
        
        const drawer = session.players[session.currentPlayerIndex];
        const isDrawer = userId === drawer?.userId;

        // 把分数塞进每个 player 对象里再发给前端
        const playersWithScores = players.map(p => ({
          ...p,
          points: scores[p.userId] || 0 
        }));
        socket.emit("gameState", {
          players: playersWithScores, // 发送带分数的玩家列表,
          currentPlayerIndex: session.currentPlayerIndex,
          drawer,
          currentRound: session.currentRound,
          totalRounds: session.totalRounds,
          timer: session.timer,
          currentFlashcard: isDrawer ? session.currentFlashcard : null, // 👈 只给画手题目
          // 【核心修复 2】将 session 中存好的画布路径发给刷新的玩家
          canvasPaths: session.canvasPaths || [],
          roundInProgress: session.roundInProgress,
          scores,
          // yue
          status: status || (timer <= 0 && currentRound >= totalRounds ? "ended" : "playing"), 
          isGameOver: status === "ended"
        });
      }
    });

    // ---- start game ----
    socket.on("startGame", ({ gameId, totalRounds, timer, difficulty }) => {
      console.log("[socket] startGame:", { gameId, totalRounds, timer, difficulty, by: socket.id, userId: socket.userId });

      const players = [];
      const socketsInRoom = io.sockets.adapter.rooms.get(gameId);
      if (socketsInRoom) {
        for (const sid of socketsInRoom) {
          const s = io.sockets.sockets.get(sid);
          if (s?.userId && s?.displayName) {
            players.push({ userId: s.userId, displayName: s.displayName, socketId: s.id });
          }
        }
      }

      gameSessionManager.createSession(gameId, players, totalRounds, timer, difficulty);
      gameSessionManager.startRound(gameId, io);

      io.to(gameId).emit("updatePlayers", gameSessionManager.getPlayersWithScores(gameId));
      io.to(gameId).emit("startTimer", { duration: timer });
      startSynchronizedTimer(io, gameId, timer);
    });

    // ---- drawing relay (only drawer can broadcast) ----
    socket.on("drawing-data", ({ gameId, userId, data }) => {
      const session = gameSessionManager.getSession(gameId);
      if (!session) return;
      const drawerId = session.players[session.currentPlayerIndex]?.userId;
      if (userId !== drawerId) return;

      // 存储路径到 session 中，供刷新的人加载
      session.canvasPaths = data;
      socket.to(gameId).emit("drawing-data", data);
    });

    // ---- submit answer ----
    socket.on("submitAnswer", ({ gameId, userId, answer }) => {
      console.log(`[YUE]Answer submitted in game ${gameId} by user ${userId}:`, answer);
      const session = gameSessionManager.getSession(gameId);
      if (!session) return;

      const drawer = session.players[session.currentPlayerIndex];
      const player = session.players.find((p) => p.userId === userId);
      if (!player) return;

      // Only allow teammates of the drawer to answer, and not the drawer themselves
      if (player.team !== drawer.team || player.userId === drawer.userId) {
        socket.emit("answerRejected", { message: "It's not your team's turn to guess!" });
        return;
      }

      // Read the current remaining seconds for speed scoring
      const remainingSeconds = activeTimers[gameId]?.secondsLeft ?? 0;

      const result = gameSessionManager.handleAnswer(
        gameId,
        userId,
        answer,
        io,
        remainingSeconds
      );

      // All teammates answered correctly -> immediately proceed to the next round
      if (result?.allSubmitted) {
        clearActiveTimer(gameId);
        proceedToNextRound(io, gameId);
      }
    });

    // ---- manual nextRound ----
    socket.on("nextRound", ({ gameId }) => {
      clearActiveTimer(gameId);
      proceedToNextRound(io, gameId);
    });

    socket.on("startRound", async ({ roomId }) => {
      await gameSessionManager.startRound(roomId, io);
    });

    socket.on("getRoomPlayers", ({ roomId }) => {
      const session = gameSessionManager.getSession(roomId);
      if (session) io.to(roomId).emit("roomPlayers", { players: session.players });
    });

    socket.on("disconnect", () => {});
  });
}

/** Synchronize timer to all clients and write remaining seconds back to activeTimers for scoring */
function startSynchronizedTimer(io, gameId, duration) {
  clearActiveTimer(gameId);

  let secondsLeft = Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0;

  // Write initial state first, so it's immediately readable from the outside
  activeTimers[gameId] = { intervalId: null, secondsLeft };

  const intervalId = setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);

    // Write back every second, submit answer to get real-time remaining time
    if (activeTimers[gameId]) {
      activeTimers[gameId].secondsLeft = secondsLeft;
    }

    io.to(gameId).emit("timerUpdate", { secondsLeft });

    if (secondsLeft <= 0) {
      clearInterval(intervalId);
      io.to(gameId).emit("clear-canvas");
      delete activeTimers[gameId];

      // Time's up → proceed to the next round
      proceedToNextRound(io, gameId);
    }
  }, 1000);

  activeTimers[gameId].intervalId = intervalId;
}

function clearActiveTimer(gameId) {
  if (activeTimers[gameId]) {
    clearInterval(activeTimers[gameId].intervalId);
    delete activeTimers[gameId];
  }
}

/** Proceed to the next round: switch drawer, draw new card, start new timer */
function proceedToNextRound(io, gameId) {
  // 1. 检查锁：看看函数是否因为 advancingRounds 提前退出了
  console.log(`[Debug] proceedToNextRound called for room: ${gameId}. Current locks:`, Array.from(advancingRounds));

  if (advancingRounds.has(gameId)) {
    console.log(`[Debug] Blocked by lock for room: ${gameId}`);
    return; 
  } // Prevent repeated entry into the next round
  advancingRounds.add(gameId);

  try {
    const nextRoundInfo = gameSessionManager.nextRound(gameId);

    if (nextRoundInfo) {
      console.log("Next Round Info:", nextRoundInfo);

      // startRound is responsible for: sending a new Flashcard to the questioner, broadcasting drawerChanged/roundStarted, and updating gameState
      gameSessionManager.startRound(gameId, io);

      io.to(gameId).emit("startTimer", { duration: nextRoundInfo.timer });
      startSynchronizedTimer(io, gameId, nextRoundInfo.timer);
    } else {
      // 1. 获取当前房间的 session
      const session = gameSessionManager.getSession(gameId);
      
      // 2. 准备结算数据：将 scores 对象里的分数合并到 players 数组中
      const finalPlayers = session ? session.players.map(p => ({
        ...p,
        points: session.scores[p.userId] || 0
      })) : [];

      // 3. 标记 session 状态为已结束（确保刷新后的 getGameState 也能拿到）
      if (session) session.status = "ended";

      // 4. 【关键】广播给所有人，并带上 finalPlayers 数据
      console.log(`[GameEnded] Sending final scores for room ${gameId}`);
      io.to(gameId).emit("gameEnded", finalPlayers); 
      
      clearActiveTimer(gameId);


      // io.to(gameId).emit("gameEnded");
      // clearActiveTimer(gameId);
    }
  } finally {
    advancingRounds.delete(gameId);
  }
}

module.exports = createGameSocket;

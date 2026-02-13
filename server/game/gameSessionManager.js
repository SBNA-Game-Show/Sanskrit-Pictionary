// server/game/gameSessionManager.js
// GameSessionManager - manages in-memory game sessions and fetches flashcards from MongoDB
const Flashcard = require("../models/Flashcard");

// ========== helpers: normalization & synonyms ==========
function normDeva(s) {
  return (s || "")
    .toString()
    .trim()
    .normalize("NFC")
    .replace(/[\u200C\u200D\uFEFF]/g, "") // ZWNJ/ZWJ/BOM
    .replace(/[\u2018\u2019\u201C\u201D"'`]+/g, "") // quotes
    .replace(/[^\p{L}\p{M}\p{N}\u0900-\u097F]/gu, ""); // keep letters/marks/digits + Devanagari
}

function normLatin(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip latin diacritics
    .replace(/[^a-z0-9]+/g, ""); // keep a-z0-9
}

function stripCommonEndings(s) {
  return s.replace(/(am|ah|aḥ|m|ḥ|ṃ)$/u, "");
}

function toArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return String(v).split(/[\/,;|、，\s]+/).filter(Boolean);
}

function pushManyDeva(set, raw) {
  for (const x of toArray(raw)) {
    const t = normDeva(x);
    if (t) set.add(t);
  }
}
// ======================================================

class GameSessionManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession(gameId, players, totalRounds, timer, difficulty) {
    // shuffle players and assign teams (even/odd)
    const shuffled = players.slice().sort(() => Math.random() - 0.5);
    shuffled.forEach((p, i) => {
      p.team = i % 2 === 0 ? "Red" : "Blue";
    });

    // make sure the first drawer is on Red team if available
    let firstDrawerIndex = shuffled.findIndex((p) => p.team === "Red");
    if (firstDrawerIndex === -1) firstDrawerIndex = 0;

    this.sessions.set(gameId, {
      players: shuffled,
      currentRound: 0,
      totalRounds,
      currentPlayerIndex: firstDrawerIndex,
      timer,
      difficulty,
      roundInProgress: false,
      scores: {},
      currentFlashcard: null,
      status: "playing", // "playing" or "ended"
    });

    // init scores
    shuffled.forEach((p) => {
      this.sessions.get(gameId).scores[p.userId] = 0;
    });

    console.log(
      `[createSession] gameId=${gameId} players=${shuffled.length} timer=${timer} difficulty=${difficulty}`
    );
  }

  getSession(gameId) {
    return this.sessions.get(gameId);
  }

  /**
   * Try to fetch a random flashcard from MongoDB.
   * - Uses case-insensitive matching for difficulty
   * - Falls back to any random flashcard if none for given difficulty
   */
  async getRandomFlashcard(difficulty) {
    try {
      let query = {};
      if (difficulty) {
        query = { difficulty: { $regex: `^${difficulty}$`, $options: "i" } };
      }

      const countMatching = await Flashcard.countDocuments(query);
      const totalCount = await Flashcard.countDocuments({});
      console.log(
        `[getRandomFlashcard] difficulty=${difficulty} matching=${countMatching} total=${totalCount}`
      );

      if (countMatching === 0 && totalCount > 0) {
        console.warn(
          `[getRandomFlashcard] No flashcards found for difficulty "${difficulty}". Falling back to any flashcard.`
        );
        const any = await Flashcard.aggregate([{ $sample: { size: 1 } }]);
        return any && any.length ? any[0] : null;
      }

      if (totalCount === 0) {
        console.warn("[getRandomFlashcard] Database has no flashcards at all.");
        return null;
      }

      const res = await Flashcard.aggregate([
        { $match: query },
        { $sample: { size: 1 } },
      ]);
      if (!res || res.length === 0) {
        console.warn(
          "[getRandomFlashcard] aggregate returned no results (unexpected)."
        );
        return null;
      }
      console.log("[getRandomFlashcard] chosen:", res[0]);
      return res[0];
    } catch (err) {
      console.error("[getRandomFlashcard] error:", err);
      return null;
    }
  }

  async startRound(gameId, io) {
    const session = this.getSession(gameId);
    if (!session || !session.players.length) return;

    // 【核心修复 4】清空画布路径缓存
    session.canvasPaths = [];
    
    // 1. 【核心修复：获取最新 SocketId】
    // 永远从 session.players 中根据当前的 index 实时获取最新的对象
    const currentPlayer = session.players[session.currentPlayerIndex]; 
    if (!currentPlayer) return;

    // 2. 【核心修复：先抽题，后发送】
    // 必须等待题目拿到并存入 session 后，再通知前端
    const flashcard = await this.getRandomFlashcard(session.difficulty);
    if (!flashcard) {
        io.to(gameId).emit("flashcardError", { message: "No flashcards found." });
        return;
    }
    
    // 将新题目持久化到 session，这样刷新后的 getGameState 才能抓到它
    session.currentFlashcard = flashcard; 
    session.roundInProgress = true;

    console.log(`[startRound] Game: ${gameId}, Round: ${session.currentRound + 1}, Drawer: ${currentPlayer.displayName}, Socket: ${currentPlayer.socketId}`);

    // 3. 使用最新的 socketId 发送私密题目给画手
    io.to(currentPlayer.socketId).emit("newFlashcard", {
        word: flashcard.word,
        transliteration: flashcard.transliteration,
        translation: flashcard.translation,
        imageSrc: flashcard.imageSrc || "",
        audioSrc: flashcard.audioSrc || "",
        difficulty: flashcard.difficulty || session.difficulty || "unknown",
    });

    // 4. 广播给所有人：谁在画画（不带题目）
    io.to(gameId).emit("drawerChanged", {
        userId: currentPlayer.userId,
        displayName: currentPlayer.displayName,
        team: currentPlayer.team,
    });

    io.to(gameId).emit("roundStarted", {
      currentRound: session.currentRound + 1,
      totalRounds: session.totalRounds,
      currentPlayer: currentPlayer.displayName,
      timer: session.timer,
    });

    // io.to(gameId).emit("gameState", {
    //   players: this.getPlayersWithScores(gameId),
    //   currentPlayerIndex: session.currentPlayerIndex,
    //   drawer: {
    //     userId: currentPlayer.userId,
    //     displayName: currentPlayer.displayName,
    //     team: currentPlayer.team,
    //     socketId: currentPlayer.socketId,
    //   },
    //   currentRound: session.currentRound + 1,
    //   totalRounds: session.totalRounds,
    //   timer: session.timer,
    //   currentFlashcard: null, // drawer-only
    //   scores: session.scores,
    // });

    session.players.forEach((p) => {
      p.hasAnswered = false;
    });
  }

  nextRound(gameId) {
    const session = this.sessions.get(gameId);
    if (!session) return null;
    if (session.currentRound >= session.totalRounds) {
        session.status = "ended"; // 这样 getGameState 就能抓到这个状态了
        return null; 
    }

    session.currentRound++;
    session.currentPlayerIndex =
      (session.currentPlayerIndex + 1) % session.players.length;
    session.roundInProgress = true;
    session.status = "playing"; // 确保每轮开始时状态是 playing

    return {
      currentRound: session.currentRound,
      currentPlayer: session.players[session.currentPlayerIndex],
      timer: session.timer,
      difficulty: session.difficulty,
    };
  }

  // NOTE: include remainingSeconds for time-based scoring
  handleAnswer(gameId, userId, answer, io, remainingSeconds = 0) {
    const session = this.getSession(gameId);
    if (!session || !session.currentFlashcard || !session.roundInProgress) {
      return { allSubmitted: false };
    }

    const player = session.players.find((p) => p.userId === userId);
    if (!player) return { allSubmitted: false };

    if (player.hasAnswered) {
      io.to(gameId).emit("answerResult", {
        ok: false,
        userId,
        reason: "ALREADY_ANSWERED",
      });
      return { allSubmitted: false };
    }

    // ----- correctness (Devanagari + english + transliteration + synonyms) -----
    const submittedRaw = answer;

    const subDeva = normDeva(submittedRaw);
    const subLat = normLatin(submittedRaw);

    const corWord = session.currentFlashcard.word;
    const traWord = session.currentFlashcard.translation;
    const romWord = session.currentFlashcard.transliteration;

    const corDeva = normDeva(corWord);
    const traLat = normLatin(traWord);
    const romLat = normLatin(romWord);

    // synonyms/aliases/altWords supported if provided by DB
    const acceptDeva = new Set();
    pushManyDeva(acceptDeva, corWord);
    pushManyDeva(acceptDeva, session.currentFlashcard.synonyms);
    pushManyDeva(acceptDeva, session.currentFlashcard.aliases);
    pushManyDeva(acceptDeva, session.currentFlashcard.altWords);

    const isCorrect =
      (subDeva && acceptDeva.has(subDeva)) ||
      (subLat && traLat && subLat === traLat) ||
      (subLat &&
        romLat &&
        (subLat === romLat ||
          stripCommonEndings(subLat) === stripCommonEndings(romLat)));

    if (isCorrect) {
      // ----- time-based score -----
      const MAX_SCORE = 200;
      const MIN_SCORE = 10;
      const total = Number(session.timer) || 60;
      const remain = Math.max(
        0,
        Math.min(total, Number(remainingSeconds) || 0)
      );
      const ratio = total > 0 ? remain / total : 0;
      const gained = Math.floor(MIN_SCORE + (MAX_SCORE - MIN_SCORE) * ratio);

      player.hasAnswered = true;
      session.scores[userId] = (session.scores[userId] || 0) + gained;

      io.to(gameId).emit("correctAnswer", {
        userId,
        displayName: player.displayName,
        points: session.scores[userId],
        scoreGained: gained,
        remainingSeconds: remain,
      });

      io.to(gameId).emit("updatePlayers", this.getPlayersWithScores(gameId));

      // check if all teammates (excluding drawer) already answered
      const drawer = session.players[session.currentPlayerIndex];
      const teammates = session.players.filter(
        (p) => p.team === drawer.team && p.userId !== drawer.userId
      );
      const everyoneCorrect =
        teammates.length > 0 && teammates.every((p) => p.hasAnswered === true);

      // DO NOT start next round here; let socket layer decide using this flag
      return { allSubmitted: Boolean(everyoneCorrect) };
    }

    // wrong answer
    io.to(gameId).emit("wrongAnswer", {
      userId,
      displayName: player.displayName,
    });
    return { allSubmitted: false };
  }

  endRound(gameId) {
    const session = this.sessions.get(gameId);
    if (session) session.roundInProgress = false;
  }

  addPlayer(gameId, player) {
    const session = this.getSession(gameId);
    if (session && !session.players.find((p) => p.userId === player.userId)) {
      session.players.push(player);
      session.scores[player.userId] = 0;
    }
  }

  updateScore(gameId, userId, points) {
    const session = this.getSession(gameId);
    if (session) {
      session.scores[userId] = (session.scores[userId] || 0) + points;
    }
  }

  getPlayersWithScores(gameId) {
    const session = this.sessions.get(gameId);
    if (!session) return [];
    return session.players.map((p) => ({
      displayName: p.displayName,
      userId: p.userId,
      team: p.team,
      points: session.scores[p.userId] || 0,
      imageSrc: p.imageSrc || "",
    }));
  }
}

module.exports = new GameSessionManager();

const { v4: uuidv4 } = require("uuid");

const Flashcard = require("../models/Flashcard");
const User = require("../models/User"); // NEW: Import the User model

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
  return String(v)
    .split(/[\/,;|、，\s]+/)
    .filter(Boolean);
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
  // NEW: Method to reset scores in the database
  async resetScoresForSession(players) {
    try {
      const userIds = players.map((p) => p.userId); // CHANGED: Use 'score' field
      await User.updateMany({ userId: { $in: userIds } }, { score: 0 });
      console.log(
        `[resetScoresForSession] Reset scores for ${userIds.length} players.`
      );
    } catch (err) {
      console.error("[resetScoresForSession] Error resetting scores:", err);
    }
  }

  async createSession(gameId, players, totalRounds, timer, difficulty) {
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
      roundInProgress: false, // Removed in-memory scores, they will be fetched from DB
      currentFlashcard: null,
    });
    // NEW: Reset scores for all players in the session
    await this.resetScoresForSession(shuffled);

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

    session.roundInProgress = true;

    const flashcard = await this.getRandomFlashcard(session.difficulty);
    if (!flashcard) {
      io.to(gameId).emit("flashcardError", { message: "No flashcards found." });
      return;
    }
    session.currentFlashcard = flashcard;

    const currentPlayer = session.players[session.currentPlayerIndex];
    if (!currentPlayer) {
      console.warn("[startRound] no currentPlayer for session", gameId);
      return;
    }

    console.log(
      `[startRound] gameId=${gameId} currentPlayer=${currentPlayer.userId} socketId=${currentPlayer.socketId}`
    );
    // Send flashcard privately to drawer
    io.to(currentPlayer.socketId).emit("newFlashcard", {
      word: flashcard.word,
      transliteration: flashcard.transliteration,
      hint: flashcard.translation,
      image: flashcard.imageSrc || "",
      audio: flashcard.audioSrc || "",
      difficulty: flashcard.difficulty || session.difficulty || "unknown",
    });

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

    io.to(gameId).emit("gameState", {
      players: await this.getPlayersWithScores(gameId), // CHANGED to await
      currentPlayerIndex: session.currentPlayerIndex,
      drawer: {
        userId: currentPlayer.userId,
        displayName: currentPlayer.displayName,
        team: currentPlayer.team,
        socketId: currentPlayer.socketId,
      },
      currentRound: session.currentRound + 1,
      totalRounds: session.totalRounds,
      timer: session.timer,
      currentFlashcard: null, // drawer-only
      scores: null, // Removed in-memory scores
    });

    session.players.forEach((p) => {
      p.hasAnswered = false;
    });
  }

  nextRound(gameId) {
    const session = this.getSession(gameId);
    if (!session) return null;
    if (session.currentRound >= session.totalRounds) return null;

    session.currentRound++;
    session.currentPlayerIndex =
      (session.currentPlayerIndex + 1) % session.players.length;
    session.roundInProgress = true;

    return {
      currentRound: session.currentRound,
      currentPlayer: session.players[session.currentPlayerIndex],
      timer: session.timer,
      difficulty: session.difficulty,
    };
  }

  // NOTE: include remainingSeconds for time-based scoring
  async handleAnswer(gameId, userId, answer, io, remainingSeconds = 0) {
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

      // NEW: Add points to the drawer as well
      const drawerId = session.players[session.currentPlayerIndex].userId;
      const drawerPoints = Math.floor(gained / 2); // Drawer gets half points
      await User.findByIdAndUpdate(
        drawerId,
        { $inc: { score: drawerPoints } },
        { new: true }
      );

      // FIX: Using findByIdAndUpdate to correctly query by MongoDB's _id
      // and return the updated document in a single call.
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { score: gained } },
        { new: true } // Return the updated document
      );

      if (!updatedUser) {
        console.warn(
          `User with ID ${userId} not found in DB after update attempt. Answer ignored.`
        );
        return { allSubmitted: false };
      }

      console.log(
        `[handleAnswer] Emitting correctAnswer for userId: ${updatedUser.userId}, points: ${updatedUser.score}, gained: ${gained}`
      );
      io.to(gameId).emit("correctAnswer", {
        userId: updatedUser.userId, // Use the custom userId from the found document
        displayName: player.displayName,
        points: updatedUser.score,
        scoreGained: gained,
        remainingSeconds: remain,
      });

      // Re-fetch players to ensure we have the most up-to-date scores
      const updatedPlayers = await this.getPlayersWithScores(gameId);

      console.log(
        "[handleAnswer] Emitting updatePlayers. First player's score:",
        updatedPlayers[0]?.score
      );
      // CHANGED: Get players with scores from the DB before broadcasting
      io.to(gameId).emit("updatePlayers", updatedPlayers);
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

  async addPlayer(gameId, player) {
    const session = this.getSession(gameId);
    if (session && !session.players.find((p) => p.userId === player.userId)) {
      session.players.push(player);
      // NEW: Ensure the new player has a score field in the DB
      // CHANGED: Use 'score' field
      await User.findOneAndUpdate(
        { userId: player.userId },
        { $setOnInsert: { score: 0 } },
        { upsert: true }
      );
    }
  }
  // This method is now unused, as score is handled in handleAnswer
  // updateScore(gameId, userId, points) {
  //   const session = this.getSession(gameId);
  //   if (session) {
  //     session.scores[userId] = (session.scores[userId] || 0) + points;
  //   }
  // }

  async getPlayersWithScores(gameId) {
    const session = this.sessions.get(gameId);
    if (!session) return [];
    // CHANGED: Fetch scores from MongoDB
    const playerIds = session.players.map((p) => p.userId);
    const dbUsers = await User.find({ userId: { $in: playerIds } });
    const userMap = new Map(dbUsers.map((u) => [u.userId, u.score || 0]));

    console.log(
      "[getPlayersWithScores] Fetched scores from DB:",
      Array.from(userMap.entries())
    );

    return session.players.map((p) => ({
      displayName: p.displayName,
      userId: p.userId,
      team: p.team,
      score: userMap.get(p.userId) || 0, // Get the score from the DB
      imageSrc: p.imageSrc || "",
    }));
  }
}

module.exports = new GameSessionManager();

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

  createSession(gameId, players, totalRounds, timer, difficulty, teams, hostData) {
    // assign players to selected teams
    players.forEach((p) => {
      if (teams.Red.includes(p.userId)) {
        p.team = "Red";
      } else if (teams.Blue.includes(p.userId)) {
        p.team = "Blue";
      }
    });

    // make sure the first drawer is on Red team if available
    let firstDrawerIndex = players.findIndex((p) => p.team === "Red");
    if (firstDrawerIndex === -1) firstDrawerIndex = 0;

    this.sessions.set(gameId, {
      players,
      hostData,
      currentRound: 1, // Round number should be starts from 1 
      totalRounds,
      currentPlayerIndex: firstDrawerIndex,
      timer,
      difficulty,
      roundInProgress: false,
      scores: {},
      currentFlashcard: null,
      canvasData: null,
      // guesses are tracked per-player (p.remainingGuesses)
    });

    // init scores
    players.forEach((p) => {
      this.sessions.get(gameId).scores[p.userId] = 0;
    });

    console.log(
      `[createSession] gameId=${gameId} players=${players.length} timer=${timer} difficulty=${difficulty}`
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
        `[getRandomFlashcard] difficulty=${difficulty} matching=${countMatching} total=${totalCount}`,
      );

      if (countMatching === 0 && totalCount > 0) {
        console.warn(
          `[getRandomFlashcard] No flashcards found for difficulty "${difficulty}". Falling back to any flashcard.`,
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
          "[getRandomFlashcard] aggregate returned no results (unexpected).",
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
    // Reset per-player guesses + answered state for new round
    session.players.forEach((p) => {
      p.hasAnswered = false;
      p.remainingGuesses = 4;
    });

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
      `[startRound] gameId=${gameId} currentPlayer=${currentPlayer.userId} socketId=${currentPlayer.socketId}`,
    );

    // Send flashcard privately to drawer and host
    io.to([currentPlayer.socketId, session.hostData.hostSocketId]).emit("newFlashcard", {
      word: flashcard.word,
      transliteration: flashcard.transliteration,
      translation: flashcard.translation,
      imageSrc: flashcard.imageSrc || "",
      audioSrc: flashcard.audioSrc || "",
      difficulty: flashcard.difficulty || session.difficulty || "unknown",
    });

    io.to(gameId).emit("drawerChanged", {
      userId: currentPlayer.userId,
      displayName: currentPlayer.displayName,
      team: currentPlayer.team,
    });

    io.to(gameId).emit("roundStarted", {
      currentRound: session.currentRound,
      totalRounds: session.totalRounds,
      currentPlayer: currentPlayer.displayName,
      timer: session.timer,
      // per-player guesses are sent via updatePlayers/gameState
    });

    io.to(gameId).emit("gameState", {
      players: this.getPlayersWithScores(gameId),
      hostData: session.hostData,
      currentPlayerIndex: session.currentPlayerIndex,
      drawer: {
        userId: currentPlayer.userId,
        displayName: currentPlayer.displayName,
        team: currentPlayer.team,
        socketId: currentPlayer.socketId,
      },
      currentRound: session.currentRound,
      totalRounds: session.totalRounds,
      timer: session.timer,
      currentFlashcard: null, // drawer-only
      scores: session.scores,
    });
  }

  nextRound(gameId, io) {
    const session = this.sessions.get(gameId);
    if (!session) return null;

    const lastDrawer = session.players[session.currentPlayerIndex];

    // End game when if reached total rounds and last drawer was Blue team
    if (lastDrawer.team === "Blue" 
        && session.currentRound >= session.totalRounds) return null;

    // Round number only increments after Blue team's turn, as Red always starts first
    if (lastDrawer.team === "Blue") {
      // Trigger roundEnded popup message
      io.to(gameId).emit("roundEnded", {
        roundNumber: session.currentRound
      });

      session.currentRound++;
    }

    // The turn should cycle through the target team members based on the round count
    session.currentPlayerIndex = this._getNextDrawerIndex(session, lastDrawer);
    session.roundInProgress = true;

    return {
      currentRound: session.currentRound,
      currentPlayer: session.players[session.currentPlayerIndex],
      timer: session.timer,
      difficulty: session.difficulty,
    };
  }

  // The next drawer should be the n-th member of the target team, 
  // where n corresponds to the current round number (modulo team size).
  _getNextDrawerIndex(session, lastDrawer) {
    // Next drawer should be from the opposite team of last drawer
    const targetTeam = (lastDrawer.team === "Blue") ? "Red" : "Blue";

    // Find all players and their indexes in the target team
    const targetTeamMembers = session.players
        .map((player, index) => ({ player, index }))
        .filter(item => item.player.team === targetTeam)
        .map(item => item.index);

    // Find the next drawer index based on current round number, ensuring it cycles through team members
    const nextDrawerIndex = (session.currentRound - 1) % targetTeamMembers.length;

    return targetTeamMembers[nextDrawerIndex];
  }

  // NOTE: include remainingSeconds for time-based scoring
  handleAnswer(gameId, userId, answer, io, remainingSeconds = 0) {
    const session = this.getSession(gameId);
    if (!session || !session.currentFlashcard || !session.roundInProgress) {
      return { allSubmitted: false };
    }

    const player = session.players.find((p) => p.userId === userId);
    if (!player) return { allSubmitted: false };

    // Ensure remainingGuesses is always a finite number in the 0..4 range.
    // This prevents accidental extra chances due to falsy/undefined values.
    const rgRaw = player.remainingGuesses;
    const rgNum = Number(rgRaw);
    if (!Number.isFinite(rgNum)) {
      player.remainingGuesses = 4;
    } else {
      player.remainingGuesses = Math.max(0, Math.min(4, Math.floor(rgNum)));
    }

    if (player.remainingGuesses <= 0) {
      if (player.socketId) {
        io.to(player.socketId).emit("answerRejected", {
          message: "No guesses left this round.",
        });
      }
      return { allSubmitted: false };
    }

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
        Math.min(total, Number(remainingSeconds) || 0),
      );
      const ratio = total > 0 ? remain / total : 0;
      const gained = Math.floor(MIN_SCORE + (MAX_SCORE - MIN_SCORE) * ratio);

      player.hasAnswered = true;
      session.scores[userId] = (session.scores[userId] || 0) + gained;

      const fc = session.currentFlashcard || {};
      const answerText =
        fc.transliteration || fc.translation || fc.word || "";

      io.to(gameId).emit("correctAnswer", {
        userId,
        displayName: player.displayName,
        points: session.scores[userId],
        scoreGained: gained,
        remainingSeconds: remain,
        answerText,
        answer: {
          word: fc.word || "",
          transliteration: fc.transliteration || "",
          translation: fc.translation || "",
        },
      });

      io.to(gameId).emit("updatePlayers", this.getPlayersWithScores(gameId));

      // check if all teammates (excluding drawer) already answered
      const drawer = session.players[session.currentPlayerIndex];
      const teammates = session.players.filter(
        (p) => p.team === drawer.team && p.userId !== drawer.userId,
      );
      const everyoneCorrect =
        teammates.length > 0 && teammates.every((p) => p.hasAnswered === true);

      // DO NOT start next round here; let socket layer decide using this flag
      return { allSubmitted: Boolean(everyoneCorrect) };
    }

    // wrong answer
    player.remainingGuesses = Math.max(0, (player.remainingGuesses ?? 4) - 1);

    // ----- score penalty for wrong answer -----
    const WRONG_ANSWER_PENALTY = 15;
    const currentScore = session.scores[userId] || 0;
    const newScore = Math.max(0, currentScore - WRONG_ANSWER_PENALTY);
    session.scores[userId] = newScore;

    io.to(gameId).emit("wrongAnswer", {
      userId,
      displayName: player.displayName,
      remainingGuesses: player.remainingGuesses,
      points: newScore,
      scoreLost: WRONG_ANSWER_PENALTY,
    });

    io.to(gameId).emit("updatePlayers", this.getPlayersWithScores(gameId));

    // End the round when ALL eligible guessers are either correct OR out of guesses
    const drawer = session.players[session.currentPlayerIndex];
    const eligibleGuessers = session.players.filter(
      (p) => p.team === drawer.team && p.userId !== drawer.userId,
    );

    const everyoneCorrect =
      eligibleGuessers.length > 0 && eligibleGuessers.every((p) => p.hasAnswered === true);
    const allGuessersDone =
      eligibleGuessers.length > 0 &&
      eligibleGuessers.every(
        (p) => p.hasAnswered === true || (p.remainingGuesses ?? 0) <= 0,
      );

    return { allSubmitted: Boolean(everyoneCorrect), guessesExhausted: Boolean(allGuessersDone && !everyoneCorrect) };
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
      remainingGuesses: p.remainingGuesses ?? 4,
      imageSrc: p.imageSrc || "",
    }));
  }

  // ✅ Get all sessions
  getAllSessions() {
    return this.sessions;
  }

  // ✅ Mark player as reconnected
  markPlayerReconnected(gameId, userId, socketId) {
    const session = this.sessions[gameId];
    if (!session) return false;

    const player = session.players.find((p) => p.userId === userId);
    if (player) {
      player.disconnected = false;
      player.socketId = socketId;
      delete player.disconnectTime;
      console.log(`[Session] Player ${userId} reconnected to ${gameId}`);
      return true;
    }
    return false;
  }

  // ✅ Remove player from session
  removePlayer(gameId, userId) {
    const session = this.sessions[gameId];
    if (!session) return false;

    const index = session.players.findIndex((p) => p.userId === userId);
    if (index !== -1) {
      session.players.splice(index, 1);
      console.log(`[Session] Removed player ${userId} from ${gameId}`);
      return true;
    }
    return false;
  }

  // ✅ ADD: Update canvas data
  updateCanvasData(gameId, canvasData) {
    const session = this.sessions.get(gameId);
    if (session) {
      session.canvasData = canvasData;
      return true;
    }
    return false;
  }

  // ✅ ADD: Clear canvas data (called when round changes)
  clearCanvasData(gameId) {
    const session = this.sessions.get(gameId);
    if (session) {
      session.canvasData = null;
      return true;
    }
    return false;
  }

  // ✅ ADD: Get canvas data
  getCanvasData(gameId) {
    const session = this.sessions.get(gameId);
    return session?.canvasData || null;
  }
}

module.exports = new GameSessionManager();

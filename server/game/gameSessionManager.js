// server/game/gameSessionManager.js
// GameSessionManager - manages in-memory game sessions and fetches flashcards from MongoDB
const Flashcard = require("../models/Flashcard");

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
      // Build query (case-insensitive) only if difficulty provided
      let query = {};
      if (difficulty) {
        // allow either "Easy"/"easy" etc.
        query = { difficulty: { $regex: `^${difficulty}$`, $options: "i" } };
      }

      // Log counts for debugging
      const countMatching = await Flashcard.countDocuments(query);
      const totalCount = await Flashcard.countDocuments({});
      console.log(
        `[getRandomFlashcard] difficulty=${difficulty} matching=${countMatching} total=${totalCount}`
      );

      // If there are no matching docs for difficulty, fallback to any
      if (countMatching === 0 && totalCount > 0) {
        console.warn(
          `[getRandomFlashcard] No flashcards found for difficulty "${difficulty}". Falling back to any flashcard.`
        );
        // pick any random document
        const any = await Flashcard.aggregate([{ $sample: { size: 1 } }]);
        return any && any.length ? any[0] : null;
      }

      // If both counts are zero, return null
      if (totalCount === 0) {
        console.warn("[getRandomFlashcard] Database has no flashcards at all.");
        return null;
      }

      // Get a random matching flashcard
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

    // fetch a flashcard from DB (with fallback)
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

    // DEBUG logs
    console.log(
      `[startRound] gameId=${gameId} currentPlayer=${currentPlayer.userId} socketId=${currentPlayer.socketId}`
    );
    console.log("[startRound] flashcard chosen:", flashcard);

    // Emit the flashcard ONLY to the drawer's socket (private)
    io.to(currentPlayer.socketId).emit("newFlashcard", {
      // include fields the frontend expects; keep names consistent
      word: flashcard.word,
      transliteration: flashcard.transliteration,
      hint: flashcard.translation, // used as 'hint' on frontend
      image: flashcard.imageSrc || "",
      audio: flashcard.audioSrc || "",
      difficulty: flashcard.difficulty || session.difficulty || "unknown",
    });

    console.log(
      `[startRound] emitted newFlashcard to socket ${currentPlayer.socketId}`
    );

    // Broadcast which player is drawing
    io.to(gameId).emit("drawerChanged", {
      userId: currentPlayer.userId,
      displayName: currentPlayer.displayName,
      team: currentPlayer.team,
    });

    // Broadcast a roundStarted payload that matches what lobby/play expect
    const roundPayload = {
      currentRound: session.currentRound + 1,
      totalRounds: session.totalRounds,
      currentPlayer: currentPlayer.displayName,
      timer: session.timer,
    };
    io.to(gameId).emit("roundStarted", roundPayload);

    // Also emit a full gameState for clients that request it or to synchronize
    const gameState = {
      players: this.getPlayersWithScores(gameId),
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
      currentFlashcard: null, // not broadcast to everyone; drawer already got it privately
      scores: session.scores,
    };
    io.to(gameId).emit("gameState", gameState);

    // reset answer flags
    session.players.forEach((p) => {
      p.hasAnswered = false;
    });
  }

  nextRound(gameId) {
    const session = this.sessions.get(gameId);
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

  handleAnswer(gameId, userId, answer, io) {
    const session = this.getSession(gameId);
    if (!session || !session.currentFlashcard || !session.roundInProgress)
      return;

    const correct = session.currentFlashcard.word.trim().toLowerCase();
    const submitted = answer.trim().toLowerCase();

    const player = session.players.find((p) => p.userId === userId);
    if (!player || player.hasAnswered) return;

    player.hasAnswered = true;

    if (submitted === correct) {
      session.scores[userId] = (session.scores[userId] || 0) + 10;
      io.to(gameId).emit("correctAnswer", {
        userId,
        displayName: player.displayName,
        points: session.scores[userId],
      });

      io.to(gameId).emit("updatePlayers", this.getPlayersWithScores(gameId));

      setTimeout(() => {
        const next = this.nextRound(gameId);
        if (!next) {
          io.to(gameId).emit("gameEnded");
        } else {
          this.startRound(gameId, io);
        }
      }, 1500);
    } else {
      io.to(gameId).emit("wrongAnswer", {
        userId,
        displayName: player.displayName,
      });
    }
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

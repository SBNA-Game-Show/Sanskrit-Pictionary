// const Flashcard = require("../models/Flashcard");

class GameSessionManager {
  constructor() {
    this.sessions = new Map();

    // Local flashcards for testing
    this.testFlashcards = [
      { word: "Apple", translation: "Fruit", imageSrc: "", audioSrc: "", transliteration: "æpl" },
      { word: "Tree", translation: "Plant", imageSrc: "", audioSrc: "", transliteration: "triː" },
      { word: "Sun", translation: "Star", imageSrc: "", audioSrc: "", transliteration: "sʌn" },
    ];
  }

  createSession(gameId, players, totalRounds, timer, difficulty) {
    const shuffled = players.slice().sort(() => Math.random() - 0.5);
    shuffled.forEach((p, i) => {
      p.team = i % 2 === 0 ? "Red" : "Blue";
    });

    let firstDrawerIndex = shuffled.findIndex(p => p.team === "Red");
    if (firstDrawerIndex === -1) {
      firstDrawerIndex = 0;
    }

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
  }

  getSession(gameId) {
    return this.sessions.get(gameId);
  }

  // --- ORIGINAL DB CALL COMMENTED OUT ---
  /*
  async getRandomFlashcard(difficulty) {
    const flashcards = await Flashcard.aggregate([
      { $match: { difficulty } },
      { $sample: { size: 1 } }
    ]);
    return flashcards[0];
  }
  */

  // Local test version (no Mongo)
  async getRandomFlashcard(difficulty) {
    const list = this.testFlashcards;
    return list[Math.floor(Math.random() * list.length)];
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

    io.to(currentPlayer.socketId).emit("newFlashcard", {
      word: flashcard.word,
      hint: flashcard.translation,
      image: flashcard.imageSrc,
      audio: flashcard.audioSrc,
      transliteration: flashcard.transliteration
    });

    io.to(gameId).emit("drawerChanged", {
      userId: currentPlayer.userId,
      displayName: currentPlayer.displayName,
      team: currentPlayer.team
    });

    io.to(gameId).emit("roundStarted", {
      round: session.currentRound + 1,
      totalRounds: session.totalRounds,
      currentPlayer: currentPlayer.displayName
    });

    session.players.forEach((p) => { p.hasAnswered = false; });
  }

  nextRound(gameId) {
    const session = this.sessions.get(gameId);
    if (!session) return null;
    if (session.currentRound >= session.totalRounds) return null;

    session.currentRound++;
    session.currentPlayerIndex = (session.currentPlayerIndex + 1) % session.players.length;
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
    if (!session || !session.currentFlashcard || !session.roundInProgress) return;

    const correctWord = (session.currentFlashcard.word || '').trim().toLowerCase();
    const submitted = (answer || '').trim().toLowerCase();


    const player = session.players.find((p) => p.userId === userId);
    if (!player) return;

    if (player.hasAnswered) {
      io.to(gameId).emit("answerResult", { ok: false, userId, reason: "ALREADY_CORRECT" });
      return { allSubmitted: false };
    }

    if (submitted === correctWord) {
      //Score by speed: linearly decreasing
      const MAX_SCORE = 200;
      const MIN_SCORE = 10;

      const total = Number(session.timer) || 60; 
      const remain = Math.max(0, Math.min(total, Number(remainingSeconds) || 0));
      const remainRatio = total > 0 ? (remain / total) : 0;
      const gained = Math.floor(MIN_SCORE + (MAX_SCORE - MIN_SCORE) * remainRatio);

      // Scoring
      player.hasAnswered = true;
      session.scores[userId] = (session.scores[userId] || 0) + gained;
      
      io.to(gameId).emit("correctAnswer", {
        userId,
        displayName: player.displayName,
        points: session.scores[userId],
        scoreGained: gained, 
        remainingSeconds: remain   
      });

      io.to(gameId).emit("updatePlayers", this.getPlayersWithScores(gameId));

      const drawer = session.players[session.currentPlayerIndex];
      const teammates = session.players.filter(p => p.team === drawer.team && p.userId !== drawer.userId);
      const everyoneCorrect = teammates.length > 0 && teammates.every(p => p.hasAnswered === true);

      return { allSubmitted: Boolean(everyoneCorrect) };
    }

    io.to(gameId).emit("wrongAnswer", {
      userId,
      displayName: player.displayName
    });
    return { allSubmitted: false };
  }

  endRound(gameId) {
    const session = this.sessions.get(gameId);
    if (session) session.roundInProgress = false;
  }

  addPlayer(gameId, player) {
    const session = this.getSession(gameId);
    if (session && !session.players.find(p => p.userId === player.userId)) {
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
    return session.players.map(p => ({
      displayName: p.displayName,
      userId: p.userId,
      team: p.team,
      points: session.scores[p.userId] || 0,
      imageSrc: p.imageSrc || ''
    }));
  }
}

module.exports = new GameSessionManager();

const Flashcard = require("../models/Flashcard");

class GameSessionManager {
  constructor() {
    this.sessions = new Map(); 
  }

  createSession(gameId, players, totalRounds, timer, difficulty) {
    this.sessions.set(gameId, {
      players,
      currentRound: 0,
      totalRounds,
      currentPlayerIndex: 0,
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

  async getRandomFlashcard(difficulty) {
    const flashcards = await Flashcard.aggregate([
      { $match: { difficulty } },
      { $sample: { size: 1 } }
    ]);
    return flashcards[0];
  }

  async startRound(gameId, io) {
    const session = this.getSession(gameId);
    if (!session) return;

    session.roundInProgress = true;

    const flashcard = await this.getRandomFlashcard(session.difficulty);
    if (!flashcard) {
      io.to(gameId).emit("flashcardError", { message: "No flashcards found." });
      return;
    }

    session.currentFlashcard = flashcard;

    const currentPlayer = session.players[session.currentPlayerIndex];

    //Sent only to the questioner
    io.to(currentPlayer.socketId).emit("newFlashcard", {
      word: flashcard.word,
      hint: flashcard.translation,
      image: flashcard.imageSrc,
      audio: flashcard.audioSrc,
      transliteration: flashcard.transliteration
    });

    //Everyone: Notify the round start + question setter
    io.to(gameId).emit("roundStarted", {
      round: session.currentRound + 1,
      totalRounds: session.totalRounds,
      currentPlayer: currentPlayer.displayName
    });

    session.players.forEach((p) => {
      p.hasAnswered = false;
    });
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
  const session = this.sessions.get(gameId);
  if (!session || !session.currentFlashcard || !session.roundInProgress) return;

  const correct = session.currentFlashcard.word.trim().toLowerCase();
  const submitted = answer.trim().toLowerCase();

  const player = session.players.find((p) => p.userId === userId);
  if (!player || player.hasAnswered) return; // Avoid repeated answers

  player.hasAnswered = true;

  if (submitted === correct) {
    // Correct: Add points + Broadcast
    session.scores[userId] = (session.scores[userId] || 0) + 10;

    io.to(gameId).emit("correctAnswer", {
      userId,
      displayName: player.displayName,
      points: session.scores[userId],
    });

    // Broadcast all players' score updates
    const updatedPlayers = this.getPlayersWithScores(gameId);
    io.to(gameId).emit("updatePlayers", updatedPlayers);

    // Automatically switch after this round ends
    setTimeout(() => {
      const next = this.nextRound(gameId);
      if (!next) {
        io.to(gameId).emit("gameEnded");
      } else {
        this.startRound(gameId, io);
      }
    }, 1500);
  } else {
    // Wrong answer broadcast
    io.to(gameId).emit("wrongAnswer", {
      userId,
      displayName: player.displayName
    });
  }
}


  endRound(gameId) {
    const session = this.sessions.get(gameId);
    if (session) session.roundInProgress = false;
  }

  addPlayer(gameId, player) {
    const session = this.sessions.get(gameId);
    if (session && !session.players.find(p => p.userId === player.userId)) {
      session.players.push(player);
      session.scores[player.userId] = 0;
    }
  }

  updateScore(gameId, userId, points) {
    const session = this.sessions.get(gameId);
    if (session) {
      session.scores[userId] = (session.scores[userId] || 0) + points;
    }
  }

  getPlayersWithScores(gameId) {
  const session = this.sessions.get(gameId);
  if (!session) return [];
  
  return session.players.map(p => ({
    name: p.displayName,
    userId: p.userId,
    points: session.scores[p.userId] || 0,
    imageSrc: p.imageSrc || '' 
  }));
  }
}

module.exports = new GameSessionManager();

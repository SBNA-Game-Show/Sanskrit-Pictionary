// server/game/gameSessionManager.js
// GameSessionManager - manages in-memory game sessions and fetches flashcards from MongoDB
const Flashcard = require("../models/Flashcard");

const FLASHCARD_MANIFEST_URL =
  process.env.FLASHCARD_MANIFEST_URL ||
  "https://raw.githubusercontent.com/SBNA-Game-Show/sanskrit-asset/main/data/images.json";

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
const EventEmitter = require("events");

class GameSessionManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
  }

  // --- PAUSE/RESUME LOGIC ---
  pauseTimer(gameId) {
    this.emit("pauseTimer", gameId);
  }

  resumeTimer(gameId) {
    this.emit("resumeTimer", gameId);
  }

  async createSession(gameId, players, totalRounds, timer, difficulty, teams, hostData, guesses, isLearningMode) {
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
      redTeamRound: 1, // Indicater the n-th drawer of red team
      blueTeamRound: 1, // Indicater the n-th drawer of blue team
      timer,
      difficulty,
      isLearningMode, // Added isLearningMode
      guesses: Number(guesses) || 3, // Guesses config with default value 3
      roundInProgress: false,
      scores: {},
      currentFlashcard: null,
      canvasData: null,
      usedFlashcardIds: [],
      flashcardDeck: [],    
      deckIndex: 0,
      // guesses are tracked per-player (p.remainingGuesses)
      gameEnded: false // flag to indicate if game has ended (after final round)
    });

    await this.initializeFlashcardDeck(gameId, difficulty);

    // init scores
    players.forEach((p) => {
      this.sessions.get(gameId).scores[p.userId] = 0;
    });

    console.log(
      `[createSession] gameId=${gameId} players=${players.length} isLearningMode=${isLearningMode}
        timer=${timer} difficulty=${difficulty} guesses=${guesses}`
    );
  }

  getSession(gameId) {
    return this.sessions.get(gameId);
  }

  async initializeFlashcardDeck(gameId, difficulty) {
    const session = this.getSession(gameId);

    const response = await fetch(FLASHCARD_MANIFEST_URL);
    const manifest = await response.json();

    // Manifest is now pictionary-only and already uses the game schema.
    const all = manifest.filter(
      (card) =>
        card.difficulty?.toLowerCase() === difficulty.toLowerCase() &&
        card.word &&
        card.transliteration &&
        card.translation,
    );
    
    // Shuffle in normal case!
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    
    session.flashcardDeck = all;
    session.deckIndex = 0;
    
    console.log(`[initializeFlashcardDeck] Deck initialized with ${all.length} cards`);
  }

  /**
   * Try to fetch a random flashcard from MongoDB.
   * - Uses case-insensitive matching for difficulty
   * - Falls back to any random flashcard if none for given difficulty
   */
  async getRandomFlashcard(gameId, difficulty) {
    const session = this.getSession(gameId);
    
    // If deck empty or used up, reshuffle
    if (!session.flashcardDeck?.length || session.deckIndex >= session.flashcardDeck.length) {
      await this.initializeFlashcardDeck(gameId, difficulty);
    }
    
    // Get next card from deck
    const flashcard = session.flashcardDeck[session.deckIndex];
    session.deckIndex++;
    
    return flashcard;
  }

  async startRound(gameId, io) {
    const session = this.getSession(gameId);
    if (!session || !session.players.length) return;

    session.roundInProgress = true;
    // Reset per-player guesses + answered state for new round
    session.players.forEach((p) => {
      p.hasAnswered = false;
      // reset player's guesses with configed value in session
      p.remainingGuesses = session.guesses; 
    });

    const flashcard = await this.getRandomFlashcard(gameId, session.difficulty);
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
    io.to(gameId).emit("newFlashcard", {
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
      guesses: session.guesses, // send configed guesses
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
      guesses: session.guesses, // add guesses
      currentFlashcard: null, // drawer-only
      scores: session.scores,
    });
  }

  nextRound(gameId, io, lastDrawerOverride = null) {
    const session = this.sessions.get(gameId);
    if (!session) return null;

    if (session.isLearningMode){
      // Learning Mode:
      // send popup after every turn (both red and blue)
      const fc = session.currentFlashcard || {};

      io.to(gameId).emit("turnEnded", {
        word: fc.word || "",
        transliteration: fc.transliteration || "",
        imageSrc: fc.imageSrc || "",
        audioSrc: fc.audioSrc || ""
      });
    }

    const lastDrawer = lastDrawerOverride || session.players[session.currentPlayerIndex];

    // No next round if reached total rounds and last drawer was Blue team
    if (lastDrawer && lastDrawer.team === "Blue" 
        && session.currentRound >= session.totalRounds){
          session.gameEnded = true; // Mark game as ended
          return null;
        } 

    // Round number only increments after Blue team's turn, as Red always starts first
    if (lastDrawer && lastDrawer.team === "Blue") {
      // Trigger roundEnded popup message
      io.to(gameId).emit("roundEnded", {
        roundNumber: session.currentRound
      });

      session.redTeamRound++;
      session.blueTeamRound++;
      session.currentRound++;
    }

    // The turn should cycle through the target team members based on the round count
    session.currentPlayerIndex = this._getNextDrawerIndex(session, lastDrawer);
    if (session.currentPlayerIndex === -1) return null;

    session.roundInProgress = true;

    return {
      currentRound: session.currentRound,
      currentPlayer: session.players[session.currentPlayerIndex],
      redTeamRound: session.redTeamRound,
      blueTeamRound: session.blueTeamRound,
      timer: session.timer,
      difficulty: session.difficulty,
    };
  }

  // The next drawer should be the n-th member of the target team, 
  // where n corresponds to the current round number (modulo team size).
  _getNextDrawerIndex(session, lastDrawer) {
    // Next drawer should be from the opposite team of last drawer
    const targetTeam = (lastDrawer && lastDrawer.team === "Blue") ? "Red" : "Blue";
    // Get the teamRound to be updated
    const targetTeamRound = targetTeam === "Red" ? "redTeamRound" : "blueTeamRound";

    // Find all players and their indexes in the target team
    const targetTeamMembers = session.players
        .map((player, index) => ({ player, index }))
        .filter(item => item.player.team === targetTeam)
        .map(item => item.index);

    if (targetTeamMembers.length === 0) return -1;

    // Find the next drawer index based on teamRound number, ensuring it cycles through team members
    const nextDrawerIndex = (session[targetTeamRound] - 1) % targetTeamMembers.length;

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

    const getGuessersRoundStatus = () => {
      const drawer = session.players[session.currentPlayerIndex];
      const eligibleGuessers = session.players.filter(
        (p) => p.team === drawer.team && p.userId !== drawer.userId,
      );

      const everyoneCorrect =
        eligibleGuessers.length > 0 &&
        eligibleGuessers.every((p) => p.hasAnswered === true);
      const allGuessersDone =
        eligibleGuessers.length > 0 &&
        eligibleGuessers.every(
          (p) => p.hasAnswered === true || (p.remainingGuesses ?? 0) <= 0,
        );

      return { everyoneCorrect, allGuessersDone };
    };

    // Ensure remainingGuesses is always a finite number in the 0..session.guesses range.
    // This prevents accidental extra chances due to falsy/undefined values.
    const rgRaw = player.remainingGuesses;
    const rgNum = Number(rgRaw);
    if (!Number.isFinite(rgNum)) {
      player.remainingGuesses = session.guesses;
    } else {
      player.remainingGuesses = Math.max(0, Math.min(session.guesses, Math.floor(rgNum)));
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
        scoreGained: gained,
        answerText,
        answer: {
          word: fc.word || "",
          transliteration: fc.transliteration || "",
          translation: fc.translation || "",
        },
      });

      io.to(gameId).emit("updatePlayers", this.getPlayersWithScores(gameId));

      const { everyoneCorrect, allGuessersDone } = getGuessersRoundStatus();

      // DO NOT start next round here; let socket layer decide using these flags
      return {
        allSubmitted: Boolean(everyoneCorrect),
        guessesExhausted: Boolean(allGuessersDone && !everyoneCorrect),
      };
    }

    // wrong answer
    player.remainingGuesses = Math.max(0, (player.remainingGuesses ?? session.guesses) - 1);

    // ----- score penalty for wrong answer -----
    const WRONG_ANSWER_PENALTY = 15;
    const currentScore = session.scores[userId] || 0;
    const newScore = Math.max(0, currentScore - WRONG_ANSWER_PENALTY);
    session.scores[userId] = newScore;

    // emit to play incorrect sound and trigger point deduction popup
    io.to(gameId).emit("wrongAnswer", {
      userId,
      displayName: player.displayName,
      remainingGuesses: player.remainingGuesses,
      points: newScore,
      scoreLost: WRONG_ANSWER_PENALTY,
    });

    io.to(gameId).emit("updatePlayers", this.getPlayersWithScores(gameId));

    const { everyoneCorrect, allGuessersDone } = getGuessersRoundStatus();

    return {
      allSubmitted: Boolean(everyoneCorrect),
      guessesExhausted: Boolean(allGuessersDone && !everyoneCorrect),
    };
  }

  updatePlayerPoints(gameId, userId, scoreChange) {
    const session = this.sessions.get(gameId);
    const currentScore = session.scores[userId] || 0;
    const newScore = Math.max(0, currentScore + scoreChange);
    session.scores[userId] = newScore;

    return session.scores[userId];
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
      remainingGuesses: p.remainingGuesses ?? session.guesses,
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

  // Kick player from session
  kickPlayer(gameId, userId) {
    const session = this.sessions.get(gameId);
    if (!session) return null;

    const playerIndex = session.players.findIndex((p) => p.userId === userId);
    if (playerIndex === -1) return null;

    const isCurrentDrawer = session.currentPlayerIndex === playerIndex;
    const kickedPlayer = session.players[playerIndex];
    // Get the teamRound to be updated
    const kickedTeamRound = kickedPlayer.team === "Red" ? "redTeamRound" : "blueTeamRound";
    // Get kickedPlayer's index in team
    const kickedPlayerTeamIndex = session.players.filter(p => p.team === kickedPlayer.team).findIndex(p => p === kickedPlayer);
    const teamSizeBefore = session.players.filter(p => p.team === kickedPlayer.team).length;

    // Remove player
    session.players.splice(playerIndex, 1);

    // Clean up score
    delete session.scores[userId];

    // Adjust currentPlayerIndex if they were before the current drawer
    // If the kicked player index is less than the current player index, 
    // then the current player index should be decremented by 1
    if (playerIndex < session.currentPlayerIndex) {
      session.currentPlayerIndex--;
    }

    // If the kicked player's index is less equal than the current team player in team, 
    // then the current teamRound should be decremented by 1
    if (kickedPlayerTeamIndex <= session[kickedTeamRound] % teamSizeBefore ) {
      session[kickedTeamRound]--;
    }
    // If the kicked player index is outside of the array length,
    // set current player index back to 0 
    else if (session.currentPlayerIndex >= session.players.length) {
      session.currentPlayerIndex = 0;
    }

    console.log(`[Session] Kicked player ${userId} from ${gameId}`);
    return { isCurrentDrawer, kickedPlayer };
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

  deleteSession(gameId) {
    if (this.sessions.has(gameId)) {
      this.sessions.delete(gameId);
      console.log(`[Session] Deleted session ${gameId}`);
      return true;
    }
    return false;
  }
}

module.exports = new GameSessionManager();

/**
 * GameSessionManager - Manages in-memory game sessions and fetches flashcards from MongoDB
 * 
 * Responsibilities:
 * - Create and maintain game sessions
 * - Manage flashcard decks and rounds
 * - Handle player answers and scoring
 * - Emit game events (via EventEmitter)
 */

const Flashcard = require("../models/Flashcard");
const EventEmitter = require("events");

// ============= SCORING CONSTANTS =============
const SCORING = {
  MAX_SCORE: 200,        // Maximum points for perfect answer
  MIN_SCORE: 10,         // Minimum points for slowest correct answer
  WRONG_ANSWER_PENALTY: 15, // Points deducted for wrong guess
};

// ============= TEXT NORMALIZATION HELPERS =============

/**
 * Normalizes Devanagari text for comparison
 * - Handles Unicode normalization (NFC)
 * - Removes zero-width characters, quotes, and non-Devanagari characters
 * @param {string} s - Input string
 * @returns {string} Normalized Devanagari text
 */
function normDeva(s) {
  return (s || "")
    .toString()
    .trim()
    .normalize("NFC")
    .replace(/[\u200C\u200D\uFEFF]/g, "") // Remove ZWNJ/ZWJ/BOM
    .replace(/[\u2018\u2019\u201C\u201D"'`]+/g, "") // Remove various quote characters
    .replace(/[^\p{L}\p{M}\p{N}\u0900-\u097F]/gu, ""); // Keep only letters/marks/digits + Devanagari
}

/**
 * Normalizes Latin text for comparison
 * - Converts to lowercase
 * - Removes diacritical marks
 * - Keeps only alphanumeric characters
 * @param {string} s - Input string
 * @returns {string} Normalized Latin text (lowercase, no diacritics)
 */
function normLatin(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Strip Latin diacritical marks
    .replace(/[^a-z0-9]+/g, ""); // Keep only a-z and 0-9
}

/**
 * Strips common Sanskrit word endings during comparison
 * Handles Sanskrit case suffixes: am, ah, aḥ, m, ḥ, ṃ
 * @param {string} s - Input string
 * @returns {string} String without common endings
 */
function stripCommonEndings(s) {
  return s.replace(/(am|ah|aḥ|m|ḥ|ṃ)$/u, "");
}

/**
 * Converts value to array by splitting on common delimiters
 * @param {any} v - Value to convert (string, array, or falsy)
 * @returns {array} Array of non-empty strings
 */
function toArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return String(v)
    .split(/[\/,;|、，\s]+/) // Split on slash, comma, semicolon, pipe, Chinese punctuation, or whitespace
    .filter(Boolean);
}

/**
 * Adds normalized Devanagari versions of all values to a Set
 * Useful for building synonym/alias acceptance lists
 * @param {Set} set - Set to add normalized strings to
 * @param {string|array} raw - Raw string(s) to normalize and add
 */
function pushManyDeva(set, raw) {
  for (const x of toArray(raw)) {
    const t = normDeva(x);
    if (t) set.add(t);
  }
}

/**
 * GameSessionManager - Central manager for all active game sessions
 * Extends EventEmitter to emit game state changes to Socket.IO
 */
class GameSessionManager extends EventEmitter {
  /**
   * Initializes the game session manager
   * @constructor
   */
  constructor() {
    super();
    this.sessions = new Map(); // Map<gameId, sessionObject>
  }

  // ============= TIMER CONTROL =============

  /**
   * Emits a pause timer event for a specific game
   * @param {string} gameId - Game session ID
   */
  pauseTimer(gameId) {
    this.emit("pauseTimer", gameId);
  }

  /**
   * Emits a resume timer event for a specific game
   * @param {string} gameId - Game session ID
   */
  resumeTimer(gameId) {
    this.emit("resumeTimer", gameId);
  }

  // ============= SESSION MANAGEMENT =============

  /**
   * Creates a new game session with initial configuration
   * - Assigns players to teams
   * - Initializes scores and round counters
   * - Loads flashcard deck from database
   * 
   * @param {string} gameId - Unique game identifier
   * @param {array} players - Player objects with userId, displayName, socketId
   * @param {number} totalRounds - Total number of rounds to play
   * @param {number} timer - Time limit per round in seconds
   * @param {string} difficulty - Difficulty level for flashcards (Easy/Medium/Hard)
   * @param {object} teams - Team assignments {Red: [], Blue: []}
   * @param {object} hostData - Host configuration data
   * @param {number} guesses - Number of guesses per player per round
   * @param {boolean} isLearningMode - Whether the game is in learning mode
   */
  async createSession(gameId, players, totalRounds, timer, difficulty, teams, hostData, guesses, isLearningMode) {
    // Assign each player to their team
    players.forEach((p) => {
      if (teams.Red.includes(p.userId)) {
        p.team = "Red";
      } else if (teams.Blue.includes(p.userId)) {
        p.team = "Blue";
      }
    });

    // Determine first drawer: preferably from Red team to establish consistency
    let firstDrawerIndex = players.findIndex((p) => p.team === "Red");
    if (firstDrawerIndex === -1) firstDrawerIndex = 0;

    // Initialize session object with all game state
    this.sessions.set(gameId, {
      // Player and team tracking
      players,
      hostData,
      
      // Round and turn tracking
      currentRound: 1,        // Current round number (starts at 1)
      totalRounds,            // Total rounds configured
      currentPlayerIndex: firstDrawerIndex, // Index of current drawer in players array
      redTeamRound: 1,        // Tracks which Red team member's turn it is
      blueTeamRound: 1,       // Tracks which Blue team member's turn it is
      
      // Game configuration
      timer,                  // Time per round in seconds
      difficulty,             // Flashcard difficulty level
      isLearningMode,         // Learning mode flag (shows answer after each turn)
      guesses: Number(guesses) || 5, // Number of guesses per player per round (default: 5)
      
      // Game state flags
      roundInProgress: false, // Whether a round is currently active
      gameEnded: false,       // Whether the game has ended
      
      // Scoring and flashcards
      scores: {},             // Map<userId, totalScore>
      currentFlashcard: null, // Current flashcard being drawn
      canvasData: null,       // Drawing data from current round
      usedFlashcardIds: [],   // Flashcard IDs already used (for no-repeat logic if added)
      flashcardDeck: [],      // Pre-loaded deck of flashcards
      deckIndex: 0,           // Current position in deck
    });

    // Initialize scores for all players
    players.forEach((p) => {
      this.sessions.get(gameId).scores[p.userId] = 0;
    });

    // Load flashcards for this difficulty
    await this.initializeFlashcardDeck(gameId, difficulty);

    console.log(
      `[createSession] gameId=${gameId} players=${players.length} ` +
      `isLearningMode=${isLearningMode} timer=${timer}s difficulty=${difficulty} guesses=${guesses}`
    );
  }

  /**
   * Retrieves a session by game ID
   * @param {string} gameId - Game session ID
   * @returns {object|undefined} Session object or undefined if not found
   */
  getSession(gameId) {
    return this.sessions.get(gameId);
  }

  // ============= FLASHCARD MANAGEMENT =============

  /**
   * Loads and shuffles a deck of flashcards from the database
   * - First attempts to find cards matching the specified difficulty
   * - Falls back to all available cards if none match difficulty
   * - Uses Fisher-Yates shuffle for randomization
   * 
   * @param {string} gameId - Game session ID
   * @param {string} difficulty - Difficulty level (Easy/Medium/Hard)
   */
  async initializeFlashcardDeck(gameId, difficulty) {
    const session = this.getSession(gameId);
    if (!session) return;

    // Attempt to fetch flashcards matching the specified difficulty (case-insensitive)
    let cards = await Flashcard.find({
      difficulty: { $regex: `^${difficulty}$`, $options: "i" }
    }).lean();

    console.log(`[initializeFlashcardDeck] Found ${cards.length} flashcards for difficulty "${difficulty}"`);

    // If no cards found for difficulty, fall back to all available cards
    if (cards.length === 0) {
      console.warn(`[initializeFlashcardDeck] No cards for "${difficulty}", falling back to all flashcards...`);
      cards = await Flashcard.find({}).lean();
      console.log(`[initializeFlashcardDeck] Fallback: ${cards.length} total flashcards available`);

      if (cards.length === 0) {
        console.error("[initializeFlashcardDeck] CRITICAL: Database contains no flashcards!");
        session.flashcardDeck = [];
        session.deckIndex = 0;
        return;
      }
    }

    // Shuffle the deck using Fisher-Yates algorithm for better randomization
    this._shuffleArray(cards);

    // Store the shuffled deck in the session
    session.flashcardDeck = cards;
    session.deckIndex = 0;

    console.log(`[initializeFlashcardDeck] Deck ready with ${cards.length} shuffled cards`);
  }

  /**
   * Fisher-Yates shuffle algorithm for array randomization
   * @param {array} arr - Array to shuffle in-place
   * @private
   */
  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  /**
   * Retrieves the next flashcard from the deck
   * - Automatically reloads and reshuffles deck when exhausted
   * - Returns the same card and increments deck position
   * 
   * @param {string} gameId - Game session ID
   * @param {string} difficulty - Difficulty for reload if deck is empty
   * @returns {object|null} Flashcard object or null if no cards available
   */
  async getRandomFlashcard(gameId, difficulty) {
    const session = this.getSession(gameId);
    if (!session) return null;

    // If deck is empty or fully used, reinitialize it
    if (!session.flashcardDeck?.length || session.deckIndex >= session.flashcardDeck.length) {
      await this.initializeFlashcardDeck(gameId, difficulty);
    }

    // Return current card and advance position
    const flashcard = session.flashcardDeck[session.deckIndex];
    session.deckIndex++;

    return flashcard || null;
  }

  // ============= ROUND MANAGEMENT =============

  /**
   * Starts a new round in the game
   * - Resets player guesses and answered status
   * - Loads new flashcard from deck
   * - Emits game state to all players
   * 
   * @param {object} io - Socket.IO instance for emitting events
   * @param {string} gameId - Game session ID
   */
  async startRound(gameId, io) {
    const session = this.getSession(gameId);
    if (!session || !session.players.length) return;

    session.roundInProgress = true;

    // Reset all players' guesses and answered status for the new round
    session.players.forEach((p) => {
      p.hasAnswered = false;
      p.remainingGuesses = session.guesses; // Reset to configured value
    });

    // Fetch next flashcard
    const flashcard = await this.getRandomFlashcard(gameId, session.difficulty);
    if (!flashcard) {
      console.error("[startRound] No flashcards available!");
      io.to(gameId).emit("flashcardError", { message: "No flashcards found." });
      return;
    }
    session.currentFlashcard = flashcard;

    // Get current drawer
    const currentPlayer = session.players[session.currentPlayerIndex];
    if (!currentPlayer) {
      console.warn("[startRound] Current drawer not found for gameId:", gameId);
      return;
    }

    console.log(
      `[startRound] gameId=${gameId} drawer=${currentPlayer.userId} (${currentPlayer.displayName})`
    );

    // Broadcast flashcard and round info to all players
    io.to(gameId).emit("newFlashcard", {
      word: flashcard.word,
      transliteration: flashcard.transliteration,
      translation: flashcard.translation,
      imageSrc: flashcard.imageSrc || "",
      audioSrc: flashcard.audioSrc || "",
      difficulty: flashcard.difficulty || session.difficulty || "unknown",
    });

    // Notify all players who the current drawer is
    io.to(gameId).emit("drawerChanged", {
      userId: currentPlayer.userId,
      displayName: currentPlayer.displayName,
      team: currentPlayer.team,
    });

    // Emit round start event with game stats
    io.to(gameId).emit("roundStarted", {
      currentRound: session.currentRound,
      totalRounds: session.totalRounds,
      currentPlayer: currentPlayer.displayName,
      timer: session.timer,
      guesses: session.guesses,
    });

    // Send complete game state to all players
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
      guesses: session.guesses,
      scores: session.scores,
    });
  }

  /**
   * Advances to the next round (or ends game if total rounds reached)
   * - Handles Red/Blue team turn alternation
   * - Increments round counter after Blue team's turn
   * - Returns next round info or null if game ended
   * 
   * @param {string} gameId - Game session ID
   * @param {object} io - Socket.IO instance for emitting events
   * @param {object} lastDrawerOverride - Optional override for last drawer (defaults to current player)
   * @returns {object|null} Next round data or null if game ended
   */
  nextRound(gameId, io, lastDrawerOverride = null) {
    const session = this.sessions.get(gameId);
    if (!session) return null;

    const lastDrawer = lastDrawerOverride || session.players[session.currentPlayerIndex];

    // In Learning Mode: emit popup after every drawer's turn
    if (session.isLearningMode && lastDrawer) {
      const fc = session.currentFlashcard || {};
      io.to(gameId).emit("turnEnded", {
        word: fc.word || "",
        transliteration: fc.transliteration || "",
        imageSrc: fc.imageSrc || "",
        audioSrc: fc.audioSrc || "",
      });
    }

    // Check if game should end after Blue team's turn
    if (lastDrawer?.team === "Blue" && session.currentRound >= session.totalRounds) {
      session.gameEnded = true;
      console.log(`[nextRound] Game ended after round ${session.currentRound}`);
      return null;
    }

    // Increment round counter and emit roundEnded event (only after Blue team's turn)
    if (lastDrawer?.team === "Blue") {
      io.to(gameId).emit("roundEnded", {
        roundNumber: session.currentRound,
      });

      session.redTeamRound++;
      session.blueTeamRound++;
      session.currentRound++;
    }

    // Calculate next drawer and get their index
    session.currentPlayerIndex = this._getNextDrawerIndex(session, lastDrawer);
    if (session.currentPlayerIndex === -1) {
      console.warn("[nextRound] No valid next drawer found");
      return null;
    }

    session.roundInProgress = true;
    const nextPlayer = session.players[session.currentPlayerIndex];

    return {
      currentRound: session.currentRound,
      currentPlayer: nextPlayer,
      redTeamRound: session.redTeamRound,
      blueTeamRound: session.blueTeamRound,
      timer: session.timer,
      difficulty: session.difficulty,
    };
  }

  /**
   * Determines the next drawer based on team round counters
   * - Alternates between Red and Blue teams
   * - Cycles through team members using modulo arithmetic
   * 
   * @param {object} session - Game session object
   * @param {object} lastDrawer - The player who just finished drawing
   * @returns {number} Index of next drawer or -1 if no valid drawer exists
   * @private
   */
  _getNextDrawerIndex(session, lastDrawer) {
    // Alternate teams: if last was Blue, next is Red (and vice versa)
    const targetTeam = (lastDrawer?.team === "Blue") ? "Red" : "Blue";
    const teamRoundKey = targetTeam === "Red" ? "redTeamRound" : "blueTeamRound";

    // Get all players on target team and their indices in main player array
    const targetTeamMembers = session.players
      .map((player, index) => ({ player, index }))
      .filter(item => item.player.team === targetTeam)
      .map(item => item.index);

    if (targetTeamMembers.length === 0) {
      console.warn(`[_getNextDrawerIndex] No players found on team "${targetTeam}"`);
      return -1;
    }

    // Use current team round to determine which team member draws (cycling)
    const teamMemberIndex = (session[teamRoundKey] - 1) % targetTeamMembers.length;
    return targetTeamMembers[teamMemberIndex];
  }

  /**
   * Ends the current round (stops accepting answers)
   * @param {string} gameId - Game session ID
   */
  endRound(gameId) {
    const session = this.getSession(gameId);
    if (session) {
      session.roundInProgress = false;
    }
  }

  // ============= ANSWER HANDLING & SCORING =============

  /**
   * Processes a player's answer attempt
   * - Validates answer against current flashcard (Devanagari, English, transliteration)
   * - Supports synonyms and aliases
   * - Applies time-based scoring for correct answers
   * - Applies penalty for incorrect answers
   * 
   * @param {string} gameId - Game session ID
   * @param {string} userId - ID of answering player
   * @param {string} answer - Player's submitted answer
   * @param {object} io - Socket.IO instance for emitting events
   * @param {number} remainingSeconds - Time remaining in round (for scoring)
   * @returns {object} {allSubmitted: bool, guessesExhausted: bool}
   */
  handleAnswer(gameId, userId, answer, io, remainingSeconds = 0) {
    const session = this.getSession(gameId);
    if (!session || !session.currentFlashcard || !session.roundInProgress) {
      return { allSubmitted: false };
    }

    const player = session.players.find((p) => p.userId === userId);
    if (!player) return { allSubmitted: false };

    // Validate and normalize remaining guesses
    this._normalizePlayerGuesses(session, player);

    // Check if player has guesses remaining
    if (player.remainingGuesses <= 0) {
      if (player.socketId) {
        io.to(player.socketId).emit("answerRejected", {
          message: "No guesses left this round.",
        });
      }
      return { allSubmitted: false };
    }

    // Check if player already answered in this round
    if (player.hasAnswered) {
      io.to(gameId).emit("answerResult", {
        ok: false,
        userId,
        reason: "ALREADY_ANSWERED",
      });
      return { allSubmitted: false };
    }

    // Check if answer is correct (supports multiple formats)
    const isCorrect = this._isAnswerCorrect(session, answer);

    if (isCorrect) {
      return this._handleCorrectAnswer(gameId, userId, player, session, io, remainingSeconds);
    } else {
      return this._handleWrongAnswer(gameId, userId, player, session, io);
    }
  }

  /**
   * Ensures player's remaining guesses is a valid number within bounds
   * Prevents undefined/NaN values from causing logic errors
   * 
   * @param {object} session - Game session
   * @param {object} player - Player object
   * @private
   */
  _normalizePlayerGuesses(session, player) {
    const rgNum = Number(player.remainingGuesses);
    if (!Number.isFinite(rgNum)) {
      player.remainingGuesses = session.guesses;
    } else {
      player.remainingGuesses = Math.max(0, Math.min(session.guesses, Math.floor(rgNum)));
    }
  }

  /**
   * Checks if a submitted answer matches the current flashcard word
   * Supports multiple matching formats:
   * - Devanagari with synonyms/aliases
   * - English translation
   * - Transliteration (with Sanskrit ending variations)
   * 
   * @param {object} session - Game session with currentFlashcard
   * @param {string} answer - Submitted answer
   * @returns {boolean} True if answer is correct
   * @private
   */
  _isAnswerCorrect(session, answer) {
    const fc = session.currentFlashcard;
    const submittedRaw = answer.trim();

    // Normalize answer to multiple formats
    const subDeva = normDeva(submittedRaw);
    const subLat = normLatin(submittedRaw);

    // Build acceptance set for Devanagari (word + synonyms + aliases)
    const acceptDeva = new Set();
    pushManyDeva(acceptDeva, fc.word);
    pushManyDeva(acceptDeva, fc.synonyms);
    pushManyDeva(acceptDeva, fc.aliases);
    pushManyDeva(acceptDeva, fc.altWords);

    // Normalize flashcard fields for comparison
    const traLat = normLatin(fc.translation);
    const romLat = normLatin(fc.transliteration);

    // Match against: Devanagari, English translation, or transliteration
    return (
      (subDeva && acceptDeva.has(subDeva)) ||                              // Devanagari match
      (subLat && traLat && subLat === traLat) ||                           // English translation match
      (subLat && romLat && (subLat === romLat || stripCommonEndings(subLat) === stripCommonEndings(romLat))) // Transliteration match
    );
  }

  /**
   * Processes a correct answer:
   * - Calculates time-based score
   * - Updates player score
   * - Marks player as answered
   * - Broadcasts result and game state updates
   * 
   * @param {string} gameId - Game session ID
   * @param {string} userId - Player ID
   * @param {object} player - Player object
   * @param {object} session - Game session
   * @param {object} io - Socket.IO instance
   * @param {number} remainingSeconds - Time remaining in round
   * @returns {object} Round status flags
   * @private
   */
  _handleCorrectAnswer(gameId, userId, player, session, io, remainingSeconds) {
    // Calculate score based on remaining time (faster = higher score)
    const score = this._calculateTimedScore(session.timer, remainingSeconds);

    player.hasAnswered = true;
    session.scores[userId] = (session.scores[userId] || 0) + score;

    const fc = session.currentFlashcard;
    io.to(gameId).emit("correctAnswer", {
      userId,
      displayName: player.displayName,
      scoreGained: score,
      answerText: fc.transliteration || fc.translation || fc.word || "",
      answer: {
        word: fc.word || "",
        transliteration: fc.transliteration || "",
        translation: fc.translation || "",
      },
    });

    io.to(gameId).emit("updatePlayers", this.getPlayersWithScores(gameId));

    const { everyoneCorrect, allGuessersDone } = this._getGuessersStatus(session);

    return {
      allSubmitted: Boolean(everyoneCorrect),
      guessesExhausted: Boolean(allGuessersDone && !everyoneCorrect),
    };
  }

  /**
   * Processes an incorrect answer:
   * - Deducts one guess
   * - Applies score penalty
   * - Broadcasts result and game state
   * 
   * @param {string} gameId - Game session ID
   * @param {string} userId - Player ID
   * @param {object} player - Player object
   * @param {object} session - Game session
   * @param {object} io - Socket.IO instance
   * @returns {object} Round status flags
   * @private
   */
  _handleWrongAnswer(gameId, userId, player, session, io) {
    // Deduct one guess
    player.remainingGuesses = Math.max(0, (player.remainingGuesses ?? session.guesses) - 1);

    // Apply score penalty
    const penalty = SCORING.WRONG_ANSWER_PENALTY;
    const currentScore = session.scores[userId] || 0;
    const newScore = Math.max(0, currentScore - penalty);
    session.scores[userId] = newScore;

    io.to(gameId).emit("wrongAnswer", {
      userId,
      displayName: player.displayName,
      remainingGuesses: player.remainingGuesses,
      points: newScore,
      scoreLost: penalty,
    });

    io.to(gameId).emit("updatePlayers", this.getPlayersWithScores(gameId));

    const { everyoneCorrect, allGuessersDone } = this._getGuessersStatus(session);

    return {
      allSubmitted: Boolean(everyoneCorrect),
      guessesExhausted: Boolean(allGuessersDone && !everyoneCorrect),
    };
  }

  /**
   * Calculates time-based score for correct answer
   * Higher score for faster answers (more time remaining)
   * Score range: MIN_SCORE (slowest) to MAX_SCORE (fastest)
   * 
   * @param {number} totalSeconds - Total round time in seconds
   * @param {number} remainingSeconds - Time remaining when answer submitted
   * @returns {number} Score earned
   * @private
   */
  _calculateTimedScore(totalSeconds, remainingSeconds) {
    const total = Number(totalSeconds) || 60;
    const remain = Math.max(0, Math.min(total, Number(remainingSeconds) || 0));
    const ratio = total > 0 ? remain / total : 0;

    const scoreRange = SCORING.MAX_SCORE - SCORING.MIN_SCORE;
    return Math.floor(SCORING.MIN_SCORE + scoreRange * ratio);
  }

  /**
   * Determines the guessing status for current round
   * Checks if all eligible team guessers (excluding drawer) have answered or ran out of guesses
   * 
   * @param {object} session - Game session
   * @returns {object} {everyoneCorrect, allGuessersDone}
   * @private
   */
  _getGuessersStatus(session) {
    const drawer = session.players[session.currentPlayerIndex];
    const eligibleGuessers = session.players.filter(
      (p) => p.team === drawer.team && p.userId !== drawer.userId
    );

    const everyoneCorrect =
      eligibleGuessers.length > 0 &&
      eligibleGuessers.every((p) => p.hasAnswered === true);

    const allGuessersDone =
      eligibleGuessers.length > 0 &&
      eligibleGuessers.every(
        (p) => p.hasAnswered === true || (p.remainingGuesses ?? 0) <= 0
      );

    return { everyoneCorrect, allGuessersDone };
  }

  // ============= SCORE & PLAYER MANAGEMENT =============

  /**
   * Updates a player's points (can be positive or negative)
   * Ensures score never goes below 0
   * 
   * @param {string} gameId - Game session ID
   * @param {string} userId - Player ID
   * @param {number} scoreChange - Points to add/subtract
   * @returns {number} Updated total score
   */
  updatePlayerPoints(gameId, userId, scoreChange) {
    const session = this.sessions.get(gameId);
    if (!session) return 0;
    
    const currentScore = session.scores[userId] || 0;
    const newScore = Math.max(0, currentScore + scoreChange);
    session.scores[userId] = newScore;

    return newScore;
  }

  /**
   * Adds a new player to the session if not already present
   * @param {string} gameId - Game session ID
   * @param {object} player - Player object to add
   */
  addPlayer(gameId, player) {
    const session = this.getSession(gameId);
    if (session && !session.players.find((p) => p.userId === player.userId)) {
      session.players.push(player);
      session.scores[player.userId] = 0;
    }
  }

  /**
   * Updates a player's score (adds to existing score)
   * @param {string} gameId - Game session ID
   * @param {string} userId - Player ID
   * @param {number} points - Points to add
   */
  updateScore(gameId, userId, points) {
    const session = this.getSession(gameId);
    if (session) {
      session.scores[userId] = (session.scores[userId] || 0) + points;
    }
  }

  /**
   * Retrieves all players in a session with their scores and remaining guesses
   * @param {string} gameId - Game session ID
   * @returns {array} Array of player objects with scores
   */
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

  // ============= SESSION RETRIEVAL & MANAGEMENT =============

  /**
   * Gets all active game sessions
   * @returns {Map} Map of all sessions (gameId -> sessionObject)
   */
  getAllSessions() {
    return this.sessions;
  }

  /**
   * Marks a previously disconnected player as reconnected
   * Updates their socket ID and clears disconnection flags
   * 
   * @param {string} gameId - Game session ID
   * @param {string} userId - Player ID
   * @param {string} socketId - New socket ID
   * @returns {boolean} True if player was reconnected
   */
  markPlayerReconnected(gameId, userId, socketId) {
    const session = this.sessions.get(gameId);
    if (!session) return false;

    const player = session.players.find((p) => p.userId === userId);
    if (player) {
      player.disconnected = false;
      player.socketId = socketId;
      delete player.disconnectTime;
      console.log(`[markPlayerReconnected] Player ${userId} in game ${gameId}`);
      return true;
    }
    return false;
  }

  /**
   * Removes a player from a session
   * @param {string} gameId - Game session ID
   * @param {string} userId - Player ID
   * @returns {boolean} True if player was removed
   */
  removePlayer(gameId, userId) {
    const session = this.sessions.get(gameId);
    if (!session) return false;

    const index = session.players.findIndex((p) => p.userId === userId);
    if (index !== -1) {
      session.players.splice(index, 1);
      console.log(`[removePlayer] Removed ${userId} from game ${gameId}`);
      return true;
    }
    return false;
  }

  /**
   * Kicks a player from the game and adjusts game state
   * - Removes player and their score
   * - Adjusts current player index if needed
   * - Updates team round counters if applicable
   * 
   * @param {string} gameId - Game session ID
   * @param {string} userId - Player ID to kick
   * @returns {object|null} {isCurrentDrawer, kickedPlayer} or null if player not found
   */
  kickPlayer(gameId, userId) {
    const session = this.sessions.get(gameId);
    if (!session) return null;

    const playerIndex = session.players.findIndex((p) => p.userId === userId);
    if (playerIndex === -1) return null;

    const isCurrentDrawer = session.currentPlayerIndex === playerIndex;
    const kickedPlayer = session.players[playerIndex];
    const kickedTeamRound = kickedPlayer.team === "Red" ? "redTeamRound" : "blueTeamRound";
    const kickedPlayerTeamIndex = session.players.filter(p => p.team === kickedPlayer.team).findIndex(p => p === kickedPlayer);
    const teamSizeBefore = session.players.filter(p => p.team === kickedPlayer.team).length;

    // Remove player and their score
    session.players.splice(playerIndex, 1);
    delete session.scores[userId];

    // Adjust currentPlayerIndex if kicked player was before it
    if (playerIndex < session.currentPlayerIndex) {
      session.currentPlayerIndex--;
    }

    // Adjust team round counter if kicked player was in turn order before current
    if (kickedPlayerTeamIndex <= session[kickedTeamRound] % teamSizeBefore) {
      session[kickedTeamRound]--;
    }

    // Wrap current player index if it's out of bounds
    if (session.currentPlayerIndex >= session.players.length) {
      session.currentPlayerIndex = Math.max(0, session.players.length - 1);
    }

    console.log(`[kickPlayer] Kicked ${userId} from game ${gameId} (was drawer: ${isCurrentDrawer})`);
    return { isCurrentDrawer, kickedPlayer };
  }

  // ============= CANVAS DATA MANAGEMENT =============

  /**
   * Updates the canvas drawing data for the current round
   * @param {string} gameId - Game session ID
   * @param {object} canvasData - Drawing data (canvas strokes/state)
   * @returns {boolean} True if updated successfully
   */
  updateCanvasData(gameId, canvasData) {
    const session = this.sessions.get(gameId);
    if (session) {
      session.canvasData = canvasData;
      return true;
    }
    return false;
  }

  /**
   * Clears the canvas data (called when round changes or ends)
   * @param {string} gameId - Game session ID
   * @returns {boolean} True if cleared successfully
   */
  clearCanvasData(gameId) {
    const session = this.sessions.get(gameId);
    if (session) {
      session.canvasData = null;
      return true;
    }
    return false;
  }

  /**
   * Retrieves the current canvas drawing data
   * @param {string} gameId - Game session ID
   * @returns {object|null} Canvas data or null if not available
   */
  getCanvasData(gameId) {
    const session = this.sessions.get(gameId);
    return session?.canvasData || null;
  }

  // ============= SESSION CLEANUP =============

  /**
   * Permanently deletes a game session
   * Called when game ends or needs cleanup
   * 
   * @param {string} gameId - Game session ID
   * @returns {boolean} True if session was deleted
   */
  deleteSession(gameId) {
    if (this.sessions.has(gameId)) {
      this.sessions.delete(gameId);
      console.log(`[deleteSession] Deleted session ${gameId}`);
      return true;
    }
    return false;
  }

}

module.exports = new GameSessionManager();

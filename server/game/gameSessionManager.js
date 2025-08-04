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
    });
  }

  getSession(gameId) {
    return this.sessions.get(gameId);
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
}

module.exports = new GameSessionManager();

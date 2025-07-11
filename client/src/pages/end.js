import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './end.css';

const End = () => {
  const navigate = useNavigate();
  
  // Mock data - replace with actual game data
  const [gameResults] = useState({
    players: [
      { id: 1, name: 'Alice', score: 950, avatar: 'avatar1.png' },
      { id: 2, name: 'Bob', score: 875, avatar: 'avatar2.png' },
      { id: 3, name: 'Charlie', score: 720, avatar: 'avatar3.png' },
      { id: 4, name: 'Diana', score: 650, avatar: 'avatar1.png' },
    ],
    bestDrawing: {
      word: 'पुस्तकम्‌ (Book)',
      artist: 'Alice',
      imageUrl: null // This would contain the actual drawing data
    },
    gameStats: {
      totalRounds: 5,
      totalTime: '15:30',
      wordsGuessed: 12
    }
  });

  const [sortedPlayers, setSortedPlayers] = useState([]);

  useEffect(() => {
    // Sort players by score in descending order
    const sorted = [...gameResults.players].sort((a, b) => b.score - a.score);
    setSortedPlayers(sorted);
  }, [gameResults.players]);

  const handleNewGame = () => {
    // Add logic to start a new game
    // This might involve resetting game state, redirecting to lobby, etc.
    navigate('/lobby');
  };

  const handleGoHome = () => {
    navigate('/welcome');
  };

  const getRankEmoji = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}`;
  };

  return (
    <div className="gameend-container">
      <h1 className="gameend-title">🎉 Game Complete! 🎉</h1>
      
      {/* Game Statistics */}
      <div className="game-stats">
        <div className="stats-row">
          <div className="stat-item">
            <div className="stat-value">{gameResults.gameStats.totalRounds}</div>
            <div className="stat-label">Rounds Played</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{gameResults.gameStats.totalTime}</div>
            <div className="stat-label">Total Time</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{gameResults.gameStats.wordsGuessed}</div>
            <div className="stat-label">Words Guessed</div>
          </div>
        </div>
      </div>

      <div className="gameend-content">
        {/* Leaderboard Section */}
        <div className="leaderboard-section">
          <h2>
            <span className="trophy-icon">🏆</span>
            Leaderboard
          </h2>
          <ul className="leaderboard-list">
            {sortedPlayers.map((player, index) => (
              <li key={player.id} className="leaderboard-item">
                <span className="player-rank">
                  {getRankEmoji(index + 1)}
                </span>
                <div className="player-info">
                  <img 
                    src={player.avatar} 
                    alt={`${player.name}'s avatar`} 
                    className="player-avatar"
                  />
                  <span className="player-name">{player.name}</span>
                </div>
                <span className="player-score">{player.score} pts</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Best Drawing Section */}
        <div className="best-drawing-section">
          <h2>🎨 Best Drawing</h2>
          <div className="drawing-display">
            {gameResults.bestDrawing.imageUrl ? (
              <img 
                src={gameResults.bestDrawing.imageUrl} 
                alt="Best drawing of the game" 
                style={{ maxWidth: '100%', maxHeight: '100%' }}
              />
            ) : (
              <div className="drawing-placeholder">🖼️</div>
            )}
          </div>
          <div className="drawing-info">
            <div className="drawing-word">{gameResults.bestDrawing.word}</div>
            <div className="drawing-artist">by {gameResults.bestDrawing.artist}</div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="gameend-actions">
        <button className="action-button new-game-button" onClick={handleNewGame}>
          New Game
        </button>
        <button className="action-button home-button" onClick={handleGoHome}>
          Exit to Home
        </button>
      </div>
    </div>
  );
};

export default End;
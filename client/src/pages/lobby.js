import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './lobby.css';

const Lobby = () => {
  const [displayName, setDisplayName] = useState('');
  const [players, setPlayers] = useState([]);
  const [teamA, setTeamA] = useState([]);
  const [teamB, setTeamB] = useState([]);
  const [rounds, setRounds] = useState(3);
  const [timer, setTimer] = useState(60);
  const [difficulty, setDifficulty] = useState("Medium");

  const navigate = useNavigate();

  useEffect(() => {
    const storedName = localStorage.getItem('displayName');
    const nameToUse = storedName ? storedName : "Profile";

    setDisplayName(nameToUse);
    setPlayers([{ name: nameToUse, score: 0, emoji: '👤' }]);
  }, []);

  const handleJoinTeam = (team) => {
    const user = players.find(p => p.name === displayName);
    if (!user) return;

    if (team === 'A') {
      setTeamA(prev => {
        if (prev.some(p => p.name === user.name)) return prev;
        return [...prev, user];
      });
      setTeamB(prev => prev.filter(p => p.name !== user.name));
    } else if (team === 'B') {
      setTeamB(prev => {
        if (prev.some(p => p.name === user.name)) return prev;
        return [...prev, user];
      });
      setTeamA(prev => prev.filter(p => p.name !== user.name));
    }
  };

  const handleStartGame = () => {
    alert(`Game starting with:
Rounds: ${rounds}
Timer: ${timer}s
Difficulty: ${difficulty}`);
  };

  return (
    <div className="lobby-container">
      <div className="lobby-body">
        <div className="user-section">
          <h3>All Users</h3>
          {players.map((player, idx) => (
            <div key={idx} className="player-entry">
              <span className="emoji">{player.emoji}</span>
              <span className="player-name">{player.name}</span>
              <span className="player-score">Score: {player.score}</span>
            </div>
          ))}
          <div className="team-buttons">
            <button onClick={() => handleJoinTeam('A')}>Join Team A</button>
            <button onClick={() => handleJoinTeam('B')}>Join Team B</button>
          </div>
        </div>

        <div className="team-section">
          <div className="team">
            <h3>Team A</h3>
            {teamA.map((p, i) => (
              <p key={i}>{p.emoji} {p.name}</p>
            ))}
          </div>
          <div className="team">
            <h3>Team B</h3>
            {teamB.map((p, i) => (
              <p key={i}>{p.emoji} {p.name}</p>
            ))}
          </div>
        </div>

        <div className="game-settings">
          <h3>Game Settings</h3>
          <div className="setting-group">
            <label>Select Rounds</label>
            {[1, 2, 3, 4, 5].map(r => (
              <button
                key={r}
                className={rounds === r ? "active" : ""}
                onClick={() => setRounds(r)}
              >{r}</button>
            ))}
          </div>
          <div className="setting-group">
            <label>Select Timer</label>
            {[30, 45, 60, 75, 90].map(t => (
              <button
                key={t}
                className={timer === t ? "active" : ""}
                onClick={() => setTimer(t)}
              >{t}</button>
            ))}
          </div>
          <div className="setting-group">
            <label>Select Difficulty</label>
            {["Easy", "Medium", "Hard"].map(d => (
              <button
                key={d}
                className={difficulty === d ? "active" : ""}
                onClick={() => setDifficulty(d)}
              >{d}</button>
            ))}
          </div>
          <button className="start-game-btn" onClick={handleStartGame}>
            Start Game
          </button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;

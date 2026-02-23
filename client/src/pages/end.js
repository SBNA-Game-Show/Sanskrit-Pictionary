// export default End;
import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './end.css';
import Fireworks from './firework.js';
import {useReward} from "partycles";

const End = () => {

 
  const navigate = useNavigate();
  const location = useLocation();
  // Expect players: [{userId, displayName, points, imageSrc, team}]
  const players = useMemo(() => {
    const p = (location.state && location.state.players) || [];
    // normalize fields
    return Array.isArray(p) ? p.map(x => ({
      id: x.userId || x.id || x._id || String(Math.random()).slice(2),
      name: x.displayName || x.name || 'Player',
      points: Number(x.points ?? x.score ?? 0),
      avatar: x.imageSrc || x.avatar || null,
      team: x.team || ''
    })) : [];
  }, [location.state]);

  const sorted = useMemo(() => [...players].sort((a, b) => b.points - a.points), [players]);

  // sort the players by team 
  const redTeam = useMemo(() => sorted.filter(p => p.team.toLowerCase() === 'red'), [sorted]);
  const blueTeam = useMemo(() => sorted.filter(p => p.team.toLowerCase() === 'blue'), [sorted]);

  const {redPoints, bluePoints} = useMemo(() => {
    const redPoints = redTeam.reduce((sum, p) => sum + p.points, 0);
    const bluePoints = blueTeam.reduce((sum, p) => sum + p.points, 0);
    return {redPoints, bluePoints};
  }, [redTeam, blueTeam]);

  const winningTeam = useMemo(() => {
    if(redPoints > bluePoints) return 'red';
    if(bluePoints > redPoints) return 'blue';
    return "tie";
  }, [redPoints, bluePoints]);

  
const winningStyle = (winningTeam) => {
  if(winningTeam === 'red') {
    return {color:'red', backgroundColor:'rgba(255, 0, 0, 0.1)'};
  }
  else if(winningTeam === 'blue') {
    return {color:'blue', backgroundColor:'rgba(9, 9, 235, 0.1)'};
  }else{
    return {}
  }
};

const winningFireworkColors = (winningTeam) => {
  if(winningTeam === 'red') {
    return ["#ff1744"];
  }
  else if(winningTeam === 'blue') {
    return ["#2979ff"];
  }else{
    return ["#ff1744", "#2979ff", "#ffea00", "#00e676"];
  }
};



  const handleNewGame = () => navigate('/lobby');
  const handleGoHome = () => navigate('/');
  

  if (!sorted.length) {
    return (
      <div className="gameend-container">
        <h2 className="gameend-title">Game Over</h2>
        <p>No results to show. It looks like the game didn’t send final scores.</p>
        <div className="gameend-actions">
          <button className="action-button new-game-button" onClick={handleNewGame}>New Game</button>
          <button className="action-button home-button" onClick={handleGoHome}>Exit to Home</button>
        </div>
      </div>
    );
  }


  return (
    <div className="gameend-container">
      <h2 className="gameend-title">Leaderboard</h2>
      <Fireworks colors={winningFireworkColors(winningTeam)} />
      <p className="winning-team" style={winningStyle(winningTeam)}>{winningTeam  === 'tie'
    ? 'It’s a Tie!'
    : `${winningTeam === 'red' ? 'Red' : 'Blue'} Team Wins!`}  </p>
      <div className="leaderboard-list" >
        <div className={`teamRed ${winningTeam === 'red' ? 'winner' : ''}`}>
          <p className="team-title" id="red">Red Team </p>
          <div className="team-score">Total: {redPoints}</div>
        {redTeam.map((player, index) => (
          <div className={`leaderboard-card ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : ''}`} key={player.id}>
            <div className="rank-badge">#{index + 1}</div>
            <img
               src={player.avatar || '/default-avatar.png'}
              alt={`${player.name}'s avatar`}
              className="player-avatar" 
              onError={(e) => { e.currentTarget.src = '/default-avatar.png'; }}
            />
            <div className="player-info">
              <span className="player-name">
                {player.name}
                {index === 0 && <span className="medal">🥇</span>}
                {index === 1 && <span className="medal">🥈</span>}
                {index === 2 && <span className="medal">🥉</span>}
              </span>

              {player.team && <span className={`team-tag team-${player.team.toLowerCase()}`}>{player.team}</span>}
            </div>
            <span className="player-score">{player.points} pts</span>
          </div>
        ))}
        </div>

        <div className={`teamBlue ${winningTeam === 'blue' ? 'winner' : ''}`}>
          <p className="team-title" id="blue">Blue Team</p>
          <div className="team-score">Total: {bluePoints}</div>
        {blueTeam.map((player, index) => (
          <div className={`leaderboard-card ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : ''}`} key={player.id}>
            <div className="rank-badge">#{index + 1}</div>
            <img
              src={player.avatar || '/default-avatar.png'}
              alt={`${player.name}'s avatar`}
              className="player-avatar"
              onError={(e) => { e.currentTarget.src = '/default-avatar.png'; }}
            />
            <div className="player-info">
              <span className="player-name">  
                {player.name}
                {index === 0 && <span className="medal">🥇</span>}
                {index === 1 && <span className="medal">🥈</span>}
                {index === 2 && <span className="medal">🥉</span>}
              </span>

              {player.team && <span className={`team-tag team-${player.team.toLowerCase()}`}>{player.team}</span>}
            </div>
            <span className="player-score">{player.points} pts</span>
          </div>
        ))}
        </div>
        
        {/* {sorted.map((player, index) => (
          <div className={`leaderboard-card ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : ''}`} key={player.id}>
            <div className="rank-badge">#{index + 1}</div>
            <img
              src={player.avatar || '/default-avatar.png'}
              alt={`${player.name}'s avatar`}
              className="player-avatar"
              onError={(e) => { e.currentTarget.src = '/default-avatar.png'; }}
            />
            <div className="player-info">
              <span className="player-name">
                {player.name}
                {index === 0 && <span className="medal">🥇</span>}
                {index === 1 && <span className="medal">🥈</span>}
                {index === 2 && <span className="medal">🥉</span>}
              </span>

              {player.team && <span className={`team-tag team-${player.team.toLowerCase()}`}>{player.team}</span>}
            </div>
            <span className="player-score">{player.points} pts</span>
          </div>
        ))} */}
      </div>

      <div className="gameend-actions">
        <button className="action-button new-game-button" onClick={handleNewGame}>New Game</button>
        <button className="action-button home-button" onClick={handleGoHome}>Exit to Home</button>
      </div>
    </div>
  );
};

export default End;

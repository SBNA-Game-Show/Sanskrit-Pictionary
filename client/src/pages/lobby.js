import { Link } from 'react-router-dom';
import './lobby.css';

const handleCopyLink = () => {
  const link = "https://www.shareableURL.com";
  navigator.clipboard.writeText(link)
    .then(() => {
      alert("Link copied to clipboard!");
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
    });
};

const Lobby = () => {
  return (
    <div className="lobby-container">

      <div className="lobby-url">
        <span>
          <strong>Game Lobby URL:</strong> https://www.shareableURL.com
        </span>
        <button className="copy-button" onClick={handleCopyLink}>
          Copy Link
        </button>
      </div>

      <div className="lobby-content">
        <div className="user-list">
          <h2>User List</h2>
          <ul>
            <li> Alice <span>Score: 0</span></li>
            <li> Bob <span>Score: 0</span></li>
            <li> Charlie <span>Score: 0</span></li>
          </ul>
        </div>

        <div className="game-settings">
          <h2>Game Settings</h2>

          <div className="setting-section">
            <h3>Select Rounds</h3>
            <label>Choose number of rounds<br />
              <div className="option-buttons">
                {[1, 2, 3, 4, 5].map(round => (
                  <button key={round}>{round}</button>
                ))}
              </div>
            </label>
          </div>

          <div className="setting-section">
            <h3>Select Timer</h3>
            <label>Set duration of each round<br />
              <div className="option-buttons">
                {[30, 45, 60, 75, 90].map(timer => (
                  <button key={timer}>{timer}</button>
                ))}
              </div>
            </label>
          </div>

          <div className="setting-section">
            <h3>Select Difficulty</h3>
            <label>Adjust challange level<br />
              <div className="option-buttons">
                {["Easy", "Medium", "Hard"].map(level => (
                  <button key={level}>{level}</button>
                ))}
              </div>
            </label>
          </div>

          <button className="start-game-button">Start Game</button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
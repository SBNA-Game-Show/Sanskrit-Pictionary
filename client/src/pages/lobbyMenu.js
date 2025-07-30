import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid"; // 6 character URLs

const LobbyMenu = () => {
  const [roomInput, setRoomInput] = useState("");
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    const myRoomId = nanoid(6); // short alpha-numeric room code
    navigate(`/lobby/${myRoomId}`);
  };

  const handleEnterRoom = () => {
    if (roomInput.trim() === "") return;
    navigate(`/lobby/${roomInput.trim()}`);
  };

  return (
    <div className="lobby-container">
      <h2>Welcome to the Game Lobby</h2>
      <button className="start-game-button" onClick={handleCreateRoom}>
        🆕 Create Room
      </button>
      <div style={{ margin: "24px 0" }}>
        <input
          className="lobby-room-input"
          placeholder="Enter Room Code"
          value={roomInput}
          onChange={e => setRoomInput(e.target.value)}
          style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ccc" }}
        />
        <button className="start-game-button" onClick={handleEnterRoom}>
          🔗 Enter Room
        </button>
      </div>
    </div>
  );
};

export default LobbyMenu;

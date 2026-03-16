import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { getUserId } from "../utils/authStorage";
import { toastError } from "../utils/toast";

const LobbyMenu = () => {
  const [roomInput, setRoomInput] = useState("");
  const navigate = useNavigate();
  const userId = getUserId();

  // Check if user has valid session (registered OR guest)
  useEffect(() => {
    if (!userId) {
      toastError("Please sign in or play as guest first");
      navigate("/");
    }
  }, [userId, navigate]);

  const handleCreateRoom = () => {
    if (!userId) {
      toastError("Please sign in or play as guest first");
      return;
    }

    const myRoomId = nanoid(6); // short alpha-numeric room code
    navigate(`/lobby/${myRoomId}`);
  };

  const handleEnterRoom = () => {
    if (roomInput.trim() === "") {
      toastError("Please enter a room code");
      return;
    }

    if (!userId) {
      toastError("Please sign in or play as guest first");
      return;
    }

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
          onChange={(e) => setRoomInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleEnterRoom()}
          style={{
            padding: "10px",
            borderRadius: "6px",
            border: "1px solid #ccc",
          }}
        />
        <button className="start-game-button" onClick={handleEnterRoom}>
          🔗 Enter Room
        </button>
      </div>
    </div>
  );
};

export default LobbyMenu;

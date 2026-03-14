import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { getUserId, getDisplayName } from "../utils/authStorage";
import { toastError, toastSuccess } from "../utils/toast";
import { socket } from "./socket"; 

const LobbyMenu = () => {
  const [roomInput, setRoomInput] = useState("");
  const [loading, setLoading] = useState(false);
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
    // emit room creation 
    socket.emit("createRoom", {
      userId: userId,
      displayName: getDisplayName() ,
      roomId: myRoomId,
    });
    navigate(`/lobby/${myRoomId}`);
  };

  // Validate room before joining
  const handleEnterRoom = async () => {
    if (roomInput.trim() === "") {
      toastError("Please enter a room code");
      return;
    }

    const roomCode = roomInput.trim();
    setLoading(true);

    try {
      // Check if room exists
      const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5005";
      const response = await fetch(`${API_BASE}/api/room/exists/${roomCode}`);
      const data = await response.json();

      if (data.exists) {
        // Room exists - check if full
        if (data.isFull) {
          toastError("This room is full (20/20 players)");
          setLoading(false);
          return;
        }

        navigate(`/lobby/${roomCode}`);
      } else {
        // Room doesn't exist
        toastError("Room not found! Please check the code and try again.");
        setLoading(false);
      }
    } catch (error) {
      console.error("Error checking room:", error);
      toastError("Failed to verify room. Please try again.");
      setLoading(false);
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !loading) {
      handleEnterRoom();
    }
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
          onKeyPress={handleKeyPress}
          disabled={loading}
          style={{
            padding: "10px",
            borderRadius: "6px",
            border: "1px solid #ccc",
          }}
        />
        <button
          className="start-game-button"
          onClick={handleEnterRoom}
          disabled={loading}
        >
          {loading ? "Checking..." : "🔗 Enter Room"}
        </button>
      </div>
    </div>
  );
};

export default LobbyMenu;

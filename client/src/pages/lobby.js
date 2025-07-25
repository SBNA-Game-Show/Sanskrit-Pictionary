import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { socket } from "./socket.js"; // Adjust path as needed
import UserCard from "../reusableComponents/usercard";
import "./lobby.css";

const Lobby = () => {
  const { roomId } = useParams();
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    const userId = sessionStorage.getItem("userId");
    if (!userId || !roomId) return;

    socket.emit("registerLobby", { userId, roomId });
    socket.emit("requestLobbyUsers", { roomId });

    socket.on("lobbyUsers", (users) => setOnlineUsers(users));
    socket.on("userJoinedLobby", (user) => {
      setOnlineUsers((prev) => {
        const exists = prev.find((u) => u.userId === user.userId);
        return exists ? prev : [...prev, user];
      });
    });
    socket.on("userLeftLobby", ({ userId }) => {
      setOnlineUsers((prev) => prev.filter((u) => u.userId !== userId));
    });

    return () => {
      socket.off("lobbyUsers");
      socket.off("userJoinedLobby");
      socket.off("userLeftLobby");
    };
  }, [roomId]);

  return (
    <div className="lobby-container">
      <div className="lobby-url">
        <span>
          <strong>Game Lobby ID:</strong> {roomId}
        </span>
        <button
          className="copy-button"
          onClick={() => {
            navigator.clipboard.writeText(roomId);
            alert("Link copied to clipboard!");
          }}
        >
          Copy ID
        </button>
      </div>

      <div className="lobby-content">
        <div className="user-list">
          <h2>Online Users</h2>
          {onlineUsers.length === 0 ? (
            <p>No users online.</p>
          ) : (
            onlineUsers.map((user) => (
              <UserCard
                key={user.userId}
                name={user.displayName}
                points={0}
                imageSrc="avatar1.png"
              />
            ))
          )}
        </div>
        <div className="game-settings">
          <h2>Game Settings</h2>
          <div className="setting-section">
            <h3>Select Rounds</h3>
            <div className="option-buttons">
              {[1, 2, 3, 4, 5].map((round) => (
                <button key={round}>{round}</button>
              ))}
            </div>
          </div>
          <div className="setting-section">
            <h3>Select Timer</h3>
            <div className="option-buttons">
              {[30, 45, 60, 75, 90].map((sec) => (
                <button key={sec}>{sec}s</button>
              ))}
            </div>
          </div>
          <div className="setting-section">
            <h3>Select Difficulty</h3>
            <div className="option-buttons">
              {["Easy", "Medium", "Hard"].map((level) => (
                <button key={level}>{level}</button>
              ))}
            </div>
          </div>
          <button className="start-game-button">Start Game</button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "./socket";
import UserCard from "../reusableComponents/usercard";
import "./lobby.css";

const Lobby = () => {
  const { roomId } = useParams();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [teams, setTeams] = useState({ Red: [], Blue: [] });
  const myUserId = sessionStorage.getItem("userId");
  const myDisplayName = sessionStorage.getItem("displayName");
  const navigate = useNavigate();
  const [selectedRounds, setSelectedRounds] = useState(1);
  const [selectedTimer, setSelectedTimer] = useState(30);
  const [selectedDifficulty, setSelectedDifficulty] = useState("Easy");
  const [currentRound, setCurrentRound] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!myUserId || !roomId) return;

    socket.emit("registerLobby", { userId: myUserId, roomId });
    socket.emit("requestLobbyUsers", { roomId });
    socket.on("lobbyUsers", setOnlineUsers);
    socket.on("userJoinedLobby", user => {
      setOnlineUsers(prev =>
        prev.some(u => u.userId === user.userId) ? prev : [...prev, user]
      );
    });
    socket.on("userLeftLobby", ({ userId }) => {
      setOnlineUsers(prev => prev.filter(u => u.userId !== userId));
    });
    socket.on("hostSet", setHostId);
    socket.on("teamsUpdate", setTeams);
    socket.on("userKicked", ({ userId }) => {
      if (userId === myUserId) {
        alert("You were kicked from the lobby.");
        navigate("/lobby");
      }
    });
    socket.on("kicked", () => {
      alert("You were kicked from the lobby.");
      navigate("/lobby");
    });
    socket.on("roundStarted", ({ currentRound, currentPlayer, timer }) => {
      setCurrentRound(currentRound);
      setCurrentPlayer(currentPlayer);
      setTimeLeft(timer);
    });

    socket.on("startTimer", ({ duration }) => {
      setTimeLeft(duration);
      const timerInterval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    socket.on("gameEnded", () => {
      alert("Game Over!");
      setCurrentRound(null);
      setTimeLeft(null);
    });

    return () => {
      socket.off("lobbyUsers");
      socket.off("userJoinedLobby");
      socket.off("userLeftLobby");
      socket.off("hostSet");
      socket.off("teamsUpdate");
      socket.off("userKicked");
      socket.off("kicked");
      socket.off("roundStarted");
      socket.off("startTimer");
      socket.off("gameEnded");
    };
  }, [roomId, myUserId, navigate]);

  // Helper functions
  const getDisplayName = userId =>
    onlineUsers.find(u => u.userId === userId)?.displayName || userId;
  const inAnyTeam = [...(teams.Red || []), ...(teams.Blue || [])];
  const unassignedUsers = onlineUsers.filter(u => !inAnyTeam.includes(u.userId));
  const renderStyledName = (userId) => {
    const name = getDisplayName(userId);
    const isHost = userId === hostId;
    return (
      <span style={{ fontWeight: isHost ? "bold" : "normal" }}>
        {name}
        {isHost && <span title="Host" style={{ marginLeft: 3, color: "#e3aa13" }}> 👑</span>}
      </span>
    );
  };

  // Team selection logic
  const handleJoinTeam = (teamColor) => {
    socket.emit("joinTeam", { roomId, teamColor, userId: myUserId });
  };

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

      <div className="lobby-content" style={{ display: "flex", alignItems: "flex-start", gap: "40px" }}>
        {/* ONLINE USERS COLUMN */}
        <div className="user-list" style={{ minWidth: 180 }}>
          <h2 style={{ textAlign: "center" }}>Online Users</h2>
          {unassignedUsers.length === 0 ? (
            <p>No users online.</p>
          ) : (
            unassignedUsers.map(user => (
              <div key={user.userId}>
                {renderStyledName(user.userId)}
                {/* Only YOU (unassigned) see team selection buttons */}
                {user.userId === myUserId && (
                  <span>
                    <button
                      style={{ color: "crimson", marginLeft: 8 }}
                      onClick={() => handleJoinTeam("Red")}
                    >
                      Join Red
                    </button>
                    <button
                      style={{ color: "royalblue", marginLeft: 8 }}
                      onClick={() => handleJoinTeam("Blue")}
                    >
                      Join Blue
                    </button>
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* TEAMS COLUMN: RED ABOVE BLUE */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* RED TEAM */}
          <div style={{
            background: "#f8e7e9",
            borderRadius: 8,
            padding: 10,
            minWidth: 150
          }}>
            <h3 style={{ color: "crimson", textAlign: "center" }}>Red Team</h3>
            {teams.Red.length === 0
              ? <p style={{ color: "#999" }}>No players</p>
              : teams.Red.map(uid => <div key={uid}>{renderStyledName(uid)}</div>)
            }
          </div>
          {/* BLUE TEAM */}
          <div style={{
            background: "#e7eef8",
            borderRadius: 8,
            padding: 10,
            minWidth: 150
          }}>
            <h3 style={{ color: "royalblue", textAlign: "center" }}>Blue Team</h3>
            {teams.Blue.length === 0
              ? <p style={{ color: "#999" }}>No players</p>
              : teams.Blue.map(uid => <div key={uid}>{renderStyledName(uid)}</div>)
            }
          </div>
        </div>

        {/* SETTINGS */}
        <div className="game-settings" style={{ minWidth: 260 }}>
          <h2>Game Settings</h2>
          {/* Rounds */}
          <div className="setting-section">
            <h3>Select Rounds</h3>
            <div className="option-buttons">
              {[1, 2, 3, 4, 5].map((round) => (
                <button
                  key={round}
                  className={selectedRounds === round ? "active" : ""}
                  onClick={() => setSelectedRounds(round)}
                >
                  {round}
                </button>
              ))}
            </div>
          </div>

          {/* Timer */}
          <div className="setting-section">
            <h3>Select Timer</h3>
            <div className="option-buttons">
              {[30, 45, 60, 75, 90].map((sec) => (
                <button
                  key={sec}
                  className={selectedTimer === sec ? "active" : ""}
                  onClick={() => setSelectedTimer(sec)}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div className="setting-section">
            <h3>Select Difficulty</h3>
            <div className="option-buttons">
              {["Easy", "Medium", "Hard"].map((level) => (
                <button
                  key={level}
                  className={selectedDifficulty === level ? "active" : ""}
                  onClick={() => setSelectedDifficulty(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>


          {/* Start Game Button */}
          <button
            className="start-game-button"
            onClick={() => {
              console.log("🟢 sending startGame:", {
                gameId: roomId,
                totalRounds: selectedRounds,
                timer: selectedTimer,
                difficulty: selectedDifficulty,
              });
              socket.emit("startGame", {
                gameId: roomId,
                totalRounds: selectedRounds,
                timer: selectedTimer,
                difficulty: selectedDifficulty,
              });
              }}
            >
            Start Game
          </button>
        </div>
      </div>

      {/* Displays the current round and countdown */}
      {currentRound && (
        <div className="game-status">
          <h3>Round: {currentRound}</h3>
          <p>
            Current Player:{" "}
            {currentPlayer?.displayName || currentPlayer}
          </p>
          <p>Time Left: {timeLeft}s</p>
        </div>
      )}
    </div>
  );
};

export default Lobby;
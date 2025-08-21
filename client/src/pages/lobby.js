import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "./socket";
import UserCard from "../reusableComponents/usercard";
import Chat from "../reusableComponents/chat";
import "./lobby.css";

/* NEW: DiceBear for inline avatars (no UI change elsewhere) */
import { createAvatar } from "@dicebear/core";
import * as Dice from "@dicebear/collection";

const Lobby = () => {
  const { roomId } = useParams();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [teams, setTeams] = useState({ Red: [], Blue: [] });
  const myUserId = sessionStorage.getItem("userId");
  const myDisplayName = sessionStorage.getItem("displayName");
  const navigate = useNavigate();

  // Game setting states
  const [selectedRounds, setSelectedRounds] = useState(1);
  const [selectedTimer, setSelectedTimer] = useState(30);
  const [selectedDifficulty, setSelectedDifficulty] = useState("Easy");
  const [currentRound, setCurrentRound] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  // Is this player the host
  const isHost = myUserId === hostId;

  // for checking if both teams have enough players or not
  const redTeamHasPlayers = teams.Red.length > 0;
  const blueTeamHasPlayers = teams.Blue.length > 0;
  const canStartGame = isHost && redTeamHasPlayers && blueTeamHasPlayers;

  useEffect(() => {
    if (!myUserId || !roomId) return;

    socket.emit("registerLobby", {
      userId: myUserId,
      displayName: myDisplayName,
      roomId,
    });
    socket.emit("requestLobbyUsers", { roomId });

    socket.on("lobbyUsers", setOnlineUsers);
    socket.on("userJoinedLobby", (user) => {
      setOnlineUsers((prev) =>
        prev.some((u) => u.userId === user.userId) ? prev : [...prev, user]
      );
    });
    socket.on("userLeftLobby", ({ userId }) => {
      setOnlineUsers((prev) => prev.filter((u) => u.userId !== userId));
    });
    socket.on("hostSet", setHostId);

    socket.on("teamsUpdate", setTeams);

    // SYNC SETTINGS to ALL users
    socket.on("gameSettingsUpdate", (settings) => {
      setSelectedRounds(settings.rounds);
      setSelectedTimer(settings.timer);
      setSelectedDifficulty(settings.difficulty);
    });

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
      navigate(`/play/${roomId}`);
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

    /* NEW: live profile updates (name/avatar) while in lobby */
    socket.on("profileUpdated", ({ userId, displayName, avatarSeed, avatarStyle }) => {
      setOnlineUsers((prev) =>
        prev.map((u) =>
          u.userId === userId
            ? {
                ...u,
                ...(displayName !== undefined ? { displayName } : {}),
                ...(avatarSeed !== undefined ? { avatarSeed } : {}),
                ...(avatarStyle !== undefined ? { avatarStyle } : {}),
              }
            : u
        )
      );
    });

    return () => {
      socket.off("lobbyUsers");
      socket.off("userJoinedLobby");
      socket.off("userLeftLobby");
      socket.off("hostSet");
      socket.off("teamsUpdate");
      socket.off("gameSettingsUpdate");
      socket.off("userKicked");
      socket.off("kicked");
      socket.off("roundStarted");
      socket.off("startTimer");
      socket.off("gameEnded");
      socket.off("profileUpdated"); // NEW off
    };
  }, [roomId, myUserId, navigate, myDisplayName]);

  // ------- Team/Users logic -------
  const getDisplayName = (userId) =>
    onlineUsers.find((u) => u.userId === userId)?.displayName || userId;

  /* NEW: make a tiny avatar data URL for a user */
  const avatarUrlFor = (userId) => {
    const u = onlineUsers.find((x) => x.userId === userId);
    const styleName = u?.avatarStyle || "funEmoji";
    const style = Dice[styleName] || Dice.funEmoji;
    const seed = u?.avatarSeed || u?.displayName || u?.userId || "player";
    const svg = createAvatar(style, { seed }).toString();
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const inAnyTeam = [...(teams.Red || []), ...(teams.Blue || [])];
  const unassignedUsers = onlineUsers.filter(
    (u) => !inAnyTeam.includes(u.userId)
  );
  const myTeam = teams.Red.includes(myUserId)
    ? "Red"
    : teams.Blue.includes(myUserId)
    ? "Blue"
    : null;

  /* NEW: leave team helper */
  const handleLeaveTeam = () => {
    socket.emit("leaveTeam", { roomId, userId: myUserId });
  };

  const renderStyledName = (userId) => {
    const name = getDisplayName(userId);
    const isHostUser = userId === hostId;
    let color = "#222";
    if (teams.Red.includes(userId)) color = "crimson";
    if (teams.Blue.includes(userId)) color = "royalblue";

    /* NEW: small inline avatar chip (keeps layout intact) */
    const avatarSrc = avatarUrlFor(userId);

    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color }}>
        <img
          src={avatarSrc}
          alt=""
          className="user-avatar avatar-anim"
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            verticalAlign: "middle",
          }}
        />
        <span style={{ fontWeight: isHostUser ? "bold" : "normal" }}>
          {name}
          {isHostUser && (
            <span title="Host" style={{ marginLeft: 3, color: "#e3aa13" }}>
              {" "}
              👑
            </span>
          )}
        </span>
      </span>
    );
  };

  const handleJoinTeam = (teamColor) => {
    socket.emit("joinTeam", { roomId, teamColor, userId: myUserId });
  };

  // ----- Only host can change settings -----
  const handleSettingsChange = (setting, value) => {
    if (!isHost) return;
    let updatedSettings = {
      rounds: selectedRounds,
      timer: selectedTimer,
      difficulty: selectedDifficulty,
    };
    if (setting === "rounds") updatedSettings.rounds = value;
    if (setting === "timer") updatedSettings.timer = value;
    if (setting === "difficulty") updatedSettings.difficulty = value;
    setSelectedRounds(updatedSettings.rounds);
    setSelectedTimer(updatedSettings.timer);
    setSelectedDifficulty(updatedSettings.difficulty);
    socket.emit("updateGameSettings", { roomId, newSettings: updatedSettings });
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
      <div
        className="lobby-content"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "36px",
          width: "100%",
        }}
      >
        {/* COLUMN 1: ONLINE USERS */}
        <div style={{ minWidth: 180 }}>
          <h2 style={{ textAlign: "center" }}>Online Users</h2>
          {unassignedUsers.length === 0 ? (
            <p>No users online.</p>
          ) : (
            unassignedUsers.map((user) => (
              <div key={user.userId} style={{ marginBottom: 6 }}>
                {renderStyledName(user.userId)}
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

        {/* COLUMN 2: TEAMS */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            minWidth: 180,
          }}
        >
          <div style={{ background: "#f8e7e9", borderRadius: 8, padding: 10 }}>
            <h3 style={{ color: "crimson", marginBottom: 8 }}>Red Team</h3>
            {teams.Red.length === 0 ? (
              <p style={{ color: "#999" }}>No players</p>
            ) : (
              teams.Red.map((uid) => (
                <div key={uid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {renderStyledName(uid)}
                  {/* NEW: my actions when inside a team */}
                  {uid === myUserId && (
                    <span style={{ marginLeft: 8 }}>
                      <button onClick={handleLeaveTeam} style={{ marginRight: 6 }}>
                        Leave
                      </button>
                      <button onClick={() => handleJoinTeam("Blue")}>
                        Switch to Blue
                      </button>
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
          <div style={{ background: "#e7eef8", borderRadius: 8, padding: 10 }}>
            <h3 style={{ color: "royalblue", marginBottom: 8 }}>Blue Team</h3>
            {teams.Blue.length === 0 ? (
              <p style={{ color: "#999" }}>No players</p>
            ) : (
              teams.Blue.map((uid) => (
                <div key={uid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {renderStyledName(uid)}
                  {/* NEW: my actions when inside a team */}
                  {uid === myUserId && (
                    <span style={{ marginLeft: 8 }}>
                      <button onClick={handleLeaveTeam} style={{ marginRight: 6 }}>
                        Leave
                      </button>
                      <button onClick={() => handleJoinTeam("Red")}>
                        Switch to Red
                      </button>
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUMN 3: SETTINGS (HOST ONLY editable) */}
        <div className="game-settings" style={{ minWidth: 260 }}>
          <h2>Game Settings</h2>
          <div className="setting-section">
            <h3>Select Rounds</h3>
            <div className="option-buttons">
              {[1, 2, 3, 4, 5].map((round) => (
                <button
                  key={round}
                  className={selectedRounds === round ? "active" : ""}
                  onClick={() => handleSettingsChange("rounds", round)}
                  disabled={!isHost}
                >
                  {round}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-section">
            <h3>Select Timer</h3>
            <div className="option-buttons">
              {[30, 45, 60, 75, 90, 100000].map((sec) => (
                <button
                  key={sec}
                  className={selectedTimer === sec ? "active" : ""}
                  onClick={() => handleSettingsChange("timer", sec)}
                  disabled={!isHost}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>
          <div className="setting-section">
            <h3>Select Difficulty</h3>
            <div className="option-buttons">
              {["Easy", "Medium", "Hard"].map((level) => (
                <button
                  key={level}
                  className={selectedDifficulty === level ? "active" : ""}
                  onClick={() => handleSettingsChange("difficulty", level)}
                  disabled={!isHost}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
          <button
            className="start-game-button"
            onClick={() => {
              if (isHost) {
                socket.emit("startGame", {
                  gameId: roomId,
                  totalRounds: selectedRounds,
                  timer: selectedTimer,
                  difficulty: selectedDifficulty,
                });
              }
            }}
            disabled={!canStartGame}
          >
            Start Game
          </button>

          {!isHost && (
            <small style={{ color: "#999" }}>
              Only the host can start the game.
            </small>
          )}

          {isHost && (!redTeamHasPlayers || !blueTeamHasPlayers) && (
            <small style={{ color: "crimson" }}>
              Both teams must have at least one player to start the game.
            </small>
          )}
        </div>

        {/* COLUMN 4: CHAT */}
        <div style={{ minWidth: 280, flex: "0 0 280px" }}>
          <Chat
            myUserId={myUserId}
            myDisplayName={myDisplayName}
            myTeam={myTeam}
          />
        </div>
      </div>

      {currentRound && (
        <div className="game-status">
          <h3>Round: {currentRound}</h3>
          <p>Current Player: {currentPlayer?.displayName || currentPlayer}</p>
          <p>Time Left: {timeLeft}s</p>
        </div>
      )}
    </div>
  );
};

export default Lobby;

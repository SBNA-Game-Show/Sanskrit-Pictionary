// client/src/pages/Lobby.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "./socket";
import Chat from "../reusableComponents/chat";
import InteractiveAvatar from "../reusableComponents/InteractiveAvatar";
import "./lobby.css";

const Lobby = () => {
  const { roomId } = useParams();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [teams, setTeams] = useState({ Red: [], Blue: [] });

  const [selectedRounds, setSelectedRounds] = useState(1);
  const [selectedTimer, setSelectedTimer] = useState(30);
  const [selectedDifficulty, setSelectedDifficulty] = useState("Easy");
  const [currentRound, setCurrentRound] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  const myUserId = sessionStorage.getItem("userId");
  const myDisplayName = sessionStorage.getItem("displayName");
  const navigate = useNavigate();
  const isHost = myUserId === hostId;

  useEffect(() => {
    if (!myUserId || !roomId) return;

    socket.emit("registerLobby", {
      userId: myUserId,
      displayName: myDisplayName,
      roomId,
    });

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

    socket.on("gameSettingsUpdate", (settings) => {
      setSelectedRounds(settings.rounds);
      setSelectedTimer(settings.timer);
      setSelectedDifficulty(settings.difficulty);
    });

    socket.on("roundStarted", ({ currentRound, currentPlayer, timer }) => {
      setCurrentRound(currentRound);
      setCurrentPlayer(currentPlayer);
      setTimeLeft(timer);
      navigate(`/play/${roomId}`);
    });

    return () => {
      socket.off();
    };
  }, [roomId, myUserId, navigate]);

  const inAnyTeam = [...(teams.Red || []), ...(teams.Blue || [])];
  const unassignedUsers = onlineUsers.filter((u) => !inAnyTeam.includes(u.userId));
  const myTeam = teams.Red.includes(myUserId) ? "Red" : teams.Blue.includes(myUserId) ? "Blue" : null;

  const handleJoinTeam = (teamColor) => {
    socket.emit("joinTeam", { roomId, teamColor, userId: myUserId });
  };
  const handleLeaveTeam = () => {
    socket.emit("leaveTeam", { roomId, userId: myUserId });
  };

  const renderUserRow = (user) => {
    const isMe = user.userId === myUserId;
    return (
      <div className="user-row" key={user.userId}>
        <div className="user-name">
          {/* 🔹 Use DB-provided avatarSeed + avatarStyle */}
          <InteractiveAvatar
            avatarSeed={user.avatarSeed || user.displayName || "player"}
            avatarStyle={user.avatarStyle || "funEmoji"}
            size={40}
          />
          <span className="username-bold">{user.displayName}</span>
        </div>

        {isMe && (
          <div className="user-actions">
            {myTeam ? (
              <>
                <button className="leave-btn" onClick={handleLeaveTeam}>Leave</button>
                {myTeam === "Red" && (
                  <button className="join-btn join-blue" onClick={() => handleJoinTeam("Blue")}>Switch → Blue</button>
                )}
                {myTeam === "Blue" && (
                  <button className="join-btn join-red" onClick={() => handleJoinTeam("Red")}>Switch → Red</button>
                )}
              </>
            ) : (
              <>
                <button className="join-btn join-red" onClick={() => handleJoinTeam("Red")}>Join Red</button>
                <button className="join-btn join-blue" onClick={() => handleJoinTeam("Blue")}>Join Blue</button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const canStartGame = isHost && teams.Red.length > 0 && teams.Blue.length > 0;

  return (
    <div className="lobby-container">
      <div className="lobby-url">
        <span><strong>Game Lobby ID:</strong> {roomId}</span>
        <button
          className="copy-button"
          onClick={() => {
            navigator.clipboard.writeText(roomId);
            alert("Copied!");
          }}
        >
          Copy ID
        </button>
      </div>

      <div className="lobby-content">
        <div className="user-list">
          <h2>Online Users</h2>
          {unassignedUsers.length === 0 ? <p>No users online.</p> : unassignedUsers.map(renderUserRow)}
        </div>

        <div className="teams-col">
          <div className="team-card red">
            <h3>Red Team</h3>
            {teams.Red.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              teams.Red.map((uid) => renderUserRow(onlineUsers.find((u) => u.userId === uid) || { userId: uid, displayName: uid }))
            )}
          </div>
          <div className="team-card blue">
            <h3>Blue Team</h3>
            {teams.Blue.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              teams.Blue.map((uid) => renderUserRow(onlineUsers.find((u) => u.userId === uid) || { userId: uid, displayName: uid }))
            )}
          </div>
        </div>

        <div className="game-settings">
          <h2>Game Settings</h2>
          {/* your settings UI unchanged */}
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
          {!isHost && <small className="muted">Only host can start</small>}
        </div>

        <div className="chat-col">
          <Chat myUserId={myUserId} myDisplayName={myDisplayName} myTeam={myTeam} />
        </div>
      </div>
    </div>
  );
};

export default Lobby;

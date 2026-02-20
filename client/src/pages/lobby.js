import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "./socket";
import { createAvatar } from "@dicebear/core";
import * as Dice from "@dicebear/collection";
import Chat from "../reusableComponents/chat";
import "./lobby.css";
import { getUserId, getDisplayName } from "../utils/authStorage";

/** Inline interactive DiceBear avatar (no extra files) */
function InteractiveAvatar({
  avatarStyle = "funEmoji",
  avatarSeed = "player",
  size = 44,
  className = "",
}) {
  const wrapRef = useRef(null);
  const [pop, setPop] = useState(false);
  const [sparkles, setSparkles] = useState([]);
  const [tilt, setTilt] = useState({ tx: 0, ty: 0, rot: 0 });

  const dataUrl = useMemo(() => {
    const style = Dice[avatarStyle] || Dice.funEmoji;
    const svg = createAvatar(style, { seed: avatarSeed }).toString();
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [avatarStyle, avatarSeed]);

  const onPointerMove = (e) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const dx = (x - 0.5) * 2;
    const dy = (y - 0.5) * 2;
    const maxShift = 4;
    const maxRot = 6;
    setTilt({ tx: dx * maxShift, ty: dy * maxShift, rot: dx * -maxRot });
  };

  const onPointerLeave = () => setTilt({ tx: 0, ty: 0, rot: 0 });
  const onClick = () => {
    setPop(true);
    setTimeout(() => setPop(false), 240);
  };
  const onDoubleClick = () => {
    const now = Date.now();
    const burst = Array.from({ length: 7 }).map((_, i) => ({
      id: `${now}-${i}`,
      left: 40 + Math.random() * (size - 80),
      top: 40 + Math.random() * (size - 80),
      emoji: ["✨", "★", "✦", "✳︎", "❈"][Math.floor(Math.random() * 5)],
    }));
    setSparkles((prev) => [...prev, ...burst]);
    setTimeout(() => {
      setSparkles((prev) =>
        prev.filter((s) => !burst.find((b) => b.id === s.id)),
      );
    }, 700);
  };

  return (
    <div
      ref={wrapRef}
      className={`avatar-wrap ${className}`}
      style={{ width: size, height: size }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Drag, click, or double-click me ✨"
    >
      <img
        alt=""
        className={`user-avatar avatar-anim avatar-interactive ${pop ? "pop" : ""}`}
        src={dataUrl}
        style={{
          transform: `translate(${tilt.tx}px, ${tilt.ty}px) rotate(${tilt.rot}deg)`,
        }}
      />
      {sparkles.map((s) => (
        <span
          key={s.id}
          className="sparkle"
          style={{ left: s.left, top: s.top }}
        >
          {s.emoji}
        </span>
      ))}
    </div>
  );
}

const Lobby = () => {
  const { roomId } = useParams();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [teams, setTeams] = useState({ Red: [], Blue: [] });

  const myUserId = getUserId();
  const myDisplayName = getDisplayName();
  const navigate = useNavigate();

  // game settings
  const [selectedRounds, setSelectedRounds] = useState(1);
  const [selectedTimer, setSelectedTimer] = useState(30);
  const [selectedDifficulty, setSelectedDifficulty] = useState("Easy");
  const [currentRound, setCurrentRound] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  const byId = useMemo(
    () => Object.fromEntries(onlineUsers.map((u) => [u.userId, u])),
    [onlineUsers],
  );

  const myTeam = useMemo(() => {
    if (!myUserId) return null;
    if ((teams.Red || []).includes(myUserId)) return "Red";
    if ((teams.Blue || []).includes(myUserId)) return "Blue";
    return null;
  }, [teams, myUserId]);

  const isHost = myUserId === hostId;
  const redTeamHasPlayers = teams.Red.length > 1;
  const blueTeamHasPlayers = teams.Blue.length > 1;
  const canStartGame = isHost && redTeamHasPlayers && blueTeamHasPlayers;

  useEffect(() => {
    if (!myUserId || !roomId) return;

    // 1) Attach listeners FIRST to avoid race conditions
    socket.on("lobbyUsers", setOnlineUsers);
    socket.on("userJoinedLobby", (user) => {
      setOnlineUsers((prev) =>
        prev.some((u) => u.userId === user.userId) ? prev : [...prev, user],
      );
    });
    socket.on("userLeftLobby", ({ userId }) => {
      setOnlineUsers((prev) => prev.filter((u) => u.userId !== userId));
    });

    socket.on(
      "profileUpdated",
      ({ userId, displayName, avatarSeed, avatarStyle }) => {
        setOnlineUsers((prev) =>
          prev.map((u) =>
            u.userId === userId
              ? { ...u, displayName, avatarSeed, avatarStyle }
              : u,
          ),
        );
      },
    );

    socket.on("hostSet", setHostId);
    socket.on("teamsUpdate", setTeams);

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

    socket.on("leftTeam", (res) => {
      if (!res?.ok) console.warn("leftTeam failed", res?.error);
    });

    socket.on("startGameError", ({ message }) => {
      alert(message || "Unable to start the game.");
    });

    // 2) After listeners are ready, emit registration & state requests
    socket.emit("registerLobby", {
      userId: myUserId,
      displayName: myDisplayName,
      roomId,
    });
    socket.emit("requestLobbyUsers", { roomId });
    socket.emit("getHost", { roomId });

    return () => {
      // cleanup only what we used
      socket.off("lobbyUsers");
      socket.off("userJoinedLobby");
      socket.off("userLeftLobby");
      socket.off("profileUpdated");
      socket.off("hostSet");
      socket.off("teamsUpdate");
      socket.off("gameSettingsUpdate");
      socket.off("userKicked");
      socket.off("kicked");
      socket.off("roundStarted");
      socket.off("startTimer");
      socket.off("gameEnded");
      socket.off("leftTeam");
      socket.off("startGameError");
    };
  }, [roomId, myUserId, myDisplayName, navigate]);

  const inAnyTeam = [...(teams.Red || []), ...(teams.Blue || [])];
  const unassignedUsers = onlineUsers.filter(
    (u) => !inAnyTeam.includes(u.userId),
  );

  const handleJoinTeam = (teamColor) => {
    socket.emit("joinTeam", { roomId, teamColor, userId: myUserId });
  };
  const handleLeaveTeam = () => {
    socket.emit("leaveTeam", { roomId, userId: myUserId });
  };

  const handleSettingsChange = (setting, value) => {
    if (!isHost) return;
    const updated = {
      rounds: selectedRounds,
      timer: selectedTimer,
      difficulty: selectedDifficulty,
    };
    if (setting === "rounds") updated.rounds = value;
    if (setting === "timer") updated.timer = value;
    if (setting === "difficulty") updated.difficulty = value;

    // reflect immediately
    setSelectedRounds(updated.rounds);
    setSelectedTimer(updated.timer);
    setSelectedDifficulty(updated.difficulty);

    // broadcast to room (server validates host)
    socket.emit("updateGameSettings", { roomId, newSettings: updated });
  };

  const renderUserRow = (userId) => {
    const user = byId[userId] || { userId, displayName: userId };
    const isHostUser = userId === hostId;
    const isMe = userId === myUserId;

    let actions = null;
    if (isMe) {
      if (myTeam === "Red") {
        actions = (
          <span className="user-actions">
            <button className="leave-btn" onClick={handleLeaveTeam}>
              Leave team
            </button>
            <button
              className="join-btn join-blue"
              onClick={() => handleJoinTeam("Blue")}
            >
              Switch to Blue
            </button>
          </span>
        );
      } else if (myTeam === "Blue") {
        actions = (
          <span className="user-actions">
            <button className="leave-btn" onClick={handleLeaveTeam}>
              Leave team
            </button>
            <button
              className="join-btn join-red"
              onClick={() => handleJoinTeam("Red")}
            >
              Switch to Red
            </button>
          </span>
        );
      } else {
        actions = (
          <span className="user-actions">
            <button
              className="join-btn join-red"
              onClick={() => handleJoinTeam("Red")}
            >
              Join Red
            </button>
            <button
              className="join-btn join-blue"
              onClick={() => handleJoinTeam("Blue")}
            >
              Join Blue
            </button>
          </span>
        );
      }
    }

    return (
      <div className="user-row" key={userId}>
        <InteractiveAvatar
          avatarStyle={user.avatarStyle}
          avatarSeed={user.avatarSeed || user.displayName || user.userId}
          size={44}
          className="avatar-anim"
        />
        <span className={`user-name ${isHostUser ? "host" : ""}`}>
          {user.displayName}
          {isHostUser && (
            <span title="Host" className="crown">
              👑
            </span>
          )}
        </span>
        {actions}
      </div>
    );
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

      <div className="lobby-content">
        {/* ONLINE USERS */}
        <div className="user-list">
          <h2>Online Users</h2>
          {unassignedUsers.length === 0 ? (
            <p>No users online.</p>
          ) : (
            unassignedUsers.map((u) => renderUserRow(u.userId))
          )}
        </div>

        {/* TEAMS */}
        <div className="teams-col">
          <div className="team-card red">
            <h3>Red Team</h3>
            {teams.Red.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              teams.Red.map((uid) => renderUserRow(uid))
            )}
          </div>
          <div className="team-card blue">
            <h3>Blue Team</h3>
            {teams.Blue.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              teams.Blue.map((uid) => renderUserRow(uid))
            )}
          </div>
        </div>

        {/* SETTINGS */}
        <div className="game-settings">
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
              {/* Added time to adjust styling. To be removed when completed*/}
              {[30, 45, 60, 75, 90, 100000000000000].map((sec) => (
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
              Both teams must have at least two players to start the game.
            </small>
          )}
        </div>

        {/* CHAT */}
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

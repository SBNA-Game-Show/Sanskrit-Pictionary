import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "./socket";
import Chat from "../reusableComponents/chat";
import "./lobby.css";
import { getUserId, getDisplayName } from "../utils/authStorage";
import {
  toastSuccess,
  toastInfo,
  toastError,
  toastWarning,
} from "../utils/toast";
import InteractiveAvatar from "../reusableComponents/InteractiveAvatar";

const DEFAULT_GAME_SETTINGS = {
  rounds: 1,
  timer: 30,
  difficulty: "Easy",
  guesses: 4,
  isLearningMode: true
};

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5005";

const createUpdatedSettings = (settings, setting, value) => {
  const updated = { ...settings };
  if (setting === "rounds") updated.rounds = value;
  if (setting === "timer") updated.timer = value;
  if (setting === "difficulty") updated.difficulty = value;
  if (setting === "guesses") updated.guesses = value;
  if (setting === "isLearningMode") updated.isLearningMode = value;
  return updated;
};

const Lobby = () => {
  const { roomId } = useParams();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [teams, setTeams] = useState({ Red: [], Blue: [] });

  const myUserId = getUserId();
  const myDisplayName = getDisplayName();
  const navigate = useNavigate();

  // Track recently shown join notifications to prevent duplicates
  const recentJoinsRef = useRef(new Set());
  const timerIntervalRef = useRef(null);

  // game settings
  const [gameSettings, setGameSettings] = useState(DEFAULT_GAME_SETTINGS);
  const [currentRound, setCurrentRound] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  const { rounds, timer, difficulty, guesses, isLearningMode } = gameSettings;

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
  const evenTeams = Math.abs(teams.Red.length - teams.Blue.length) <= 1;
  const canStartGame =
    isHost && redTeamHasPlayers && blueTeamHasPlayers && evenTeams;

  const inAnyTeam = useMemo(
    () => [...(teams.Red || []), ...(teams.Blue || [])],
    [teams],
  );

  const unassignedUsers = useMemo(
    () => onlineUsers.filter((u) => !inAnyTeam.includes(u.userId)),
    [onlineUsers, inAnyTeam],
  );

  const clearCountdown = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const registerAndSyncLobby = async () => {
    if (!roomId || !myUserId) return;

    console.log("[Lobby] Rejoining lobby");
    try {
      const response = await fetch(`${API_BASE}/api/room/exists/${roomId}`);
      const data = await response.json();

      if (!data.exists) {
        toastError("Invalid room code! Navigating to the lobby", {
          toastId: "invalid-room",
        });
        navigate(`/lobby`, { replace: true });
        return;
      }

      socket.emit("registerLobby", {
        userId: myUserId,
        displayName: myDisplayName,
        roomId,
      });
      socket.emit("requestLobbyUsers", { roomId });
      socket.emit("getHost", { roomId });
    } catch (error) {
      console.error("[Lobby] Failed to verify room status:", error);
    }
  };

  const leaveLobbyAndGoHome = () => {
    if (socket && socket.connected) {
      socket.emit("leaveLobby", { roomId, userId: myUserId });
    }
    navigate("/lobby");
  };

  useEffect(() => {
    // Check if user has valid session (registered OR guest)
    if (!myUserId) {
      toastError("Session expired. Please sign in or play as guest.");
      navigate("/");
      return;
    }

    if (!roomId) return;

    // Initial registration
    registerAndSyncLobby();

    // Handle reconnection
    const handleReconnect = () => {
      console.log("[Lobby] Socket reconnected, rejoining");
      registerAndSyncLobby();
    };

    socket.on("connect", handleReconnect);

    // Attach listeners first, then request state to avoid race conditions.
    socket.on("lobbyUsers", setOnlineUsers);
    socket.on("userJoinedLobby", (user) => {
      setOnlineUsers((prev) =>
        prev.some((u) => u.userId === user.userId) ? prev : [...prev, user],
      );

      if (
        user.userId !== myUserId &&
        !recentJoinsRef.current.has(user.userId)
      ) {
        toastInfo(`${user.displayName} joined the lobby`, {
          autoClose: 2500,
        });
        recentJoinsRef.current.add(user.userId);
        setTimeout(() => recentJoinsRef.current.delete(user.userId), 2000);
      }
    });
    socket.on("userLeftLobby", ({ userId }) => {
      setOnlineUsers((prev) => prev.filter((u) => u.userId !== userId));
    });

    socket.on(
      "profileUpdated",
      ({ userId, displayName, avatarSeed, avatarStyle, avatarData }) => {
        setOnlineUsers((prev) =>
          prev.map((u) =>
            u.userId === userId
              ? { ...u, displayName, avatarSeed, avatarStyle, avatarData }
              : u,
          ),
        );
      },
    );

    socket.on("hostSet", setHostId);
    socket.on("teamsUpdate", setTeams);

    socket.on("gameSettingsUpdate", (settings) => {
      setGameSettings({
        rounds: settings.rounds,
        timer: settings.timer,
        difficulty: settings.difficulty,
        guesses: settings.guesses,
        isLearningMode: settings.isLearningMode
      });
    });

    socket.on("roundStarted", ({ currentRound, currentPlayer, timer, guesses }) => {
      setCurrentRound(currentRound);
      setCurrentPlayer(currentPlayer);
      setTimeLeft(timer);
      setGameSettings((prev) => ({ ...prev, guesses }));
      navigate(`/play/${roomId}`);
    });

    socket.on("startTimer", ({ duration }) => {
      clearCountdown();
      setTimeLeft(duration);
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearCountdown();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    // Keep player in /lobby if game has ended
    socket.once("gameEnded", () => {
      toastWarning("Game is over!");
      navigate("/lobby", { replace: true });
    });

    // Redirect player to /play/roomId
    socket.once("gameInProgress", (data) => {
      toastWarning("Game in progress. Joining as spectator.");
      navigate(`/play/${data.roomId}`);
    });

    socket.on("leftTeam", (res) => {
      if (!res?.ok) console.warn("leftTeam failed", res?.error);
    });

    socket.on("startGameError", ({ message }) => {
      toastError(message || "Unable to start the game.");
    });

    socket.on("hostLeftOthers", ({ hostName }) => {
      toastError(`Host ${hostName} ended the game. You have been kicked out.`, {
        autoClose: 4000,
      });
      leaveLobbyAndGoHome();
    });

    socket.on("hostDisconnectedOthers", ({ hostName, hostId }) => {
      if (hostId === myUserId) return;
      toastError(`Host ${hostName} disconnected. You have been kicked out.`, {
        autoClose: 4000,
      });
      leaveLobbyAndGoHome();
    });

    // Non-host player left
    socket.on("playerLeftLobby", ({ userId, displayName }) => {
      toastWarning(`${displayName} left the lobby`, { autoClose: 2500 });
    });

    // After listeners are ready, request latest lobby state.
    socket.emit("requestLobbyUsers", { roomId });
    socket.emit("getHost", { roomId });

    return () => {
      clearCountdown();
      socket.off("connect", handleReconnect);
      socket.off("lobbyUsers");
      socket.off("userJoinedLobby");
      socket.off("userLeftLobby");
      socket.off("profileUpdated");
      socket.off("hostSet");
      socket.off("teamsUpdate");
      socket.off("gameSettingsUpdate");
      socket.off("roundStarted");
      socket.off("startTimer");
      socket.off("gameEnded");
      socket.off("leftTeam");
      socket.off("startGameError");
      socket.off("hostLeftOthers");
      socket.off("hostDisconnectedOthers");
      socket.off("playerLeftLobby");
      socket.off("gameInProgress");
    };
  }, [roomId, myUserId, myDisplayName, navigate]);

  const handleBackButton = () => {
    // Show confirmation for host
    if (isHost) {
      // If host is alone in the room
      const isAlone = onlineUsers.length === 1;

      const confirmed = window.confirm(
        isAlone
          ? "Are you sure you want to leave the lobby?"
          : "Are you sure you want to leave? This will end the game and kick all players.",
      );

      if (!confirmed) {
        return; // User cancelled, don't leave
      }

      // Based on whether host is alone
      if (isAlone) {
        toastInfo("You have left the lobby.", { autoClose: 2000 });
      } else {
        toastInfo("You have left the lobby. All players are being kicked.", {
          autoClose: 2500,
        });
      }
    }

    // Leave the lobby before navigating away
    leaveLobbyAndGoHome();
  };

  const handleJoinTeam = (teamColor) => {
    socket.emit("joinTeam", { roomId, teamColor, userId: myUserId });
  };
  const handleLeaveTeam = () => {
    socket.emit("leaveTeam", { roomId, userId: myUserId });
  };

  const handleSettingsChange = (setting, value) => {
    if (!isHost) return;
    const updated = createUpdatedSettings(gameSettings, setting, value);

    // reflect immediately
    setGameSettings(updated);

    // broadcast to room (server validates host)
    socket.emit("updateGameSettings", { roomId, newSettings: updated });
  };

  const renderUserRow = (userId) => {
    const user = byId[userId] || { userId, displayName: userId };
    const isHostUser = userId === hostId;
    const isMe = userId === myUserId;
    const isGuestUser = userId.startsWith("guest_");

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
          isGuest={isGuestUser}
        />
        <span className={`user-name ${isHostUser ? "host" : ""}`}>
          {user.displayName}
          {isHostUser && (
            <span title="Host" className="crown">
              👑
            </span>
          )}
        </span>
        {!isHostUser && actions}
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
            toastSuccess("Room ID copied to clipboard! 📋", {
              autoClose: 2000,
            });
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

          <button
            className="copy-button"
            onClick={handleBackButton}
            title="Back to main menu"
          >
            {" "}
            Back to Main
          </button>
        </div>

        {/* TEAMS */}
        <div className="teams-col">
          <div className="team-card red">
            <h3>Red Team / रक्तदल (Raktadala)</h3>
            {teams.Red.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              teams.Red.map((uid) => renderUserRow(uid))
            )}
          </div>
          <div className="team-card blue">
            <h3>Blue Team / नीलदल (Neeladala)</h3>
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
            <h3>Select Game Mode</h3>
            <div className="option-buttons">
              <button
                className={gameSettings.isLearningMode ? "active" : ""}
                onClick={() => handleSettingsChange("isLearningMode", true)}
                disabled={!isHost}
              >
                Learning
              </button>
              <button
                className={!gameSettings.isLearningMode ? "active" : ""}
                onClick={() => handleSettingsChange("isLearningMode", false)}
                disabled={!isHost}
              >
                Blitz
              </button>
            </div>
            <small style={{ marginTop: "5px", display: "block" }}>
              {gameSettings.isLearningMode 
                ? "Show answers after each turn." 
                : "Fast-paced! Answers are hidden."}
            </small>
          </div>

          <div className="setting-section">
            <h3>Select Rounds</h3>
            <div className="option-buttons">
              {[1, 2, 3, 4, 5].map((round) => (
                <button
                  key={round}
                  className={rounds === round ? "active" : ""}
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
              {[30, 45, 60, 75, 90].map((sec) => (
                <button
                  key={sec}
                  className={timer === sec ? "active" : ""}
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
                  className={difficulty === level ? "active" : ""}
                  onClick={() => handleSettingsChange("difficulty", level)}
                  disabled={!isHost}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Host-configurable guess count used by gameplay round logic */}
          <div className="setting-section">
            <h3>Select Chances</h3>
            <div className="option-buttons">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  className={guesses === num ? "active" : ""}
                  onClick={() => handleSettingsChange("guesses", num)}
                  disabled={!isHost}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {isHost && (
            <button
              className="start-game-button"
              onClick={() => {
                if (isHost) {
                  socket.emit("startGame", {
                    gameId: roomId,
                    totalRounds: rounds,
                    timer,
                    difficulty,
                    guesses,
                    isLearningMode,
                    hostData: {
                      hostId,
                      hostDisplayName: myDisplayName,
                      hostSocketId: socket.id,
                    },
                    teams: teams,
                  });
                }
              }}
              disabled={!canStartGame}
            >
              Start Game
            </button>
          )}

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

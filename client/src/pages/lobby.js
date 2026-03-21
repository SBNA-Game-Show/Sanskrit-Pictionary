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

  // game settings
  const [selectedRounds, setSelectedRounds] = useState(1);
  const [selectedTimer, setSelectedTimer] = useState(30);
  const [selectedDifficulty, setSelectedDifficulty] = useState("Easy");
  const [selectedGuesses, setSelectedGuesses] = useState(4); // Added new config for guesses
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
  const evenTeams = Math.abs(teams.Red.length - teams.Blue.length) <= 1;
  const canStartGame =
    isHost && redTeamHasPlayers && blueTeamHasPlayers && evenTeams;

  useEffect(() => {
    // Check if user has valid session (registered OR guest)
    if (!myUserId) {
      toastError("Session expired. Please sign in or play as guest.");
      navigate("/");
      return;
    }

    if (!roomId) return;

    // unction to rejoin
    const rejoinLobby = () => {
      console.log("[Lobby] Rejoining lobby");

      socket.emit("registerLobby", {
        userId: myUserId,
        displayName: myDisplayName,
        roomId,
      });

      socket.emit("requestLobbyUsers", { roomId });
      socket.emit("getHost", { roomId });
    };

    // Initial registration
    rejoinLobby();

    // Handle reconnection
    const handleReconnect = () => {
      console.log("[Lobby] Socket reconnected, rejoining");
      rejoinLobby();
    };

    socket.on("connect", handleReconnect);

    // 1) Attach listeners FIRST to avoid race conditions
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
      setSelectedRounds(settings.rounds);
      setSelectedTimer(settings.timer);
      setSelectedDifficulty(settings.difficulty);
      setSelectedGuesses(settings.guesses);
    });

    socket.on("roundStarted", ({ currentRound, currentPlayer, timer, guesses }) => {
      setCurrentRound(currentRound);
      setCurrentPlayer(currentPlayer);
      setTimeLeft(timer);
      setSelectedGuesses(guesses);
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
      if (socket && socket.connected) {
        socket.emit("leaveLobby", { roomId, userId: myUserId });
      }
      navigate("/lobby");
    });

    socket.on("hostDisconnectedOthers", ({ hostName }) => {
      toastError(`Host ${hostName} disconnected. You have been kicked out.`, {
        autoClose: 4000,
      });
      if (socket && socket.connected) {
        socket.emit("leaveLobby", { roomId, userId: myUserId });
      }
      navigate("/lobby");
    });

    // Non-host player left
    socket.on("playerLeftLobby", ({ userId, displayName }) => {
      toastWarning(`${displayName} left the lobby`, { autoClose: 2500 });
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
    if (socket && socket.connected) {
      socket.emit("leaveLobby", { roomId, userId: myUserId });
    }

    navigate("/lobby");
  };

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
      guesses: selectedGuesses
    };
    if (setting === "rounds") updated.rounds = value;
    if (setting === "timer") updated.timer = value;
    if (setting === "difficulty") updated.difficulty = value;
    if (setting === "guesses") updated.guesses = value;

    // reflect immediately
    setSelectedRounds(updated.rounds);
    setSelectedTimer(updated.timer);
    setSelectedDifficulty(updated.difficulty);
    setSelectedGuesses(updated.guesses);

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
    <div className="lobby-container" data-testid="lobby-page">
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
        <div className="user-list" data-testid="online-users-panel">
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
          <div className="team-card red" data-testid="red-team-panel">
            <h3>Red Team</h3>
            {teams.Red.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              teams.Red.map((uid) => renderUserRow(uid))
            )}
          </div>
          <div className="team-card blue" data-testid="blue-team-panel">
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
            {console.log("Current timer in Render:", selectedTimer)}
            <div className="option-buttons">
              {/* Added time to adjust styling. To be removed when completed*/}
              {[30, 45, 60, 75, 90].map((sec) => (
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
            {console.log("Current diff in Render:", selectedDifficulty)}
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

          {/* Added config for guessess in the lobby */}
          <div className="setting-section">
            <h3>Select Chances</h3>
            {console.log("Current selectedGuesses in Render:", selectedGuesses)}
            <div className="option-buttons">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  className={selectedGuesses === num ? "active" : ""}
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
                    totalRounds: selectedRounds,
                    timer: selectedTimer,
                    difficulty: selectedDifficulty,
                    guesses: selectedGuesses, // send guesses to server
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

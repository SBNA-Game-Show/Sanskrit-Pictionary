import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import "./play.css";
import FloatableChat from "../reusableComponents/FloatableChat";
import Flashcard from "../reusableComponents/flashcard";
import RoundPopups from "../reusableComponents/RoundPopups";
import InteractiveAvatar from "../reusableComponents/InteractiveAvatar";
import { ReactSketchCanvas } from "react-sketch-canvas";
import { createAvatar } from "@dicebear/core";
import * as DiceStyles from "@dicebear/collection";
import { socket } from "./socket";
import { getUserId, getDisplayName } from "../utils/authStorage";
import { toastWarning, toastError, toastInfo, toastSuccess } from "../utils/toast";

import correctSound from "../assets/sounds/correct.wav";
import wrongSound from "../assets/sounds/wrong.wav";
import ImagesSelection from "../reusableComponents/ImagesSelection";

const svgToDataUrl = (svg) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

function makeAvatarDataUrl(styleKey, seed) {
  const style = DiceStyles[styleKey] || DiceStyles.funEmoji;
  const svg = createAvatar(style, { seed: seed || "player" }).toString();
  return svgToDataUrl(svg);
}
function maskPhraseToUnderscores(phrase) {
  if (!phrase || typeof phrase !== "string") return "";
  // collapse combining marks so each letter (incl. ā, ś, etc.) becomes ONE "_"
  return phrase.normalize("NFC").replace(/\p{L}\p{M}*/gu, "_");
}

const Play = () => {
  const canvasRef = useRef(null);
  const playersRef = useRef([]); // holds freshest players for end screen
  const profilesRef = useRef({});
  const hostRef = useRef(false);
  const { roomId } = useParams();
  const navigate = useNavigate(); // for /end navigation

  // Tracking if game ended naturally
  const isGameEndedRef = useRef(false);

  // UI / game states
  const [players, setPlayers] = useState([]);
  const [hostData, setHostData] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [eraseMode, setEraseMode] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [eraserWidth, setEraserWidth] = useState(10);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [flashcard, setFlashcard] = useState(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [drawerId, setDrawerId] = useState(null);
  const [drawerTeam, setDrawerTeam] = useState("");
  const [currentPlayerName, setCurrentPlayerName] = useState("");
  const [myTeam, setMyTeam] = useState("");
  const [answer, setAnswer] = useState("");
  const [remainingGuesses, setRemainingGuesses] = useState(4);
  const [totalGuesses, setTotalGuesses] = useState(4); // To store configed guesses

  // For multiple-choice image selection (guessers only)
  const [imageChoices, setImageChoices] = useState([]);
  const [showChoices, setShowChoices] = useState(false);
  const [roundKey, setRoundKey] = useState(0);

  // 🔹 profile map: userId -> { displayName, avatarSeed, avatarStyle }
  const [profiles, setProfiles] = useState({});

  // Pause state
  const [isGamePaused, setIsGamePaused] = useState(false);
  const [pausedByHost, setPausedByHost] = useState("");


  // Small modal to show round result (e.g., correct answer)
  const [roundResult, setRoundResult] = useState(null); // {type: 'correct', displayName: 'X'} or null
  const [roundReveal, setRoundReveal] = useState(null);

  // Track all users who answered correctly this round to highlight their cards
  const [correctUserIds, setCorrectUserIds] = useState([]);

  // Modal state for kicking
  const [showKickModal, setShowKickModal] = useState(false);
  const [kickTarget, setKickTarget] = useState(null); // { userId, displayName }

  // Derived booleans
  const isDrawer = (getUserId() || currentUserId) === drawerId;
  const isEligibleGuesser = myTeam === drawerTeam && !isDrawer;
  const canAnswer = isEligibleGuesser && remainingGuesses > 0;

  // Audio cues
  const correctAudioRef = useRef(new Audio(correctSound));
  const wrongAudioRef = useRef(new Audio(wrongSound));

  // ---------- UI helpers ----------
  const handlePenClick = () => {
    setEraseMode(false);
    canvasRef.current?.eraseMode(false);
  };

  const handleEraserClick = () => {
    setEraseMode(true);
    canvasRef.current?.eraseMode(true);
  };

  const handleStrokeWidthChange = (e) => setStrokeWidth(Number(e.target.value));
  const handleEraserWidthChange = (e) => setEraserWidth(Number(e.target.value));
  const handleStrokeColorChange = (e) => setStrokeColor(e.target.value);

  // Send answer to server
  const handleSubmitAnswer = () => {
    if (answer.trim() === "" || !canAnswer) return;
    socket.emit("submitAnswer", {
      gameId: roomId,
      userId: getUserId(),
      answer: answer.trim(),
    });
    setAnswer("");
  };

  // Emit drawing updates only if you're the drawer
  const handleCanvasChange = (paths) => {
    if (isDrawer) {
      socket.emit("drawing-data", {
        gameId: roomId,
        userId: getUserId(),
        data: paths,
      });
    }
  };

  // Clear canvas (drawer triggers broadcast)
  const handleClear = () => {
    canvasRef.current?.clearCanvas();
    canvasRef.current?.eraseMode(false);
    setEraseMode(false);
    if (isDrawer) {
      socket.emit("clear-canvas", {
        gameId: roomId,
        userId: getUserId(),
      });
    }
  };

  // Warn current drawer
  const handleWarnDrawer = () => {
    canvasRef.current?.clearCanvas();
    if (isHost) {
      socket.emit("warnDrawer", {
        gameId: roomId,
        userId: getUserId(),
      });
    }
  };

  const handleForceSkip = () => {
    canvasRef.current?.clearCanvas();
    if (isHost) {
      socket.emit("forceSkipRound", {
        gameId: roomId,
        userId: getUserId(),
      });
    }
  };

  const handleKickClick = (user, displayName) => {
    setKickTarget({ userId: user.userId, displayName });
    setShowKickModal(true);
  };

  const handleKickConfirm = () => {
    if (kickTarget) {
      socket.emit("kickUser", { roomId, targetUserId: kickTarget.userId });
    }
    setShowKickModal(false);
    setKickTarget(null);
  };

  const handleKickCancel = () => {
    setShowKickModal(false);
    setKickTarget(null);
  };

  // ---------- Socket setup ----------
  useEffect(() => {
    const userId = getUserId();
    setCurrentUserId(userId || "");
    console.log("[Play] mounting | roomId=", roomId, "userId=", userId);
    if (!roomId) return;

    // Function to rejoin and sync state
    const rejoinAndSync = async () => {

      // Checking room existence before joining
      const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5005";

      try {
        // Call API for room exists status
        const response = await fetch(`${API_BASE}/api/room/exists/${roomId}`);
        const data = await response.json();

        if (data.exists) {
          // Emit registerLobby only when room exists
          socket.emit("registerLobby", {
            userId,
            displayName: getDisplayName() || userId,
            roomId,
          });
          socket.emit("getGameState", { roomId });
          socket.emit("requestLobbyUsers", { roomId });
        } else {
          // Navigate to home if room code is invalid.
          toastError("Invalid room code! Navigating to the lobby", { toastId: "invalid-room" });
          navigate(`/lobby`, { replace: true })
        }
      } catch (error) {
        console.error("[Play] Failed to verify room status:", error);
      }
    };

    rejoinAndSync();

    const handleReconnect = () => {
      console.log("[Play] Socket reconnected, rejoining game");
      rejoinAndSync();
    };

    socket.on("connect", handleReconnect);

    socket.on("playerDisconnected", ({ userId, displayName }) => {
      toastWarning(`${displayName} disconnected`, { autoClose: 2000 });
    });

    socket.on("playerReconnected", ({ userId, displayName }) => {
      toastInfo(`${displayName} reconnected! 🎮`, { autoClose: 2000 });
    });

    socket.on("hostDisconnectedOthers", ({ hostName, hostId }) => {
      if (hostId === getUserId()) return;
      isGameEndedRef.current = true;
      toastError(`Host ${hostName} disconnected. You have been kicked out.`, {
        autoClose: 4000,
      });
      navigate("/lobby");
    });

    socket.on("gamePaused", ({ hostName }) => {
      setIsGamePaused(true);
      setPausedByHost(hostName);
    });

    socket.on("gameResumed", ({ hostName }) => {
      setIsGamePaused(false);
      setPausedByHost("");
      toastInfo(`Host ${hostName} returned! Game resumed.`, { autoClose: 3000 });
    });

    socket.on("userKicked", (kickedPlayer) => {
      if (kickedPlayer.userId === getUserId()) {
        isGameEndedRef.current = true;
        toastInfo("You were kicked from the game.");
        navigate("/lobby");
      } else {
        toastInfo(`${kickedPlayer.displayName} was kicked from the game.`);
      }
    });

    const onLobbyUsers = (users) => {
      const map = {};
      (users || []).forEach((u) => {
        map[u.userId] = {
          displayName: u.displayName,
          avatarSeed: u.avatarSeed,
          avatarStyle: u.avatarStyle,
          avatarData: u.avatarData,
        };
      });
      setProfiles(map);
      profilesRef.current = map;
    };
    socket.on("lobbyUsers", onLobbyUsers);

    // Navigate to /lobby/code if the game not started
    socket.once("newGame", (data) => {
      toastWarning("Game is not started! Navigating to the lobby");
      navigate(`/lobby/${data.roomId}`, { replace: true });
    });

    const onProfileUpdated = ({
      userId,
      displayName,
      avatarSeed,
      avatarStyle,
      avatarData,
    }) => {
      setProfiles((prev) => {
        const updated = {
          ...prev,
          [userId]: {
            displayName: displayName ?? prev[userId]?.displayName,
            avatarSeed: avatarSeed ?? prev[userId]?.avatarSeed,
            avatarStyle: avatarStyle ?? prev[userId]?.avatarStyle,
            avatarData: avatarData ?? prev[userId]?.avatarData,
          },
        };
        profilesRef.current = updated;
        return updated;
      });
    };
    socket.on("profileUpdated", onProfileUpdated);

    // ✅ UPDATED: gameState with canvas data
    socket.on("gameState", (state) => {
      console.log("[Play] received gameState:", state);
      const serverFlash = state.currentFlashcard ?? state.flashcard ?? null;

      setTotalGuesses(state.guesses); // set total guesses
      setPlayers((prev) => {
        const prevMap = new Map((prev || []).map((p) => [p.userId, p]));
        const merged = (state.players || []).map((p) => {
          const prevP = prevMap.get(p.userId);
          return {
            ...p,
            remainingGuesses:
              p.remainingGuesses ?? prevP?.remainingGuesses ?? totalGuesses,
          };
        });
        playersRef.current = merged;
        return merged;
      });
      setHostData(state.hostData || null);
      setDrawerId(state.drawer?.userId || null);
      setDrawerTeam(state.drawer?.team || "");
      setCurrentPlayerName(state.drawer?.displayName || "");
      setTimeLeft(state.timer || 0);

      if (serverFlash) setFlashcard(serverFlash);

      const me = (state.players || []).find((p) => p.userId === userId);
      setMyTeam(me?.team || "");
      setRemainingGuesses(
        me?.remainingGuesses !== undefined ? me.remainingGuesses : totalGuesses,
      );

      // ✅ Handle canvas data from gameState
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();

        if (state.canvasData && state.canvasData.length > 0) {
          setTimeout(() => {
            if (canvasRef.current) {
              console.log("[Play] Loading canvas data from gameState");
              canvasRef.current.loadPaths(state.canvasData);
            }
          }, 100);
        }
      }
    });

    socket.on("updatePlayers", (list) => {
      setPlayers((prev) => {
        const prevMap = new Map((prev || []).map((p) => [p.userId, p]));
        const merged = (list || []).map((p) => {
          const prevP = prevMap.get(p.userId);
          return {
            ...p,
            remainingGuesses:
              p.remainingGuesses ?? prevP?.remainingGuesses ?? totalGuesses,
          };
        });
        playersRef.current = merged;
        return merged;
      });

      const me = (list || []).find((p) => p.userId === userId);
      setMyTeam(me?.team || "");
      setRemainingGuesses(
        me?.remainingGuesses !== undefined ? me.remainingGuesses : totalGuesses,
      );
    });

    // drawerChanged clears canvas
    socket.on("drawerChanged", ({ userId: newDrawerId, displayName, team }) => {
      console.log("[Play] drawerChanged", {
        newDrawerId,
        displayName,
        team,
        clientUserId: getUserId(),
      });

      setDrawerId(newDrawerId);
      setDrawerTeam(team || "");

      const name =
        typeof displayName === "string"
          ? displayName
          : displayName?.displayName || displayName?.userId || "";
      setCurrentPlayerName(name);

      // Clear canvas when drawer changes
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
      }
    });

    socket.on("timerUpdate", ({ secondsLeft }) => {
      setTimeLeft(secondsLeft);
    });

    socket.on("drawing-data", (data) => {
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
        canvasRef.current.loadPaths(data);
      }
    });

    socket.on("newFlashcard", (data) => {
      console.log("[Play] received newFlashcard (drawer-only):", {
        data,
        clientUserId: getUserId(),
        drawerId,
        translation: data.translation ?? data.hint ?? "",
        imageSrc: data.imageSrc ?? data.image ?? "",
        audioSrc: data.audioSrc ?? data.audio ?? "",
      });
      setFlashcard(data);
    });

    // roundStarted clears canvas
    socket.on("roundStarted", ({ currentRound, currentPlayer, timer }) => {
      console.log("[Play] roundStarted payload:", {
        currentRound,
        currentPlayer,
        timer,
      });

      let cpName = "";
      if (typeof currentPlayer === "string") cpName = currentPlayer;
      else if (currentPlayer && typeof currentPlayer === "object")
        cpName = currentPlayer.displayName || currentPlayer.userId || "";

      setCurrentPlayerName(cpName);
      setAnswer("");
      setTimeLeft(timer || 0);
      setRemainingGuesses(totalGuesses);
      setCorrectUserIds([]); // Reset the correct answer highlights

      // Reset answer and choices when drawer changes
      setImageChoices([]);
      setRoundKey((k) => k + 1);
      setFlashcard(null); //  clear old card instantly
      socket.emit("getGameState", { roomId }); // fetch new card

      // Clear canvas when new round starts
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
      }
    });

    socket.on("correctAnswer", ({ displayName, scoreGained, userId }) => {
      if (userId === getUserId()) {
        correctAudioRef.current.currentTime = 0;
        correctAudioRef.current.play();
      }
      if (userId) {
        setCorrectUserIds((prev) =>
          prev.includes(userId) ? prev : [...prev, userId],
        );
      }
      toastSuccess(
        `🎉 ${displayName || "Someone"} guessed correctly and earned ${scoreGained} points!`,
        {
          autoClose: 3000,
          position: "top-left",
        },
      );
    });

    socket.on(
      "wrongAnswer",
      ({ userId: wrongUserId, displayName, remainingGuesses, scoreLost }) => {
        if (wrongUserId === getUserId()) {
          wrongAudioRef.current.currentTime = 0;
          wrongAudioRef.current.play();
        }

        console.log("[Play] wrongAnswer", {
          wrongUserId,
          displayName,
          remainingGuesses,
          scoreLost,
        });
        if (wrongUserId === getUserId() && remainingGuesses !== undefined) {
          setRemainingGuesses(remainingGuesses);
        }

        // Update the user list for everyone immediately (server also emits updatePlayers,
        // but this makes the UI responsive even if packets arrive out-of-order)
        if (wrongUserId && remainingGuesses !== undefined) {
          setPlayers((prev) => {
            const next = (prev || []).map((p) =>
              p.userId === wrongUserId ? { ...p, remainingGuesses } : p,
            );
            playersRef.current = next;
            return next;
          });
        }

        // Show penalty notification if this is the current user
        if (scoreLost && wrongUserId === getUserId()) {
          setRoundResult({
            type: "wrong",
            displayName: displayName || "You",
            scoreLost: scoreLost,
          });
          setTimeout(() => setRoundResult(null), 1200);
        }
      },
    );

    socket.on("guessesExhausted", () => {
      console.log("[Play] guessesExhausted");

      setRoundResult({
        type: "guessesExhausted",
        displayName: "Out of guesses!",
      });
      setTimeout(() => setRoundResult(null), 1500);
    });

    socket.on("turnEnded", (data) => {
      console.log("[Play] turnEnded", data);

      setRoundReveal({
        word: data.word,
        transliteration: data.transliteration,
        imageSrc: data.imageSrc,
      });

      if (data.audioSrc) {
        const audio = new Audio(data.audioSrc);
        audio.currentTime = 0;
        audio.play();
      }

      setTimeout(() => {
        setRoundReveal(null);
      }, 4000);
    });

    socket.on("clear-canvas", () => {
      canvasRef.current?.clearCanvas();
      canvasRef.current?.eraseMode(false);
      setEraseMode(false);
    });

    socket.on("warnDrawer", (drawerId, newScore) => {
      canvasRef.current?.clearCanvas();

      setPlayers((prev) => {
        const next = (prev || []).map((p) =>
          p.userId === drawerId ? { ...p, points: newScore } : p,
        );

        playersRef.current = next;
        return next;
      });
    });

    socket.on("gameEnded", (data) => {
      isGameEndedRef.current = true;
      setRoundResult({ type: "gameEnded" });
      const base = Array.isArray(playersRef.current)
        ? playersRef.current
        : players;

      const currentProfiles = profilesRef.current;

      const withAvatars = data.finalPlayers.map((p) => {
        const prof = currentProfiles[p.userId] || {};
        const seed = prof.avatarSeed || p.displayName || p.userId || "player";
        const style = prof.avatarStyle || "funEmoji";

        // Use custom avatar if available
        const avatarUrl = prof.avatarData || makeAvatarDataUrl(style, seed);
        return {
          ...p,
          avatar: avatarUrl,
          avatarSeed: seed,
          avatarStyle: style,
        };
      });

      setTimeout(() => {
        setRoundResult(null);
        if (hostRef.current) {
          socket.emit("deleteRoom", { roomId });
        }
        navigate("/end", { state: { players: withAvatars } });
      }, 1200);
    });

    return () => {
      socket.off("connect", handleReconnect);
      socket.off("playerDisconnected");
      socket.off("playerReconnected");
      socket.off("hostDisconnectedOthers");
      socket.off("gamePaused");
      socket.off("gameResumed");
      socket.off("userKicked");
      socket.off("lobbyUsers", onLobbyUsers);
      socket.off("newGame");
      socket.off("profileUpdated", onProfileUpdated);
      socket.off("gameState");
      socket.off("updatePlayers");
      socket.off("drawerChanged");
      socket.off("turnEnded");
      socket.off("timerUpdate");
      socket.off("drawing-data");
      socket.off("newFlashcard");
      socket.off("roundStarted");
      socket.off("correctAnswer");
      socket.off("wrongAnswer");
      socket.off("guessesExhausted");
      socket.off("clear-canvas");
      socket.off("warnDrawer");
      socket.off("gameEnded");

      // Check for unnatural unmount (e.g. navbar navigation)
      if (!isGameEndedRef.current) {
        console.log("[Play] Unmounting mid-game, simulating disconnect...");
        socket.emit("manualDisconnect");
      }
    };
  }, [roomId, navigate]); // eslint-disable-next-line react-hooks/exhaustive-deps

  const isHost = currentUserId === hostData?.hostId;

  useEffect(() => {
    hostRef.current = isHost;
  }, [isHost]);
  
  // team lists
  const redTeam = players.filter((p) => p.team === "Red");
  const blueTeam = players.filter((p) => p.team === "Blue");

  const renderUserChip = (user) => {
    const prof = profiles[user.userId] || {};
    const displayName = prof.displayName || user.displayName || user.userId;
    const seed = prof.avatarSeed || displayName || user.userId;
    const style = prof.avatarStyle;
    const isGuestUser = user.userId.startsWith("guest_");

    // Determine states - exhausted only if not correct and not drawer
    const isCorrect = correctUserIds.includes(user.userId);
    const isExhausted =
      (user.remainingGuesses ?? totalGuesses) <= 0 &&
      !isCorrect &&
      user.userId !== drawerId;

    // Debug logging
    if (isExhausted) {
      console.log(
        `[EXHAUSTED] ${displayName}: guesses=${user.remainingGuesses}, isCorrect=${isCorrect}, isDrawer=${user.userId === drawerId}`,
      );
    }

    const chipClass =
      "user-chip " +
      (user.team === "Red" ? "chip-red" : "chip-blue") +
      (user.userId === drawerId ? " is-drawer" : "") +
      (isCorrect ? " correct-answer" : "") +
      (isExhausted ? " guesses-exhausted" : "");

    return (
      <div
        className={chipClass}
        key={user.userId}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 2px",
          minWidth: "200px",
        }}
      >
        
        {/* Avatar + Kick button */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
          <InteractiveAvatar
            avatarSeed={seed}
            avatarStyle={style}
            size={30}
            isGuest={isGuestUser}
            className="avatar-anim"
          />
          {isHost && user.userId !== currentUserId && (
            <button
              onClick={() => handleKickClick(user, displayName)}
              style={{
                background: "crimson",
                color: "white",
                border: "none",
                borderRadius: "4px",
                padding: "2px 6px",
                cursor: "pointer",
                fontSize: "10px",
                fontWeight: "bold",
                marginRight: "4px",
              }}
              title="Kick Player"
            >
              Kick
            </button>
          )}
        </div>

        {/* DisplayName */}
        <div style={{ display: "flex", alignItems: "center", width: "120px", gap: "2px" }}>
          <span style={{
            fontWeight: "bold", fontSize: "18px", maxWidth: "110px",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
          }}>
            {displayName}
          </span>
          <span style={{ fontSize: "15px" }}>
            {user.userId === drawerId && " ✏️"}
          </span>
        </div>

        {/* Points + Atmps*/}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            fontSize: "13px",
            minWidth: "55px",
          }}
        >
          {/* Points */}
          <span style={{ color: "#e1bf00", fontWeight: "bold" }}>
            Pts: {user.points ?? 0}
          </span>
          {/* Atmps */}
          <div style={{ display: "flex", gap: "4px", marginTop: "2px" }}>
            {[...Array(totalGuesses)]
              .map((_, i) => (
                <span key={i} style={{ fontSize: "7px" }}>
                  {i < (user.remainingGuesses ?? totalGuesses) ? "❤️" : "🤍"}
                </span>
              ))
              .reverse()}
          </div>
        </div>
      </div>
    );
  };

  const targetPhrase = flashcard?.transliteration || "";



  return (
    <>
      <RoundPopups />
      <div className="play-grid">
        {/* Round result modal */}
      {roundReveal && (
        <div className="round-reveal-popup">
          <div className="round-reveal-card">

            <div className="round-reveal-title">
              It was:
            </div>

            <img
              className="round-reveal-image"
              src={roundReveal.imageSrc}
              alt=""
            />

            <div className="round-reveal-word">
              {roundReveal.word}
            </div>

            <div className="round-reveal-translit">
              {roundReveal.transliteration}
            </div>

          </div>
        </div>
      )}
        {roundResult && (
          <div className="round-result-modal">
            {/* Removed the JSX popups here as we are using toast 
                  and roundpopups for all the notifications */}
            {roundResult.type === "correct"}
            {roundResult.type === "wrong"}
            {roundResult.type === "guessesExhausted"}
            {roundResult.type === "gameEnded"}
          </div>
        )}

        <div className={`score-box ${isHost && "hidden"}`}>
          <strong>Score: </strong>
          <a>
            <label htmlFor="score">
              {players.find((p) => p.userId === currentUserId)?.points || 0}
            </label>{" "}
            pts
          </a>
        </div>

        <div className="time-box">
          <strong>Time Left: </strong>
          <a>
            <label htmlFor="timeleft">{timeLeft}</label> sec
          </a>
        </div>

        <div className="guesses-box">
          <strong>Guesses Left: </strong>
          <a>
            <label
              htmlFor="guessesleft"
              style={{
                color:
                  isEligibleGuesser && remainingGuesses <= 2
                    ? "red"
                    : "inherit",
              }}
            >
              {isEligibleGuesser ? remainingGuesses : "—"}
            </label>
          </a>
        </div>

        {/* Drawer and host see the full flashcard */}
        {flashcard && (isDrawer || isHost) && <Flashcard items={[flashcard]} />}

        {/* User List */}
        <div className="user-list">
          <div className="user-panel-title">Players List</div>

          <div className="team-block">
            <h3 className="team-title red">Red Team / लाल दल</h3>
            {redTeam.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              redTeam.map(renderUserChip)
            )}
          </div>

          <div className="team-block">
            <h3 className="team-title blue">Blue Team / नील दल</h3>
            {blueTeam.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              blueTeam.map(renderUserChip)
            )}
          </div>
        </div>

        <div
          className="drawer-name"
          style={{ textAlign: "center", marginBottom: "5px" }}
        >
          <strong>Drawing by:</strong>{" "}
          <span
            style={{
              color: drawerTeam === "Red" ? "crimson" : "royalblue",
              fontWeight: "bold",
            }}
          >
            {currentPlayerName}
          </span>
        </div>

        <ReactSketchCanvas
          className="canvas"
          ref={canvasRef}
          width="100%"
          height="100%"
          strokeColor={strokeColor}
          strokeWidth={eraseMode ? 0 : strokeWidth}
          eraserWidth={eraseMode ? eraserWidth : 0}
          canvasColor="#fffaf0"
          eraserOn={eraseMode}
          onChange={handleCanvasChange}
          style={{
            pointerEvents: isDrawer ? "auto" : "none",
            opacity: isDrawer ? 1 : 0.7,
          }}
        />

        <div className="canvascontrols">
          {!isHost ? (
            <>
              <button
                onClick={handlePenClick}
                disabled={!isDrawer || !eraseMode}
              >
                Pen
              </button>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={strokeWidth}
                onChange={handleStrokeWidthChange}
                disabled={!isDrawer || eraseMode}
              />
              <input
                type="color"
                value={strokeColor}
                onChange={handleStrokeColorChange}
                disabled={!isDrawer}
              />
              <button
                onClick={handleEraserClick}
                disabled={!isDrawer || eraseMode}
              >
                Eraser
              </button>
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                value={eraserWidth}
                onChange={handleEraserWidthChange}
                disabled={!isDrawer || !eraseMode}
              />
              <button onClick={handleClear} disabled={!isDrawer}>
                Clear
              </button>
            </>
          ) : (
            <>
              <button onClick={handleWarnDrawer}>Warn Drawer</button>
              <button onClick={handleForceSkip}>Force Skip Round</button>
            </>
          )}
        </div>

        {/* FLOATABLE CHAT */}
        <FloatableChat
          myUserId={currentUserId}
          myDisplayName={
            isHost
              ? hostData.hostDisplayName
              : players.find((p) => p.userId === currentUserId)?.displayName ||
                ""
          }
          myTeam={myTeam}
        />

        <div className={`input-area-wrapper ${isHost && "hidden"}`}>
          {roundResult?.type === "wrong" && (
            <div className="round-result-modal">
              <div className="modal-card wrong-answer">
                <h3>Wrong Answer</h3>
                <p>-{roundResult.scoreLost} points 😪</p>
              </div>
            </div>
          )}

          <h5>Answer Box</h5>
          <div className="input-area2">
            <input
              type="text"
              placeholder="Type answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={!canAnswer}
            />
            <button onClick={handleSubmitAnswer} disabled={!canAnswer}>
              Send
            </button>
          </div>
          
        {/* image selection logic all and i called the necessary usestates */}
        <ImagesSelection flashcard={flashcard} getUserId={getUserId} canAnswer={canAnswer} roundKey={roundKey} roomId={roomId} socket={socket} setImageChoices={setImageChoices} setShowChoices={setShowChoices} showChoices={showChoices} imageChoices={imageChoices} />

          {!canAnswer && (
            <small style={{ color: "#c00" }}>
              Only the {drawerTeam} team can answer, and not the drawer.
            </small>
          )}
        </div>
      </div>

      {/* GAME PAUSED OVERLAY */}
      {isGamePaused && (
        <div className="pause-overlay">
          <div className="pause-content">
            <h2>Game Paused</h2>
            <p>Waiting 60s for Host {pausedByHost} to reconnect...</p>
          </div>
        </div>
      )}

      {/* Kick Confirmation Modal */}
      {showKickModal &&
        createPortal(
          <div className="modal-overlay" onClick={handleKickCancel}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Kick Player</h2>
                <button className="modal-close" onClick={handleKickCancel}>
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <p
                  style={{
                    fontSize: "16px",
                    color: "#333",
                    marginBottom: "10px",
                  }}
                >
                  Are you sure you want to kick{" "}
                  <strong>{kickTarget?.displayName}</strong> from the game?
                </p>
                <div className="modal-note">
                  <span className="note-icon">ⓘ</span>
                  <span>
                    Kicked players will be removed from the leaderboard and
                    cannot rejoin until a new game starts.
                  </span>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="modal-button cancel"
                  onClick={handleKickCancel}
                >
                  Cancel
                </button>
                <button
                  className="modal-button kick"
                  onClick={handleKickConfirm}
                >
                  Kick Player
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default Play;

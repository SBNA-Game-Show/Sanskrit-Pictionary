// src/pages/Play.jsx
import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom"; // ✅ added useNavigate
import "./play.css";
import Chat from "../reusableComponents/chat";
import Flashcard from "../reusableComponents/flashcard";
import RoundPopups from "../reusableComponents/RoundPopups";
import InteractiveAvatar from "../reusableComponents/InteractiveAvatar";
import { ReactSketchCanvas } from "react-sketch-canvas";
import { createAvatar } from "@dicebear/core";
import * as DiceStyles from "@dicebear/collection";
import { socket } from "./socket";

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
  const playersRef = useRef([]); // ✅ holds freshest players for end screen
  const { roomId } = useParams();
  const navigate = useNavigate(); // ✅ for /end navigation

  // UI / game states
  const [players, setPlayers] = useState([]);
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

  // 🔹 profile map: userId -> { displayName, avatarSeed, avatarStyle }
  const [profiles, setProfiles] = useState({});

  // Small modal to show round result (e.g., correct answer)
  const [roundResult, setRoundResult] = useState(null); // {type: 'correct', displayName: 'X'} or null

  // Derived booleans
  const isDrawer =
    (sessionStorage.getItem("userId") || currentUserId) === drawerId;
  const canAnswer = myTeam === drawerTeam && !isDrawer;

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
      userId: sessionStorage.getItem("userId"),
      answer: answer.trim(),
    });
    setAnswer("");
  };

  // Emit drawing updates only if you're the drawer
  const handleCanvasChange = (paths) => {
    if (isDrawer) {
      socket.emit("drawing-data", {
        gameId: roomId,
        userId: sessionStorage.getItem("userId"),
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
        userId: sessionStorage.getItem("userId"),
      });
    }
  };

  // ---------- Socket setup ----------
  useEffect(() => {
    const userId = sessionStorage.getItem("userId");
    setCurrentUserId(userId || "");

    console.log("[Play] mounting | roomId=", roomId, "userId=", userId);
    if (!roomId) return;

    // Ask server for current state
    socket.emit("getGameState", { roomId });
    console.log("[Play] emitted getGameState", { roomId });

    // Also grab profiles using the existing lobby event (no server changes)
    socket.emit("requestLobbyUsers", { roomId });

    const onLobbyUsers = (users) => {
      const map = {};
      (users || []).forEach((u) => {
        map[u.userId] = {
          displayName: u.displayName,
          avatarSeed: u.avatarSeed,
          avatarStyle: u.avatarStyle,
        };
      });
      setProfiles(map);
    };
    socket.on("lobbyUsers", onLobbyUsers);

    const onProfileUpdated = ({ userId, displayName, avatarSeed, avatarStyle }) => {
      setProfiles((prev) => ({
        ...prev,
        [userId]: {
          displayName: displayName ?? prev[userId]?.displayName,
          avatarSeed: avatarSeed ?? prev[userId]?.avatarSeed,
          avatarStyle: avatarStyle ?? prev[userId]?.avatarStyle,
        },
      }));
    };
    socket.on("profileUpdated", onProfileUpdated);

    // -------- core state sync --------
    socket.on("gameState", (state) => {
      console.log("[Play] received gameState:", state);
      const serverFlash = state.currentFlashcard ?? state.flashcard ?? null;

      setPlayers(state.players || []);
      playersRef.current = state.players || []; // ✅ keep ref fresh
      setDrawerId(state.drawer?.userId || null);
      setDrawerTeam(state.drawer?.team || "");
      setCurrentPlayerName(state.drawer?.displayName || "");
      setTimeLeft(state.timer || 0);

      if (serverFlash) setFlashcard(serverFlash);

      const me = (state.players || []).find((p) => p.userId === userId);
      setMyTeam(me?.team || "");
    });

    socket.on("updatePlayers", (list) => {
      setPlayers(list || []);
      playersRef.current = list || []; // ✅ keep ref fresh
      const me = (list || []).find((p) => p.userId === userId);
      setMyTeam(me?.team || "");
    });

    // drawerChanged: when drawer rotates
    socket.on("drawerChanged", ({ userId: newDrawerId, displayName, team }) => {
      console.log("[Play] drawerChanged", {
        newDrawerId,
        displayName,
        team,
        clientUserId: sessionStorage.getItem("userId"),
      });
      setDrawerId(newDrawerId);
      setDrawerTeam(team || "");
      const name =
        typeof displayName === "string"
          ? displayName
          : displayName?.displayName || displayName?.userId || "";
      setCurrentPlayerName(name);
    });

    // timer updates
    socket.on("timerUpdate", ({ secondsLeft }) => {
      setTimeLeft(secondsLeft);
    });

    // drawing broadcast -> draw on local canvas
    socket.on("drawing-data", (data) => {
      canvasRef.current?.loadPaths(data);
    });

    // The server emits this to the drawer (only) when a round starts and a flashcard is selected.
    socket.on("newFlashcard", (data) => {
      console.log("[Play] received newFlashcard (drawer-only):", {
        data,
        clientUserId: sessionStorage.getItem("userId"),
        drawerId,
        translation: data.translation ?? data.hint ?? "",
        imageSrc: data.imageSrc ?? data.image ?? "",
        audioSrc: data.audioSrc ?? data.audio ?? ""
      });
      setFlashcard(data);
    });

    // round started
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
    });

    socket.on("correctAnswer", ({ userId: correctUserId, displayName }) => {
      console.log("[Play] correctAnswer", { correctUserId, displayName });
      setRoundResult({
        type: "correct",
        displayName: displayName || "Someone",
      });
      setTimeout(() => setRoundResult(null), 1500);
      socket.emit("getGameState", { roomId });
    });

    // clear canvas broadcast
    socket.on("clear-canvas", () => {
      canvasRef.current?.clearCanvas();
      canvasRef.current?.eraseMode(false);
      setEraseMode(false);
    });

    // ✅ game ended -> go to /end with final players
    socket.on("gameEnded", () => {
      setRoundResult({ type: "gameEnded" });
      const base = Array.isArray(playersRef.current) ? playersRef.current : players;
      const withAvatars = base.map((p) => {
        const prof = profiles[p.userId] || {};
        const seed = prof.avatarSeed || p.displayName || p.userId || "player";
        const style = prof.avatarStyle || "funEmoji";
        return {
          ...p,
          avatar: makeAvatarDataUrl(style, seed), 
          avatarSeed: seed,                           
          avatarStyle: style,                     
        };
      });
      setTimeout(() => {
        setRoundResult(null);
        navigate("/end", { state: { players: withAvatars } });
      }, 1200);
    });

    // cleanup on unmount
    return () => {
      socket.off("lobbyUsers", onLobbyUsers);
      socket.off("profileUpdated", onProfileUpdated);
      socket.off("gameState");
      socket.off("updatePlayers");
      socket.off("drawerChanged");
      socket.off("timerUpdate");
      socket.off("drawing-data");
      socket.off("newFlashcard");
      socket.off("roundStarted");
      socket.off("correctAnswer");
      socket.off("clear-canvas");
      socket.off("gameEnded");
    };
  }, [roomId, navigate]); // ✅ include navigate to satisfy hooks linting

  // team lists
  const redTeam = players.filter((p) => p.team === "Red");
  const blueTeam = players.filter((p) => p.team === "Blue");

  const renderUserChip = (user) => {
    const prof = profiles[user.userId] || {};
    const displayName = prof.displayName || user.displayName || user.userId;
    const seed = prof.avatarSeed || displayName || user.userId;
    const style = prof.avatarStyle;

    const chipClass =
      "user-chip " +
      (user.team === "Red" ? "chip-red" : "chip-blue") +
      (user.userId === drawerId ? " is-drawer" : "");

    return (
      <div className={chipClass} key={user.userId}>
        <InteractiveAvatar avatarSeed={seed} avatarStyle={style} size={36} />
        <span className="chip-name">{displayName}</span>
        {user.userId === drawerId && <span className="chip-pen" title="Drawing now">✏️</span>}
      </div>
    );
  };


  const targetPhrase = flashcard?.transliteration || "";

  const hintDisplay = !isDrawer
    ? maskPhraseToUnderscores(targetPhrase)
    : (flashcard?.word || flashcard?.translation || flashcard?.transliteration || "");


  return (
    <>
      <RoundPopups />
      <div className="play-grid">
        {/* Round result modal */}
        {roundResult && (
          <div className="round-result-modal">
            {roundResult.type === "correct" && (
              <div className="modal-card">
                <h3>Correct!</h3>
                <p>{roundResult.displayName} guessed correctly 🎉</p>
              </div>
            )}
            {roundResult.type === "gameEnded" && (
              <div className="modal-card">
                <h3>Game Over</h3>
                <p>Thanks for playing — check the scoreboard!</p>
              </div>
            )}
          </div>
        )}

        <div className="score-box">
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

        <div className="hint-box">
          <strong>Word Hint: </strong>
          <label htmlFor="wordhint">
                    {flashcard && !isDrawer
            ? maskPhraseToUnderscores(flashcard.word || "")
            : "..."}

          </label>
        </div>



        {/* Drawer sees the full flashcard */}
        {flashcard && isDrawer && <Flashcard items={[flashcard]} />}

        {/* User List */}
        <div className="user-list">
          <div className="user-panel-title">User List</div>

          <div className="team-block">
            <h3 className="team-title red">Red Team</h3>
            {redTeam.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              redTeam.map(renderUserChip)
            )}
          </div>

          <div className="team-block">
            <h3 className="team-title blue">Blue Team</h3>
            {blueTeam.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              blueTeam.map(renderUserChip)
            )}
          </div>
        </div>

        <div style={{ textAlign: "center", marginBottom: "5px" }}>
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
          <button onClick={handlePenClick} disabled={!isDrawer || !eraseMode}>
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
          <button onClick={handleEraserClick} disabled={!isDrawer || eraseMode}>
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
        </div>

        <div className="chat-box">
          <Chat
            myUserId={currentUserId}
            myDisplayName={
              players.find((p) => p.userId === currentUserId)?.displayName || ""
            }
            myTeam={myTeam}
          />
        </div>

        <div className="input-area-wrapper">
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
          {!canAnswer && (
            <small style={{ color: "#c00" }}>
              Only the {drawerTeam} team can answer, and not the drawer.
              <button
                onClick={() =>
                  console.log("DBG state", {
                    currentUserId: sessionStorage.getItem("userId"),
                    drawerId,
                    isDrawer,
                    flashcard,
                  })
                }
              >
                DEBUG
              </button>
            </small>
          )}
        </div>
      </div>
    </>
  );
};

export default Play;

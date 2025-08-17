// src/pages/Play.jsx
import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import "./play.css";
import Chat from "../reusableComponents/chat";
import Flashcard from "../reusableComponents/flashcard";
import { ReactSketchCanvas } from "react-sketch-canvas";
import { socket } from "./socket";

const Play = () => {
  const canvasRef = useRef(null);
  const { roomId } = useParams();

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

  // Small modal to show round result (e.g., correct answer)
  const [roundResult, setRoundResult] = useState(null); // {type: 'correct', displayName: 'X'} or null

  // Derived booleans
  // isDrawer is computed from the most stable sources: sessionStorage + drawerId.
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
      roomId,
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
  // inside useEffect(...) — replace the socket handler block with this

  useEffect(() => {
    const userId = sessionStorage.getItem("userId");
    setCurrentUserId(userId || "");

    console.log("[Play] mounting | roomId=", roomId, "userId=", userId);

    if (!roomId) return;

    // Ask server for current state
    socket.emit("getGameState", { roomId });
    console.log("[Play] emitted getGameState", { roomId });

    // -------- core state sync --------
    socket.on("gameState", (state) => {
      // DEBUG: log full state
      console.log("[Play] received gameState:", state);

      // server uses "currentFlashcard" (gameSessionManager sets session.currentFlashcard)
      // but keep a fallback if server uses different key
      const serverFlash = state.currentFlashcard ?? state.flashcard ?? null;
      console.log("[Play] serverFlash (currentFlashcard):", serverFlash);

      setPlayers(state.players || []);
      setDrawerId(state.drawer?.userId || null);
      setDrawerTeam(state.drawer?.team || "");
      setCurrentPlayerName(state.drawer?.displayName || "");
      setTimeLeft(state.timer || 0);

      // If server included a current flashcard in the game state, set it
      if (serverFlash) {
        setFlashcard(serverFlash);
      }

      // Determine my team from state players
      const me = (state.players || []).find((p) => p.userId === userId);
      setMyTeam(me?.team || "");
    });

    socket.on("updatePlayers", (list) => {
      setPlayers(list || []);
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

      // Normalize values (always set primitive/string into state)
      setDrawerId(newDrawerId);
      setDrawerTeam(team || "");

      // displayName might be missing; ensure we store a string
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
      });
      // data: { word, hint, image, audio, transliteration }
      setFlashcard(data);
    });

    // round started: server may send currentPlayer as string OR object
    socket.on("roundStarted", ({ currentRound, currentPlayer, timer }) => {
      console.log("[Play] roundStarted payload:", {
        currentRound,
        currentPlayer,
        timer,
      });

      // Normalize currentPlayer — it can be either:
      //  - a string (displayName)
      //  - an object { userId, displayName, ... }
      let cpName = "";
      if (typeof currentPlayer === "string") {
        cpName = currentPlayer;
      } else if (currentPlayer && typeof currentPlayer === "object") {
        cpName = currentPlayer.displayName || currentPlayer.userId || "";
      }

      setCurrentPlayerName(cpName);

      // Do NOT overwrite flashcard here if server will send newFlashcard to drawer.
      // If your design requires clearing, you can clear for guessers only.
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

    // game ended
    socket.on("gameEnded", () => {
      setRoundResult({ type: "gameEnded" });
      setTimeout(() => setRoundResult(null), 3000);
    });

    // cleanup on unmount
    return () => {
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
  }, [roomId]); // keep dependency as roomId

  // team lists
  const redTeam = players.filter((p) => p.team === "Red");
  const blueTeam = players.filter((p) => p.team === "Blue");

  return (
    <div className="play-grid">
      {/* Round result modal (very minimal) */}
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
          {/* Show partial hint to guessers only (example: hide letters) */}
          {flashcard && !isDrawer
            ? (flashcard.hint || "").replace(/[A-Za-z]/g, "_")
            : "..."}
        </label>
      </div>

      {/* Drawer sees the full flashcard. Use isDrawer (reliable) */}
      {flashcard && isDrawer && <Flashcard items={[flashcard]} />}

      <div className="user-list">
        <h3 style={{ color: "crimson", marginBottom: 4 }}>Red Team</h3>
        {redTeam.length === 0 ? (
          <p style={{ color: "#999" }}>No players</p>
        ) : (
          redTeam.map((user) => (
            <div
              key={user.userId}
              style={{
                color: "crimson",
                fontWeight: user.userId === drawerId ? "bold" : "normal",
                marginBottom: 2,
              }}
            >
              {user.displayName}
              {user.userId === drawerId && (
                <span style={{ marginLeft: 6 }}>✏️</span>
              )}
            </div>
          ))
        )}
        <h3 style={{ color: "royalblue", marginBottom: 4, marginTop: 16 }}>
          Blue Team
        </h3>
        {blueTeam.length === 0 ? (
          <p style={{ color: "#999" }}>No players</p>
        ) : (
          blueTeam.map((user) => (
            <div
              key={user.userId}
              style={{
                color: "royalblue",
                fontWeight: user.userId === drawerId ? "bold" : "normal",
                marginBottom: 2,
              }}
            >
              {user.displayName}
              {user.userId === drawerId && (
                <span style={{ marginLeft: 6 }}>✏️</span>
              )}
            </div>
          ))
        )}
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
  );
};

export default Play;

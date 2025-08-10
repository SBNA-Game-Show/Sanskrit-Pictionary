import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './play.css';
import Chat from '../reusableComponents/chat';
import Flashcard from '../reusableComponents/flashcard';
import { ReactSketchCanvas } from 'react-sketch-canvas';
import { socket } from './socket';

const Play = () => {
  const canvasRef = useRef(null);
  const { roomId } = useParams();
  const [players, setPlayers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [eraseMode, setEraseMode] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [eraserWidth, setEraserWidth] = useState(10);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [flashcard, setFlashcard] = useState(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [isCurrentPlayer, setIsCurrentPlayer] = useState(false);
  const [drawerId, setDrawerId] = useState(null);
  const [drawerTeam, setDrawerTeam] = useState("");
  const [currentPlayerName, setCurrentPlayerName] = useState("");
  const [myTeam, setMyTeam] = useState("");
  const [answer, setAnswer] = useState("");

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

  const isDrawer = currentUserId === drawerId;
  const canAnswer = myTeam === drawerTeam && !isDrawer;

  const handleSubmitAnswer = () => {
    if (answer.trim() === "" || !canAnswer) return;
    socket.emit("submitAnswer", {
      roomId,
      userId: currentUserId,
      answer: answer.trim()
    });
    setAnswer("");
  };

  const handleCanvasChange = (paths) => {
    if (isDrawer) {
      socket.emit("drawing-data", { gameId: roomId, userId: currentUserId, data: paths });
    }
  };

  // --- NEW: Clear functionality for all users ---
  const handleClear = () => {
    canvasRef.current?.clearCanvas();
    canvasRef.current?.eraseMode(false);
    setEraseMode(false);
    if (isDrawer) {
      socket.emit("clear-canvas", { gameId: roomId, userId: currentUserId });
    }
  };

  useEffect(() => {
    const userId = sessionStorage.getItem("userId");
    setCurrentUserId(userId);

    if (!roomId) return;
    socket.emit("getGameState", { roomId });

    socket.on("gameState", (state) => {
      setPlayers(state.players);
      setDrawerId(state.drawer?.userId || null);
      setDrawerTeam(state.drawer?.team || "");
      setCurrentPlayerName(state.drawer?.displayName || "");
      setTimeLeft(state.timer);
      const me = state.players.find(p => p.userId === userId);
      setMyTeam(me?.team || "");
    });

    socket.on("updatePlayers", (list) => {
      setPlayers(list);
      const me = list.find((p) => p.userId === userId);
      setMyTeam(me?.team || "");
    });

    socket.on("drawerChanged", ({ userId, displayName, team }) => {
      setDrawerId(userId);
      setDrawerTeam(team);
      setCurrentPlayerName(displayName);
      setIsCurrentPlayer(userId === currentUserId);
    });

    socket.on("timerUpdate", ({ secondsLeft }) => setTimeLeft(secondsLeft));
    socket.on("drawing-data", (data) => {
      canvasRef.current?.loadPaths(data);
    });

    socket.on("newFlashcard", (data) => setFlashcard(data));

    socket.on("roundStarted", ({ currentPlayer }) => {
      setCurrentPlayerName(currentPlayer);
      setFlashcard(null);
      setAnswer("");
      setIsCurrentPlayer(players.find((p) => p.userId === currentUserId)?.displayName === currentPlayer);
    });

    socket.on("correctAnswer", ({ userId, displayName }) => {
      socket.emit("getGameState", { roomId });
    });

    // --- Listen for canvas clear from the drawer ---
    socket.on("clear-canvas", () => {
      canvasRef.current?.clearCanvas();
      canvasRef.current?.eraseMode(false);
      setEraseMode(false);
    });

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
    };
  }, [roomId]);

  const redTeam = players.filter(p => p.team === "Red");
  const blueTeam = players.filter(p => p.team === "Blue");

  return (
    <div className="play-grid">
      <div className="score-box">
        <strong>Score: </strong>
        <a>
          <label htmlFor='score'>
            {players.find(p => p.userId === currentUserId)?.points || 0}
          </label> pts
        </a>
      </div>
      <div className="time-box">
        <strong>Time Left: </strong><a><label htmlFor='timeleft'>{timeLeft}</label> sec</a>
      </div>
      <div className="hint-box">
        <strong>Word Hint: </strong>
        <label htmlFor='wordhint'>
          {flashcard && !isCurrentPlayer ? flashcard.hint.replace(/[a-zA-Z]/g, '_') : '...'}
        </label>
      </div>
      {flashcard && isCurrentPlayer && (
        <Flashcard items={[flashcard]} />
      )}
      <div className="user-list">
        <h3 style={{ color: "crimson", marginBottom: 4 }}>Red Team</h3>
        {redTeam.length === 0
          ? <p style={{ color: "#999" }}>No players</p>
          : redTeam.map(user =>
            <div
              key={user.userId}
              style={{
                color: "crimson",
                fontWeight: user.userId === drawerId ? "bold" : "normal",
                marginBottom: 2
              }}>
              {user.displayName}
              {user.userId === drawerId && <span style={{ marginLeft: 6 }}>✏️</span>}
            </div>
          )
        }
        <h3 style={{ color: "royalblue", marginBottom: 4, marginTop: 16 }}>Blue Team</h3>
        {blueTeam.length === 0
          ? <p style={{ color: "#999" }}>No players</p>
          : blueTeam.map(user =>
            <div
              key={user.userId}
              style={{
                color: "royalblue",
                fontWeight: user.userId === drawerId ? "bold" : "normal",
                marginBottom: 2
              }}>
              {user.displayName}
              {user.userId === drawerId && <span style={{ marginLeft: 6 }}>✏️</span>}
            </div>
          )
        }
      </div>
      <div style={{ textAlign: "center", marginBottom: "5px" }}>
        <strong>Drawing by:</strong>{" "}
        <span style={{
          color: drawerTeam === "Red" ? "crimson" : "royalblue",
          fontWeight: "bold"
        }}>
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
        style={{ pointerEvents: isDrawer ? "auto" : "none", opacity: isDrawer ? 1 : 0.7 }}
      />
      <div className="canvascontrols">
        <button onClick={handlePenClick} disabled={!isDrawer || !eraseMode}>Pen</button>
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
        <button onClick={handleEraserClick} disabled={!isDrawer || eraseMode}>Eraser</button>
        <input
          type="range"
          min="1"
          max="100"
          step="1"
          value={eraserWidth}
          onChange={handleEraserWidthChange}
          disabled={!isDrawer || !eraseMode}
        />
        <button
          onClick={handleClear}
          disabled={!isDrawer}
        >
          Clear
        </button>
      </div>
      <div className="chat-box">
        <Chat
          myUserId={currentUserId}
          myDisplayName={players.find(p => p.userId === currentUserId)?.displayName || ""}
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
            onChange={e => setAnswer(e.target.value)}
            disabled={!canAnswer}
          />
          <button onClick={handleSubmitAnswer} disabled={!canAnswer}>Send</button>
        </div>
        {!canAnswer && (
          <small style={{ color: "#c00" }}>
            Only the {drawerTeam} team can answer, and not the drawer.
          </small>
        )}
      </div>
    </div>
  );
};

export default Play;

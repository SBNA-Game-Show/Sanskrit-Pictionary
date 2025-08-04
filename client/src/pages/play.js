import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './play.css';
import Chat from '../reusableComponents/chat';
import UserCard from '../reusableComponents/usercard';
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

  const handlePenClick = () => {
    setEraseMode(false);
    canvasRef.current?.eraseMode(false);
  };

  const handleEraserClick = () => {
    setEraseMode(true);
    canvasRef.current?.eraseMode(true);
  };

  const handleStrokeWidthChange = (e) => {
    setStrokeWidth(Number(e.target.value));
  };

  const handleEraserWidthChange = (e) => {
    setEraserWidth(Number(e.target.value));
  };

  const handleStrokeColorChange = (e) => {
    setStrokeColor(e.target.value);
  };

  const words = [
    {
      word: "पुस्तकम्‌",
      transliteration: "Pustakam",
      translation: "Book",
      audioSrc: "",
      imageSrc: "books.png"
    }
  ];

  useEffect(() => {
    if (!roomId) return;
    socket.emit("startTimer", { roomId });
    socket.on("timerUpdate", ({ secondsLeft }) => {
      setTimeLeft(secondsLeft);
    });
    socket.emit("getRoomPlayers", { roomId });

    socket.on("updatePlayers", (players) => {
    setPlayers(players);
    });
    
    socket.on("roomPlayers", ({ players }) => {
      setPlayers(players);
    });

    return () => {
      socket.off("timerUpdate");
      socket.off("updatePlayers");
      socket.off("roomPlayers");
    };
  }, [roomId]);


  return (
    <div className="play-grid">

      <div className="score-box">
        <strong>Score: </strong><a><label htmlFor='score'>11</label> pts</a>
      </div>

      <div className="time-box">
        <strong>Time Left: </strong><a><label htmlFor='timeleft'>{timeLeft}</label> sec</a>
      </div>

      <div className="hint-box">
        <strong>Word Hint: </strong><label htmlFor='wordhint'>b_o_</label>
      </div>

      <Flashcard items={words} />

      <div className="user-list">
        <h2>User List</h2>
        {players.map((player) => (
          <UserCard
            key={player.userId}
            imageSrc={player.imageSrc || "default.png"}
            name={player.displayName}
            points={player.points || 0}
          />
        ))}
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
      />

      <div className="canvascontrols">
        <button onClick={handlePenClick} disabled={!eraseMode}>Pen</button>
        <input
          type="range"
          min="1"
          max="30"
          step="1"
          value={strokeWidth}
          onChange={handleStrokeWidthChange}
          disabled={eraseMode}
        />
        <input
          type="color"
          value={strokeColor}
          onChange={handleStrokeColorChange}
        />
        <button onClick={handleEraserClick} disabled={eraseMode}>Eraser</button>
        <input
          type="range"
          min="1"
          max="100"
          step="1"
          value={eraserWidth}
          onChange={handleEraserWidthChange}
          disabled={!eraseMode}
        />
        <button
          onClick={() => {
            canvasRef.current?.clearCanvas();
            canvasRef.current?.eraseMode(false);
            setEraseMode(false);
          }}
        >
          Clear
        </button>
      </div>

      <div className="chat-box">
        <Chat />
      </div>

      <div className="input-area-wrapper">
        <h5>Answer Box</h5>
        <div className="input-area2">
          <input type="text" placeholder="Type answer" />
          <button>Send</button>
        </div>
      </div>

    </div>
  );
};

export default Play;
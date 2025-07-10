import { useState, useRef } from 'react';
import './play.css';
import Chat from '../reusableComponents/chat';
import UserCard from '../reusableComponents/usercard';
import Flashcard from '../reusableComponents/flashcard';
import { ReactSketchCanvas } from 'react-sketch-canvas';

const players = [
  { name: 'Alice', points: 16, imageSrc: 'avatar1.png' },
  { name: 'Bob', points: 11, imageSrc: 'avatar2.png' },
  { name: 'Charlie', points: 6, imageSrc: 'avatar3.png' }
];

const Play = () => {
  const canvasRef = useRef(null);
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

  return (
    <div className="play-grid">

      <div className="score-box">
        <strong>Score: </strong><a><label htmlFor='score'>11</label> pts</a>
      </div>

      <div className="time-box">
        <strong>Time Left: </strong><a><label htmlFor='timeleft'>46</label> sec</a>
      </div>

      <div className="hint-box">
        <strong>Word Hint: </strong><label htmlFor='wordhint'>b_o_</label>
      </div>

      <Flashcard items={words} />

      <div className="user-list">
        <h2>User List</h2>
        {players.map((player) => (
          <UserCard
            key={player.name}
            imageSrc={player.imageSrc}
            name={player.name}
            points={player.points}
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
        <div className="input-area2">
          <input type="text" placeholder="Type answer" />
          <button>Send</button>
        </div>
      </div>

    </div>
  );
};

export default Play;
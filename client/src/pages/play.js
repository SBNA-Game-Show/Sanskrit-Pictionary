import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import "./play.css";
import FloatableChat from "../reusableComponents/FloatableChat";
import Flashcard from "../reusableComponents/flashcard";
import RoundPopups from "../reusableComponents/RoundPopups";
import InteractiveAvatar from "../reusableComponents/InteractiveAvatar";
import { ReactSketchCanvas } from "react-sketch-canvas";

import { socket } from "./socket";
import { getUserId, getDisplayName } from "../utils/authStorage";

import correctSound from "../assets/sounds/correct.wav";
import wrongSound from "../assets/sounds/wrong.wav";
import ImagesSelection from "../reusableComponents/ImagesSelection";
import { useGameSocket } from "../hooks/socket/useGameSocket";

const Play = () => {
  const canvasRef = useRef(null);
  const profilesRef = useRef({});
  const hostRef = useRef(false);
  const { roomId } = useParams();

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
  const [answer, setAnswer] = useState("");
  const [totalGuesses, setTotalGuesses] = useState(4); // To store configed guesses

  // Audio + timeout refs for round reveal popup sound
  const roundRevealTimeoutRef = useRef(null);
  const revealAudioRef = useRef(new Audio());

  // For multiple-choice image selection (guessers only)
  const [imageChoices, setImageChoices] = useState([]);
  const [showChoices, setShowChoices] = useState(false);
  const [roundKey, setRoundKey] = useState(0);

  // 🔹 profile map: userId -> { displayName, avatarSeed, avatarStyle }
  const [profiles, setProfiles] = useState({});

  // Pause state
  const [isGamePaused, setIsGamePaused] = useState(false);

  // Small modal to show round result (e.g., correct answer)
  const [roundResult, setRoundResult] = useState(null); // {type: 'correct', displayName: 'X'} or null
  const [roundReveal, setRoundReveal] = useState(null);

  // Track all users who answered correctly this round to highlight their cards
  const [correctUserIds, setCorrectUserIds] = useState([]);

  // Modal state for kicking
  const [showKickModal, setShowKickModal] = useState(false);
  const [kickTarget, setKickTarget] = useState(null); // { userId, displayName }

  // Derived booleans
  const remainingGuesses = players.find((p) => p.userId === (getUserId() || currentUserId))?.remainingGuesses;
  const myTeam = players.find((p) => p.userId === (getUserId() || currentUserId))?.team;
  const isDrawer = (getUserId() || currentUserId) === drawerId;
  const isEligibleGuesser = myTeam === drawerTeam && !isDrawer;
  const canAnswer = isEligibleGuesser && remainingGuesses > 0;

  // Audio cues
  const correctAudioRef = useRef(new Audio(correctSound));
  const wrongAudioRef = useRef(new Audio(wrongSound));

  //LOG PLAYERS
  console.log(players)

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

  // Socket setup
  useGameSocket(
    setCurrentUserId,
    setPlayers,
    setHostData,
    drawerId,
    setDrawerId,
    setDrawerTeam,
    setCurrentPlayerName,
    setTimeLeft,
    setFlashcard,
    setTotalGuesses,
    setProfiles,
    setIsGamePaused,
    setRoundResult,
    setRoundReveal,
    setCorrectUserIds,
    setAnswer,
    setImageChoices,
    setRoundKey,
    setEraseMode,
    isGameEndedRef,
    canvasRef,
    correctAudioRef,
    wrongAudioRef,
    revealAudioRef,
    roundRevealTimeoutRef,
    profilesRef,
    hostRef,
  )

  const isHost = currentUserId === hostData?.hostId;

  useEffect(() => {
    hostRef.current = isHost;
  }, [isHost]);

  // Listerner for players changing
  useEffect(() => {
    // Only send from host to avoid duplication
    if (!isHost || players.length === 0 || isGameEndedRef.current) return;

    const redTeamCount = players.filter((p) => p.team === "Red").length;
    const blueTeamCount = players.filter((p) => p.team === "Blue").length;

    if (redTeamCount < 2 || blueTeamCount < 2) {
      socket.emit("gameEnded", {
        roomId,
        reason: "Not enough players in one of the teams.",
      });
    }
  }, [players, isHost, roomId]);

  // team lists
  const redTeam = players.filter((p) => p.team === "Red");
  const blueTeam = players.filter((p) => p.team === "Blue");

  // Check if current user is a spectator (not in players list AND not host)
  const isSpectator =
    !isHost && !players.find((p) => p.userId === currentUserId);

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
          /* I am changing this for responsiveness */
          width: "100%",
        }}
      >
        {/* Avatar + Kick button */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "3px",
          }}
        >
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            width: "120px",
            gap: "2px",
          }}
        >
          <span
            style={{
              fontWeight: "bold",
              fontSize: "18px",
              maxWidth: "110px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
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
      <div className={`play-grid ${isHost ? "host-view" : "player-view"} ${isDrawer ? "drawer-view" : "guesser-view"}`}>
        {/* Round result modal */}
        {roundReveal && (
          <div className="round-reveal-popup">
            <div className="round-reveal-card">
              <div className="round-reveal-title">It was:</div>

              <img
                className="round-reveal-image"
                src={roundReveal.imageSrc}
                alt=""
              />

              <div className="round-reveal-word">{roundReveal.word}</div>

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
          <div className="team-container">
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

        {/* FLOATABLE CHAT - Hide for spectators */}
        {!isSpectator && (
          <FloatableChat
            myUserId={currentUserId}
            myDisplayName={
              isHost
                ? hostData.hostDisplayName
                : players.find((p) => p.userId === currentUserId)
                    ?.displayName || ""
            }
            myTeam={myTeam}
          />
        )}

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
          <ImagesSelection
            flashcard={flashcard}
            getUserId={getUserId}
            canAnswer={canAnswer}
            roundKey={roundKey}
            roomId={roomId}
            socket={socket}
            setImageChoices={setImageChoices}
            setShowChoices={setShowChoices}
            showChoices={showChoices}
            imageChoices={imageChoices}
          />

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
            <p>Waiting 60s for Host to reconnect...</p>
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
                <div
                  className="modal-note"
                  style={{ display: "flex", flexDirection: "column" }}
                >
                  <span>
                    ⚠️ Kicked players will be removed from the leaderboard and
                    cannot rejoin until a new game starts.
                  </span>
                  {/* Warning of gameEnded in confirm popup  */}
                  {(() => {
                    const targetUser = players.find(
                      (p) => p.userId === kickTarget?.userId,
                    );
                    const teamCount = players.filter(
                      (p) => p.team === targetUser?.team,
                    ).length;
                    if (teamCount <= 2) {
                      return (
                        <span>
                          ⚠️ <strong>Game will be ended</strong> as no enough
                          players in {targetUser?.team} team.
                        </span>
                      );
                    }
                    return null;
                  })()}
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

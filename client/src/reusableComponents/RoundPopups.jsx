// client/src/reusableComponents/RoundPopups.jsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { socket } from "../pages/socket"; 
import "./roundPopups.css";

/**
 * Center overlay popups for:
 *  - roundStarted        -> "Round X / Y — Drawer: Name"
 *  - correctAnswer       -> "Round X ended — Guesser: Name"
 *  - drawerChanged(team) -> "Team switched — Drawer is now Name (Team)"
 *  - gameEnded           -> "Game Over"
 *
 * Uses a small queue so messages don't overlap.
 * Border/outline color follows the drawer's team (red/blue) when applicable.
 */
export default function RoundPopups() {
  const [msg, setMsg] = useState(null);    // { title, subtitle, kind, team, duration }
  const queueRef = useRef([]);
  const showingRef = useRef(false);

  // persistent refs to track the latest known state
  const roundRef = useRef(0);
  const totalRef = useRef(null);
  const drawerNameRef = useRef("");
  const drawerTeamRef = useRef(""); // "Red" | "Blue" | ""

  function enqueue(item) {
    queueRef.current.push(item);
    if (!showingRef.current) drain();
  }

  function drain() {
    if (queueRef.current.length === 0) {
      showingRef.current = false;
      setMsg(null);
      return;
    }
    showingRef.current = true;
    const next = queueRef.current.shift();
    setMsg(next);
    const dur = next.duration ?? 1700;
    setTimeout(() => {
      setMsg(null);
      // let CSS exit animation breathe a frame
      requestAnimationFrame(drain);
    }, dur);
  }

  useEffect(() => {
    // ---- Round started ----
    const onRoundStarted = ({ currentRound, totalRounds, currentPlayer }) => {
      roundRef.current = currentRound;
      if (typeof totalRounds === "number") totalRef.current = totalRounds;

      // currentPlayer can be string or object
      const dname =
        typeof currentPlayer === "string"
          ? currentPlayer
          : currentPlayer?.displayName || currentPlayer?.userId || "Player";
      if (dname) drawerNameRef.current = dname;

      enqueue({
        title: `Round ${currentRound}${
          totalRef.current ? ` / ${totalRef.current}` : ""
        }`,
        // Add turn details in round popup
        subtitle: `${drawerTeamRef.current} Team Turn — Drawer: ${dname}`,
        // subtitle: `Started — Drawer: ${drawerNameRef.current}`,
        kind: "start",
        team: drawerTeamRef.current, // use last known team to color outline
        duration: 3000,
      });
    };

    // ---- Drawer / team changed ----
    const onDrawerChanged = ({ displayName, team }) => {
      const dname =
        typeof displayName === "string"
          ? displayName
          : displayName?.displayName || displayName?.userId || "Player";

      const prevTeam = drawerTeamRef.current;
      const nextTeam = team || prevTeam;

      // announce team switch (only if changed and both sides are known)
      if (prevTeam && nextTeam && prevTeam !== nextTeam) {
        enqueue({
          title: `${nextTeam} Team Turn`, // 明确提示换队了
          // title: "Team switched",
          subtitle: `Drawer is now ${dname} (${nextTeam} team)`,
          kind: "switch",
          team: nextTeam,
          duration: 3000,
        });
      }

      drawerTeamRef.current = nextTeam;
      if (dname) drawerNameRef.current = dname;
    };

    // ---- Correct answer ----
    const onCorrectAnswer = ({ displayName, scoreGained, answerText }) => {
      const pts = Number.isFinite(Number(scoreGained)) ? Number(scoreGained) : null;
      const ans = typeof answerText === "string" && answerText.trim() ? answerText.trim() : "";
      enqueue({
        title: `${displayName} Answered Correctly!`,
        subtitle:
          displayName && pts !== null
            ? `Guesser: ${displayName} (+${pts} pts)${ans ? ` — Answer: ${ans}` : ""}`
            : displayName
              ? `Guesser: ${displayName}`
              : pts !== null
                ? `+${pts} pts`
                : undefined,
        kind: "end",
        team: drawerTeamRef.current, // keep outline with the drawer team for that round
        duration: 2000,
      });
    };

    // ---- Game ended ----
    const onGameEnded = () => {
      enqueue({
        title: "Game Over",
        subtitle: "Thanks for playing!",
        kind: "gameEnd",
        team: "", // neutral border
        duration: 2200,
      });
    };

    // ---- Guesses exhausted ----
    const onGuessesExhausted = ({ displayName }) => {
      enqueue({
        title: `${displayName} Ran Out of Guesses!`,
        subtitle: "Out of guesses!",
        kind: "exhausted",
        team: drawerTeamRef.current,
        duration: 2000,
      });
    };

    socket.on("roundStarted", onRoundStarted);
    socket.on("drawerChanged", onDrawerChanged);
    socket.on("correctAnswer", onCorrectAnswer);
    socket.on("gameEnded", onGameEnded);
    socket.on("guessesExhausted", onGuessesExhausted);

    return () => {
      socket.off("roundStarted", onRoundStarted);
      socket.off("drawerChanged", onDrawerChanged);
      socket.off("correctAnswer", onCorrectAnswer);
      socket.off("gameEnded", onGameEnded);
      socket.off("guessesExhausted", onGuessesExhausted);
    };
  }, []);

  if (!msg) return null;

  // map team -> CSS modifier
  const teamClass =
    msg.team === "Red" ? "rp2-red" : msg.team === "Blue" ? "rp2-blue" : "";

  return createPortal(
    <div className={`rp2-backdrop ${msg.kind}`}>
      <div className={`rp2-card ${teamClass}`}>
        <div className="rp2-title">{msg.title}</div>
        {msg.subtitle && <div className="rp2-sub">{msg.subtitle}</div>}
      </div>
    </div>,
    document.body
  );
}

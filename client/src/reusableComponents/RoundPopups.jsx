// client/src/reusableComponents/RoundPopups.jsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { socket } from "../pages/socket"; 
import "./roundPopups.css";

/**
 * Center overlay popups for:
 *  - roundStarted        -> "Round X / Y — Drawer: Name"
 *  - drawerCountdown     -> Animated 5-4-3-2-1 Begin countdown with drawer name
 *  - correctAnswer       -> "Round X ended — Guesser: Name"
 *  - drawerChanged(team) -> "Team switched — Drawer is now Name (Team)"
 *  - teamSwitchCountdown -> Team switch announcement with 5-4-3-2-1 countdown
 *  - gameEnded           -> "Game Over"
 *
 * Uses a small queue so messages don't overlap.
 * Border/outline color follows the drawer's team (red/blue) when applicable.
 */
const teamLabel = (team) =>
  team === "Red" ? "Red Team / रक्तदल" :
  team === "Blue" ? "Blue Team / नीलदल" :
  team ? `${team} Team` : "";

export default function RoundPopups({ roomId }) {
  const [msg, setMsg] = useState(null);    // { title, subtitle, kind, team, duration, countdown }
  const [countdownNum, setCountdownNum] = useState(null); // for animated countdowns
  const queueRef = useRef([]);
  const showingRef = useRef(false);
  const countdownIntervalRef = useRef(null);

  // persistent refs to track the latest known state
  const roundRef = useRef(0);
  const totalRef = useRef(null);
  const drawerNameRef = useRef("");
  const drawerTeamRef = useRef(""); // "Red" | "Blue" | ""

  function enqueue(item) {
    console.log("📢 [RoundPopups] Enqueue:", item.kind, item.title);
    queueRef.current.push(item);
    if (!showingRef.current) drain();
  }

  function drain() {
    if (queueRef.current.length === 0) {
      console.log("📢 [RoundPopups] Queue empty, stopping drain");
      showingRef.current = false;
      setMsg(null);
      setCountdownNum(null);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }
    showingRef.current = true;
    const next = queueRef.current.shift();
    console.log("📢 [RoundPopups] Showing:", next.kind, next.title);
    setMsg(next);

    // Handle countdown animation
    if (next.kind === "drawerCountdown" || next.kind === "teamSwitchCountdown") {
      console.log("📢 [RoundPopups] Starting countdown animation");
      let count = 5;
      setCountdownNum(count);

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }

      countdownIntervalRef.current = setInterval(() => {
        count--;
        if (count >= 0) {
          setCountdownNum(count);
        } else {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          // End this message after "Begin"
          console.log("📢 [RoundPopups] Countdown finished, moving to next");
          setTimeout(() => {
            if (
              next.kind === "drawerCountdown" &&
              next.syncId &&
              (next.gameId || roomId)
            ) {
              socket.emit("drawerCountdownComplete", {
                gameId: next.gameId || roomId,
                syncId: next.syncId,
              });
            }
            setMsg(null);
            requestAnimationFrame(drain);
          }, 800);
          return;
        }
      }, 900); // Update every 900ms for ~5-4-3-2-1 then Begin

      return; // Don't use duration timer for countdown
    }

    const dur = next.duration ?? 1700;
    setTimeout(() => {
      setMsg(null);
      setCountdownNum(null);
      requestAnimationFrame(drain);
    }, dur);
  }

  useEffect(() => {
    console.log("📢 [RoundPopups] Component MOUNTED - Socket:", socket?.id);
    return () => {
      console.log("📢 [RoundPopups] Component UNMOUNTED");
    };
  }, []);

  useEffect(() => {
    // ---- Drawer intro countdown ----
    const onDrawerCountdown = ({ displayName, team, message, gameId, syncId }) => {
      console.log("📢 [RoundPopups] Received drawerCountdown:", { displayName, team, message, gameId, syncId });
      const dname = typeof displayName === "string" ? displayName : displayName?.displayName || "Player";
      drawerTeamRef.current = team || drawerTeamRef.current;

      enqueue({
        title: message || `${dname} is Drawing`,
        subtitle: `🎨 Drawer: ${dname}`,
        kind: "drawerCountdown",
        team: drawerTeamRef.current,
        isCountdown: true,
        gameId,
        syncId,
      });
    };

    // ---- Team switch countdown ----
    const onTeamSwitchCountdown = ({ currentTeam, nextTeam, currentTeamLabel, nextTeamLabel, nextDrawerName }) => {
      console.log("📢 [RoundPopups] Received teamSwitchCountdown:", { nextTeam, nextDrawerName });
      drawerTeamRef.current = nextTeam || drawerTeamRef.current;

      enqueue({
        title: `${nextTeamLabel || teamLabel(nextTeam)} Turn Starts!`,
        subtitle: `🎨 Drawer: ${nextDrawerName}`,
        kind: "teamSwitchCountdown",
        team: nextTeam,
        isCountdown: true,
      });
    };

    // ---- Round started ----
    const onRoundStarted = ({ currentRound, totalRounds, currentPlayer }) => {
      console.log("📢 [RoundPopups] Received roundStarted:", { currentRound, currentPlayer });
      roundRef.current = currentRound;
      if (typeof totalRounds === "number") totalRef.current = totalRounds;

      const dname =
        typeof currentPlayer === "string"
          ? currentPlayer
          : currentPlayer?.displayName || currentPlayer?.userId || "Player";
      if (dname) drawerNameRef.current = dname;

      enqueue({
        title: `Round ${currentRound}${
          totalRef.current ? ` / ${totalRef.current}` : ""
        }`,
        subtitle: `${teamLabel(drawerTeamRef.current)} Turn — Drawer: ${dname}`,
        kind: "start",
        team: drawerTeamRef.current,
        duration: 2500,
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

      if (prevTeam && nextTeam && prevTeam !== nextTeam) {
        enqueue({
          title: `${teamLabel(nextTeam)} Turn`,
          subtitle: `Drawer is now ${dname}`,
          kind: "switch",
          team: nextTeam,
          duration: 2500,
        });
      }

      drawerTeamRef.current = nextTeam;
      if (dname) drawerNameRef.current = dname;
    };

    // ---- Round Ended ----
    const onRoundEnded = ({ roundNumber }) => {
      enqueue({
        title: `Round ${roundNumber} Complete!`,
        kind: "end",
        duration: 1500,
      });
    };

    // ---- Game ended ----
    const onGameEnded = () => {
      enqueue({
        title: "Game Over",
        subtitle: "Thanks for playing!",
        kind: "gameEnd",
        team: "",
        duration: 2200,
      });
    };

    // ---- Guesses exhausted ----
    const onGuessesExhausted = () => {
      enqueue({
        title: `Ran Out of Guesses!`,
        subtitle: "Out of guesses!",
        kind: "exhausted",
        team: drawerTeamRef.current,
        duration: 2000,
      });
    };

    // ---- Warn player ----
    const onWarnPlayer = () => {
      enqueue({
        title: "Warning Drawer",
        subtitle: "Reminder: All drawings must be appropriate and respectful for all players.",
        kind: "warning",
        team: drawerTeamRef.current,
        duration: 5000,
      });
    };

    console.log("📢 [RoundPopups] Registering socket listeners - socket connected:", socket?.connected, "socket id:", socket?.id);

    socket.on("drawerCountdown", onDrawerCountdown);
    socket.on("teamSwitchCountdown", onTeamSwitchCountdown);
    socket.on("roundStarted", onRoundStarted);
    socket.on("drawerChanged", onDrawerChanged);
    socket.on("roundEnded", onRoundEnded);
    socket.on("warnDrawer", onWarnPlayer);
    socket.on("gameEnded", onGameEnded);
    socket.on("guessesExhausted", onGuessesExhausted);

    return () => {
      socket.off("drawerCountdown", onDrawerCountdown);
      socket.off("teamSwitchCountdown", onTeamSwitchCountdown);
      socket.off("roundStarted", onRoundStarted);
      socket.off("drawerChanged", onDrawerChanged);
      socket.off("roundEnded", onRoundEnded);
      socket.off("warnDrawer", onWarnPlayer);
      socket.off("gameEnded", onGameEnded);
      socket.off("guessesExhausted", onGuessesExhausted);
    };
  }, []);

  if (!msg) return null;

  const teamClass =
    msg.team === "Red" ? "rp2-red" : msg.team === "Blue" ? "rp2-blue" : "";

  return createPortal(
    <div className="rp2-backdrop">
      <div className={`rp2-card ${teamClass} ${msg.isCountdown ? "rp2-countdown-active" : ""}`}>
        <div className="rp2-title">{msg.title}</div>
        {msg.subtitle && <div className="rp2-sub">{msg.subtitle}</div>}
        {msg.isCountdown && countdownNum !== null && (
          <div className="rp2-countdown">
            <div className={`rp2-number ${countdownNum === 0 ? "rp2-begin" : ""}`}>
              {countdownNum === 0 ? "BEGIN!" : countdownNum}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

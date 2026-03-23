// client/src/reusableComponents/RoundPopups.jsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { socket } from "../pages/socket"; 
import "./roundPopups.css";

/*
 * Center overlay popups for:
 *  - drawerChanged(team) -> "Team switched — Drawer is now Name (Team)"
 *  - roundEnded          -> "Round X ended"
 *  - warnDrawer          -> "Warning Drawer"
 *  - gameEnded           -> "Game Over"
 *
 * Uses a small queue so messages don't overlap.
 * Border/outline color follows the drawer's team (red/blue) when applicable.
 */

const teamLabel = (team) =>
  team === "Red" ? "Red Team / लाल दल" :
  team === "Blue" ? "Blue Team / नील दल" :
  team ? `${team} Team` : "";

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
          title: `${teamLabel(nextTeam)} Turn`, // Team switched!
          subtitle: `Drawer is now ${dname} (${teamLabel(nextTeam)})`,
          kind: "switch",
          team: nextTeam,
          duration: 3000,
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

    socket.on("drawerChanged", onDrawerChanged);
    socket.on("roundEnded", onRoundEnded);
    socket.on("warnDrawer", onWarnPlayer);
    socket.on("gameEnded", onGameEnded);

    return () => {
      socket.off("drawerChanged", onDrawerChanged);
      socket.off("roundEnded", onRoundEnded);
      socket.off("warnDrawer", onWarnPlayer);
      socket.off("gameEnded", onGameEnded);
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

// client/src/pages/lobby.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "./socket";
import { createAvatar } from "@dicebear/core";
import * as Dice from "@dicebear/collection";
import "./lobby.css";

/** Inline interactive DiceBear avatar (no extra files) */
function InteractiveAvatar({
  avatarStyle = "funEmoji",
  avatarSeed = "player",
  size = 44,
  className = "",
}) {
  const wrapRef = useRef(null);
  const [pop, setPop] = useState(false);
  const [sparkles, setSparkles] = useState([]);
  const [tilt, setTilt] = useState({ tx: 0, ty: 0, rot: 0 });

  const dataUrl = useMemo(() => {
    const style = Dice[avatarStyle] || Dice.funEmoji;
    const svg = createAvatar(style, { seed: avatarSeed }).toString();
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [avatarStyle, avatarSeed]);

  const onPointerMove = (e) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width; // 0..1
    const y = (e.clientY - r.top) / r.height; // 0..1
    const dx = (x - 0.5) * 2; // -1..1
    const dy = (y - 0.5) * 2; // -1..1
    const maxShift = 4; // px
    const maxRot = 6;   // deg
    setTilt({ tx: dx * maxShift, ty: dy * maxShift, rot: dx * -maxRot });
  };

  const onPointerLeave = () => setTilt({ tx: 0, ty: 0, rot: 0 });

  const onClick = () => {
    setPop(true);
    setTimeout(() => setPop(false), 240);
  };

  const onDoubleClick = () => {
    const now = Date.now();
    const burst = Array.from({ length: 7 }).map((_, i) => ({
      id: `${now}-${i}`,
      left: 40 + Math.random() * (size - 80),
      top: 40 + Math.random() * (size - 80),
      emoji: ["✨", "★", "✦", "✳︎", "❈"][Math.floor(Math.random() * 5)],
    }));
    setSparkles((prev) => [...prev, ...burst]);
    setTimeout(() => {
      setSparkles((prev) => prev.filter((s) => !burst.find((b) => b.id === s.id)));
    }, 700);
  };

  return (
    <div
      ref={wrapRef}
      className={`avatar-wrap ${className}`}
      style={{ width: size, height: size }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Drag, click, or double-click me ✨"
    >
      <img
        alt=""
        className={`user-avatar avatar-anim avatar-interactive ${pop ? "pop" : ""}`}
        src={dataUrl}
        style={{
          transform: `translate(${tilt.tx}px, ${tilt.ty}px) rotate(${tilt.rot}deg)`,
        }}
      />
      {sparkles.map((s) => (
        <span key={s.id} className="sparkle" style={{ left: s.left, top: s.top }}>
          {s.emoji}
        </span>
      ))}
    </div>
  );
}

const Lobby = () => {
  const { roomId } = useParams();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [teams, setTeams] = useState({ Red: [], Blue: [] });

  const myUserId = sessionStorage.getItem("userId");
  const navigate = useNavigate();

  // quick lookup by id
  const byId = useMemo(
    () => Object.fromEntries(onlineUsers.map((u) => [u.userId, u])),
    [onlineUsers]
  );

  // which team am *I* in?
  const myTeam = useMemo(() => {
    if (!myUserId) return null;
    if ((teams.Red || []).includes(myUserId)) return "Red";
    if ((teams.Blue || []).includes(myUserId)) return "Blue";
    return null;
  }, [teams, myUserId]);

  useEffect(() => {
    if (!myUserId || !roomId) return;

    // enter the lobby & request current state
    socket.emit("registerLobby", { userId: myUserId, roomId });
    socket.emit("requestLobbyUsers", { roomId });

    // presence
    socket.on("lobbyUsers", setOnlineUsers);
    socket.on("userJoinedLobby", (user) => {
      setOnlineUsers((prev) =>
        prev.some((u) => u.userId === user.userId) ? prev : [...prev, user]
      );
    });
    socket.on("userLeftLobby", ({ userId }) => {
      setOnlineUsers((prev) => prev.filter((u) => u.userId !== userId));
    });

    // live profile updates (name/avatar)
    socket.on(
      "profileUpdated",
      ({ userId, displayName, avatarSeed, avatarStyle }) => {
        setOnlineUsers((prev) =>
          prev.map((u) =>
            u.userId === userId
              ? { ...u, displayName, avatarSeed, avatarStyle }
              : u
          )
        );
      }
    );

    // room meta
    socket.on("hostSet", setHostId);
    socket.on("teamsUpdate", setTeams);

    // kick flow
    socket.on("userKicked", ({ userId }) => {
      if (userId === myUserId) {
        alert("You were kicked from the lobby.");
        navigate("/lobby");
      }
    });
    socket.on("kicked", () => {
      alert("You were kicked from the lobby.");
      navigate("/lobby");
    });

    // optional ack for leaveTeam debugging
    socket.on("leftTeam", (res) => {
      if (!res?.ok) {
        console.warn("leftTeam failed", res?.error);
      } else {
        console.log("leftTeam ok");
      }
    });

    return () => {
      socket.off("lobbyUsers");
      socket.off("userJoinedLobby");
      socket.off("userLeftLobby");
      socket.off("profileUpdated");
      socket.off("hostSet");
      socket.off("teamsUpdate");
      socket.off("userKicked");
      socket.off("kicked");
      socket.off("leftTeam");
    };
  }, [roomId, myUserId, navigate]);

  // helpers
  const inAnyTeam = [...(teams.Red || []), ...(teams.Blue || [])];
  const unassignedUsers = onlineUsers.filter((u) => !inAnyTeam.includes(u.userId));

  const handleJoinTeam = (teamColor) => {
    socket.emit("joinTeam", { roomId, teamColor, userId: myUserId });
  };

  const handleLeaveTeam = () => {
    console.log("emit leaveTeam", { roomId, userId: myUserId });
    socket.emit("leaveTeam", { roomId, userId: myUserId });
  };

  const renderUserRow = (userId) => {
    const user = byId[userId] || { userId, displayName: userId };
    const isHost = userId === hostId;
    const isMe = userId === myUserId;

    // decide which action(s) to show for ME
    let actions = null;
    if (isMe) {
      if (myTeam === "Red") {
        actions = (
          <span className="user-actions">
            <button className="leave-btn" onClick={handleLeaveTeam}>
              Leave team
            </button>
            <button
              className="join-btn join-blue"
              onClick={() => handleJoinTeam("Blue")}
            >
              Switch to Blue
            </button>
          </span>
        );
      } else if (myTeam === "Blue") {
        actions = (
          <span className="user-actions">
            <button className="leave-btn" onClick={handleLeaveTeam}>
              Leave team
            </button>
            <button
              className="join-btn join-red"
              onClick={() => handleJoinTeam("Red")}
            >
              Switch to Red
            </button>
          </span>
        );
      } else {
        actions = (
          <span className="user-actions">
            <button
              className="join-btn join-red"
              onClick={() => handleJoinTeam("Red")}
            >
              Join Red
            </button>
            <button
              className="join-btn join-blue"
              onClick={() => handleJoinTeam("Blue")}
            >
              Join Blue
            </button>
          </span>
        );
      }
    }

    return (
      <div className="user-row" key={userId}>
        <InteractiveAvatar
          avatarStyle={user.avatarStyle}
          avatarSeed={user.avatarSeed || user.displayName || user.userId}
          size={44} // keep in sync with --avatar-size if you like
          className="avatar-anim" // you can add avatar-bounce/avatar-fast classes in CSS if desired
        />

        <span className={`user-name ${isHost ? "host" : ""}`}>
          {user.displayName}
          {isHost && (
            <span title="Host" className="crown" aria-label="Host">
              👑
            </span>
          )}
        </span>

        {actions}
      </div>
    );
  };

  return (
    <div className="lobby-container">
      <div className="lobby-url">
        <span>
          <strong>Game Lobby ID:</strong> {roomId}
        </span>
        <button
          className="copy-button"
          onClick={() => {
            navigator.clipboard.writeText(roomId);
            alert("Link copied to clipboard!");
          }}
        >
          Copy ID
        </button>
      </div>

      <div className="lobby-content">
        {/* ONLINE USERS */}
        <div className="user-list">
          <h2>Online Users</h2>
          {unassignedUsers.length === 0 ? (
            <p>No users online.</p>
          ) : (
            unassignedUsers.map((u) => renderUserRow(u.userId))
          )}
        </div>

        {/* TEAMS */}
        <div className="teams-col">
          <div className="team-card red">
            <h3>Red Team</h3>
            {teams.Red.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              teams.Red.map((uid) => renderUserRow(uid))
            )}
          </div>

          <div className="team-card blue">
            <h3>Blue Team</h3>
            {teams.Blue.length === 0 ? (
              <p className="muted">No players</p>
            ) : (
              teams.Blue.map((uid) => renderUserRow(uid))
            )}
          </div>
        </div>

        {/* SETTINGS (placeholder UI) */}
        <div className="game-settings">
          <h2>Game Settings</h2>

          <div className="setting-section">
            <h3>Select Rounds</h3>
            <div className="option-buttons">
              {[1, 2, 3, 4, 5].map((round) => (
                <button key={round}>{round}</button>
              ))}
            </div>
          </div>

          <div className="setting-section">
            <h3>Select Timer</h3>
            <div className="option-buttons">
              {[30, 45, 60, 75, 90].map((sec) => (
                <button key={sec}>{sec}s</button>
              ))}
            </div>
          </div>

          <div className="setting-section">
            <h3>Select Difficulty</h3>
            <div className="option-buttons">
              {["Easy", "Medium", "Hard"].map((level) => (
                <button key={level}>{level}</button>
              ))}
            </div>
          </div>

          <button className="start-game-button">Start Game</button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;

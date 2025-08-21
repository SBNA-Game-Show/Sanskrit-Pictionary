// client/src/components/InteractiveAvatar.js
import React, { useRef, useState, useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as Dice from "@dicebear/collection";
import "./InteractiveAvatar.css"; // optional for styling

export default function InteractiveAvatar({
  avatarStyle = "funEmoji",
  avatarSeed = "player",
  size = 44,
  className = "",
}) {
  const wrapRef = useRef(null);
  const [pop, setPop] = useState(false);
  const [sparkles, setSparkles] = useState([]);

  const dataUrl = useMemo(() => {
    const style = Dice[avatarStyle] || Dice.funEmoji;
    const svg = createAvatar(style, { seed: avatarSeed }).toString();
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [avatarStyle, avatarSeed]);

  const onClick = () => {
    const now = Date.now();
    const burst = Array.from({ length: 4 }).map((_, i) => ({
      id: `${now}-${i}`,
      left: 10 + Math.random() * (size - 20),
      top: 10 + Math.random() * (size - 20),
      emoji: ["✨", "★", "✦", "✳︎", "❈"][Math.floor(Math.random() * 5)],
      color: ["gold", "deepskyblue", "violet", "lime", "orange"][
        Math.floor(Math.random() * 5)
      ],
    }));
    setSparkles((prev) => [...prev, ...burst]);
    setTimeout(() => {
      setSparkles((prev) =>
        prev.filter((s) => !burst.find((b) => b.id === s.id))
      );
    }, 900);
    setPop(true);
    setTimeout(() => setPop(false), 240);
  };

  const onDoubleClick = () => {
    const now = Date.now();
    const burst = Array.from({ length: 15 }).map((_, i) => ({
      id: `${now}-${i}`,
      left: Math.random() * size,
      top: Math.random() * size,
      emoji: ["✨", "★", "✦", "✳︎", "❈", "❇︎", "✺", "✶"][
        Math.floor(Math.random() * 8)
      ],
      color: ["gold", "deepskyblue", "violet", "lime", "orange", "hotpink"][
        Math.floor(Math.random() * 6)
      ],
    }));
    setSparkles((prev) => [...prev, ...burst]);
    setTimeout(() => {
      setSparkles((prev) =>
        prev.filter((s) => !burst.find((b) => b.id === s.id))
      );
    }, 1200);
  };

  return (
    <div
      ref={wrapRef}
      className={`avatar-wrap ${className}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Click or double-click me ✨"
    >
      <img
        alt="avatar"
        className={`user-avatar avatar-anim ${pop ? "pop" : ""}`}
        src={dataUrl}
      />
      {sparkles.map((s) => (
        <span
          key={s.id}
          className="sparkle"
          style={{ left: s.left, top: s.top, color: s.color }}
        >
          {s.emoji}
        </span>
      ))}
    </div>
  );
}

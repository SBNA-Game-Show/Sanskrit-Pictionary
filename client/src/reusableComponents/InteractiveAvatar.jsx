import React, { useRef, useState, useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as Dice from "@dicebear/collection";

const svgToDataUrl = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export default function InteractiveAvatar({
  avatarStyle = "funEmoji",
  avatarSeed = "player",
  size = 44,
  className = "",
}) {
  const wrapRef = useRef(null);
  const [pop, setPop] = useState(false);
  const [sparkles, setSparkles] = useState([]);
  const [tilt, setTilt] = useState({ tx: 0, ty: 0, rot: 0 }); // translate + rotateZ

  const dataUrl = useMemo(() => {
    const style = Dice[avatarStyle] || Dice.funEmoji;
    return svgToDataUrl(createAvatar(style, { seed: avatarSeed }).toString());
  }, [avatarStyle, avatarSeed]);

  const onPointerMove = (e) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;   // 0..1
    const y = (e.clientY - r.top) / r.height;   // 0..1
    const dx = (x - 0.5) * 2;                   // -1..1
    const dy = (y - 0.5) * 2;                   // -1..1
    const maxShift = 4;  // px
    const maxRot = 6;    // deg
    setTilt({
      tx: dx * maxShift,
      ty: dy * maxShift,
      rot: dx * -maxRot, // rotate opposite for a nice tilt
    });
  };

  const onPointerLeave = () => setTilt({ tx: 0, ty: 0, rot: 0 });

  const onClick = () => {
    setPop(true);
    setTimeout(() => setPop(false), 240);
  };

  const onDoubleClick = () => {
    // burst a few sparkles that auto-fade
    const now = Date.now();
    const burst = Array.from({ length: 7 }).map((_, i) => ({
      id: `${now}-${i}`,
      left: 40 + Math.random() * (size - 80), // keep near center
      top:  40 + Math.random() * (size - 80),
      emoji: ["✨", "★", "✦", "✳︎", "❈"][Math.floor(Math.random()*5)],
    }));
    setSparkles((prev) => [...prev, ...burst]);
    setTimeout(() => {
      setSparkles((prev) => prev.filter(s => !burst.find(b => b.id === s.id)));
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
          transform: `translate(${tilt.tx}px, ${tilt.ty}px) rotate(${tilt.rot}deg)`
        }}
      />
      {sparkles.map((s) => (
        <span
          key={s.id}
          className="sparkle"
          style={{ left: s.left, top: s.top }}
        >
          {s.emoji}
        </span>
      ))}
    </div>
  );
}
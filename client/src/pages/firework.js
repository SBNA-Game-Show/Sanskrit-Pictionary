/* // Fireworks.js
import { useEffect, useState } from "react";
import "./firework.css";

export default function Fireworks() {
  const [fireworks, setFireworks] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const id = Date.now();
      const left = Math.random() * 90 + 5; // random horizontal position
      setFireworks((prev) => [...prev, { id, left }]);

      setTimeout(() => {
        setFireworks((prev) => prev.filter((f) => f.id !== id));
      }, 2000); // remove firework after animation
    }, 500); // launch every 0.5s

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fireworks-container">
      {fireworks.map((f) => (
        <div key={f.id} className="firework" style={{ left: `${f.left}%` }}></div>
      ))}
    </div>
  );
} */

import React, { useEffect, useRef } from "react";
import { useReward } from "partycles";

export default function Fireworks({colors}) {
  const ref = useRef(null);

  const { reward } = useReward(ref, "fireworks", {
    particleCount: 80,
    spread: 140,
    colors: colors, 
    startVelocity: 40,
    decay: 0.8,

  });

  useEffect(() => {
   let count = 0;
   const maxBurst = 3;
   const interval = setInterval(() => {
    if (count >= maxBurst) {
        clearInterval(interval);
        return;
    }
    reward();
    count++;
   }, 1500); 

   return () => clearInterval(interval);
  }, []);

  return <div ref={ref} className="fireworks-trigger"></div>;
}

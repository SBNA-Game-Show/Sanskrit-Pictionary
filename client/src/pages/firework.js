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
import "./firework.css";

export default function Fireworks({colors}) {
  const ref = useRef(null);
  
  // Detect Safari browser for optimizations
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  const { reward } = useReward(ref, "mortar", {

    particleCount: 4,
  spread: 40,
  startVelocity: 20,
  elementSize: 10,
  lifetime: 100,
  physics: {
    gravity: 0.35,
    friction: 0.99
  },
  colors: [
    "#bf2222",
    "#df0c21",
    "#df162a",
    "#ff1744",
    "#d500f9",
  ]
   /*  particleCount: isSafari ? 60 : 80,  // Reduce for Safari performance
    spread: 140,
    colors: colors, 
    startVelocity: isSafari ? 35 : 40,  // Lower for Safari smoothness
    decay: 0.9,
    scalar: 1, */
  });

  useEffect(() => {
   let count = 0;
   const maxBurst = 3;
   const interval = setInterval(() => {
    if (count >= maxBurst) {
        clearInterval(interval);
        return;
    }
    
      // Use requestAnimationFrame for Safari animation sync
      /* if (isSafari) {
        requestAnimationFrame(() => reward());
      } else {
        reward();
      } */
     reward();
    count++;
     }, isSafari ? 2000 : 1500);  // Longer interval for Safari

   return () => clearInterval(interval);
    }, []); // Empty array - effect runs once, doesn't restart
  return <div ref={ref} className="fireworks-trigger"></div>;
}

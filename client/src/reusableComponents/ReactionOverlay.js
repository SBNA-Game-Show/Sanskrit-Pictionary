import React from 'react';
import "./ReactionOverlay.css"; 

const ReactionOverlay = ({ reactions }) => {
  return (
    <div className="reaction-container">
      {reactions.map((r) => (
        <span 
          key={r.id} 
          className="floating-emoji" 
          style={{ left: `${r.left}%` }}
        >
          {r.type}
        </span>
      ))}
    </div>
  );
};

export default ReactionOverlay;
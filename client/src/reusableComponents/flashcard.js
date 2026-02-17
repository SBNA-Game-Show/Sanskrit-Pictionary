import React from 'react';

function Flashcard({ items }) {

  // ✅ NEW: Safe audio playback function (prevents runtime errors)
  const handlePlaySound = (audioSrc) => {
    if (!audioSrc) {
      console.warn("Audio source is missing");
      return;
    }

    const audio = new Audio(audioSrc);

    audio.play().catch((err) => {
      console.error("Audio playback failed:", err);
    });
  };

  return (
    <div className="flashcard-container">
      {items.map(({ word, transliteration, translation, audioSrc, imageSrc }, index) => (
        <div key={index} className="vocab-row">
          
          <span className="sanskrit-word">{word}</span>

          {/* ✅ UPDATED: Safe audio handler */}
          <button 
            onClick={() => handlePlaySound(audioSrc)} 
            className="sound-button"
          >
            🔊
          </button>

          <img className="numimage" src={imageSrc} alt="Vocab" />

          <div className="translation-row">{translation}</div>

          <div className="transliteration-row">{transliteration}</div>

        </div>
      ))}
    </div>
  );
}

export default Flashcard;

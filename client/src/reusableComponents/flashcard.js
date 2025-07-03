import React from 'react';

function Flashcard({ items }) {
  return (
    <div className="flashcard-container">
      {items.map(({ word, transliteration, translation, audioSrc, imageSrc }, index) => (
        <div key={index} className="vocab-row">
          
          <span className="sanskrit-word">{word}</span>

          <button onClick={() => new Audio(audioSrc).play()} className="sound-button" >🔊</button>

          <img className="numimage" src={imageSrc} alt="Vocab" />

          <div className="translation-row">{translation}</div>

          <div className="transliteration-row">{transliteration}</div>
          
        </div>
      ))}
    </div>
  );
}

export default Flashcard;
import React, { useRef } from "react";

function Flashcard({ items = [] }) {
  const audioRef = useRef(null);

  const imageToAudio = (imageSrc) => {
    if (!imageSrc) return "";

    const src = imageSrc.startsWith("/") ? imageSrc : `/${imageSrc}`;

    const parts = src.split("/").filter(Boolean); 
    // ["FlashCardEasy", "bird.png"]

    const folder = parts[0]; 
    const file = parts[parts.length - 1]; 
    const base = file.split(".")[0].toLowerCase();

    return `/${folder}/audio/${base}.mp3`;
  };

  const playAudio = async (imageSrc) => {
    const audioPath = imageToAudio(imageSrc);
    if (!audioPath) return;

    const el = audioRef.current;
    if (!el) return;

    try {
      el.src = audioPath;
      el.currentTime = 0;
      el.volume = 1;
      await el.play();
      console.log("Playing:", audioPath);
    } catch (e) {
      console.error("Audio failed:", e, "SRC:", audioPath);
    }
  };

  return (
    <div className="flashcard-container">
      <audio ref={audioRef} preload="auto" />

      {items.map((item, index) => (
        <div
          key={item?.id ?? `${item?.word}-${index}`}
          className="vocab-row"
          onClick={() => playAudio(item?.imageSrc)}
          style={{ cursor: "pointer" }}
        >
          <span className="sanskrit-word">{item?.word}</span>

          <button
            className="sound-button"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              playAudio(item?.imageSrc);
            }}
          >
            🔊
          </button>

          {item?.imageSrc && (
            <img className="numimage" src={item.imageSrc} alt="Vocab" />
          )}

          <div className="translation-row">{item?.translation}</div>
          <div className="transliteration-row">{item?.transliteration}</div>
        </div>
      ))}
    </div>
  );
}

export default Flashcard;
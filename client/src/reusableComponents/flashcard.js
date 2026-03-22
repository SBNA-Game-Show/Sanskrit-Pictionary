import React, { useRef } from "react";

function Flashcard({ items = [] }) {
  const audioRef = useRef(null);

  const playAudio = async (item) => {
    const audioPath = item?.audioSrc || "";
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
          onClick={() => playAudio(item)}
          style={{ cursor: "pointer" }}
        >
          <span className="sanskrit-word">{item?.word}</span>

          <button
            className="sound-button"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              playAudio(item);
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
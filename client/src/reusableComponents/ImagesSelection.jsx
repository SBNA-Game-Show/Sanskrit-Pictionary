import React, { useEffect, useState } from 'react'
import "./ImagesSelection.css";
 // For multiple-choice image selection (guessers only)

const FLASHCARD_MANIFEST_URL =
  process.env.REACT_APP_FLASHCARD_MANIFEST_URL ||
  "https://raw.githubusercontent.com/SBNA-Game-Show/sanskrit-asset/main/data/images.json";

function normalizeDifficulty(value) {
  const text = (value || "").toString().trim().toLowerCase();
  if (text === "easy" || text === "medium" || text === "hard") return text;
  return "easy";
}

function normalizeSrc(value) {
  return (value || "").toString().trim();
}


export default function ImagesSelection( { flashcard, getUserId, canAnswer, roundKey, roomId, socket, setImageChoices, setShowChoices, imageChoices, showChoices }) {
    const [isShaking, setIsShaking] = useState(false);
    const [showPointsLoss, setShowPointsLoss] = useState(false);
    const [pointsGained, setPointsGained] = useState(null);

      const [manifestImagesByDifficulty, setManifestImagesByDifficulty] = useState({
        easy: [],
        medium: [],
        hard: [],
      });

      useEffect(() => {
        let cancelled = false;

        const loadManifestImages = async () => {
          try {
            const response = await fetch(FLASHCARD_MANIFEST_URL);
            if (!response.ok) {
              throw new Error(`Manifest request failed: ${response.status}`);
            }

            const manifest = await response.json();
            if (!Array.isArray(manifest)) {
              throw new Error("Manifest payload is not an array");
            }

            const next = { easy: [], medium: [], hard: [] };
            for (const card of manifest) {
              const difficulty = normalizeDifficulty(card?.difficulty);
              const src = normalizeSrc(card?.imageSrc);
              if (!src) continue;
              next[difficulty].push(src);
            }

            if (!cancelled) {
              setManifestImagesByDifficulty({
                easy: [...new Set(next.easy)],
                medium: [...new Set(next.medium)],
                hard: [...new Set(next.hard)],
              });
            }
          } catch (error) {
            console.warn("[ImagesSelection] Failed to load manifest choices", error);
            if (!cancelled) {
              setManifestImagesByDifficulty({ easy: [], medium: [], hard: [] });
            }
          }
        };

        loadManifestImages();
        return () => {
          cancelled = true;
        };
      }, []);
      function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }
    
      useEffect(() => {
        if (!canAnswer || !flashcard?.imageSrc) {
          setShowChoices(false);
          setImageChoices([]);
          return;
        }

        const difficulty = normalizeDifficulty(flashcard?.difficulty);
        const src = normalizeSrc(flashcard.imageSrc);
        const folderImages = manifestImagesByDifficulty[difficulty] || [];
    
        // Remove duplicates first, just in case
        const uniqueFolderImages = [...new Set(folderImages)];
    
        // Filter out correct image from distractors
        const distractorPool = uniqueFolderImages.filter((img) => normalizeSrc(img) !== src);
    
        // We want 10 total including the correct one
        const maxChoices = 10;
        const distractorCount = Math.max(0, maxChoices - 1);
    
        // Pick up to 9 distractors, or fewer if not available
        const validDistractors = shuffle(distractorPool).slice(0, distractorCount);
    
        // Mix correct + distractors and shuffle
        const mixed = shuffle([
          { src, isCorrect: true },
          ...validDistractors.map((s) => ({ src: s, isCorrect: false })),
        ]);
    
        setImageChoices(mixed);
    
        // show modal as long as there is at least the correct image
        setShowChoices(mixed.length > 0);
      }, [canAnswer, flashcard?.imageSrc, flashcard?.difficulty, manifestImagesByDifficulty, roundKey]);
    
      useEffect(() => {
        const handleCorrect = ({ userId, scoreGained }) => {
          if (userId === getUserId()) {
            setPointsGained(scoreGained);
            
            // Duration to show the popup before closing everything
            setTimeout(() => {
              setPointsGained(null);
              setShowChoices(false);
              setImageChoices([]);
            }, 1200);
          }
        };
    
        socket.on("correctAnswer", handleCorrect);
        return () => socket.off("correctAnswer", handleCorrect);
      }, [socket, getUserId, setShowChoices, setImageChoices]);
    
      const handlePickChoice = (choice) => {
        if (!canAnswer || isShaking || showPointsLoss || pointsGained !== null) return;
    
        if (choice.isCorrect) {
          // Correct click → send real answer
          socket.emit("submitAnswer", {
            gameId: roomId,
            userId: getUserId(),
            answer: flashcard?.word || "",
          });
          
          // Note: Visibility and cleanup are now handled by the correctAnswer socket listener
        } else {
          // ❌ Wrong click → shake + points loss
          setIsShaking(true);
          setShowPointsLoss(true);

          socket.emit("submitAnswer", {
            gameId: roomId,
            userId: getUserId(),
            answer: "__wrong_choice__", // something that will never match
          });
    
          // Stop shaking
          setTimeout(() => {
            setIsShaking(false);
          }, 350);

          // Hide points loss element after animation
          setTimeout(() => {
            setShowPointsLoss(false);
          }, 1000);
        }
      };


  return (
    <div style={{ position: 'relative', width: '100%' }}>
        {showPointsLoss && <div className="points-loss">-15 points</div>}
        {pointsGained !== null && <div className="points-gain">+{pointsGained} points</div>}
        {showChoices && canAnswer && imageChoices.length > 0 && (
                  <div className="choice-modal">
                    <div className={`choice-card ${isShaking ? "shake" : ""}`}>
                      <h3>Pick the correct image</h3>
      
                      <div className="choice-grid">
                        {imageChoices.map((c, index) => (
                          <button
                            key={c.src || index}
                            className="choice-tile"
                            onClick={() => handlePickChoice(c)}
                          >
                            <img src={c.src} alt={`choice ${index + 1}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
    </div>
  )
}
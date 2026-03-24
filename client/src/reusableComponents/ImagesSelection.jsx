import React, { useEffect, useState } from 'react'
import "./ImagesSelection.css";
 // For multiple-choice image selection (guessers only)


export default function ImagesSelection( { flashcard, getUserId, canAnswer, roundKey, roomId, socket, setImageChoices, setShowChoices, imageChoices, showChoices }) {
    const [isShaking, setIsShaking] = useState(false);
    const [showPointsLoss, setShowPointsLoss] = useState(false);
    const [pointsGained, setPointsGained] = useState(null);


    
      const DIFFICULTY_FOLDERS = {
        Easy: [
          "/FlashCardEasy/bird.png",
          "/FlashCardEasy/book.png",
          "/FlashCardEasy/cow.png",
          "/FlashCardEasy/elephant.png",
          "/FlashCardEasy/father.png",
          "/FlashCardEasy/flower.png",
          "/FlashCardEasy/friend.png",
          "/FlashCardEasy/fruit.png",
          "/FlashCardEasy/house.png",
          "/FlashCardEasy/king.png",
          "/FlashCardEasy/moon.png",
          "/FlashCardEasy/mother.png",
          "/FlashCardEasy/river.png",
          "/FlashCardEasy/sun.png",
          "/FlashCardEasy/tree.png",
          "/FlashCardEasy/water.png",
        ],
    
        Medium: [
          "/FlashCardMedium/child.png",
          "/FlashCardMedium/earth.png",
          "/FlashCardMedium/fire.png",
          "/FlashCardMedium/king.png",
          "/FlashCardMedium/mountain.png",
          "/FlashCardMedium/ocean.png",
          "/FlashCardMedium/queen.png",
          "/FlashCardMedium/sky.png",
          "/FlashCardMedium/teacher.png",
          "/FlashCardMedium/time.png",
        ],
    
        Hard: [
          "/FlashCardHard/compassion.png",
          "/FlashCardHard/energy.png",
          "/FlashCardHard/freedom.png",
          "/FlashCardHard/happiness.png",
          "/FlashCardHard/knowledge.png",
          "/FlashCardHard/mind.png",
          "/FlashCardHard/speech.png",
          "/FlashCardHard/student.png",
          "/FlashCardHard/truth.png",
          "/FlashCardHard/universe.png",
        ],
      };
    
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
    
        // Detect difficulty from the imageSrc path
        let difficulty = "Easy";
        const src = flashcard.imageSrc;
    
        if (src.includes("FlashCardMedium")) difficulty = "Medium";
        if (src.includes("FlashCardHard")) difficulty = "Hard";
    
        const folderImages = DIFFICULTY_FOLDERS[difficulty] || [];
    
        // Remove duplicates first, just in case
        const uniqueFolderImages = [...new Set(folderImages)];
    
        // Filter out correct image from distractors
        const distractorPool = uniqueFolderImages.filter((img) => img !== src);
    
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
      }, [canAnswer, flashcard?.imageSrc, roundKey]);
    
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
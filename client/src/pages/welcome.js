import "./welcome.css";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { verifyAuth } from "../utils/authAPI";
import { saveGuestData, getUserId, isGuest } from "../utils/authStorage";
import { toastError, toastSuccess } from "../utils/toast";

function Welcome() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState("");

  useEffect(() => {
    // Check if user already has valid session
    async function checkAuth() {
      const userId = getUserId();
      const guestUser = isGuest();

      // Check for guest session FIRST
      if (guestUser && userId) {
        navigate("/lobby");
        return;
      }

      if (userId && !guestUser) {
        const result = await verifyAuth();
        if (result.valid) {
          navigate("/lobby");
          return;
        }
      }

      setChecking(false);
    }

    checkAuth();
  }, [navigate]);

  const handleGuestPlay = () => {
    setShowGuestModal(true);
  };

  const handleGuestSubmit = () => {
    // Validate display name
    if (!guestName.trim()) {
      toastError("Please enter a display name");
      return;
    }

    if (guestName.trim().length < 3) {
      toastError("Display name must be at least 3 characters");
      return;
    }

    if (guestName.trim().length > 15) {
      toastError("Display name must be 15 characters or less");
      return;
    }

    // Save guest data
    const result = saveGuestData(guestName.trim());

    if (result) {
      toastSuccess(`Welcome, ${result.displayName}! 🎮`);
      setShowGuestModal(false);

      window.dispatchEvent(new Event("displayNameChanged"));

      setTimeout(() => {
        navigate("/lobby");
      }, 100);
    } else {
      toastError("Failed to start guest session. Please try again.");
    }
  };

  const handleCloseModal = () => {
    setShowGuestModal(false);
    setGuestName("");
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleGuestSubmit();
    }
  };

  if (checking) {
    return (
      <div className="welcome-wrapper">
        <div className="welcome-card">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="welcome-wrapper">
        <div className="welcome-card">
          <img src="/books.png" alt="Books" className="welcome-image" />
          <h1 className="welcome-title">Sanskrit Pictionary</h1>
          <div className="welcome-buttons">
            <button className="welcome-button" onClick={handleGuestPlay}>
              Play as Guest
            </button>
            <button
              className="welcome-button"
              onClick={() => navigate("/signin")}
            >
              Sign In & Sign Up
            </button>
          </div>
        </div>
      </div>

      {/* Guest Modal */}
      {showGuestModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Play as Guest 🎮</h2>
              <button className="modal-close" onClick={handleCloseModal}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <label htmlFor="guestName">Enter your display name:</label>
              <input
                id="guestName"
                type="text"
                placeholder="e.g., PlayerOne"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyPress={handleKeyPress}
                maxLength={15}
                autoFocus
              />
              <div className="modal-note">
                <span className="note-icon">ⓘ</span>
                <span>Note: Guest sessions expire when you close the tab.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="modal-button cancel"
                onClick={handleCloseModal}
              >
                Cancel
              </button>
              <button
                className="modal-button submit"
                onClick={handleGuestSubmit}
              >
                Start Playing
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Welcome;

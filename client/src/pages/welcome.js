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

  const handleGuestSubmit = async () => {
    const trimmedName = guestName.trim();

    if (!trimmedName) {
      toastError("Please enter your name");
      return;
    }

    try {
      // Validate with backend
      const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5005";
      const response = await fetch(`${API_BASE}/api/users/validate-username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmedName }),
      });

      const data = await response.json();

      if (!data.valid) {
        toastError(data.error);
        return;
      }

      // If valid, create guest
      const result = saveGuestData(trimmedName);
      if (result) {
        window.dispatchEvent(new Event("displayNameChanged"));
        toastSuccess("Welcome! You can now join games as a guest.");
        setTimeout(() => navigate("/lobby"), 100);
      } else {
        toastError("Failed to create guest session");
      }
    } catch (error) {
      console.error("Validation error:", error);
      // toastError("Failed to validate username");
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

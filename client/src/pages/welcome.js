import "./welcome.css";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { verifyAuth } from "../utils/authAPI";

function Welcome() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if user already has valid session
    async function checkAuth() {
      const result = await verifyAuth();

      if (result.valid) {
        navigate("/lobby");
      } else {
        setChecking(false);
      }
    }

    checkAuth();
  }, [navigate]);

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
    <div className="welcome-wrapper">
      <div className="welcome-card">
        <img src="/books.png" alt="Books" className="welcome-image" />
        <h1 className="welcome-title">Sanskrit Pictionary</h1>
        <div className="welcome-buttons">
          <button className="welcome-button" onClick={() => navigate("/lobby")}>
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
  );
}

export default Welcome;

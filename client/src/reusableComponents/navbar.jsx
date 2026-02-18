import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { socket } from "../pages/socket.js";
import "./navbar.css";
import { getDisplayName, getUserId } from "../utils/authStorage";
import { logoutUser } from "../utils/authAPI";

const Navbar = () => {
  const [displayName, setDisplayName] = useState(() => getDisplayName());
  const navigate = useNavigate();

  useEffect(() => {
    const handleStorageChange = () => {
      setDisplayName(getDisplayName());
    };

    window.addEventListener("displayNameChanged", handleStorageChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("displayNameChanged", handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const handleLogout = async () => {
    // If socket is connected, clean up presence before disconnect
    if (socket && socket.connected) {
      const userId = getUserId();
      if (userId) {
        socket.emit("leaveLobby", { userId });
      }
      socket.disconnect();
    }

    // Call logout API clears HTTP-only cookie and localStorage
    await logoutUser();

    // Notify components to update
    window.dispatchEvent(new Event("displayNameChanged"));

    navigate("/welcome", { replace: true });
  };

  return (
    <nav className="navbar">
      <Link className="nav-logo" to="/welcome">
        Sanskrit Pictionary
      </Link>
      <div className="nav-links">
        <Link to="/lobby">Start Game</Link>
        <Link to="/tutorialrules">Tutorial & Rules</Link>
        {displayName ? (
          <a href="/profile">
            <span className="nav-user">{displayName}</span>
          </a>
        ) : (
          <Link to="/signin">Profile</Link>
        )}
        {displayName && (
          <button
            onClick={handleLogout}
            className="logout-btn2"
            style={{ marginLeft: 8 }}
          >
            Log Out
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

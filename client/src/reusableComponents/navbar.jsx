import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from "react-router-dom";
import { socket } from "../pages/socket.js"; // Adjust path as needed
import './navbar.css';

const Navbar = () => {
  const [displayName, setDisplayName] = useState(() => sessionStorage.getItem('displayName'));
  const navigate = useNavigate();

  useEffect(() => {
    const handleStorageChange = () => {
      setDisplayName(sessionStorage.getItem('displayName'));
    };
    window.addEventListener('displayNameChanged', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('displayNameChanged', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleLogout = () => {
  // If socket is connected, clean up presence before disconnect
  if (socket && socket.connected) {
    socket.emit("leaveLobby");
    socket.disconnect();
  }
  sessionStorage.clear();
  window.dispatchEvent(new Event("displayNameChanged"));
  navigate("/signin", { replace: true });
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
          <a href='/profile'>
            <span className="nav-user">
              {displayName}
            </span>
          </a>
        ) : (
          <Link to="/signin">Profile</Link>
        )}
        {displayName && (
          <button
            onClick={handleLogout}
            className="logout-btn2"
            style={{ marginLeft: 8 }}>
            Log Out
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
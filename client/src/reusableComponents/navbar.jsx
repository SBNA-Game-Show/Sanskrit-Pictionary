import React, { useEffect, useState } from 'react';
import './navbar.css';

const Navbar = () => {
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('displayName'));

  useEffect(() => {
    // In case the value changes while app is running
    const handleStorageChange = () => {
      setDisplayName(localStorage.getItem('displayName'));
    };

    // Listen to 'storage' changes (from other tabs)
    window.addEventListener('storage', handleStorageChange);

    // Also listen to navigation events or local changes
    window.addEventListener('displayNameChanged', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('displayNameChanged', handleStorageChange);
    };
  }, []);

  return (
    <nav className="navbar">
      <a className="nav-logo" href="/welcome">Sanskrit Pictionary</a>
      <div className="nav-links">
        <a href="/lobby">Start Game</a>
        <a href="/tutorialrules">Tutorial & Rules</a>
        {
          displayName
            ? <span className="nav-user">{displayName}</span>
            : <a href="/signin">Profile</a>
        }
      </div>
    </nav>
  );
};

export default Navbar;

import React from 'react';
import './navbar.css';

const Navbar = () => {
  return (
    <nav className="navbar">
      <a className="nav-logo" href="/welcome">Sanskrit Pictionary</a>
      <div className="nav-links">
        <a href="/lobby">Start Game</a>
        <a href="/welcome">Tutorial & Rules</a>
        <a href="/signup">Profile</a>
      </div>
    </nav>
  );
};

export default Navbar;

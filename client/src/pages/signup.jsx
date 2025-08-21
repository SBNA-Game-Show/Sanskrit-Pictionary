import React, { useState } from 'react';
import './signup.css';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Signup() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  // NEW: show/hide toggles
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.id]: e.target.value
    }));
  };

  // Email must contain domain like .com, .ca, etc.
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    if (!validateEmail(formData.email)) {
      alert("Please enter a valid email (e.g., user@example.com).");
      return;
    }

    try {
      await axios.post('/api/auth/register', {
        displayName: formData.displayName,
        email: formData.email,
        password: formData.password
      });
      alert("✅ Registration successful!");
      navigate("/signin");
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Registration failed.";
      alert(errorMsg); // You could use toast UI later instead
    }
  };

  return (
    <div className="signupContainer">
      <form className="signupForm" onSubmit={handleSubmit}>
        <h2>Create Account</h2>

        <label htmlFor="displayName">Username</label>
        <input
          type="text"
          id="displayName"
          placeholder="Enter username"
          required
          onChange={handleChange}
        />

        <label htmlFor="email">Email</label>
        <input
          type="email"
          id="email"
          placeholder="Enter email"
          required
          onChange={handleChange}
        />

        <label htmlFor="password">Password</label>
        {/* NEW: show/hide wrapper */}
        <div className="input-wrap">
          <input
            type={showPw ? "text" : "password"}
            id="password"
            placeholder="Enter password"
            required
            onChange={handleChange}
          />
          <button
            type="button"
            className="reveal-btn"
            onClick={() => setShowPw(v => !v)}
            aria-label={showPw ? "Hide password" : "Show password"}
            title={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? "Hide" : "Show"}
          </button>
        </div>

        <label htmlFor="confirmPassword">Confirm Password</label>
        {/* NEW: show/hide wrapper for confirm */}
        <div className="input-wrap">
          <input
            type={showConfirm ? "text" : "password"}
            id="confirmPassword"
            placeholder="Confirm password"
            required
            onChange={handleChange}
          />
          <button
            type="button"
            className="reveal-btn"
            onClick={() => setShowConfirm(v => !v)}
            aria-label={showConfirm ? "Hide password" : "Show password"}
            title={showConfirm ? "Hide password" : "Show password"}
          >
            {showConfirm ? "Hide" : "Show"}
          </button>
        </div>

        <button type="submit">Sign Up</button>

        <p className="loginRedirect">
          Already signed up?{' '}
          <span onClick={() => navigate('/signin')} className="loginLink">
            Click here to Login
          </span>
        </p>
      </form>
    </div>
  );
}

export default Signup;

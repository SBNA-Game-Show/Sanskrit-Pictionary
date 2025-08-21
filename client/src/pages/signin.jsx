import React, { useState } from 'react';
import './signin.css';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Signin() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  // NEW: show/hide password state
  const [showPw, setShowPw] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.id]: e.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Always clear session on login attempt (prevents "sticking")
      sessionStorage.clear();

      const res = await axios.post('/api/auth/login', {
        email: formData.email,
        password: formData.password
      });

      const { token, displayName, userId } = res.data;

      // Store login info in sessionStorage
      sessionStorage.setItem('token', token);
      sessionStorage.setItem('userId', userId);
      sessionStorage.setItem('displayName', displayName);

      // Optional: Notify for navbar/profile reactive update
      window.dispatchEvent(new Event("displayNameChanged"));

      alert("✅ Login successful!");
      navigate('/lobby');
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.error || "Login failed.";
      alert(errorMsg);
    }
  };

  return (
    <div className="signinContainer">
      <form className="signinForm" onSubmit={handleSubmit}>
        <h2>Sign In</h2>
        <label htmlFor="email">Email</label>
        <input
          type="email"
          id="email"
          placeholder="Enter email"
          required
          onChange={handleChange}
        />

        <label htmlFor="password">Password</label>
        {/* NEW: wrap with show/hide control */}
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

        <button type="submit">Sign in</button>

        <p className="signupRedirect">
          Have not signed up, yet?{' '}
          <span onClick={() => navigate('/signup')} className="signupLink">
            Click here to Sign up
          </span>
        </p>
      </form>
    </div>
  );
}

export default Signin;

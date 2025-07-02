// signin.jsx
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

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.id]: e.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.post('/api/auth/login', {
        email: formData.email,
        password: formData.password
      });

      const token = res.data.token;

      // Store token in localStorage for now (can later use cookies or context)
      localStorage.setItem('token', token);
      localStorage.setItem('displayName', res.data.displayName); // ✅ Store this for navbar
      window.dispatchEvent(new Event("displayNameChanged")); // 🔄 Triggers update

      alert("✅ Login successful!");
      navigate('/lobby');
    } catch (err) {
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
        <input
          type="password"
          id="password"
          placeholder="Enter password"
          required
          onChange={handleChange}
        />

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

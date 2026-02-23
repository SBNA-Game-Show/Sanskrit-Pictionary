import React, { useState } from "react";
import "./signup.css";
import { useNavigate } from "react-router-dom";
import { registerUser } from "../utils/authAPI";
import { toastSuccess, toastError, toastInfo } from "../utils/toast";

function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false); //Add loading state

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.id]: e.target.value,
    }));
  };

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toastInfo("Passwords do not match.");
      return;
    }

    if (!validateEmail(formData.email)) {
      toastInfo("Please enter a valid email (e.g., user@example.com).");
      return;
    }

    setLoading(true);

    try {
      const result = await registerUser(
        formData.displayName,
        formData.email,
        formData.password,
      );

      if (result.success) {
        toastSuccess("Registration successful! Please login.");
        navigate("/signin");
      } else {
        toastError(result.error || "Registration failed");
      }
    } catch (error) {
      console.error("Registration error:", error);
      toastError("An unexpected error occurred");
    } finally {
      setLoading(false);
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
          disabled={loading}
        />
        <label htmlFor="email">Email</label>
        <input
          type="email"
          id="email"
          placeholder="Enter email"
          required
          onChange={handleChange}
          disabled={loading}
        />
        <label htmlFor="password">Password</label>
        <div className="input-wrap">
          <input
            type={showPw ? "text" : "password"}
            id="password"
            placeholder="Enter password"
            required
            onChange={handleChange}
            disabled={loading}
          />
          <button
            type="button"
            className="reveal-btn"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "Hide password" : "Show password"}
            title={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? "Hide" : "Show"}
          </button>
        </div>
        <label htmlFor="confirmPassword">Confirm Password</label>
        <div className="input-wrap">
          <input
            type={showConfirm ? "text" : "password"}
            id="confirmPassword"
            placeholder="Confirm password"
            required
            onChange={handleChange}
            disabled={loading}
          />
          <button
            type="button"
            className="reveal-btn"
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={showConfirm ? "Hide password" : "Show password"}
            title={showConfirm ? "Hide password" : "Show password"}
          >
            {showConfirm ? "Hide" : "Show"}
          </button>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Sign Up"}
        </button>
        <p className="loginRedirect">
          Already signed up?{" "}
          <span onClick={() => navigate("/signin")} className="loginLink">
            Click here to Login
          </span>
        </p>
      </form>
    </div>
  );
}

export default Signup;

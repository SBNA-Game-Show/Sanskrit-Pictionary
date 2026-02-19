import React, { useState } from "react";
import "./signin.css";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../utils/authAPI";

function Signin() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false); // Add loading state

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.id]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await loginUser(formData.email, formData.password);

      if (result.success) {
        // Notify navbar to update
        window.dispatchEvent(new Event("displayNameChanged"));

        alert("✅ Login successful!");
        navigate("/lobby");
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("An unexpected error occurred");
    } finally {
      setLoading(false);
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
        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="signupRedirect">
          Have not signed up, yet?{" "}
          <span onClick={() => navigate("/signup")} className="signupLink">
            Click here to Sign up
          </span>
        </p>
      </form>
    </div>
  );
}

export default Signin;

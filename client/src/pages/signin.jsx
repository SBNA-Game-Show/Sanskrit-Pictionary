import React, { useState, useEffect } from "react";
import "./signin.css";
import { useNavigate, useLocation } from "react-router-dom";
import { loginUser } from "../utils/authAPI";
import { toastSuccess, toastError } from "../utils/toast";

function Signin() {
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestName, setGuestName] = useState("");

  // Extract guest name from URL params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nameParam = params.get("guestName");
    if (nameParam) {
      setGuestName(decodeURIComponent(nameParam));
    }
  }, [location]);

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
        toastSuccess("Login successful! Welcome back! 🎉");
        navigate("/lobby");
      } else {
        toastError(result.error || "Login failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      toastError("An unexpected error occurred");
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
          data-testid="email-input"
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
            data-testid="password-input"
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

        <button type="submit" data-testid="signin-button" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="signupRedirect">
          Have not signed up, yet?{" "}
          <span
            onClick={() => {
              // Forward guest name parameter to signup
              const signupUrl = guestName
                ? `/signup?guestName=${encodeURIComponent(guestName)}`
                : "/signup";
              navigate(signupUrl);
            }}
            className="signupLink"
          >
            Click here to Sign up
          </span>
        </p>
      </form>
    </div>
  );
}

export default Signin;

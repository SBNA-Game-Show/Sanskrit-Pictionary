import React, { useState, useEffect } from "react";
import axios from "axios";
import "./profile.css";

function Profile() {
  const [user, setUser] = useState({ username: "", email: "" });
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (storedUser) {
      setUser(storedUser);
    }
  }, []);

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setMessage("New passwords do not match.");
      return;
    }

    try {
      const response = await axios.post("/api/users/change-password", {
        email: user.email,
        oldPassword,
        newPassword,
      });

      setMessage(response.data.message || "Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Password change failed.";
      setMessage(errorMsg);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("displayName");
    localStorage.removeItem("email");
    window.dispatchEvent(new Event("displayNameChanged")); // if needed to refresh navbar
    window.location.href = "/signin";
  };

  return (
    <div className="profile-container">
      <div className="profile-header">
        <div className="profile-icon-box">
          <img src="/profile-icon.png" alt="Profile Icon" className="profile-icon" />
        </div>
        <h1>Profile</h1>
      </div>

      <div className="user-info">
        <p><strong>Username:</strong> {user.username}</p>
        <p><strong>Email:</strong> {user.email}</p>
      </div>

      <form className="profile-form" onSubmit={handleChangePassword}>
        <h3>Change Password</h3>
        <label>
          Old Password:
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
          />
        </label>
        <label>
          New Password:
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </label>
        <label>
          Confirm Password:
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="save-btn">Change Password</button>
      </form>

      {message && <p className="status-message">{message}</p>}

      <button className="logout-btn" onClick={handleLogout}>Logout</button>
    </div>
  );
}

export default Profile;

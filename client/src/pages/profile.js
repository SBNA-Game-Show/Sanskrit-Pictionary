import React, { useState, useEffect } from "react";
import "./profile.css";

function Profile() {
  const [user, setUser] = useState({ username: "", email: "" });
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (storedUser) {
      setUser(storedUser);
    }
  }, []);

  const handleChangePassword = (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert("New passwords do not match.");
      return;
    }
    alert("Password changed successfully!");
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
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

      <button className="logout-btn" onClick={handleLogout}>Logout</button>
    </div>
  );
}

export default Profile;

import React, { useEffect, useState } from "react";
import { apiClient } from "../utils/authAPI";
import { useNavigate } from "react-router-dom";
import { getEmail } from "../utils/authStorage";
import { logoutUser } from "../utils/authAPI";
import { toastSuccess, toastError, toastWarning } from "../utils/toast";

export default function AccountSettings() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // show/hide toggles
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const userEmail = getEmail();
    if (userEmail) {
      setEmail(userEmail);
    }
  }, []);

  const changePassword = async (e) => {
    e.preventDefault();

    if (newPw.length < 8)
      return toastWarning("New password must be at least 8 characters.");
    if (newPw !== confirm) return toastWarning("Passwords don't match.");

    try {
      setLoading(true);
      await apiClient.post("/api/users/change-password", {
        email,
        oldPassword: oldPw,
        newPassword: newPw,
      });
      toastSuccess("Password changed successfully! 🔐");
      setOldPw("");
      setNewPw("");
      setConfirm("");
    } catch (err) {
      toastError(err?.response?.data?.error || "Couldn't change password.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    window.dispatchEvent(new Event("displayNameChanged"));
    navigate("/welcome", { replace: true });
  };

  return (
    <div className="panel profile-panel">
      <h2>Account</h2>
      <form className="form" onSubmit={changePassword} autoComplete="off">
        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          spellCheck={false}
        />

        <label className="label">Current Password</label>
        <div className="input-wrap">
          <input
            className="input"
            type={showOld ? "text" : "password"}
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            className="reveal-btn"
            onClick={() => setShowOld((v) => !v)}
            aria-label={showOld ? "Hide password" : "Show password"}
            title={showOld ? "Hide password" : "Show password"}
          >
            {showOld ? "Hide" : "Show"}
          </button>
        </div>

        <label className="label">New Password</label>
        <div className="input-wrap">
          <input
            className="input"
            type={showNew ? "text" : "password"}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="reveal-btn"
            onClick={() => setShowNew((v) => !v)}
            aria-label={showNew ? "Hide password" : "Show password"}
            title={showNew ? "Hide password" : "Show password"}
          >
            {showNew ? "Hide" : "Show"}
          </button>
        </div>

        <label className="label">Confirm New Password</label>
        <div className="input-wrap">
          <input
            className="input"
            type={showConfirm ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
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

        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? "Changing…" : "Change Password"}
        </button>
      </form>

      <button className="btn danger" onClick={handleLogout}>
        Log Out
      </button>
    </div>
  );
}

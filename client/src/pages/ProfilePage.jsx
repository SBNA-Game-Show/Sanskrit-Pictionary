import React, { useState } from "react";
import ProfileSettings from "./ProfileSettings";
import AccountSettings from "./AccountSettings";
import "./profile.css";

export default function ProfilePage() {
  const [tab, setTab] = useState("profile"); // "profile" | "account"

  return (
    <div className="profile-container">
      <div className="profile-tabs">
        <button
          className={`tab-btn ${tab === "profile" ? "active" : ""}`}
          onClick={() => setTab("profile")}
        >
          Profile
        </button>
        <button
          className={`tab-btn ${tab === "account" ? "active" : ""}`}
          onClick={() => setTab("account")}
        >
          Account
        </button>
      </div>

      {tab === "profile" ? <ProfileSettings /> : <AccountSettings />}
    </div>
  );
}
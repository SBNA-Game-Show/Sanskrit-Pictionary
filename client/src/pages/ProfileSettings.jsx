// // client/src/pages/ProfileSettings.jsx
// import React, { useEffect, useMemo, useState } from "react";
// import axios from "axios";
// import { socket } from "./socket";
// import {
//   getUserId,
//   getDisplayName,
//   saveUserData,
//   getUserData,
// } from "../utils/authStorage";

// import { createAvatar } from "@dicebear/core";
// import {
//   funEmoji,
//   bottts,
//   croodles,
//   avataaars,
//   pixelArt,
//   bigSmile,
//   adventurer,
//   bigEars,
// } from "@dicebear/collection";

// import "./profile.css";

// /* Map of available DiceBear styles */
// const stylesMap = {
//   funEmoji,
//   bottts,
//   croodles,
//   avataaars,
//   pixelArt,
//   bigSmile,
//   adventurer,
//   bigEars,
// };

// const svgToDataUrl = (svg) =>
//   `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// export default function ProfileSettings() {
//   const [displayName, setDisplayName] = useState("");
//   const [avatarSeed, setAvatarSeed] = useState("player");
//   const [avatarStyle, setAvatarStyle] = useState("funEmoji");

//   const [uploadDataUrl, setUploadDataUrl] = useState(null); // optional raw image
//   const [saving, setSaving] = useState(false);
//   const [msg, setMsg] = useState("");

//   // load stored profile on mount
//   useEffect(() => {
//     const local = JSON.parse(localStorage.getItem("user") || "{}");
//     if (local.displayName) setDisplayName(local.displayName);
//     if (local.avatarSeed) setAvatarSeed(local.avatarSeed);
//     if (local.avatarStyle) setAvatarStyle(local.avatarStyle);

//     // const ssName = sessionStorage.getItem("displayName");
//     const ssName = getDisplayName();
//     if (!local.displayName && ssName) setDisplayName(ssName);
//   }, []);

//   // live DiceBear SVG
//   const diceSvg = useMemo(() => {
//     const style = stylesMap[avatarStyle] || funEmoji;
//     return createAvatar(style, { seed: avatarSeed }).toString();
//   }, [avatarStyle, avatarSeed]);

//   const handleFile = (file) => {
//     if (!file) return setUploadDataUrl(null);
//     const reader = new FileReader();
//     reader.onload = () => setUploadDataUrl(reader.result?.toString() || null);
//     reader.readAsDataURL(file);
//   };

//   const handleSave = async () => {
//     setMsg("");
//     setSaving(true);
//     try {
//       // const userId = sessionStorage.getItem("userId");
//       const userId = getUserId();
//       if (!userId) throw new Error("No userId in localStorage");

//       const avatarData = uploadDataUrl || svgToDataUrl(diceSvg);

//       // 1) local save
//       const existing = JSON.parse(localStorage.getItem("user") || "{}");
//       localStorage.setItem(
//         "user",
//         JSON.stringify({
//           ...existing,
//           displayName,
//           avatarSeed,
//           avatarStyle,
//           avatarData, // local only
//         })
//       );
//       sessionStorage.setItem("displayName", displayName);
//       window.dispatchEvent(new Event("displayNameChanged"));

//       // 2) save on backend
//       await axios.put("/api/users/me/profile", {
//         userId,
//         displayName,
//         avatarSeed,
//         avatarStyle,
//       });

//       // 3) notify lobby (must include userId so others update correctly)
//       socket.emit("updateProfile", {
//         userId,
//         displayName,
//         avatarSeed,
//         avatarStyle,
//       });

//       setMsg("Saved ✓");
//     } catch (err) {
//       console.error(err);
//       setMsg("Couldn’t save profile.");
//     } finally {
//       setSaving(false);
//       setTimeout(() => setMsg(""), 2000);
//     }
//   };

//   const quickSeeds = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
//   const styleKeys = Object.keys(stylesMap);

//   const randomizeSeed = () => {
//     setAvatarSeed(Math.random().toString(36).slice(2));
//     setUploadDataUrl(null);
//   };

//   return (
//     <div className="panel profile-panel">
//       <h2>In-game Profile</h2>

//       <label className="label">Display Name</label>
//       <input
//         className="input"
//         maxLength={24}
//         placeholder="name to display"
//         value={displayName}
//         onChange={(e) => setDisplayName(e.target.value)}
//       />

//       <div className="avatar-row">
//         <div className="avatar-preview">
//           {uploadDataUrl ? (
//             <img
//               alt="uploaded avatar"
//               width={180}
//               height={180}
//               src={uploadDataUrl}
//               className="avatar-preview-img"
//             />
//           ) : (
//             <img
//               alt="generated avatar"
//               width={180}
//               height={180}
//               src={svgToDataUrl(diceSvg)}
//               className="avatar-preview-img avatar-anim avatar-interactive"
//             />
//           )}
//         </div>

//         <div className="avatar-controls">
//           <div className="control-group">
//             <label className="label">Avatar Style</label>
//             <div className="avatar-style-row">
//               <select
//                 className="input"
//                 value={avatarStyle}
//                 onChange={(e) => setAvatarStyle(e.target.value)}
//               >
//                 {styleKeys.map((s) => (
//                   <option key={s} value={s}>
//                     {s}
//                   </option>
//                 ))}
//               </select>
//               <button
//                 type="button"
//                 className="dice-btn"
//                 onClick={randomizeSeed}
//                 title="Randomize avatar"
//               >
//                 🎲
//               </button>
//             </div>
//           </div>

//           <div className="control-group">
//             <label className="label">Quick Picks</label>
//             <div className="avatar-grid">
//               {quickSeeds.map((seed) => {
//                 const svg = createAvatar(stylesMap[avatarStyle], { seed }).toString();
//                 return (
//                   <button
//                     key={seed}
//                     type="button"
//                     className={`avatar-cell ${avatarSeed === seed ? "selected" : ""}`}
//                     onClick={() => {
//                       setAvatarSeed(seed);
//                       setUploadDataUrl(null);
//                     }}
//                   >
//                     <img alt="" src={svgToDataUrl(svg)} />
//                   </button>
//                 );
//               })}
//             </div>
//           </div>

//           <div className="control-group">
//             <label className="label">Or Upload</label>
//             <input
//               type="file"
//               accept="image/*"
//               onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
//             />
//             {uploadDataUrl && (
//               <button
//                 type="button"
//                 className="btn subtle"
//                 style={{ marginTop: 8 }}
//                 onClick={() => setUploadDataUrl(null)}
//               >
//                 Use generated avatar instead
//               </button>
//             )}
//           </div>
//         </div>
//       </div>

//       {msg && <div className="notice" style={{ marginTop: 8 }}>{msg}</div>}

//       <div className="actions">
//         <button className="btn primary" onClick={handleSave} disabled={saving}>
//           {saving ? "Saving…" : "Save Changes"}
//         </button>
//       </div>
//     </div>
//   );
// }

// client/src/pages/ProfileSettings.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { socket } from "./socket";
import {
  getUserId,
  getDisplayName,
  saveUserData,
  getUserData,
} from "../utils/authStorage";
import { createAvatar } from "@dicebear/core";
import {
  funEmoji,
  bottts,
  croodles,
  avataaars,
  pixelArt,
  bigSmile,
  adventurer,
  bigEars,
} from "@dicebear/collection";
import "./profile.css";

/* Map of available DiceBear styles */
const stylesMap = {
  funEmoji,
  bottts,
  croodles,
  avataaars,
  pixelArt,
  bigSmile,
  adventurer,
  bigEars,
};

const svgToDataUrl = (svg) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export default function ProfileSettings() {
  const [displayName, setDisplayName] = useState("");
  const [avatarSeed, setAvatarSeed] = useState("player");
  const [avatarStyle, setAvatarStyle] = useState("funEmoji");
  const [uploadDataUrl, setUploadDataUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // ✅ Load stored profile on mount
  useEffect(() => {
    // Get user data from centralized storage
    const userData = getUserData();

    if (userData?.displayName) {
      setDisplayName(userData.displayName);
    }

    // Load avatar preferences from separate localStorage key (UI-only data)
    const avatarPrefs = JSON.parse(localStorage.getItem("avatarPrefs") || "{}");
    if (avatarPrefs.avatarSeed) setAvatarSeed(avatarPrefs.avatarSeed);
    if (avatarPrefs.avatarStyle) setAvatarStyle(avatarPrefs.avatarStyle);
  }, []);

  // Live DiceBear SVG
  const diceSvg = useMemo(() => {
    const style = stylesMap[avatarStyle] || funEmoji;
    return createAvatar(style, { seed: avatarSeed }).toString();
  }, [avatarStyle, avatarSeed]);

  const handleFile = (file) => {
    if (!file) return setUploadDataUrl(null);
    const reader = new FileReader();
    reader.onload = () => setUploadDataUrl(reader.result?.toString() || null);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setMsg("");
    setSaving(true);
    try {
      const userId = getUserId();
      if (!userId) throw new Error("No userId in localStorage");

      const avatarData = uploadDataUrl || svgToDataUrl(diceSvg);

      // ✅ 1) Save display name to centralized auth storage
      const currentUserData = getUserData();
      saveUserData(userId, displayName, currentUserData?.email);

      // ✅ 2) Save avatar preferences separately (UI-only data)
      localStorage.setItem(
        "avatarPrefs",
        JSON.stringify({
          avatarSeed,
          avatarStyle,
          avatarData, // local only for quick display
        }),
      );

      // Notify navbar and other components
      window.dispatchEvent(new Event("displayNameChanged"));

      // ✅ 3) Save on backend (with credentials for cookie)
      await axios.put(
        "/api/users/me/profile",
        {
          userId,
          displayName,
          avatarSeed,
          avatarStyle,
        },
        {
          withCredentials: true, // ✅ Send HTTP-only cookie
        },
      );

      // ✅ 4) Notify lobby via socket
      socket.emit("updateProfile", {
        userId,
        displayName,
        avatarSeed,
        avatarStyle,
      });

      setMsg("Saved ✓");
    } catch (err) {
      console.error(err);
      setMsg("Couldn't save profile.");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 2000);
    }
  };

  const quickSeeds = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
  const styleKeys = Object.keys(stylesMap);

  const randomizeSeed = () => {
    setAvatarSeed(Math.random().toString(36).slice(2));
    setUploadDataUrl(null);
  };

  return (
    <div className="panel profile-panel">
      <h2>In-game Profile</h2>
      <label className="label">Display Name</label>
      <input
        className="input"
        maxLength={24}
        placeholder="name to display"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <div className="avatar-row">
        <div className="avatar-preview">
          {uploadDataUrl ? (
            <img
              alt="uploaded avatar"
              width={180}
              height={180}
              src={uploadDataUrl}
              className="avatar-preview-img"
            />
          ) : (
            <img
              alt="generated avatar"
              width={180}
              height={180}
              src={svgToDataUrl(diceSvg)}
              className="avatar-preview-img avatar-anim avatar-interactive"
            />
          )}
        </div>
        <div className="avatar-controls">
          <div className="control-group">
            <label className="label">Avatar Style</label>
            <div className="avatar-style-row">
              <select
                className="input"
                value={avatarStyle}
                onChange={(e) => setAvatarStyle(e.target.value)}
              >
                {styleKeys.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="dice-btn"
                onClick={randomizeSeed}
                title="Randomize avatar"
              >
                🎲
              </button>
            </div>
          </div>
          <div className="control-group">
            <label className="label">Quick Picks</label>
            <div className="avatar-grid">
              {quickSeeds.map((seed) => {
                const svg = createAvatar(stylesMap[avatarStyle], {
                  seed,
                }).toString();
                return (
                  <button
                    key={seed}
                    type="button"
                    className={`avatar-cell ${avatarSeed === seed ? "selected" : ""}`}
                    onClick={() => {
                      setAvatarSeed(seed);
                      setUploadDataUrl(null);
                    }}
                  >
                    <img alt="" src={svgToDataUrl(svg)} />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="control-group">
            <label className="label">Or Upload</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {uploadDataUrl && (
              <button
                type="button"
                className="btn subtle"
                style={{ marginTop: 8 }}
                onClick={() => setUploadDataUrl(null)}
              >
                Use generated avatar instead
              </button>
            )}
          </div>
        </div>
      </div>
      {msg && (
        <div className="notice" style={{ marginTop: 8 }}>
          {msg}
        </div>
      )}
      <div className="actions">
        <button className="btn primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

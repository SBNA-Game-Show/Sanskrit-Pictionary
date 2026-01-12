# **📄 Sanskrit Pictionary – Codebase Trace & Refactor Guide**

## **1\. Project Overview**

* **Frontend (React)**: `Sanskrit-Pictionary/client/src/`

  * Pages: `/pages/` → main screens (lobby, play, end, profile, welcome, tutorial)

  * Reusable Components: `/reusableComponents/` → chat, flashcards, avatars, navbar, popups, word history

  * Entry point: `index.js`, `App.js`

* **Backend (Node/Express)**: `Sanskrit-Pictionary/server/`

  * Controllers: handle authentication and other logic (`auth.controller.js`)

  * Middleware: authentication (`auth.middleware.js`)

  * Routes: `/routes/` → auth, user

  * Game logic: `/game/` → `gameSessionManager.js`, `gameSocket.js`

  * Lobby manager: `lobbyManager.js`

  * Models: `User.js`, `Team.js`, `Flashcard.js`

  * Entry point: `server.js`

---

## **2\. Frontend → Backend Interaction**

| Frontend File | Backend Endpoint / Logic | Notes |
| ----- | ----- | ----- |
| `lobby.js` | `gameSocket.js`, WebSocket events | Handles joining lobbies, real-time updates |
| `play.js` | `gameSessionManager.js` | Manages drawing, guess submissions, scoring |
| `ProfilePage.jsx` | `/routes/user.routes.js` | Fetches user info |
| `signin.jsx` / `signup.jsx` | `/routes/auth.routes.js` | Login/signup flows, JWT handled via `auth.middleware.js` |

---

## **3\. File Responsibilities & Refactor Targets**

* **Large / multi-responsibility files** (good candidates for SRP):

  * `play.js` → contains both drawing UI \+ socket logic → split: `PlayCanvas.jsx` \+ `PlaySockets.js`

  * `lobby.js` → currently handles UI \+ lobby WebSocket events → split: `LobbyUI.jsx` \+ `LobbySockets.js`

  * `gameSessionManager.js` → could separate: scoring logic, round timer, word management

* **Utility / minor components** (keep as-is or minor tweaks):

  * `flashcard.js`, `chat.js`, `button.js`

---

## **4\. Tracing Code Flow (Example: Player Joining & Round Start)**

1. Player opens **Welcome Page** → `welcome.js`

2. Clicks “Play Now” → navigates to `lobby.js`

3. Frontend connects to backend via **WebSocket (`gameSocket.js`)**

4. Backend (`lobbyManager.js`) creates lobby / assigns drawer

5. Drawer receives flashcard → game round begins

6. Drawing submitted via **WebSocket** → guessers see live updates

7. Scoring calculated in `gameSessionManager.js` → sent back to frontend

8. Round recap & scoreboard updated → `RoundPopups.jsx` / `wordhistory.js`

---

## **5\. Refactor Plan (SRP / Modularization)**

| Target File | Suggested Modules | Notes |
| ----- | ----- | ----- |
| `play.js` | `PlayCanvas.jsx`, `PlaySockets.js`, `PlayHelpers.js` | Separate UI, socket, and helper functions |
| `lobby.js` | `LobbyUI.jsx`, `LobbySockets.js` | Clean separation of UI vs networking |
| `gameSessionManager.js` | `Scoring.js`, `RoundManager.js`, `WordManager.js` | Each handles a single responsibility |
| `ProfilePage.jsx` | `ProfileUI.jsx`, `ProfileAPI.js` | UI vs API calls |

---

## **6\. Debugging / Runtime Tracing Recommendations**

* Use **console logs** or **browser React DevTools** for frontend.

* Use **Node debugger / VSCode Debugger** for backend.

* Trace key flows: lobby join, round start, drawing submission, scoring update.

* Optional: record **sequence diagrams** to visualize socket events.

---

## **7\. Team Checklist**

- [ ] Ensure local setup works for everyone (`npm install` / `.env` config)

- [ ] Walkthrough each main flow: Welcome → Lobby → Play → End

- [ ] Identify large files & assign SRP split tasks

- [ ] Document each new module / refactor in shared Google Doc

- [ ] Test WebSocket flows after refactor


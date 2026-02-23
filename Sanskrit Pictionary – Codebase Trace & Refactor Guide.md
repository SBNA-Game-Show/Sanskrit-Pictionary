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

## **2\.1 Gameplay Mechanics Implemented (Current Behavior)**

### **A) Guesses: 4 per player (server-enforced)**

* Each eligible **guesser** starts every round with **4 guesses**.

  * Eligible guesser = on the **drawer’s team**, and **not** the drawer.

* A wrong guess reduces only that player’s guesses: `4 → 3 → 2 → 1 → 0`.

* Guesses reset back to **4** at the start of each new round.

* The round ends immediately (even if time remains) when the guessing side is “done”:

  * every eligible guesser has either **guessed correctly** OR has **0 guesses left**.

Where this lives:

* Backend (source of truth): `server/game/gameSessionManager.js`

  * `startRound(...)` resets `player.remainingGuesses = 4` and `player.hasAnswered = false`

  * `handleAnswer(...)` decrements `player.remainingGuesses` on wrong answers

  * `getPlayersWithScores(...)` includes `remainingGuesses` in the players payload

* Backend (round end trigger): `server/game/gameSocket.js`

  * Ends the round early when `handleAnswer(...)` returns `guessesExhausted`

* Frontend (display): `client/src/pages/play.js`

  * Shows each player’s guesses as `G: <num>` in the user list

  * Disables answering when your guesses hit `0`

### **B) Scoring: quicker correct guess = more points**

Correct answers use time-based scoring on the server.

* Constants:

  * `MAX_SCORE = 200`

  * `MIN_SCORE = 10`

* Formula:

```
ratio = remainingSeconds / totalSeconds
scoreGained = floor(MIN_SCORE + (MAX_SCORE - MIN_SCORE) * ratio)
```

Where this lives:

* Score calculation: `server/game/gameSessionManager.js` (`handleAnswer(...)`)

* Timer source for `remainingSeconds`: `server/game/gameSocket.js` (`activeTimers[gameId].secondsLeft`)

* UI feedback showing the earned points:

  * `client/src/reusableComponents/RoundPopups.jsx` (overlay popup)

  * `client/src/pages/play.js` (Correct modal)

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


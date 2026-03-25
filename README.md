# 🕉️ Sanskrit Pictionary

Sanskrit Pictionary is a web-based multiplayer game that helps users learn Sanskrit in a fun way. Players draw Sanskrit words while others guess the **English spelling of the transliteration**. The flashcard reveals parts (word, image, audio, meaning) step-by-step as the timer goes down.

---

## 🛠 Tech Stack (MERN)

- **Frontend**: React (inside `/client`)
- **Backend**: Node.js + Express + MongoDB (inside `/server`)
- **Authentication**: JWT
- **Database**: MongoDB Atlas

---

## 📁 Project Structure

```
Sanskrit-Pictionary/
├── client/        # React frontend
├── server/        # Express backend
├── imageHostingSolution/  # Separate asset dashboard module
├── .env           # Contains MongoDB URI and secret
├── README.md
```

---

## 🔧 How to Run the Project

### 1. Clone the Repo

```in bash terminal
git clone https://github.com/<your-username>/Sanskrit-Pictionary.git
cd Sanskrit-Pictionary
```

### 2. Run Backend (server)

```in bash terminal
cd server
npm install
```

Create a `.env` file inside `/server` with:

```
MONGO_URI=your_mongo_connection_string
JWT_SECRET=your_jwt_secret
PORT=5005
FLASHCARD_MANIFEST_URL=https://raw.githubusercontent.com/SBNA-Game-Show/sanskrit-asset/main/data/images.json
```

Optional (client-side, for answer image choices):

Create a `.env` file inside `/client` with:

```
REACT_APP_FLASHCARD_MANIFEST_URL=https://raw.githubusercontent.com/SBNA-Game-Show/sanskrit-asset/main/data/images.json
```

Then:

```in bash terminal
npm start
```

This starts the backend at `http://localhost:5005`

---

### 3. Run Frontend (client)

```in bash terminal
cd ../client
npm install
```

In `/client/package.json`, add this line:

```json
"proxy": "http://localhost:5005"
```

Then:

```in bash terminal
npm start
```

This starts the frontend at `http://localhost:3000`

---

### 4. Run Image Dashboard (separate module)

```in bash terminal
cd ../imageHostingSolution
npm install
```

Create `.env` in `imageHostingSolution` from `.env.example` and set:

- `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`
- `JWT_SECRET` (must match `server/.env`)
- `ADMIN_USER_ID` (single admin user id)

Start dashboard API and UI:

```in bash terminal
npm run server   # http://localhost:4000
npm run dev      # http://localhost:5173
```

The dashboard sign-in uses Sanskrit-Pictionary credentials and only allows `ADMIN_USER_ID`.

---

### 5. Set Single Admin User

From `server/`, run:

```in bash terminal
npm run admin:set-single -- 698cb2d895facbe7d45568a8
```

This removes `ADMIN` from all users, then adds it only to the target user.

---

## ✅ Features Done

- frontend page: welcome, signup, signin, lobby
- User registration & login (with validation)
- JWT token auth and displayName in navbar
- Protected `/lobby` route (only visible after login)
- `GET /api/users/online` route working (shows online users)

---

## 📌 Notes

- Run `npm install` in **both** `/client` and `/server`
- Each team member should make their own branch like:  
  `TeamName-YourName`
- Proxy setup helps frontend talk to backend during development
- Node modules are not pushed to GitHub — always run `npm install` after cloning

---

Let us know if anything breaks 🧠🚧 Happy coding!

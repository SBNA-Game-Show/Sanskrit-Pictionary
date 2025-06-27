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
PORT=5000
```

Then:

```in bash terminal
npm start
```

This starts the backend at `http://localhost:5000`

---

### 3. Run Frontend (client)

```in bash terminal
cd ../client
npm install
```

In `/client/package.json`, add this line:

```json
"proxy": "http://localhost:5000"
```

Then:

```in bash terminal
npm start
```

This starts the frontend at `http://localhost:3000`

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

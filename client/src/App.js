import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./reusableComponents/navbar";
import Footer from "./reusableComponents/footer";
import Welcome from "./pages/welcome";
import LobbyMenu from "./pages/lobbyMenu"
import Lobby from "./pages/lobby";
import Signup from "./pages/signup";
import TutorialRules from "./pages/tutorialrules";
import Signin from "./pages/signin";
import ProtectedRoute from "./reusableComponents/ProtectedRoute";

function App() {
  return (
    <Router>
      <div className="appWrapper">
        <Navbar />
        <div className="appContent">
          <Routes>
            <Route path="/" element={<Navigate to="/welcome" replace />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/signin" element={<Signin />} />
            <Route path="/tutorialrules" element={<TutorialRules />} />
            <Route path="/lobby" element={<LobbyMenu />} />     
            <Route
              path="/lobby/:roomId"
              element={
                <ProtectedRoute>
                  <Lobby />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
        <img src="/background.png" className="background-image" alt="decorative" />
        <Footer />
      </div>
    </Router>
  );
}

export default App;

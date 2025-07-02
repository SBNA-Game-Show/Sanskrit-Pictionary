import "./App.css";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Navbar from "./reusableComponents/navbar";
import Footer from "./reusableComponents/footer";
import Welcome from "./pages/welcome";
import Lobby from "./pages/lobby";
import Signup from "./pages/signup";
import TutorialRules from "./pages/tutorialrules";
import Signin from "./pages/signin";
import ProtectedRoute from "./reusableComponents/ProtectedRoute";

function App() {
  return (
    <div className="appWrapper">
      <Navbar />
      <Router>
        <div className="appContent">
          <Routes>
            <Route path="/" element={<Navigate to="/welcome" replace />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/signin" element={<Signin />} />
            <Route path="/tutorialrules" element={<TutorialRules />} />
            <Route
              path="/lobby"
              element={
                <ProtectedRoute>
                  <Lobby />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </Router>
      <img
        src="/background.png"
        className="background-image"
        alt="decorative"
      />
      <Footer />
    </div>
  );
}

export default App;

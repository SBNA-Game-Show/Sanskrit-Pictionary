// import "./App.css";
// import {
//   BrowserRouter as Router,
//   Routes,
//   Route,
//   Navigate,
// } from "react-router-dom";
// import { ToastContainer } from "react-toastify";
// import "react-toastify/dist/ReactToastify.css";
// import "./styles/toast.css";
// import Navbar from "./reusableComponents/navbar";
// import Footer from "./reusableComponents/footer";

// import Welcome from "./pages/welcome";
// import LobbyMenu from "./pages/lobbyMenu";
// import Lobby from "./pages/lobby";
// import Signup from "./pages/signup";
// import TutorialRules from "./pages/tutorialrules";
// import Signin from "./pages/signin";
// import End from "./pages/end";
// import Test from "./pages/test";
// import Play from "./pages/play";

// // NEW profile page with tabs
// import ProfilePage from "./pages/ProfilePage";

// // keep a single ProtectedRoute import
// import ProtectedRoute from "./reusableComponents/ProtectedRoute";

// function App() {
//   return (
//     <Router>
//       <div className="appWrapper">
//         <Navbar />
//         <div className="appContent">
//           <Routes>
//             <Route path="/" element={<Navigate to="/welcome" replace />} />
//             <Route path="/welcome" element={<Welcome />} />
//             <Route path="/signup" element={<Signup />} />
//             <Route path="/signin" element={<Signin />} />
//             <Route path="/tutorialrules" element={<TutorialRules />} />
//             <Route path="/test" element={<Test />} />
//             {/* Redirect bare /play to the lobby (prevents mounting Play without a roomId) */}
//             <Route path="/play" element={<Navigate to="/lobby" replace />} />
//             {/* ✅ REQUIRED: dynamic play route */}
//             <Route
//               path="/play/:roomId"
//               element={
//                 <ProtectedRoute>
//                   <Play />
//                 </ProtectedRoute>
//               }
//             />
//             <Route path="/end" element={<End />} />
//             <Route path="/profile" element={<ProfilePage />} />

//             <Route path="/lobby" element={<LobbyMenu />} />
//             <Route
//               path="/lobby/:roomId"
//               element={
//                 <ProtectedRoute>
//                   <Lobby />
//                 </ProtectedRoute>
//               }
//             />
//           </Routes>
//         </div>

//         <img
//           src="/background.png"
//           className="background-image"
//           alt="decorative"
//         />
//         <img
//           src="/background.png"
//           className="background-image"
//           alt="decorative"
//         />
//         <Footer />
//         {/* ToastContainer */}
//         <ToastContainer
//           position="top-right"
//           autoClose={3000}
//           hideProgressBar={false}
//           newestOnTop={true}
//           closeOnClick
//           rtl={false}
//           pauseOnFocusLoss
//           draggable
//           pauseOnHover
//           theme="colored"
//         />
//       </div>
//     </Router>
//   );
// }

// export default App;

import "./App.css";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./styles/toast.css";
import Navbar from "./reusableComponents/navbar";
import Footer from "./reusableComponents/footer";
import Welcome from "./pages/welcome";
import LobbyMenu from "./pages/lobbyMenu";
import Lobby from "./pages/lobby";
import Signup from "./pages/signup";
import TutorialRules from "./pages/tutorialrules";
import Signin from "./pages/signin";
import End from "./pages/end";
import Test from "./pages/test";
import Play from "./pages/play";
import ProfilePage from "./pages/ProfilePage";
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
            <Route path="/test" element={<Test />} />

            {/* Redirect bare /play to the lobby */}
            <Route path="/play" element={<Navigate to="/lobby" replace />} />

            {/* ✅ UPDATED: Allow guests to play */}
            <Route path="/play/:roomId" element={<Play />} />

            <Route path="/end" element={<End />} />

            {/* ✅ Keep profile protected - only for registered users */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />

            {/* ✅ UPDATED: Allow guests in lobby */}
            <Route path="/lobby" element={<LobbyMenu />} />
            <Route path="/lobby/:roomId" element={<Lobby />} />
          </Routes>
        </div>
        <img
          src="/background.png"
          className="background-image"
          alt="decorative"
        />
        <img
          src="/background.png"
          className="background-image"
          alt="decorative"
        />
        <Footer />
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={true}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
        />
      </div>
    </Router>
  );
}

export default App;

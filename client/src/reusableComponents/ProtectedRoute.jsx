// // src/reusableComponents/ProtectedRoute.jsx
// import React from "react";
// import { Navigate } from "react-router-dom";

// const ProtectedRoute = ({ children }) => {
//   const token = sessionStorage.getItem("token");
//   return token ? children : <Navigate to="/signin" replace />;
// };

// export default ProtectedRoute;

import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { verifyAuth } from "../utils/authAPI"; // ✅ Import

const ProtectedRoute = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const result = await verifyAuth();
      setIsAuthenticated(result.valid);
      setChecking(false);
    }

    checkAuth();
  }, []);

  if (checking) {
    return <div>Loading...</div>; // Or a spinner component
  }

  if (!isAuthenticated) {
    console.warn("⚠️ Not authenticated. Redirecting to signin...");
    return <Navigate to="/signin" replace />;
  }

  return children;
};

export default ProtectedRoute;

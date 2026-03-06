import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { verifyAuth } from "../utils/authAPI";
import { isGuest, getDisplayName } from "../utils/authStorage";
import { toastInfo } from "../utils/toast";

const ProtectedRoute = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      // Skip token verification for guests
      if (isGuest()) {
        setIsAuthenticated(false);
        setChecking(false);
        return;
      }

      // Check authentication for registered users
      const result = await verifyAuth();
      setIsAuthenticated(result.valid);
      setChecking(false);
    }
    checkAuth();
  }, []);

  if (checking) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    // Pass guest name in URL if user is a guest
    if (isGuest()) {
      const guestName = getDisplayName();
      toastInfo("Create an account to access your profile! 🎮", {
        autoClose: 3000,
      });
      return (
        <Navigate
          to={`/signin?guestName=${encodeURIComponent(guestName)}`}
          replace
        />
      );
    }

    // Regular unauthenticated user
    console.warn("⚠️ Not authenticated. Redirecting to signin...");
    return <Navigate to="/signin" replace />;
  }

  return children;
};

export default ProtectedRoute;

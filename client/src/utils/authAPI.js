import axios from "axios";
import { saveUserData, clearUserData, getUserData } from "./authStorage";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5005";

// Create a custom axios instance
const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor to this instance
apiClient.interceptors.request.use(
  (config) => {
    const userData = getUserData();
    if (userData?.token) {
      config.headers.Authorization = `Bearer ${userData.token}`;
      console.log(
        "Token attached to request:",
        userData.token.substring(0, 20) + "...",
      );
    } else {
      console.warn("⚠️ No token found in localStorage");
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export async function loginUser(email, password) {
  try {
    const response = await apiClient.post("/api/auth/login", {
      email,
      password,
    });

    const { user, token } = response.data;

    if (!token) {
      console.error("❌ No token in login response");
      return {
        success: false,
        error: "No token received from server",
      };
    }

    console.log(
      "Login successful, token received:",
      token.substring(0, 20) + "...",
    );

    // Save user data + token to localStorage
    saveUserData(user.userId, user.displayName, user.email, token);

    return { success: true, user };
  } catch (error) {
    console.error("Login error:", error);
    return {
      success: false,
      error: error.response?.data?.error || "Login failed",
    };
  }
}

export async function logoutUser() {
  try {
    await apiClient.post("/api/auth/logout");
    clearUserData();
    return { success: true };
  } catch (error) {
    console.error("Logout error:", error);
    clearUserData();
    return { success: false };
  }
}

export async function verifyAuth() {
  try {
    console.log("🔍 Verifying auth...");
    const userData = getUserData();
    console.log(
      "🔍 Token in localStorage:",
      userData?.token ? "Present" : "Missing",
    );

    const response = await apiClient.get("/api/auth/verify");

    if (response.data.valid) {
      const { user } = response.data;
      // Preserve token when updating
      saveUserData(user.userId, user.displayName, user.email, userData?.token);
      console.log("Auth verification successful");
      return { valid: true, user };
    }

    console.warn("⚠️ Auth verification failed: invalid response");
    return { valid: false };
  } catch (error) {
    console.error(
      "Token verification error:",
      error.response?.data || error.message,
    );
    return { valid: false };
  }
}

export async function registerUser(displayName, email, password) {
  try {
    await apiClient.post("/api/auth/register", {
      displayName,
      email,
      password,
    });
    return { success: true };
  } catch (error) {
    console.error("Registration error:", error);
    return {
      success: false,
      error: error.response?.data?.error || "Registration failed",
    };
  }
}

// Export apiClient so other files can use it
export { apiClient };

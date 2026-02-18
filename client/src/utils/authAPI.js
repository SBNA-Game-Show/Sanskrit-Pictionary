import axios from "axios";
import { saveUserData, clearUserData, getUserData } from "./authStorage";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5005";

// Configure axios to send cookies
axios.defaults.withCredentials = true;
axios.defaults.baseURL = API_BASE;

// Interceptor to attach token to all requests
axios.interceptors.request.use((config) => {
  const userData = getUserData();
  if (userData?.token) {
    config.headers.Authorization = `Bearer ${userData.token}`;
  }
  return config;
});

export async function loginUser(email, password) {
  try {
    const response = await axios.post(`${API_BASE}/api/auth/login`, {
      email,
      password,
    });

    const { user, token } = response.data; // extract token

    // Save token along with user data
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
    await axios.post(`${API_BASE}/api/auth/logout`);
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
    const response = await axios.get(`${API_BASE}/api/auth/verify`);

    if (response.data.valid) {
      const { user } = response.data;
      const userData = getUserData(); // Get existing data
      // Preserve token when updating
      saveUserData(user.userId, user.displayName, user.email, userData?.token);
      return { valid: true, user };
    }

    return { valid: false };
  } catch (error) {
    console.error("Token verification error:", error);
    return { valid: false };
  }
}

export async function registerUser(displayName, email, password) {
  try {
    await axios.post(`${API_BASE}/api/auth/register`, {
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

import axios from "axios";
import { saveUserData, clearUserData } from "./authStorage";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5005";

// Configure axios to send cookies
axios.defaults.withCredentials = true;
axios.defaults.baseURL = API_BASE;

export async function loginUser(email, password) {
  try {
    const response = await axios.post(`${API_BASE}/api/auth/login`, {
      email,
      password,
    });

    const { user } = response.data;

    // Save user data to localStorage (JWT is in HTTP-only cookie)
    saveUserData(user.userId, user.displayName, user.email);

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
    // Clear data even if API call fails
    clearUserData();
    return { success: false };
  }
}

export async function verifyAuth() {
  try {
    const response = await axios.get(`${API_BASE}/api/auth/verify`);

    if (response.data.valid) {
      // Update localStorage in case data changed
      const { user } = response.data;
      saveUserData(user.userId, user.displayName, user.email);
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

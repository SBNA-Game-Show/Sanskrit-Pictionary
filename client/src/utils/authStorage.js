const STORAGE_KEYS = {
  USER_ID: "sanskrit_pictionary_userId",
  DISPLAY_NAME: "sanskrit_pictionary_displayName",
  EMAIL: "sanskrit_pictionary_email",
  TOKEN: "sanskrit_pictionary_token",
};

export function saveUserData(userId, displayName, email, token) {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
    localStorage.setItem(STORAGE_KEYS.DISPLAY_NAME, displayName);
    if (email) localStorage.setItem(STORAGE_KEYS.EMAIL, email);
    if (token) localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    console.log("User data saved to localStorage");
    return true;
  } catch (error) {
    console.error("Failed to save user data:", error);
    return false;
  }
}

export function getUserData() {
  try {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const displayName = localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME);
    const email = localStorage.getItem(STORAGE_KEYS.EMAIL);
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);

    if (!userId || !displayName) {
      return null;
    }

    return {
      userId,
      displayName,
      email,
      token,
    };
  } catch (error) {
    console.error("Failed to get user data:", error);
    return null;
  }
}

export function clearUserData() {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_ID);
    localStorage.removeItem(STORAGE_KEYS.DISPLAY_NAME);
    localStorage.removeItem(STORAGE_KEYS.EMAIL);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    console.log("User data cleared from localStorage");
  } catch (error) {
    console.error("Failed to clear user data:", error);
  }
}

// Get individual values (for components that use sessionStorage.getItem)
export function getUserId() {
  return localStorage.getItem(STORAGE_KEYS.USER_ID);
}

export function getDisplayName() {
  return localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME);
}

export function getEmail() {
  return localStorage.getItem(STORAGE_KEYS.EMAIL);
}

// Helper to get token
export function getToken() {
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

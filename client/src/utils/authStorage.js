const STORAGE_KEYS = {
  USER_ID: "sanskrit_pictionary_userId",
  DISPLAY_NAME: "sanskrit_pictionary_displayName",
  EMAIL: "sanskrit_pictionary_email",
};

// Save user data to localStorage (non-sensitive data only)
export function saveUserData(userId, displayName, email) {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
    localStorage.setItem(STORAGE_KEYS.DISPLAY_NAME, displayName);
    if (email) localStorage.setItem(STORAGE_KEYS.EMAIL, email);
    console.log("User data saved to localStorage");
    return true;
  } catch (error) {
    console.error("Failed to save user data:", error);
    return false;
  }
}

// Get user data from localStorage
export function getUserData() {
  try {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const displayName = localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME);
    const email = localStorage.getItem(STORAGE_KEYS.EMAIL);

    if (!userId || !displayName) {
      return null;
    }

    return {
      userId,
      displayName,
      email,
    };
  } catch (error) {
    console.error("Failed to get user data:", error);
    return null;
  }
}

// Clear user data from localStorage
export function clearUserData() {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_ID);
    localStorage.removeItem(STORAGE_KEYS.DISPLAY_NAME);
    localStorage.removeItem(STORAGE_KEYS.EMAIL);
    console.log("User data cleared from localStorage");
  } catch (error) {
    console.error("Failed to clear user data:", error);
  }
}

// Get individual values for components that use sessionStorage.getItem
export function getUserId() {
  return localStorage.getItem(STORAGE_KEYS.USER_ID);
}

export function getDisplayName() {
  return localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME);
}

export function getEmail() {
  return localStorage.getItem(STORAGE_KEYS.EMAIL);
}

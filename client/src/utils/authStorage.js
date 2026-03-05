// const STORAGE_KEYS = {
//   USER_ID: "sanskrit_pictionary_userId",
//   DISPLAY_NAME: "sanskrit_pictionary_displayName",
//   EMAIL: "sanskrit_pictionary_email",
//   TOKEN: "sanskrit_pictionary_token",
// };

// // Check if localStorage is available
// function isLocalStorageAvailable() {
//   try {
//     const test = "__localStorage_test__";
//     localStorage.setItem(test, test);
//     localStorage.removeItem(test);
//     return true;
//   } catch (e) {
//     return false;
//   }
// }

// // Fallback to sessionStorage if localStorage is blocked
// const storage = isLocalStorageAvailable() ? localStorage : sessionStorage;

// export function saveUserData(userId, displayName, email, token) {
//   try {
//     storage.setItem(STORAGE_KEYS.USER_ID, userId);
//     storage.setItem(STORAGE_KEYS.DISPLAY_NAME, displayName);
//     if (email) storage.setItem(STORAGE_KEYS.EMAIL, email);
//     if (token) storage.setItem(STORAGE_KEYS.TOKEN, token);
//     return true;
//   } catch (error) {
//     console.error("Failed to save user data:", error);
//     return false;
//   }
// }

// export function getUserData() {
//   try {
//     const userId = storage.getItem(STORAGE_KEYS.USER_ID);
//     const displayName = storage.getItem(STORAGE_KEYS.DISPLAY_NAME);
//     const email = storage.getItem(STORAGE_KEYS.EMAIL);
//     const token = storage.getItem(STORAGE_KEYS.TOKEN);

//     if (!userId || !displayName) {
//       return null;
//     }

//     return { userId, displayName, email, token };
//   } catch (error) {
//     console.error("Failed to get user data:", error);
//     return null;
//   }
// }

// export function clearUserData() {
//   try {
//     storage.removeItem(STORAGE_KEYS.USER_ID);
//     storage.removeItem(STORAGE_KEYS.DISPLAY_NAME);
//     storage.removeItem(STORAGE_KEYS.EMAIL);
//     storage.removeItem(STORAGE_KEYS.TOKEN);
//   } catch (error) {
//     console.error("Failed to clear user data:", error);
//   }
// }

// export function getUserId() {
//   return storage.getItem(STORAGE_KEYS.USER_ID);
// }

// export function getDisplayName() {
//   return storage.getItem(STORAGE_KEYS.DISPLAY_NAME);
// }

// export function getEmail() {
//   return storage.getItem(STORAGE_KEYS.EMAIL);
// }

// export function getToken() {
//   return storage.getItem(STORAGE_KEYS.TOKEN);
// }

// // ✅ UPDATED: Guest user functions - always use sessionStorage
// export function saveGuestData(displayName) {
//   try {
//     // Generate unique guest ID
//     const guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

//     // ✅ IMPORTANT: Store guest data in BOTH storages for compatibility
//     // This ensures getUserId() finds it regardless of which storage is checked first
//     const storageKeys = {
//       USER_ID: "sanskrit_pictionary_userId",
//       DISPLAY_NAME: "sanskrit_pictionary_displayName",
//     };

//     // Store in sessionStorage (primary for guests)
//     sessionStorage.setItem(storageKeys.USER_ID, guestId);
//     sessionStorage.setItem(storageKeys.DISPLAY_NAME, displayName);
//     sessionStorage.setItem("isGuest", "true");
//     sessionStorage.setItem("avatarSeed", displayName || "guest");
//     sessionStorage.setItem("avatarStyle", "funEmoji");

//     // ✅ ALSO store in localStorage if available (for getUserId() compatibility)
//     try {
//       localStorage.setItem(storageKeys.USER_ID, guestId);
//       localStorage.setItem(storageKeys.DISPLAY_NAME, displayName);
//       localStorage.setItem("isGuest", "true");
//       localStorage.setItem("avatarSeed", displayName || "guest");
//       localStorage.setItem("avatarStyle", "funEmoji");
//     } catch (e) {
//       // localStorage not available, that's OK
//       console.log("localStorage not available for guest");
//     }

//     return { guestId, displayName };
//   } catch (error) {
//     console.error("Failed to save guest data:", error);
//     return null;
//   }
// }

// export function isGuest() {
//   // Check both storages
//   return (
//     sessionStorage.getItem("isGuest") === "true" ||
//     localStorage.getItem("isGuest") === "true"
//   );
// }

// export function clearGuestData() {
//   try {
//     const storageKeys = {
//       USER_ID: "sanskrit_pictionary_userId",
//       DISPLAY_NAME: "sanskrit_pictionary_displayName",
//     };

//     // Clear from sessionStorage
//     sessionStorage.removeItem(storageKeys.USER_ID);
//     sessionStorage.removeItem(storageKeys.DISPLAY_NAME);
//     sessionStorage.removeItem("isGuest");
//     sessionStorage.removeItem("avatarSeed");
//     sessionStorage.removeItem("avatarStyle");

//     // Clear from localStorage too
//     try {
//       localStorage.removeItem(storageKeys.USER_ID);
//       localStorage.removeItem(storageKeys.DISPLAY_NAME);
//       localStorage.removeItem("isGuest");
//       localStorage.removeItem("avatarSeed");
//       localStorage.removeItem("avatarStyle");
//     } catch (e) {
//       // localStorage not available
//     }
//   } catch (error) {
//     console.error("Failed to clear guest data:", error);
//   }
// }

const STORAGE_KEYS = {
  USER_ID: "sanskrit_pictionary_userId",
  DISPLAY_NAME: "sanskrit_pictionary_displayName",
  EMAIL: "sanskrit_pictionary_email",
  TOKEN: "sanskrit_pictionary_token",
};

// Check if localStorage is available
function isLocalStorageAvailable() {
  try {
    const test = "__localStorage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

// Fallback to sessionStorage if localStorage is blocked
const storage = isLocalStorageAvailable() ? localStorage : sessionStorage;

// REGISTERED USER FUNCTIONS

export function saveUserData(userId, displayName, email, token) {
  try {
    storage.setItem(STORAGE_KEYS.USER_ID, userId);
    storage.setItem(STORAGE_KEYS.DISPLAY_NAME, displayName);
    if (email) storage.setItem(STORAGE_KEYS.EMAIL, email);
    if (token) storage.setItem(STORAGE_KEYS.TOKEN, token);
    return true;
  } catch (error) {
    console.error("Failed to save user data:", error);
    return false;
  }
}

export function getUserData() {
  try {
    const userId = storage.getItem(STORAGE_KEYS.USER_ID);
    const displayName = storage.getItem(STORAGE_KEYS.DISPLAY_NAME);
    const email = storage.getItem(STORAGE_KEYS.EMAIL);
    const token = storage.getItem(STORAGE_KEYS.TOKEN);

    if (!userId || !displayName) {
      return null;
    }

    return { userId, displayName, email, token };
  } catch (error) {
    console.error("Failed to get user data:", error);
    return null;
  }
}

export function clearUserData() {
  try {
    storage.removeItem(STORAGE_KEYS.USER_ID);
    storage.removeItem(STORAGE_KEYS.DISPLAY_NAME);
    storage.removeItem(STORAGE_KEYS.EMAIL);
    storage.removeItem(STORAGE_KEYS.TOKEN);
  } catch (error) {
    console.error("Failed to clear user data:", error);
  }
}

// GUEST USER FUNCTIONS
export function saveGuestData(displayName) {
  try {
    // Generate unique guest ID
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store ONLY in sessionStorage
    sessionStorage.setItem(STORAGE_KEYS.USER_ID, guestId);
    sessionStorage.setItem(STORAGE_KEYS.DISPLAY_NAME, displayName);
    sessionStorage.setItem("isGuest", "true");
    sessionStorage.setItem("avatarSeed", displayName || "guest");
    sessionStorage.setItem("avatarStyle", "funEmoji");

    return { guestId, displayName };
  } catch (error) {
    console.error("Failed to save guest data:", error);
    return null;
  }
}

export function clearGuestData() {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.USER_ID);
    sessionStorage.removeItem(STORAGE_KEYS.DISPLAY_NAME);
    sessionStorage.removeItem("isGuest");
    sessionStorage.removeItem("avatarSeed");
    sessionStorage.removeItem("avatarStyle");
  } catch (error) {
    console.error("Failed to clear guest data:", error);
  }
}

// UNIVERSAL GETTERS (check both storages)
export function getUserId() {
  // Check sessionStorage first (for guests), then localStorage (for registered)
  return (
    sessionStorage.getItem(STORAGE_KEYS.USER_ID) ||
    storage.getItem(STORAGE_KEYS.USER_ID)
  );
}

export function getDisplayName() {
  // Check sessionStorage first (for guests), then localStorage (for registered)
  return (
    sessionStorage.getItem(STORAGE_KEYS.DISPLAY_NAME) ||
    storage.getItem(STORAGE_KEYS.DISPLAY_NAME)
  );
}

export function isGuest() {
  return sessionStorage.getItem("isGuest") === "true";
}

export function getEmail() {
  return storage.getItem(STORAGE_KEYS.EMAIL);
}

export function getToken() {
  return storage.getItem(STORAGE_KEYS.TOKEN);
}

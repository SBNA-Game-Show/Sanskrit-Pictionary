// This is the part of the Profile page that deals with the API calls to load and save the user profile data.
// It includes functions to load the profile data from local storage and backend, 
// and to save the updated profile data back to both local storage and the backend.

import {socket} from './socket';
import { getUserId, saveUserData, getUserData } from '../utils/authStorage';
import { apiClient } from '../utils/authAPI';



// This file defines two main functions: loadProfileData and saveProfileData.
// loadProfileData retrieves the user's profile data, including display name and avatar preferences, from local storage and returns it as an object.
export const loadProfileData = () => {
  const userData = getUserData();
  const avatarPrefs = JSON.parse(localStorage.getItem("avatarPrefs") || "{}");

  return {
    displayName: userData?.displayName || "",
    avatarSeed: avatarPrefs.avatarSeed || "player",
    avatarStyle: avatarPrefs.avatarStyle || "funEmoji",
    avatarData: avatarPrefs.avatarData || null,
  };
};

// saveProfileData takes the updated profile data as input, saves the display name to centralized storage,
// saves the avatar preferences to local storage, updates the backend with the new profile data, 
// and emits a socket event to notify other clients of the profile update.
export const saveProfileData = async ({
  displayName,
  avatarSeed,
  avatarStyle,
  avatarData,
}) => {
    // Get userId from centralized storage.
  const userId = getUserId();
  if (!userId) throw new Error("No userId in localStorage");
    // Get current user data to preserve email and token when saving updated display name.
  const currentUserData = getUserData();

  // save display name
  saveUserData(
    userId,
    displayName,
    currentUserData?.email,
    currentUserData?.token
  );

  // save avatar locally
  localStorage.setItem(
    "avatarPrefs",
    JSON.stringify({
      avatarSeed,
      avatarStyle,
      avatarData,
    })
  );
  //Update the display name in the other parts of the app. 
  window.dispatchEvent(new Event("displayNameChanged"));

  // backend update
  // The API call to update the user's profile on the backend. 
  // It sends a PUT request to the /api/users/me/profile endpoint with the updated profile data, 
  // including display name, avatar seed, avatar style, and avatar data. The userId is included in the request body for identification.
  await apiClient.put("/api/users/me/profile", {
    userId,
    displayName,
    avatarSeed,
    avatarStyle,
    avatarData,
  });

  // socket notify
  socket.emit("updateProfile", {
    userId,
    displayName,
    avatarSeed,
    avatarStyle,
    avatarData,
  });
};
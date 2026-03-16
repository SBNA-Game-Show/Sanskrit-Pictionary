//This is the refactoed page for the user profile UI. This will include the avatar and display name.
// This allows the user to select their avatar style or select a random avatar. 

import React, {useEffect, useState, useMemo} from 'react';
import { createAvatar } from '@dicebear/core'; // generate avatar 
import {
    funEmoji,
    bottts,
    croodles,
    avataaars,
    pixelArt,
    bigSmile,
    adventurer,
    bigEars,
} from '@dicebear/collection'; // different avatar styles from dicebear
import {loadProfileData, saveProfileData} from '../utils/ProfileAPI.js'; // API functions to load and save profile data
import './profile.css';
import { toastSuccess, toastError } from '../utils/toast';

/* Map of available DiceBear styles */
const stylesMap={
    funEmoji,
    bottts,
    croodles,
    avataaars,
    pixelArt,
    bigSmile,
    adventurer,
    bigEars,
};
 
//This converts the generated SVG avatar into a data URL that can be used as an image source in the browser.
const svgToDataUrl = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;


//This function defines the ProfileUI and manages the user profile state, including display name and avatar preferences. 
// /It loads existing profile data on mount, generates a live preview of the avatar based on user selections, 
// //and handles saving the profile data when the user clicks the save button.
export default function ProfileUI() {
    const [displayName, setDisplayName] = useState('');
    const [avatarSeed, setAvatarSeed] = useState('player');
    const [avatarStyle, setAvatarStyle] = useState('funEmoji');
    const [uploadDataUrl, setUploadDataUrl] = useState(null);
    const [saving, setSaving] = useState(false);


    // Load the stored user profile data when the component mounts. 
    // This is ran once when the component is first rendered. 
  useEffect(() => {
    const data = loadProfileData();
    setDisplayName(data.displayName || '');
    setAvatarSeed(data.avatarSeed || 'player');
    setAvatarStyle(data.avatarStyle || 'funEmoji');
    setUploadDataUrl(data.uploadDataUrl || null);
  }, []);

  // This generates a live preview of the avatar based on the current avatar style and seed.
    const diceSvg = useMemo(() => {
        // variable to store the selected avatar style, defaults to funEmoji if the selected style is not found in stylesMap
        const style = stylesMap[avatarStyle] || funEmoji;
        return createAvatar(style, {seed: avatarSeed}).toString();
    }, [avatarStyle, avatarSeed]);

    // This function handles saving the profile data when the user clicks the save button.
    // It saves the display name and avatar preferences both locally and to the backend, and provides user feedback on success or failure.
    const handleSave = async () => {
        setSaving(true);
        try {
            const avatarData = /* uploadDataUrl ||  */svgToDataUrl(diceSvg);
            await saveProfileData({ displayName, avatarSeed, avatarStyle, ...avatarData });
            toastSuccess('Profile saved successfully! ✨');
        }catch(err) {
            console.error('Error saving profile:', err);
            toastError("Couldn't save profile.");
        }finally {
            setSaving(false);
        }
    };
    // This array of quickSeeds provides a set of predefined seeds that users can click on to quickly change their avatar.
    const quickSeeds = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
    const styleKeys = Object.keys(stylesMap);
    // This function generates a random seed for the avatar when the user clicks the dice button, allowing for quick and easy avatar changes.
    const randomizedSeed = () => {
        setAvatarSeed(Math.random().toString(36).slice(2));
        setUploadDataUrl(null);
    };

    return (
        <div className="panel profile-panel">
            <h2>In-game Profile</h2>
            <label className="label">Display Name</label>
            <input
                className="input"
                maxLength={24}
                placeholder="name to display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
            />
        
        <div className="avatar-row">
            <div className="avatar-preview">
                {uploadDataUrl ? (
                    <img 
                    alt="uploaded avatar" 
                    width={180} 
                    height={180} 
                    src={uploadDataUrl} 
                    className="avatar-preview-img" 
                    />
                ) : (
                    <img 
                    alt="generated avatar"
                    width={180}
                    height={180}
                    src={svgToDataUrl(diceSvg)}
                    className="avatar-preview-img avatar-anim avatar-interactive"
                    />
                )}
            </div>
            <div className="avatar-controls">
                <div className="label">Avatar Style</div>
                <select
                    className="input"
                    value={avatarStyle}
                    onChange={(e) => setAvatarStyle(e.target.value)}
                >
                    {styleKeys.map((s) => (
                        <option key={s} value={s}>{s}
                        </option>
                    ))}
                </select>
                <button className="dice-btn" onClick={randomizedSeed}>🎲</button>
                <div className="avatar-grid">
                    {quickSeeds.map((seed) => {
                        const svg = createAvatar(stylesMap[avatarStyle], 
                            {seed,}).toString();

                        return (
                            <button
                                key={seed}
                                className={`avatar-cell ${avatarSeed === seed ? 'selected' : ''}`}
                                onClick={() => {
                                    setAvatarSeed(seed);
                                    setUploadDataUrl(null);
                                }}
                            >
                                <img 
                                    alt=""
                                    src={svgToDataUrl(svg)}
                                />
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>

        <div className="actions">
            <button
                className="btn primary"
                onClick={handleSave}
                disabled={saving}
            >
                {saving ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
        </div>
    );
}
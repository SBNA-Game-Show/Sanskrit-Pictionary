const Filter = require("leo-profanity");

/**
 * Normalize text to catch bypassed profanity
 * Removes special characters and converts leet speak
 * Example: "a.s.s.h.o.l.e" -> "asshole"
 */
function normalizeForProfanityCheck(text) {
  if (!text || typeof text !== "string") return "";

  return text
    .replace(/[\s._\-'"*@#$%^&!~`+=|\\\/\[\]{}()<>:;,?]/g, "") // Remove special chars
    .replace(/0/g, "o") // Leet speak: 0 → o
    .replace(/1/g, "i") // Leet speak: 1 → i
    .replace(/3/g, "e") // Leet speak: 3 → e
    .replace(/4/g, "a") // Leet speak: 4 → a
    .replace(/5/g, "s") // Leet speak: 5 → s
    .replace(/7/g, "t") // Leet speak: 7 → t
    .replace(/8/g, "b") // Leet speak: 8 → b
    .toLowerCase();
}

/**
 * Check if text contains profanity
 * Checks both original text and normalized version
 * @param {string} text - Text to check
 * @returns {boolean} - True if profanity detected
 */
function containsProfanity(text) {
  if (!text || typeof text !== "string") return false;

  const normalized = normalizeForProfanityCheck(text);
  return Filter.check(text) || Filter.check(normalized);
}

module.exports = {
  normalizeForProfanityCheck,
  containsProfanity,
};

const mongoose = require('mongoose');

const flashcardSchema = new mongoose.Schema({
  word: { type: String, required: true },
  transliteration: { type: String, required: true },
  translation: { type: String, required: true },
  audioSrc: { type: String },
  imageSrc: { type: String },
  otherNames: [{ type: String }],
  otherInformation: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Flashcard', flashcardSchema);

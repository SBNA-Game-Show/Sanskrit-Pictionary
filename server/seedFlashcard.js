const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Flashcard = require("./models/Flashcard");

dotenv.config();

const words = [
  {
    word: "पुस्तकम्‌",
    transliteration: "Pustakam",
    translation: "Book",
    audioSrc: "",
    imageSrc: "books.png",
  },
  {
    word: "गृहम्",
    transliteration: "Gṛham",
    translation: "House",
    audioSrc: "",
    imageSrc: "house.png",
  },
  {
    word: "जलम्",
    transliteration: "Jalam",
    translation: "Water",
    audioSrc: "",
    imageSrc: "water.png",
  },
  {
    word: "फलम्",
    transliteration: "Phalam",
    translation: "Fruit",
    audioSrc: "",
    imageSrc: "fruit.png",
  },
  {
    word: "गजः",
    transliteration: "Gajaḥ",
    translation: "Elephant",
    audioSrc: "",
    imageSrc: "elephant.png",
  },
  {
    word: "नदी",
    transliteration: "Nadī",
    translation: "River",
    audioSrc: "",
    imageSrc: "river.png",
  },
  {
    word: "पुष्पम्",
    transliteration: "Puṣpam",
    translation: "Flower",
    audioSrc: "",
    imageSrc: "flower.png",
  },
  {
    word: "सूर्यः",
    transliteration: "Sūryaḥ",
    translation: "Sun",
    audioSrc: "",
    imageSrc: "sun.png",
  },
  {
    word: "चन्द्रः",
    transliteration: "Candraḥ",
    translation: "Moon",
    audioSrc: "",
    imageSrc: "moon.png",
  },
  {
    word: "वृक्षः",
    transliteration: "Vṛkṣaḥ",
    translation: "Tree",
    audioSrc: "",
    imageSrc: "tree.png",
  },
];

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB");

    const count = await Flashcard.countDocuments();
    if (count === 0) {
      await Flashcard.insertMany(words);
      console.log("Flashcards seeded successfully");
    } else {
      console.log(
        "Flashcards already exist in the database. Skipping seeding."
      );
    }

    mongoose.disconnect();
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB", err);
  });

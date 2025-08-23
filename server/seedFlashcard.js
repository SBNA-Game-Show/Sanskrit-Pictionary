const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Flashcard = require("./models/Flashcard");

dotenv.config();

// const words = [
//   {
//     word: "पुस्तकम्‌",
//     transliteration: "Pustakam",
//     translation: "Book",
//     audioSrc: "",
//     imageSrc: "books.png",
//   },
//   {
//     word: "गृहम्",
//     transliteration: "Gṛham",
//     translation: "House",
//     audioSrc: "",
//     imageSrc: "house.png",
//   },
//   {
//     word: "जलम्",
//     transliteration: "Jalam",
//     translation: "Water",
//     audioSrc: "",
//     imageSrc: "water.png",
//   },
//   {
//     word: "फलम्",
//     transliteration: "Phalam",
//     translation: "Fruit",
//     audioSrc: "",
//     imageSrc: "fruit.png",
//   },
//   {
//     word: "गजः",
//     transliteration: "Gajaḥ",
//     translation: "Elephant",
//     audioSrc: "",
//     imageSrc: "elephant.png",
//   },
//   {
//     word: "नदी",
//     transliteration: "Nadī",
//     translation: "River",
//     audioSrc: "",
//     imageSrc: "river.png",
//   },
//   {
//     word: "पुष्पम्",
//     transliteration: "Puṣpam",
//     translation: "Flower",
//     audioSrc: "",
//     imageSrc: "flower.png",
//   },
//   {
//     word: "सूर्यः",
//     transliteration: "Sūryaḥ",
//     translation: "Sun",
//     audioSrc: "",
//     imageSrc: "sun.png",
//   },
//   {
//     word: "चन्द्रः",
//     transliteration: "Candraḥ",
//     translation: "Moon",
//     audioSrc: "",
//     imageSrc: "moon.png",
//   },
//   {
//     word: "वृक्षः",
//     transliteration: "Vṛkṣaḥ",
//     translation: "Tree",
//     audioSrc: "",
//     imageSrc: "tree.png",
//   },
// ];
const words = [
  { word:"पुस्तकम्", transliteration:"Pustakam", translation:"Book",    imageSrc:"/FlashCardEasy/book.png",    audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"गृहम्",   transliteration:"Griham",   translation:"House",   imageSrc:"/FlashCardEasy/house.png",   audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"जलम्",    transliteration:"Jalam",    translation:"Water",   imageSrc:"/FlashCardEasy/water.png",   audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"फलम्",    transliteration:"Phalam",   translation:"Fruit",   imageSrc:"/FlashCardEasy/fruit.png",   audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"सूर्यः",   transliteration:"Surya",    translation:"Sun",     imageSrc:"/FlashCardEasy/sun.png",     audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"चन्द्रः",  transliteration:"Chandra",  translation:"Moon",    imageSrc:"/FlashCardEasy/moon.png",    audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"पुष्पम्",   transliteration:"Pushpam",  translation:"Flower",  imageSrc:"FlashCardEasyy/flower.png",  audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"वृक्षः",   transliteration:"Vriksha",  translation:"Tree",    imageSrc:"/FlashCardEasy/tree.png",    audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"नदी",     transliteration:"Nadi",     translation:"River",   imageSrc:"/FlashCardEasy/river.png",   audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"गजः",     transliteration:"Gaja",     translation:"Elephant",imageSrc:"/FlashCardEasy/elephant.png",audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"पक्षी",    transliteration:"Pakshi",   translation:"Bird",    imageSrc:"/FlashCardEasy/bird.png",    audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"गौः",     transliteration:"Gau",      translation:"Cow",     imageSrc:"/FlashCardEasy/cow.png",     audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"माता",    transliteration:"Mata",     translation:"Mother",  imageSrc:"/FlashCardEasy/mother.png",  audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"पिता",    transliteration:"Pita",     translation:"Father",  imageSrc:"/FlashCardEasy/father.png",  audioSrc:"", difficulty:"easy", otherNames:[] },
  { word:"मित्रम्",  transliteration:"Mitram",   translation:"Friend",  imageSrc:"/FlashCardEasy/friend.png",  audioSrc:"", difficulty:"easy", otherNames:[] },

  {word:"अग्निः", transliteration:"Agni", translation:"Fire", imageSrc:"/FlashCardMedium/fire.png", audioSrc:"", difficulty:"medium", otherNames:[]},
  {word:"पृथिवी", transliteration:"Prithivi", translation:"Earth", imageSrc:"/FlashCardMedium/earth.png", audioSrc:"", difficulty:"medium", otherNames:[]},
  {word:"आकाशः", transliteration:"Akasha", translation:"Sky", imageSrc:"/FlashCardMedium/sky.png", audioSrc:"", difficulty:"medium", otherNames:[]},
  {word:"पर्वतः", transliteration:"Parvata", translation:"Mountain", imageSrc:"/FlashCardMedium/mountain.png", audioSrc:"", difficulty:"medium", otherNames:[]},
  {word:"समुद्रः", transliteration:"Samudra", translation:"Ocean", imageSrc:"/FlashCardMedium/ocean.png", audioSrc:"", difficulty:"medium", otherNames:[]},
  {word:"कालः", transliteration:"Kala", translation:"Time", imageSrc:"/FlashCardMedium/time.png", audioSrc:"", difficulty:"medium", otherNames:[]},
  {word:"राजा", transliteration:"Raja", translation:"King", imageSrc:"/FlashCardMedium/king.png", audioSrc:"", difficulty:"medium", otherNames:[]},
  {word:"रानी", transliteration:"Rani", translation:"Queen", imageSrc:"/FlashCardMedium/queen.png", audioSrc:"", difficulty:"medium", otherNames:[]},
  {word:"बालः", transliteration:"Bala", translation:"Child", imageSrc:"/FlashCardMedium/child.png", audioSrc:"", difficulty:"medium", otherNames:[]},
  {word:"आचार्यः", transliteration:"Acharya", translation:"Teacher", imageSrc:"/FlashCardMedium/teacher.png", audioSrc:"", difficulty:"medium", otherNames:[]},
  
  {word:"आनन्दः", transliteration:"Ananda", translation:"Happiness", imageSrc:"/FlashCardHard/happiness.png", audioSrc:"", difficulty:"hard", otherNames:[]},
  {word:"स्वातन्त्र्यम्", transliteration:"Swatantryam", translation:"Freedom", imageSrc:"/FlashCardHard/freedom.png", audioSrc:"", difficulty:"hard", otherNames:[]},
  {word:"सत्यं", transliteration:"Satya", translation:"Truth", imageSrc:"/FlashCardHard/truth.png", audioSrc:"", difficulty:"hard", otherNames:[]},
  {word:"मनः", transliteration:"Mana", translation:"Mind", imageSrc:"/FlashCardHard/mind.png", audioSrc:"", difficulty:"hard", otherNames:[]},
  {word:"छात्रः", transliteration:"Chatra", translation:"Student", imageSrc:"/FlashCardHard/student.png", audioSrc:"", difficulty:"hard", otherNames:[]},
  {word:"विश्वम्", transliteration:"Vishvam", translation:"Universe", imageSrc:"/FlashCardHard/universe.png", audioSrc:"", difficulty:"hard", otherNames:[]},
  {word:"शक्ति", transliteration:"Shakti", translation:"Energy", imageSrc:"/FlashCardHard/energy.png", audioSrc:"", difficulty:"hard", otherNames:[]},
  {word:"वाक्", transliteration:"Vak", translation:"Speech", imageSrc:"/FlashCardHard/speech.png", audioSrc:"", difficulty:"hard", otherNames:[]},
  {word:"करुणा", transliteration:"Karuna", translation:"Compassion", imageSrc:"/FlashCardHard/compassion.png", audioSrc:"", difficulty:"hard", otherNames:[]},
  {word:"ज्ञानम्", transliteration:"Gyanam", translation:"Knowledge", imageSrc:"/FlashCardHard/knowledge.png", audioSrc:"", difficulty:"hard", otherNames:[]},

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

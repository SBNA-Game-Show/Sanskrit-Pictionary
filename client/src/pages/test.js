import '../reusableComponents/flashcard.css';
import './test.css';
import { useNavigate } from 'react-router-dom';
import UserCard from '../reusableComponents/usercard';
import Button from '../reusableComponents/button';
import InputBox from '../reusableComponents/inputbox';
import Flashcard from '../reusableComponents/flashcard';
import Chat from '../reusableComponents/chat';
import WordHistory from '../reusableComponents/wordhistory';




const words = [
  {
    word: "पुस्तकम्‌",
    transliteration: "Pustakam",
    translation: "Book",
    audioSrc: "",
    imageSrc: "books.png"
  },
  {
    word: "पुस्तकम्‌",
    transliteration: "Pustakam",
    translation: "Book",
    audioSrc: "",
    imageSrc: "books.png"
  },
  {
    word: "पुस्तकम्‌",
    transliteration: "Pustakam",
    translation: "Book",
    audioSrc: "",
    imageSrc: "books.png"
  },
  {
    word: "पुस्तकम्‌",
    transliteration: "Pustakam",
    translation: "Book",
    audioSrc: "",
    imageSrc: "books.png"
  },
  {
    word: "पुस्तकम्‌",
    transliteration: "Pustakam",
    translation: "Book",
    audioSrc: "",
    imageSrc: "books.png"
  },
]

const Test = () => {

  const navigate = useNavigate();

  return (
    <div className='mid'>
        <h2>Quality Assurance | Reusable Components</h2>

        <h3>Reusable Usercard Test</h3>
        <UserCard imageSrc="avatar2.png" name="Oz" points="15" />

        <h3>Reusable Button Test</h3>
        <Button label="Test Button" height="50px" width="120px" onClick={() => navigate('/welcome')} />

        <h3>Reusable Input Box Test</h3>
        <InputBox label = "Test Input Box" placeholder="Type the password" width = "250px" height = "30px" />

        <h3>Reusable Flashcard Test</h3>
        <Flashcard items={words}/>

        <h3>Reusable Chat-Box Test</h3>
        <Chat />

        <h3>Reusable Wordhistory Test</h3>
        <WordHistory history={words} />
        
    </div>
  );
};

export default Test;
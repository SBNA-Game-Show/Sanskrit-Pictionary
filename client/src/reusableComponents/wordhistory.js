import './wordhistory.css';
import Flashcard from './flashcard';

const WordHistory = ({ history }) => {
  return (
  <div id="wordhistory" className="word-history-container">
    <div className="word-history-header">
    <a className="word-history-title">Word History</a>
    </div>
    <div className="word-history-list">
      {history.map((item, index) => (
        <Flashcard
          key={index}
          items={[item]}
          compact={true}
        />
      ))}
    </div>
  </div>
  );
};

export default WordHistory;
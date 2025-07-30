import './wordhistory.css';
import Flashcard from './flashcard';
import html2pdf from 'html2pdf.js';

const WordHistory = ({ history }) => {

  const handleDownload = () => {
   const elementToDownload = document.getElementById('wordhistory');
   const opt = {
        jsPDF:{ unit: 'in', format: 'letter', orientation: 'landscape' }
    }
    if (elementToDownload) {
      html2pdf().set(opt).from(elementToDownload).save('SanskritStudySheet');
    } else {
      console.error('Element not found for PDF download');
    }
  };

  return (
  <div id="wordhistory" className="word-history-container">
    <div className="word-history-header">
    <a className="word-history-title">Word History</a>
    <button className="download-button" onClick={handleDownload}>Download</button>
    </div>
    <div className="word-history-list">
      {history.map((item, index) => (
        <Flashcard
          key={index}
          items={[item]}
        />
      ))}
    </div>
  </div>
  );
};

export default WordHistory;
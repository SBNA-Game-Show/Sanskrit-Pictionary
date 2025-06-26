import './welcome.css';
import { useNavigate } from 'react-router-dom';

function Welcome() {

  const navigate = useNavigate();

  return(
    <div className="welcome-wrapper">
      <div className="welcome-card">
        <img src="/books.png" alt="Books" className="welcome-image" />
        <h1 className="welcome-title">Sanskrit Pictionary</h1>
        <div className="welcome-buttons">
          <button className="welcome-button" onClick={() => navigate('/lobby')}>Play as Guest</button>
          <button className="welcome-button" onClick={() => navigate('/signin')}>Sign In & Sign Up</button>
        </div>
      </div>
    </div>
  );
}

export default Welcome;

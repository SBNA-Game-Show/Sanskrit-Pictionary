import './signup.css';
import { useNavigate } from 'react-router-dom';

function Signup() {
    const navigate = useNavigate();

    const handleSubmit = (e) => {
    e.preventDefault();
    navigate("/lobby"); 
    };

    return (
    <>
      <div className="signupContainer">
        <form className="signupForm" onSubmit={handleSubmit}>
          <h2>Create Account</h2>
          
          <label htmlFor="username">Username</label>
          <input type="text" id="username" placeholder="Enter username" required />

          <label htmlFor="password">Password</label>
          <input type="password" id="password" placeholder="Enter password" required />

          <label htmlFor="confirmPassword">Confirm Password</label>
          <input type="password" id="confirmPassword" placeholder="Confirm password" required />

          <button type="submit">Sign Up</button>

          <p className="loginRedirect">
            Already signed up?{' '}
            <span onClick={() => navigate('/welcome')} className="loginLink">
              Click here to Login
            </span>
          </p>
        </form>
      </div>
    </>
    );
}

export default Signup;
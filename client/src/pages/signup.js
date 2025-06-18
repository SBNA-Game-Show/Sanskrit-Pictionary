import './signup.css';
import { useNavigate } from 'react-router-dom';

function Signup() {
    const navigate = useNavigate();

    const handleSubmit = (e) => {
    e.preventDefault();
    navigate("/lobby"); 
    };

    return(
    <>
      <div className="signupContainer">
        <form className="signupForm" onSubmit={handleSubmit}>
          <h2>Sign Up</h2>
          
          <label htmlFor="email">Email</label>
          <input type="text" id="email" placeholder="Enter email" required />

          <label htmlFor="password">Password</label>
          <input type="password" id="password" placeholder="Enter password" required />

          <label htmlFor="confirmPassword">Confirm Password</label>
          <input type="password" id="confirmPassword" placeholder="Confirm password" required />

          <button type="submit">Sign up</button>

          <p className="loginRedirect">
            Already signed up?{' '}
            <span onClick={() => navigate('/signin')} className="loginLink">
              Click here to Sign in
            </span>
          </p>
        </form>
      </div>
    </>
    );
}

export default Signup;
import './signin.css';
import { useNavigate } from 'react-router-dom';

function Signin() {
    const navigate = useNavigate();

    const handleSubmit = (e) => {
    e.preventDefault();
    navigate("/lobby"); 
    };

    return(
    <>
      <div className="signinContainer">
        <form className="signinForm" onSubmit={handleSubmit}>
          <h2>Sign In</h2>
          
          <label htmlFor="email">Email</label>
          <input type="text" id="email" placeholder="Enter email" required />

          <label htmlFor="password">Password</label>
          <input type="password" id="password" placeholder="Enter password" required />

          <button type="submit">Sign in</button>

          <p className="signupRedirect">
            Have not signed up, yet?{' '}
            <span onClick={() => navigate('/signup')} className="signupLink">
              Click here to Sign up
            </span>
          </p>
        </form>
      </div>
    </>
    );
}

export default Signin;
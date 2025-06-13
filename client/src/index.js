import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />

    <footer className='footer'>
      <p><img className='logo' src="whatsapp.png"/><a href="https://wa.me/13654440424" target='_blank'>Contact us @Whatsapp </a></p>
      <p>&#169; 2025 Samskrita Bharati. All Rights Reserved.</p>
    </footer>
  </React.StrictMode>

);



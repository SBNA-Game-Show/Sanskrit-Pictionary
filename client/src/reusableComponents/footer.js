import './footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <p>
        <img className="logo" src="/whatsapp.png" alt="WhatsApp Logo" />
        <a href="https://wa.me/13654440424" target="_blank" rel="noopener noreferrer" style={{color: "rgb(238, 115, 7)"}}>
          Contact us @Whatsapp
        </a>
      </p>
      <p>© 2025 Samskrita Bharati. All Rights Reserved.</p>
    </footer>
  );
};

export default Footer;

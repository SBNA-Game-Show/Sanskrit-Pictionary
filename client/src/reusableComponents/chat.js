import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import './chat.css';

const Chat = () => {
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);

useEffect(() => {
  if (!socket) {
    //const username = prompt('Enter your username:') || 'Anonymous';
    setUsername(username);

    const newSocket = io('https://chat-box-backend-ipno.onrender.com');
    setSocket(newSocket);

    newSocket.emit('setName', username);
    
    newSocket.on('connect', () => {
      console.log('Socket connected');
    });

    newSocket.on('message', (msg) => {
      console.log('Received message:', msg);
      setMessages((prev) => [...prev, msg]);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
    });
    newSocket.on('error', (err) => {
      console.error('Socket error:', err);
    });

    return () => {
      console.log('Cleaning up socket');
      newSocket.disconnect();
    };
  }
}, [socket]);


  const handleSend = () => {
    if (message.trim() !== '' && socket) {
      socket.emit('message', message);
      setMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div className="chat-container">
      <h2>Chat</h2>
      <ul id="messages">
        {messages.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
      </ul>
      <div className="input-area">
        <input
          type="text"
          placeholder="Type message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyPress}
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
};

export default Chat;
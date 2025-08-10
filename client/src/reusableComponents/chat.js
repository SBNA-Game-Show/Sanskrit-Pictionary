import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../pages/socket"; // adjust path if needed
import "./chat.css";

const Chat = ({ myUserId, myDisplayName, myTeam }) => {
  const { roomId } = useParams(); // pulls from URL if in Play page
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // Fetch chat history when component mounts
    socket.emit("getChatHistory", { roomId });
    socket.on("chatHistory", (msgs) => {
      setMessages(msgs);
    });

    // Listen for new chat messages
    socket.on("chat", (msgObj) => {
      setMessages((prev) => [...prev, msgObj]);
    });

    return () => {
      socket.off("chatHistory");
      socket.off("chat");
    };
  }, [roomId]);

  const handleSend = () => {
    if (!message.trim()) return;
    socket.emit("chat", {
      roomId,
      userId: myUserId,
      displayName: myDisplayName,
      team: myTeam,
      message
    });
    setMessage("");
  };

  return (
    <div className="chat-container">
      <h2>Lobby Chat</h2>
      <ul id="messages">
        {messages.map((msg, i) => (
          <li key={i}>
            <span style={{
              color: msg.team === "Red" ? "crimson" : msg.team === "Blue" ? "royalblue" : "#222",
              fontWeight: "bold"
            }}>
              {msg.displayName}
            </span>: {msg.message}
          </li>
        ))}
      </ul>
      <div className="input-area">
        <input
          type="text"
          placeholder="Type message"
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
};

export default Chat;

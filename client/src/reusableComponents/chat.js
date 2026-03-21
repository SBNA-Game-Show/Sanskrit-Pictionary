import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../pages/socket";
import { useNavigate } from "react-router-dom";
import "./chat.css";
import { toastError, toastWarning } from "../utils/toast";

const Chat = ({ myUserId, myDisplayName, myTeam }) => {
  const { roomId } = useParams(); // pulls from URL if in Play page
  const navigate = useNavigate();
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
      console.log("Received chat message:", msgObj); // 👈 Log incoming
      setMessages((prev) => [...prev, msgObj]);
    });

    // Handle warnings and kicks
    socket.on("chatWarning", ({ message, violationCount }) => {
      if (violationCount === 1) {
        toastWarning(message, { autoClose: 3500 });
      } else if (violationCount === 2) {
        toastError(message, { autoClose: 4500 });
      }
    });

    socket.on("chatKicked", ({ message }) => {
      toastError(message, { autoClose: false });
      navigate("/lobby");
    });

    socket.on("userKickedForProfanity", ({ displayName, message }) => {
      toastWarning(message, { autoClose: 3500 });
    });

    return () => {
      socket.off("chatHistory");
      socket.off("chat");
      socket.off("chatWarning");
      socket.off("chatKicked");
      socket.off("userKickedForProfanity");
    };
  }, [roomId, navigate]);

  const handleSend = () => {
    if (!message.trim()) return;
    const msgObj = {
      roomId,
      userId: myUserId,
      displayName: myDisplayName,
      team: myTeam,
      message,
    };
    console.log("Sending chat message:", msgObj); // 👈 Logs to console every send
    socket.emit("chat", msgObj);
    setMessage("");
  };

  return (
    <div className="chat-container">
      <h2>Lobby Chat</h2>
      <ul id="messages">
        {messages.map((msg, i) => (
          <li key={i}>
            <span
              style={{
                color:
                  msg.team === "Red"
                    ? "crimson"
                    : msg.team === "Blue"
                      ? "royalblue"
                      : "#222",
                fontWeight: "bold",
              }}
            >
              {msg.displayName}
            </span>
            : {msg.message}
          </li>
        ))}
      </ul>
      <div className="input-area">
        <input
          type="text"
          placeholder="Type message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
};

export default Chat;

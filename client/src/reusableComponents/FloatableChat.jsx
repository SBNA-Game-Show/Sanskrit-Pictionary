import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../pages/socket";
import "./FloatableChat.css";

const FloatableChat = ({ myUserId, myDisplayName, myTeam }) => {
  const { roomId } = useParams();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({
    x: window.innerWidth - 370,
    y: 100,
  });
  const [size, setSize] = useState({ width: 350, height: 450 });

  const chatRef = useRef(null);
  const messagesEndRef = useRef(null);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Fetch chat history
    socket.emit("getChatHistory", { roomId });
    socket.on("chatHistory", (msgs) => {
      setMessages(msgs);
    });

    // Listen for new messages
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
    const msgObj = {
      roomId,
      userId: myUserId,
      displayName: myDisplayName,
      team: myTeam,
      message,
    };
    socket.emit("chat", msgObj);
    setMessage("");
  };

  // Dragging logic
  const handleMouseDown = (e) => {
    if (
      e.target.closest(".chat-header") &&
      !e.target.closest(".header-actions")
    ) {
      isDragging.current = true;
      dragStart.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging.current) {
      setPosition({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }

    if (isResizing.current) {
      const newWidth =
        resizeStart.current.width + (e.clientX - resizeStart.current.x);
      const newHeight =
        resizeStart.current.height + (e.clientY - resizeStart.current.y);

      setSize({
        width: Math.max(300, Math.min(600, newWidth)),
        height: Math.max(350, Math.min(700, newHeight)),
      });
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    isResizing.current = false;
  };

  const handleResizeStart = (e) => {
    e.stopPropagation();
    isResizing.current = true;
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    };
  };

  useEffect(() => {
    if (isDragging.current || isResizing.current) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [position, size]);

  // Toggle minimize/maximize
  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  return (
    <>
      {/* Floating Chat Window */}
      {!isMinimized && (
        <div
          ref={chatRef}
          className="floatable-chat"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: `${size.width}px`,
            height: `${size.height}px`,
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Header */}
          <div className="chat-header">
            <span className="chat-title">💬 Game Chat</span>
            <div className="header-actions">
              <button
                className="minimize-btn"
                onClick={toggleMinimize}
                title="Minimize"
              >
                ➖
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className="chat-message">
                <span
                  className="message-author"
                  style={{
                    color:
                      msg.team === "Red"
                        ? "crimson"
                        : msg.team === "Blue"
                          ? "royalblue"
                          : "#222",
                  }}
                >
                  {msg.displayName}:
                </span>
                <span className="message-text">{msg.message}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-area">
            <input
              type="text"
              placeholder="Type message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button onClick={handleSend}>Send</button>
          </div>

          {/* Resize Handle */}
          <div className="resize-handle" onMouseDown={handleResizeStart}>
            ⋰
          </div>
        </div>
      )}

      {/* Minimized Chat Icon (Bottom Right) */}
      {isMinimized && (
        <button
          className="chat-icon-btn"
          onClick={toggleMinimize}
          title="Open Chat"
        >
          💬
          {messages.length > 0 && (
            <span className="unread-badge">{messages.length}</span>
          )}
        </button>
      )}
    </>
  );
};

export default FloatableChat;

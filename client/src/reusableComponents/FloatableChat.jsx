import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../pages/socket";
import "./FloatableChat.css";

const FloatableChat = ({ myUserId, myDisplayName, myTeam }) => {
  const { roomId } = useParams();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isMinimized, setIsMinimized] = useState(true);
  const [position, setPosition] = useState({
    x: window.innerWidth - 370,
    y: 100,
  });
  const [size, setSize] = useState({ width: 350, height: 450 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const chatRef = useRef(null);
  const messagesEndRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });
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
      setUnreadCount(0);
    });

    // Listen for new messages
    socket.on("chat", (msgObj) => {
      setMessages((prev) => [...prev, msgObj]);

      if (isMinimized && msgObj.userId !== myUserId) {
        setUnreadCount((prev) => prev + 1);
      }
    });

    return () => {
      socket.off("chatHistory");
      socket.off("chat");
    };
  }, [roomId, isMinimized, myUserId]);

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

  // Constrain position within window boundaries
  const constrainPosition = (x, y, width, height) => {
    const maxX = window.innerWidth - width;
    const maxY = window.innerHeight - height;

    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY)),
    };
  };

  // Dragging logic
  const handleDragStart = (e) => {
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "BUTTON" ||
      e.target.classList.contains("resize-handle") ||
      e.target.classList.contains("minimize-btn")
    ) {
      return;
    }

    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  // Resize start
  const handleResizeStart = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    };
  };

  // Mouse move handler
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.current.x;
        const newY = e.clientY - dragOffset.current.y;

        const constrained = constrainPosition(
          newX,
          newY,
          size.width,
          size.height,
        );
        setPosition(constrained);
      }

      if (isResizing) {
        const newWidth =
          resizeStart.current.width + (e.clientX - resizeStart.current.x);
        const newHeight =
          resizeStart.current.height + (e.clientY - resizeStart.current.y);

        const constrainedWidth = Math.max(300, Math.min(600, newWidth));
        const constrainedHeight = Math.max(350, Math.min(700, newHeight));

        setSize({
          width: constrainedWidth,
          height: constrainedHeight,
        });

        const constrained = constrainPosition(
          position.x,
          position.y,
          constrainedWidth,
          constrainedHeight,
        );
        setPosition(constrained);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, isResizing, position, size]);

  // Re-constrain position on window resize
  useEffect(() => {
    const handleWindowResize = () => {
      const constrained = constrainPosition(
        position.x,
        position.y,
        size.width,
        size.height,
      );
      setPosition(constrained);
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [position, size]);

  const toggleMinimize = () => {
    if (isMinimized) {
      setUnreadCount(0);
    }
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
            cursor: isDragging ? "grabbing" : "grab",
          }}
          onMouseDown={handleDragStart}
        >
          {/* Header */}
          <div className="chat-header">
            <span className="chat-title">💬 Game Chat</span>
            <div className="header-actions">
              <button
                className="minimize-btn"
                onClick={toggleMinimize}
                title="Minimize"
                onMouseDown={(e) => e.stopPropagation()}
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
              onMouseDown={(e) => e.stopPropagation()}
            />
            <button
              onClick={handleSend}
              onMouseDown={(e) => e.stopPropagation()}
            >
              Send
            </button>
          </div>

          {/* Resize Handle */}
          <div
            className="resize-handle"
            onMouseDown={handleResizeStart}
            title="Drag to resize"
          >
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
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount}</span>
          )}
        </button>
      )}
    </>
  );
};

export default FloatableChat;

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { AuthModal } from "../components/AuthModal";
import { CreateChatModal } from "../components/CreateChatModal";
import { SettingsModal } from "../components/SettingsModal";
import { ConversationInfoModal } from "../components/ConversationInfoModal";

// --- Type Definitions ---
interface User {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
}

interface Member {
  id: number;
  user_id: string;
  is_admin: boolean;
  user: User;
}

interface Reaction {
  id: number;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface Receipt {
  id: number;
  message_id: string;
  user_id: string;
  status: string;
  updated_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender?: User | null;
  content: string | null;
  message_type: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  reply_to_id: string | null;
  reply_to?: {
    id: string;
    content: string | null;
    message_type: string;
    sender_id: string | null;
  } | null;
  created_at: string;
  receipts: Receipt[];
  reactions: Reaction[];
}

interface Conversation {
  id: string;
  name: string | null;
  is_group: boolean;
  avatar_url: string | null;
  disappearing_time: number;
  members: Member[];
  last_message: Message | null;
  unread_count: number;
}

export default function Home() {
  // --- Authentication State ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // --- Conversations and Chat Feed State ---
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(true);

  // --- Input & Reply States ---
  const [inputValue, setInputValue] = useState("");
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<{ [convId: string]: { [userId: string]: boolean } }>({});
  
  // --- Modals State ---
  const [showCreateChat, setShowCreateChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showConvInfo, setShowConvInfo] = useState(false);

  // --- UI Animation & Refreshes ---
  const [ticker, setTicker] = useState(0); // updates every second to tick down disappearing messages
  const [toasts, setToasts] = useState<string[]>([]);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isTypingLocal, setIsTypingLocal] = useState(false);

  // --- Load Session & Set Theme ---
  useEffect(() => {
    const savedUser = localStorage.getItem("signal_user");
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem("signal_user");
      }
    }
    setAuthChecked(true);

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
  }, []);

  // --- Tick disappearing messages every second ---
  useEffect(() => {
    const interval = setInterval(() => {
      setTicker((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // --- Helper to trigger a visual Toast ---
  const showToast = useCallback((msg: string) => {
    setToasts((prev) => [...prev, msg]);
    setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 3000);
  }, []);

  // --- Fetch Conversations List ---
  const fetchConversations = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch("http://localhost:8000/api/conversations", {
        headers: { "X-User-Id": currentUser.id },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        
        // Update active conversation object references if open
        if (activeConv) {
          const updated = data.find((c: Conversation) => c.id === activeConv.id);
          if (updated) {
            setActiveConv(updated);
          }
        }
      }
    } catch (err) {
      console.warn("Error fetching conversations:", err);
    }
  }, [currentUser, activeConv]);

  // --- Fetch Message History for Active Conversation ---
  const fetchMessages = useCallback(async (convId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`http://localhost:8000/api/conversations/${convId}/messages`, {
        headers: { "X-User-Id": currentUser.id },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
        scrollToBottom();
      }
    } catch (err) {
      console.warn("Error fetching messages:", err);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchConversations();
    }
  }, [currentUser]);

  useEffect(() => {
    if (activeConv) {
      fetchMessages(activeConv.id);
      
      // Update unread count locally in list
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConv.id ? { ...c, unread_count: 0 } : c))
      );
    } else {
      setMessages([]);
    }
  }, [activeConv?.id]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  // --- WebSocket Callback Event Router ---
  const handleWebSocketEvent = useCallback((event: any) => {
    const { type, conversation_id } = event;

    if (type === "message") {
      const { message } = event;
      // If we are currently viewing this conversation
      if (activeConv && activeConv.id === conversation_id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        scrollToBottom();
        
        // Notify backend we read it
        sendEvent({
          type: "receipt",
          conversation_id: activeConv.id,
          message_id: message.id,
          status: "read",
        });
      } else {
        // Increment unread count in conversations list
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversation_id ? { ...c, unread_count: c.unread_count + 1, last_message: message } : c
          )
        );
        
        // Send 'delivered' receipt immediately
        sendEvent({
          type: "receipt",
          conversation_id: conversation_id,
          message_id: message.id,
          status: "delivered",
        });

        // Trigger notification toast
        const senderName = message.sender?.display_name || message.sender?.username || "Someone";
        showToast(`New message from ${senderName}`);
      }
      fetchConversations();
    } 
    
    else if (type === "typing") {
      const { user_id, is_typing } = event;
      setTypingUsers((prev) => {
        const convTyping = prev[conversation_id] || {};
        return {
          ...prev,
          [conversation_id]: {
            ...convTyping,
            [user_id]: is_typing,
          },
        };
      });
    } 
    
    else if (type === "receipt") {
      const { message_id, user_id, status } = event;
      if (activeConv && activeConv.id === conversation_id) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== message_id) return msg;
            // Update or add receipt
            const existingReceiptIdx = msg.receipts.findIndex((r) => r.user_id === user_id);
            const updatedReceipts = [...msg.receipts];
            if (existingReceiptIdx > -1) {
              updatedReceipts[existingReceiptIdx] = {
                ...updatedReceipts[existingReceiptIdx],
                status,
                updated_at: new Date().toISOString(),
              };
            } else {
              updatedReceipts.push({
                id: Date.now(),
                message_id,
                user_id,
                status,
                updated_at: new Date().toISOString(),
              });
            }
            return { ...msg, receipts: updatedReceipts };
          })
        );
      }
      fetchConversations();
    } 
    
    else if (type === "reaction") {
      const { message_id, user_id, emoji, action } = event;
      if (activeConv && activeConv.id === conversation_id) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== message_id) return msg;
            let updatedReactions = [...msg.reactions];
            if (action === "remove") {
              updatedReactions = updatedReactions.filter(
                (r) => !(r.user_id === user_id && r.emoji === emoji)
              );
            } else {
              if (!updatedReactions.some((r) => r.user_id === user_id && r.emoji === emoji)) {
                updatedReactions.push({ id: Date.now(), message_id, user_id, emoji });
              }
            }
            return { ...msg, reactions: updatedReactions };
          })
        );
      }
    } 
    
    else if (type === "status") {
      const { user_id, is_online } = event;
      // Refresh conversations list to update status markers
      setConversations((prev) =>
        prev.map((c) => {
          const updatedMembers = c.members.map((m) =>
            m.user_id === user_id ? { ...m, user: { ...m.user, is_online } } : m
          );
          return { ...c, members: updatedMembers };
        })
      );
      if (activeConv) {
        setActiveConv((prev) => {
          if (!prev) return null;
          const updatedMembers = prev.members.map((m) =>
            m.user_id === user_id ? { ...m, user: { ...m.user, is_online } } : m
          );
          return { ...prev, members: updatedMembers };
        });
      }
    }
  }, [activeConv, fetchConversations]);

  // --- Connect WebSocket Hook ---
  const { isConnected, sendEvent } = useWebSocket({
    userId: currentUser ? currentUser.id : null,
    onEventReceived: handleWebSocketEvent,
  });

  // --- Local Handlers ---
  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem("signal_user", JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveConv(null);
    setConversations([]);
    localStorage.removeItem("signal_user");
    showToast("Signed out successfully");
    setShowSettings(false);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setReplyTarget(null);
        setShowCreateChat(false);
        setShowSettings(false);
        setShowConvInfo(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --- Typing indicator throttling ---
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    if (!activeConv || !currentUser) return;

    if (!isTypingLocal) {
      setIsTypingLocal(true);
      sendEvent({
        type: "typing",
        conversation_id: activeConv.id,
        is_typing: true,
      });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      setIsTypingLocal(false);
      sendEvent({
        type: "typing",
        conversation_id: activeConv.id,
        is_typing: false,
      });
    }, 2500);
  };

  // --- Send Message ---
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || !activeConv || !currentUser) return;

    const payload = {
      content: inputValue.trim(),
      message_type: "text",
      reply_to_id: replyTarget ? replyTarget.id : null,
    };

    setInputValue("");
    setReplyTarget(null);

    // Stop local typing indicator
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setIsTypingLocal(false);
    sendEvent({
      type: "typing",
      conversation_id: activeConv.id,
      is_typing: false,
    });

    try {
      const res = await fetch(`http://localhost:8000/api/conversations/${activeConv.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": currentUser.id,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        scrollToBottom();
        fetchConversations();
      }
    } catch (err) {
      console.warn("Failed to send message:", err);
    }
  };

  // --- File Upload Attachment ---
  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeConv || !currentUser) return;

    const file = files[0];
    const formData = new FormData();
    formData.append("file", file);

    setLoadingState(true);
    try {
      // 1. Upload file
      const uploadRes = await fetch(`http://localhost:8000/api/conversations/${activeConv.id}/upload`, {
        method: "POST",
        headers: { "X-User-Id": currentUser.id },
        body: formData,
      });
      const fileData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(fileData.detail || "Upload failed");

      // 2. Send message with attachment
      const messagePayload = {
        content: `Sent an attachment: ${file.name}`,
        message_type: "attachment",
        attachment_url: fileData.url,
        attachment_name: fileData.name,
        attachment_size: fileData.size,
        reply_to_id: replyTarget ? replyTarget.id : null,
      };

      const msgRes = await fetch(`http://localhost:8000/api/conversations/${activeConv.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": currentUser.id,
        },
        body: JSON.stringify(messagePayload),
      });

      if (msgRes.ok) {
        const msg = await msgRes.json();
        setMessages((prev) => [...prev, msg]);
        setReplyTarget(null);
        scrollToBottom();
        fetchConversations();
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingState(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const [loadingState, setLoadingState] = useState(false);

  // --- Toggle Reaction ---
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`http://localhost:8000/api/messages/${messageId}/reactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": currentUser.id,
        },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const updatedReactions = await res.json();
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, reactions: updatedReactions } : msg))
        );
      }
    } catch (err) {
      console.warn("Failed to react:", err);
    }
  };

  // --- Disappearing message visibility computation ---
  // Return filtered list of messages that have not yet vanished visually
  const getVisibleMessages = () => {
    if (!activeConv || activeConv.disappearing_time === 0) return messages;

    const now = Date.now();
    return messages.filter((msg) => {
      // Find read receipts (excluding sender)
      const readReceipts = msg.receipts.filter((r) => r.status === "read" && r.user_id !== msg.sender_id);
      if (readReceipts.length === 0) return true; // not read yet, so keep visible

      // Find time it was read
      const readTime = Math.min(...readReceipts.map((r) => new Date(r.updated_at).getTime()));
      const elapsedSeconds = (now - readTime) / 1000;
      return elapsedSeconds < activeConv.disappearing_time;
    });
  };

  const getDisappearingRemainingSeconds = (msg: Message) => {
    if (!activeConv || activeConv.disappearing_time === 0) return null;
    const readReceipts = msg.receipts.filter((r) => r.status === "read" && r.user_id !== msg.sender_id);
    if (readReceipts.length === 0) return null;

    const readTime = Math.min(...readReceipts.map((r) => new Date(r.updated_at).getTime()));
    const elapsedSeconds = (Date.now() - readTime) / 1000;
    const remaining = Math.max(0, activeConv.disappearing_time - elapsedSeconds);
    return Math.ceil(remaining);
  };

  // --- Get Direct Chat Partner Profile ---
  const getChatPartner = (conv: Conversation) => {
    if (conv.is_group || !currentUser) return null;
    const partner = conv.members.find((m) => m.user_id !== currentUser.id);
    return partner ? partner.user : null;
  };

  // --- Render Ticks for Receipts ---
  const renderMessageReceipt = (msg: Message) => {
    if (msg.sender_id !== currentUser?.id) return null;

    // Find receipt count/statuses
    const otherReceipts = msg.receipts.filter((r) => r.user_id !== currentUser.id);
    if (otherReceipts.length === 0) return <span style={{ fontSize: "12px", opacity: 0.6 }}>✓</span>;

    const isRead = otherReceipts.every((r) => r.status === "read");
    const isDelivered = otherReceipts.some((r) => r.status === "delivered" || r.status === "read");

    if (isRead) {
      return <span style={{ color: "#3b82f6", fontWeight: "bold", fontSize: "12px" }}>✓✓</span>;
    }
    if (isDelivered) {
      return <span style={{ opacity: 0.8, fontSize: "12px" }}>✓✓</span>;
    }
    return <span style={{ opacity: 0.6, fontSize: "12px" }}>✓</span>;
  };

  // Filter conversations based on search
  const filteredConversations = conversations.filter((c) => {
    if (c.is_group) {
      return c.name?.toLowerCase().includes(searchText.toLowerCase());
    } else {
      const partner = getChatPartner(c);
      return partner?.display_name?.toLowerCase().includes(searchText.toLowerCase()) || 
             partner?.username?.includes(searchText);
    }
  });

  if (!authChecked) {
    return <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyItems: "center", color: "var(--text-secondary)" }}>Loading Signal...</div>;
  }

  if (!currentUser) {
    return <AuthModal onAuthSuccess={handleAuthSuccess} />;
  }

  const activeChatPartner = activeConv ? getChatPartner(activeConv) : null;
  const activeChatTitle = activeConv
    ? activeConv.is_group
      ? activeConv.name
      : activeChatPartner?.display_name || activeChatPartner?.username
    : "";

  const activeChatSub = activeConv
    ? activeConv.is_group
      ? `${activeConv.members.length} members`
      : activeChatPartner?.is_online
      ? "Online"
      : "Offline"
    : "";

  // Typing indicator calculation
  const getTypingStatusString = (convId: string) => {
    const activeTypers = typingUsers[convId] || {};
    const typingIds = Object.keys(activeTypers).filter((uid) => activeTypers[uid]);
    if (typingIds.length === 0) return null;

    if (activeConv?.is_group) {
      const names = typingIds
        .map((uid) => activeConv.members.find((m) => m.user_id === uid)?.user.display_name)
        .filter(Boolean);
      if (names.length > 0) return `${names.join(", ")} is typing...`;
    }
    return "typing...";
  };

  const visibleMessages = getVisibleMessages();

  return (
    <div className="app-container">
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast, i) => (
          <div key={i} className="toast">
            {toast}
          </div>
        ))}
      </div>

      {/* Sidebar Section */}
      <div className={`sidebar ${isSidebarOpenMobile ? "" : "hidden"}`}>
        <div className="sidebar-header">
          <div className="sidebar-header-left">
            <button className="user-avatar-btn" onClick={() => setShowSettings(true)}>
              <img
                src={currentUser.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.username}`}
                alt="My Profile"
                className="avatar"
              />
              <span className="online-indicator"></span>
            </button>
            <span className="app-title">Signal</span>
          </div>

          <div className="sidebar-actions">
            <button className="icon-btn" title="New Chat" onClick={() => setShowCreateChat(true)}>
              ✏️
            </button>
            <button className="icon-btn" title="Settings" onClick={() => setShowSettings(true)}>
              ⚙️
            </button>
          </div>
        </div>

        {/* Search Conversation Bar */}
        <div className="search-container">
          <div className="search-wrapper">
            <span>🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search chat or contact..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="chat-list">
          {filteredConversations.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "40px 20px", fontSize: "14px" }}>
              No chats found. Click the pencil icon above to start messaging contacts.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const partner = getChatPartner(conv);
              const isSelected = activeConv?.id === conv.id;
              const typingIndicator = getTypingStatusString(conv.id);

              return (
                <div
                  key={conv.id}
                  className={`chat-item ${isSelected ? "active" : ""}`}
                  onClick={() => {
                    setActiveConv(conv);
                    setIsSidebarOpenMobile(false); // Switch panel on mobile
                  }}
                >
                  {/* Avatar */}
                  {conv.is_group ? (
                    <div className="avatar">
                      {conv.name ? conv.name.substring(0, 2).toUpperCase() : "GP"}
                    </div>
                  ) : (
                    <img
                      src={partner?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${partner?.username}`}
                      alt="Chat Avatar"
                      className="avatar"
                    />
                  )}

                  {/* Info details */}
                  <div className="chat-item-info">
                    <div className="chat-item-row">
                      <span className="chat-item-name">
                        {conv.is_group ? conv.name : partner?.display_name || partner?.username}
                      </span>
                      {conv.last_message && (
                        <span className="chat-item-time">
                          {new Date(conv.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    <div className="chat-item-row">
                      <div className={`chat-item-preview ${conv.unread_count > 0 ? "unread" : ""}`}>
                        {typingIndicator ? (
                          <span style={{ color: "var(--brand-blue)", fontWeight: 600 }}>{typingIndicator}</span>
                        ) : conv.last_message ? (
                          <>
                            {conv.last_message.sender_id === currentUser.id && (
                              <span style={{ marginRight: "4px" }}>{renderMessageReceipt(conv.last_message)}</span>
                            )}
                            {conv.last_message.message_type === "attachment" ? "📎 Attachment" : conv.last_message.content}
                          </>
                        ) : (
                          "No messages yet"
                        )}
                      </div>

                      {/* Right icons (unread count, disappearing clock) */}
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        {conv.disappearing_time > 0 && (
                          <span title="Disappearing messages active" style={{ fontSize: "11px" }}>⏱️</span>
                        )}
                        {conv.unread_count > 0 && (
                          <span className="unread-badge">{conv.unread_count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Feed Section */}
      <div className="chat-pane">
        {activeConv ? (
          <>
            {/* Chat header info */}
            <div className="chat-header">
              <div className="chat-header-left">
                <button
                  className="icon-btn back-btn"
                  onClick={() => setIsSidebarOpenMobile(true)}
                  style={{ marginRight: "4px" }}
                >
                  ←
                </button>
                <div onClick={() => setShowConvInfo(true)} style={{ display: "flex", gap: "10px", alignItems: "center", cursor: "pointer" }}>
                  {activeConv.is_group ? (
                    <div className="avatar avatar-small">
                      {activeConv.name ? activeConv.name.substring(0, 2).toUpperCase() : "GP"}
                    </div>
                  ) : (
                    <img
                      src={activeChatPartner?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${activeChatPartner?.username}`}
                      alt="Chat Avatar"
                      className="avatar avatar-small"
                    />
                  )}
                  <div className="chat-header-info">
                    <span className="chat-header-title">{activeChatTitle}</span>
                    <span className="chat-header-status">
                      {getTypingStatusString(activeConv.id) || activeChatSub}
                    </span>
                  </div>
                </div>
              </div>

              <div className="chat-header-actions">
                {activeConv.disappearing_time > 0 && (
                  <div className="disappearing-timer-indicator" title={`Disappearing messages set to ${activeConv.disappearing_time}s`}>
                    <span className="disappearing-hourglass">⏳</span>
                    <span>{activeConv.disappearing_time}s</span>
                  </div>
                )}
                <button className="icon-btn" title="View details" onClick={() => setShowConvInfo(true)}>
                  ℹ️
                </button>
              </div>
            </div>

            {/* Scrolling Messages thread */}
            <div className="messages-thread">
              {visibleMessages.length === 0 ? (
                <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                  <span style={{ fontSize: "36px", marginBottom: "10px" }}>🔒</span>
                  <div style={{ fontWeight: 600, fontSize: "14px" }}>End-to-end encrypted</div>
                  <div style={{ fontSize: "12px", textAlign: "center", maxWidth: "250px", marginTop: "4px" }}>
                    Messages you send are secured locally. No third party can read them.
                  </div>
                </div>
              ) : (
                visibleMessages.map((msg) => {
                  const isSentByMe = msg.sender_id === currentUser.id;
                  const isHovered = hoveredMessageId === msg.id;
                  const remainingSecs = getDisappearingRemainingSeconds(msg);

                  return (
                    <div
                      key={msg.id}
                      className="message-bubble-wrapper"
                      onMouseEnter={() => setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                    >
                      <div className={`message-row ${isSentByMe ? "sent" : "received"}`}>
                        
                        {/* Hover emoji react drawer */}
                        {isHovered && (
                          <div
                            style={{
                              display: "flex",
                              gap: "4px",
                              backgroundColor: "var(--bg-sidebar)",
                              border: "1px solid var(--border-color)",
                              borderRadius: "20px",
                              padding: "4px 8px",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                              alignSelf: "center",
                              margin: "0 10px",
                              zIndex: 10,
                              animation: "fadeIn 0.15s ease",
                            }}
                          >
                            {["❤️", "👍", "👎", "😂", "😮", "😢"].map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => handleToggleReaction(msg.id, emoji)}
                                style={{ fontSize: "15px", padding: "2px" }}
                                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.3)")}
                                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                              >
                                {emoji}
                              </button>
                            ))}
                            <button
                              onClick={() => setReplyTarget(msg)}
                              title="Reply"
                              style={{ fontSize: "12px", borderLeft: "1px solid var(--border-color)", paddingLeft: "6px", marginLeft: "2px" }}
                            >
                              ↩️
                            </button>
                          </div>
                        )}

                        <div className="message-bubble">
                          {/* Sender name for Group chats */}
                          {activeConv.is_group && !isSentByMe && msg.sender && (
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--brand-blue)", marginBottom: "4px" }}>
                              {msg.sender.display_name || msg.sender.username}
                            </span>
                          )}

                          {/* Render reply quoted message if reference exists */}
                          {msg.reply_to && (
                            <div className="message-reply-preview">
                              <span style={{ fontWeight: 600 }}>
                                {msg.reply_to.sender_id === currentUser.id ? "You" : "Reply"}
                              </span>
                              :{" "}
                              {msg.reply_to.message_type === "attachment"
                                ? "📎 Attachment"
                                : msg.reply_to.content}
                            </div>
                          )}

                          {/* Render image attachment if valid */}
                          {msg.message_type === "attachment" && msg.attachment_url && (
                            <div className="attachment-preview-box">
                              {msg.attachment_url.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) ? (
                                <img
                                  src={`http://localhost:8000${msg.attachment_url}`}
                                  alt={msg.attachment_name || "Attachment"}
                                  className="attachment-image"
                                />
                              ) : (
                                <a
                                  href={`http://localhost:8000${msg.attachment_url}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="attachment-file-box"
                                >
                                  📄 {msg.attachment_name || "Attachment File"}
                                </a>
                              )}
                            </div>
                          )}

                          {/* Message Body Content */}
                          <div style={{ wordBreak: "break-word" }}>{msg.content}</div>

                          {/* Message Footer Info */}
                          <div className="message-info-footer">
                            <span>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {/* Visual disappearing visual hourglass countdown */}
                            {remainingSecs !== null && (
                              <span style={{ display: "flex", alignItems: "center", gap: "2px" }} title="Disappearing time left">
                                ⏳ {remainingSecs}s
                              </span>
                            )}
                            {isSentByMe && <span>{renderMessageReceipt(msg)}</span>}
                          </div>

                          {/* Reaction emojis badges list */}
                          {msg.reactions.length > 0 && (
                            <div className="reactions-list">
                              {/* Group reactions by emoji */}
                              {Array.from(new Set(msg.reactions.map((r) => r.emoji))).map((emoji) => {
                                const count = msg.reactions.filter((r) => r.emoji === emoji).length;
                                return (
                                  <div
                                    key={emoji}
                                    className="reaction-badge"
                                    onClick={() => handleToggleReaction(msg.id, emoji)}
                                    title={`${count} reactions`}
                                  >
                                    <span>{emoji}</span>
                                    {count > 1 && <span style={{ marginLeft: "2px", fontSize: "9px" }}>{count}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input controller bar */}
            <div className="chat-input-area">
              {/* Replying to Target Banner */}
              {replyTarget && (
                <div className="reply-banner">
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "11px", color: "var(--brand-blue)", fontWeight: 600 }}>
                      Replying to {replyTarget.sender_id === currentUser.id ? "yourself" : replyTarget.sender?.display_name || "Contact"}
                    </span>
                    <span style={{ fontSize: "12.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "350px" }}>
                      {replyTarget.message_type === "attachment" ? "📎 Attachment" : replyTarget.content}
                    </span>
                  </div>
                  <button onClick={() => setReplyTarget(null)} style={{ fontSize: "16px", padding: "2px 8px" }}>
                    ✕
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="chat-input-row">
                {/* Paperclip attachment triggers */}
                <button
                  type="button"
                  className="icon-btn"
                  title="Attach file"
                  style={{ width: "38px", height: "38px", fontSize: "18px" }}
                  onClick={handleAttachmentClick}
                  disabled={loadingState}
                >
                  📎
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />

                {/* Text Field */}
                <div className="text-input-container">
                  <textarea
                    className="text-input"
                    placeholder="New Message"
                    value={inputValue}
                    onChange={handleInputChange}
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={loadingState}
                  />
                </div>

                <button
                  type="submit"
                  className="send-btn"
                  disabled={!inputValue.trim() || loadingState}
                >
                  ➔
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Empty Chat state page */
          <div className="chat-pane-empty">
            <div className="signal-logo-fallback">💬</div>
            <h2>Welcome to Signal</h2>
            <p style={{ maxWidth: "320px", textAlign: "center", fontSize: "14px" }}>
              Search for your seeded contacts like Bob (username: +15550200) to start private messages.
            </p>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "13px", color: "var(--text-secondary)", marginTop: "10px" }}>
              <span>🔒</span>
              <span>Mock E2E Encrypted</span>
            </div>
          </div>
        )}
      </div>

      {/* Dynamic Modal render triggers */}
      {showCreateChat && (
        <CreateChatModal
          currentUser={currentUser}
          onClose={() => setShowCreateChat(false)}
          onChatCreated={(conv) => {
            setConversations((prev) => {
              if (prev.some((c) => c.id === conv.id)) return prev;
              return [conv, ...prev];
            });
            setActiveConv(conv);
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          currentUser={currentUser}
          onClose={() => setShowSettings(false)}
          onLogout={handleLogout}
          onProfileUpdated={(user) => {
            setCurrentUser(user);
            localStorage.setItem("signal_user", JSON.stringify(user));
          }}
        />
      )}

      {showConvInfo && activeConv && (
        <ConversationInfoModal
          currentUser={currentUser}
          conversation={activeConv}
          onClose={() => setShowConvInfo(false)}
          onConversationUpdated={(conv) => {
            setActiveConv(conv);
            fetchConversations();
          }}
        />
      )}
    </div>
  );
}

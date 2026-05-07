import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { messageApi, userApi } from "../lib/api";
import { encryptPayload, decryptPayload } from "../lib/crypto";
import { motion } from "framer-motion";
import { Send, User as UserIcon, Shield, Search, Loader2, ArrowLeft, MessageSquare, ShieldAlert, Lock, ArrowDown, Check, CheckCheck, CheckCircle2 } from "lucide-react";
import { wsService } from "../lib/websocket";
const Chat = () => {
  const { user, privateKey } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  
  const scrollRef = useRef();
  const textareaRef = useRef(null);

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  };

  const formatDateSeparator = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await messageApi.getConversations();
      const convs = Array.isArray(data) ? data : (data.conversations || []);
      // Normalize: API returns user_id, map to id for consistency
      setConversations(convs.map(c => ({ ...c, id: c.user_id ?? c.id })));
    } catch (err) {
      console.error("Failed to fetch conversations", err);
    }
  }, []);

  const fetchMessages = useCallback(async (userId) => {
    try {
      const { data } = await messageApi.getMessages(userId);
      const msgs = Array.isArray(data) ? data : (data.messages || []);
      
      const decryptedMessages = await Promise.all(
        msgs.map(async (msg) => {
          try {
            const isMine = msg.from_user_id === user.id;
            const encryptedKey = isMine ? msg.payload.encryptedKeyForSelf : msg.payload.encryptedKey;
            const plaintext = await decryptPayload(
              { 
                ciphertext: msg.payload.ciphertext, 
                iv: msg.payload.iv, 
                encryptedKey: encryptedKey 
              },
              privateKey
            );
            return { ...msg, plaintext, decrypted: true };
          } catch (err) {
            console.error("Decryption failed", err);
            return { ...msg, plaintext: "[Encryption Locked]", decrypted: false };
          }
        })
      );
      
      // Reverse messages if backend returns newest first, so they display bottom-up
      setMessages(decryptedMessages.reverse());
    } catch (err) {
      console.error("Failed to fetch messages", err);
    }
  }, [user.id, privateKey]);

  useEffect(() => {
    const loadTimeout = setTimeout(() => {
      fetchConversations();
    }, 0);

    // Poll conversations every 10s
    const convInterval = setInterval(fetchConversations, 10000);
    return () => {
      clearTimeout(loadTimeout);
      clearInterval(convInterval);
    };
  }, [fetchConversations]);

  useEffect(() => {
    if (selectedUser) {
      const loadTimeout = setTimeout(() => {
        fetchMessages(selectedUser.id);
      }, 0);

      // Poll messages every 4s when a conversation is open
      const msgInterval = setInterval(() => fetchMessages(selectedUser.id), 4000);
      return () => {
        clearTimeout(loadTimeout);
        clearInterval(msgInterval);
      };
    }
  }, [selectedUser, fetchMessages, user.id, privateKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (selectedUser) {
      document.body.classList.add('conversation-open');
    } else {
      document.body.classList.remove('conversation-open');
    }
    return () => document.body.classList.remove('conversation-open');
  }, [selectedUser]);

  // WebSocket listeners for real-time messages
  useEffect(() => {
    const handleNewMessage = (msgData) => {
      if (selectedUser && (msgData.from_user_id === selectedUser.id || msgData.to_user_id === selectedUser.id)) {
        const handleDecryption = async () => {
          try {
            const isMine = msgData.from_user_id === user.id;
            const encryptedKey = isMine ? msgData.payload.encryptedKeyForSelf : msgData.payload.encryptedKey;
            const plaintext = await decryptPayload(
              {
                ciphertext: msgData.payload.ciphertext,
                iv: msgData.payload.iv,
                encryptedKey: encryptedKey,
              },
              privateKey
            );
            setMessages((prev) => [...prev, { ...msgData, plaintext, decrypted: true }]);
          } catch (err) {
            console.error("Failed to decrypt incoming message", err);
            setMessages((prev) => [...prev, { ...msgData, plaintext: "[Encryption Locked]", decrypted: false }]);
          }
        };
        handleDecryption();
      } else if (msgData.from_user_id !== user.id) {
        setUnreadCounts(prev => ({
          ...prev,
          [msgData.from_user_id]: (prev[msgData.from_user_id] || 0) + 1
        }));
      }
    };

    const handleUserOnline = (data) => setOnlineUsers(prev => new Set(prev).add(data.user_id));
    const handleUserOffline = (data) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        next.delete(data.user_id);
        return next;
      });
    };

    wsService.on("message", handleNewMessage);
    wsService.on("user.online", handleUserOnline);
    wsService.on("user.offline", handleUserOffline);
    return () => {
      wsService.off("message", handleNewMessage);
      wsService.off("user.online", handleUserOnline);
      wsService.off("user.offline", handleUserOffline);
    };
  }, [selectedUser, user, privateKey]);

  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length > 2) {
      try {
        const { data } = await userApi.searchUsers(query);
        const results = Array.isArray(data) ? data : (data.users || []);
        setSearchResults(results.filter(u => u.id !== user.id));
      } catch (err) {
        console.error("Search failed", err);
      }
    } else {
      setSearchResults([]);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || sending) return;

    const msgText = newMessage.trim();
    setSending(true);

    try {
      // 1. Get recipient's public key
      const { data: recipientKeyData } = await userApi.getPublicKey(selectedUser.id);
      const recipientPublicKey = recipientKeyData.public_key;

      // 2. Encrypt the message (for recipient + for self)
      const encrypted = await encryptPayload(msgText, recipientPublicKey, user.public_key);

      const messagePayload = {
        to: selectedUser.id,
        payload: {
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          encryptedKey: encrypted.encryptedKey,
          encryptedKeyForSelf: encrypted.encryptedKeyForSelf,
        }
      };

      // 3. Always send via REST (reliable, gives us a response)
      await messageApi.sendMessage(messagePayload);

      setNewMessage("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      // Refresh messages and conversation list
      await fetchMessages(selectedUser.id);
      fetchConversations();
    } catch (err) {
      console.error("Failed to send message", err);
      alert("Error sending message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <p>Conversations</p>
          <h2>Messages</h2>
        </div>

        <div className="sidebar-search">
          <Search className="search-icon" size={16} />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>

        <div className="sidebar-list">
          {searchQuery.length > 2 ? (
            <>
              <p className="sidebar-section-label">Search Results</p>
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setSelectedUser(u); setSearchQuery(''); setSearchResults([]); setUnreadCounts(prev => ({ ...prev, [u.id]: 0 })); }}
                  className="conv-item"
                >
                  <div className="avatar">
                    <UserIcon size={18} />
                  </div>
                  <div className="conv-meta">
                    <p>{u.display_name}</p>
                    <p>@{u.username}</p>
                  </div>
                </button>
              ))}
              {searchResults.length === 0 && <p className="sidebar-empty-text">No user found</p>}
            </>
          ) : (
            <>
              {conversations.length === 0 ? (
                <div className="empty-conversations">
                  <MessageSquare size={32} className="text-text3" />
                  <p>Start a new secure conversation</p>
                </div>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id || c.user_id}
                    type="button"
                    onClick={() => { setSelectedUser(c); setUnreadCounts(prev => ({ ...prev, [c.id]: 0 })); }}
                    className={`conv-item ${selectedUser?.id === c.id ? 'active' : ''}`}
                  >
                    <div className="avatar relative">
                      <UserIcon size={18} />
                      {onlineUsers.has(c.id || c.user_id) && <div className="online-indicator"></div>}
                      {unreadCounts[c.id] > 0 && <div className="unread-badge">{unreadCounts[c.id] > 9 ? '9+' : unreadCounts[c.id]}</div>}
                    </div>
                    <div className="conv-meta">
                      <p className={unreadCounts[c.id] > 0 ? 'font-semibold' : ''} style={unreadCounts[c.id] > 0 ? { color: 'var(--text)' } : {}}>
                        {c.display_name}
                        {unreadCounts[c.id] > 0 && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginLeft: 8, verticalAlign: 'middle' }}></span>}
                      </p>
                      <p>{unreadCounts[c.id] > 0 ? 'New message' : 'Encrypted'}</p>
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </aside>

      <section className="chat-area">
        {selectedUser ? (
          <>
            <div className="chat-header">
              <div className="chat-title">
                <button onClick={() => setSelectedUser(null)} className="back-btn">
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <p>Conversation</p>
                  <h3>{selectedUser.display_name}</h3>
                </div>
              </div>
              <div className="chat-meta">
                <div className="status-chip">
                  <span className="status-dot"></span>
                  <span>Secure</span>
                </div>
                <div className="meta-pill">
                  <Shield size={12} />
                  <span>Encrypted</span>
                </div>
              </div>
            </div>

            <div ref={scrollRef} onScroll={handleScroll} className="messages-panel">
              <div className="e2ee-trust-badge">
                <Shield size={18} />
                <p>Messages are end-to-end encrypted. No one outside this chat can read them.</p>
              </div>

              {messages.map((msg, index) => {
                const isMine = msg.from_user_id === user.id;

                const prevMsg = messages[index - 1];
                const nextMsg = messages[index + 1];
                const isSamePrev = prevMsg && prevMsg.from_user_id === msg.from_user_id;
                const isSameNext = nextMsg && nextMsg.from_user_id === msg.from_user_id;

                let bubbleClass = "bubble-single";
                if (isSamePrev && isSameNext) bubbleClass = "bubble-middle";
                else if (isSamePrev && !isSameNext) bubbleClass = "bubble-bottom";
                else if (!isSamePrev && isSameNext) bubbleClass = "bubble-top";

                const msgDate = new Date(msg.created_at).toDateString();
                const prevDate = prevMsg ? new Date(prevMsg.created_at).toDateString() : null;
                const showDateSeparator = msgDate !== prevDate;

                return (
                  <div key={msg.id} className="flex flex-col">
                    {showDateSeparator && (
                      <div className="date-separator">
                        <span>{formatDateSeparator(msg.created_at)}</span>
                      </div>
                    )}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`message-row ${isMine ? 'sent' : 'received'} ${isSameNext ? '' : 'mb-3'}`}
                    >
                      <div
                        className={`message-bubble ${isMine ? 'message-sent' : 'message-received'} ${bubbleClass}`}
                        style={{ cursor: msg.decrypted ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (msg.decrypted) handleCopy(msg.id, msg.plaintext);
                        }}
                        title={msg.decrypted ? "Click to copy" : ""}
                      >
                        <div className="message-bubble-content flex items-start justify-between gap-2">
                          <div className="message-bubble-text">
                            {!msg.decrypted && <ShieldAlert size={12} className="message-alert-icon" />}
                            <p className={msg.decrypted ? '' : 'message-locked-text'}>
                              {msg.plaintext}
                            </p>
                          </div>
                          {copiedMessageId === msg.id && (
                            <CheckCircle2 size={14} className="copied-indicator" />
                          )}
                        </div>
                      </div>
                      {!isSameNext && (
                        <div className="message-meta">
                          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {msg.decrypted && <Shield size={10} className="meta-secure-icon" />}
                          {isMine && (
                            msg.delivered ? <CheckCheck size={12} className="meta-delivered-icon" /> : <Check size={12} className="meta-pending-icon" />
                          )}
                        </div>
                      )}
                    </motion.div>
                  </div>
                );
              })}
              {showScrollButton && (
                <button onClick={scrollToBottom} className="scroll-to-bottom-btn">
                  <ArrowDown size={18} />
                </button>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="chat-footer">
              <textarea
                ref={textareaRef}
                rows="1"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                className="msg-input"
                style={{ overflowY: newMessage.split('\n').length > 4 ? 'auto' : 'hidden' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
              />
              <button
                type="submit"
                disabled={sending || !newMessage.trim()}
                className="send-button"
              >
                {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              </button>
            </form>
            <div className="chat-subtext">
              <Lock size={10} />
              <span>End-to-end encrypted - Enter to send</span>
            </div>
          </>
        ) : (
          <div className="placeholder-panel">
            <div className="placeholder-hero">
              <Shield size={48} />
              <div className="placeholder-badge">
                <Lock size={18} />
              </div>
            </div>
            <h2 className="placeholder-title">LoveBOX</h2>
            <p className="placeholder-copy">
              Select a conversation to start an end-to-end secure exchange.
            </p>
            <div className="placeholder-grid">
              <div>
                <p className="pill-title">RSA-2048</p>
                <p className="pill-copy">Identity</p>
              </div>
              <div>
                <p className="pill-title">AES-GCM</p>
                <p className="pill-copy">Messages</p>
              </div>
              <div>
                <p className="pill-title">PFS</p>
                <p className="pill-copy">Session</p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Chat;

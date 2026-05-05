import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { messageApi, userApi } from "../lib/api";
import { encryptPayload, decryptPayload } from "../lib/crypto";
import { motion } from "framer-motion";
import { Send, User as UserIcon, Shield, Search, Loader2, ArrowLeft, MessageSquare, ShieldAlert, Lock } from "lucide-react";
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
  
  const scrollRef = useRef();

  useEffect(() => {
    fetchConversations();
    // Poll conversations every 10s
    const convInterval = setInterval(fetchConversations, 10000);
    return () => clearInterval(convInterval);
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser.id);
      // Poll messages every 4s when a conversation is open
      const msgInterval = setInterval(() => fetchMessages(selectedUser.id), 4000);
      return () => clearInterval(msgInterval);
    }
  }, [selectedUser]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      }
    };

    wsService.on("message", handleNewMessage);
    return () => wsService.off("message", handleNewMessage);
  }, [selectedUser, user, privateKey]);

  const fetchConversations = async () => {
    try {
      const { data } = await messageApi.getConversations();
      const convs = Array.isArray(data) ? data : (data.conversations || []);
      // Normalize: API returns user_id, map to id for consistency
      setConversations(convs.map(c => ({ ...c, id: c.user_id ?? c.id })));
    } catch (err) {
      console.error("Failed to fetch conversations", err);
    }
  };

  const fetchMessages = async (userId) => {
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
  };

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
      <aside className={`sidebar ${selectedUser ? 'sidebar-full' : ''}`}>
        <div className="sidebar-header">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-text3 font-semibold mb-2">Conversations</p>
            <h2 className="text-xl font-semibold">Secure Contacts</h2>
          </div>
        </div>

        <div className="sidebar-search">
          <Search className="search-icon" size={18} />
          <input
            type="text"
            placeholder="Search for a user..."
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>

        <div className="sidebar-list">
          {searchQuery.length > 2 ? (
            <>
              <p className="text-[10px] uppercase tracking-[0.35em] text-accent font-semibold mb-3">Results</p>
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setSelectedUser(u); setSearchQuery(''); setSearchResults([]); }}
                  className="conv-item"
                >
                  <div className="avatar">
                    <UserIcon size={18} className="text-accent2" />
                  </div>
                  <div className="conv-meta">
                    <p className="font-semibold text-white truncate">{u.display_name}</p>
                    <p className="text-xs text-text3">@{u.username}</p>
                  </div>
                </button>
              ))}
              {searchResults.length === 0 && <p className="text-center text-xs text-text3 mt-4">No user found</p>}
            </>
          ) : (
            <>
              {conversations.length === 0 ? (
                <div className="empty-conversations">
                  <MessageSquare size={36} className="text-text3 mb-4" />
                  <p className="text-sm text-text2">Start a new secure conversation.</p>
                </div>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id || c.user_id}
                    type="button"
                    onClick={() => setSelectedUser(c)}
                    className={`conv-item ${selectedUser?.id === c.id ? 'active' : ''}`}
                  >
                    <div className="avatar">
                      <UserIcon size={20} />
                    </div>
                    <div className="conv-meta">
                      <p className="font-semibold text-white truncate">{c.display_name}</p>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-green font-black">Encrypted</p>
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </aside>

      <section className={`chat-area ${selectedUser ? 'chat-active' : ''}`}>
        {selectedUser ? (
          <>
            <div className="chat-header glass">
              <div className="chat-title">
                <button onClick={() => setSelectedUser(null)} className="back-btn">
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <p className="text-sm text-text3 uppercase tracking-[0.35em] mb-1">Conversation</p>
                  <h3 className="text-xl font-semibold">{selectedUser.display_name}</h3>
                </div>
              </div>
              <div className="chat-meta">
                <div className="status-chip">
                  <span className="status-dot"></span>
                  <span>Secure</span>
                </div>
                <div className="meta-pill">
                  <Shield size={14} />
                  <span>AES-GCM + RSA-2048</span>
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="messages-panel">
              {messages.map((msg) => {
                const isMine = msg.from_user_id === user.id;
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`message-row ${isMine ? 'sent' : 'received'}`}
                  >
                    <div className={`message-bubble ${isMine ? 'message-sent' : 'message-received'}`}>
                      {!msg.decrypted && <ShieldAlert size={14} className="text-red mb-2" />}
                      <p className={msg.decrypted ? '' : 'text-red font-mono text-xs italic'}>
                        {msg.plaintext}
                      </p>
                    </div>
                    <div className="message-meta">
                      <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {msg.decrypted && <Shield size={10} className="text-green" />}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <form onSubmit={handleSendMessage} className="chat-footer glass">
              <textarea
                rows="1"
                placeholder="Type an encrypted message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="msg-input"
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
                {sending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
              </button>
            </form>
            <div className="chat-subtext">
              <Lock size={12} />
              <span>Encrypted before sending · Enter to send</span>
            </div>
          </>
        ) : (
          <div className="placeholder-panel">
            <div className="placeholder-hero">
              <Shield size={48} className="text-accent2" />
              <div className="placeholder-badge">
                <Lock size={18} className="text-white" />
              </div>
            </div>
            <h2 className="placeholder-title">WHISPERBOX</h2>
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

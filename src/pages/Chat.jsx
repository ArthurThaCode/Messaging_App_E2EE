import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { messageApi, userApi } from "../lib/api";
import { encryptPayload, decryptPayload } from "../lib/crypto";
import { motion, AnimatePresence } from "framer-motion";
import { Send, User as UserIcon, Shield, Search, Loader2, ArrowLeft, MessageSquare, ShieldAlert } from "lucide-react";

const Chat = () => {
  const { user, privateKey } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  
  const scrollRef = useRef();

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser.id);
      const interval = setInterval(() => fetchMessages(selectedUser.id), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedUser]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const { data } = await messageApi.getConversations();
      // Handle both { conversations: [...] } and [...]
      const convs = Array.isArray(data) ? data : (data.conversations || []);
      setConversations(convs);
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
            const plaintext = await decryptPayload(
              { 
                ciphertext: msg.ciphertext, 
                iv: msg.iv, 
                encrypted_key: msg.sender_id === user.id ? msg.encrypted_key_for_self : msg.encrypted_key 
              },
              privateKey
            );
            return { ...msg, plaintext, decrypted: true };
          } catch (err) {
            console.error("Decryption failed", err);
            return { ...msg, plaintext: "[Chiffrement Verrouillé]", decrypted: false };
          }
        })
      );
      
      setMessages(decryptedMessages);
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

    setSending(true);
    try {
      const { data: recipientKeyData } = await userApi.getPublicKey(selectedUser.id);
      const recipientPublicKey = recipientKeyData.public_key || recipientKeyData;

      const payloadForRecipient = await encryptPayload(newMessage, recipientPublicKey);
      const payloadForSelf = await encryptPayload(newMessage, user.public_key);

      await messageApi.sendMessage({
        receiver_id: selectedUser.id,
        ciphertext: payloadForRecipient.ciphertext,
        iv: payloadForRecipient.iv,
        encrypted_key: payloadForRecipient.encryptedKey,
        encrypted_key_for_self: payloadForSelf.encryptedKey,
      });

      setNewMessage("");
      fetchMessages(selectedUser.id);
      fetchConversations();
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div className={`sidebar flex flex-col ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 border-b border-white/5">
          <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-4">Conversations</p>
          <div className="input-wrapper mb-4">
             <Search className="input-icon-left text-muted/40" size={16} />
             <input
                type="text"
                placeholder="Search users..."
                className="pl-10 h-11 text-xs"
                value={searchQuery}
                onChange={handleSearch}
             />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {searchQuery.length > 2 ? (
            <div className="p-2">
              <p className="text-[10px] uppercase font-black text-accent px-4 mb-3 tracking-widest">Recherche</p>
              {searchResults.map((u) => (
                <div
                  key={u.id}
                  onClick={() => { setSelectedUser(u); setSearchQuery(""); setSearchResults([]); }}
                  className="conv-item rounded-xl flex items-center gap-3 m-1"
                >
                  <div className="w-10 h-10 rounded-full bg-accent-dim flex items-center justify-center border border-accent/20">
                    <UserIcon size={18} className="text-accent2" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-white">{u.display_name}</p>
                    <p className="text-xs text-muted">@{u.username}</p>
                  </div>
                </div>
              ))}
              {searchResults.length === 0 && <p className="text-center text-xs text-muted mt-4">Aucun utilisateur trouvé</p>}
            </div>
          ) : (
            <div className="p-2">
              {conversations.length === 0 && (
                <div className="text-center py-12 px-6">
                  <MessageSquare className="mx-auto text-muted/20 mb-4" size={40} />
                  <p className="text-xs text-muted font-medium leading-relaxed">
                    Commencez une nouvelle conversation sécurisée.
                  </p>
                </div>
              )}
              {conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedUser(c)}
                  className={`conv-item rounded-xl flex items-center gap-4 m-1 ${selectedUser?.id === c.id ? 'active' : ''}`}
                >
                  <div className="w-12 h-12 rounded-full bg-surface3 flex items-center justify-center relative border border-white/5 shadow-inner">
                    <UserIcon size={22} className={selectedUser?.id === c.id ? "text-accent2" : "text-muted/50"} />
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green border-4 border-surface rounded-full"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-white truncate">{c.display_name}</p>
                    <p className="text-[10px] text-green uppercase font-black tracking-widest flex items-center gap-1.5 mt-1">
                      <Shield size={10} /> Encrypted
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`chat-area flex-1 flex flex-col ${!selectedUser ? 'hidden md:flex' : 'flex'}`}>
        {selectedUser ? (
          <>
            <div className="h-[60px] px-6 border-b border-white/5 flex items-center justify-between bg-surface/50 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <button onClick={() => setSelectedUser(null)} className="md:hidden p-2 -ml-2 text-muted">
                   <ArrowLeft size={20} />
                </button>
                <div className="w-10 h-10 rounded-full bg-surface3 flex items-center justify-center border border-white/5">
                  <UserIcon size={20} className="text-white/70" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white leading-none mb-1">{selectedUser.display_name}</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-green rounded-full shadow-[0_0_8px_var(--green)]"></div>
                    <p className="text-[10px] text-green font-black uppercase tracking-widest">Secure Active</p>
                  </div>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-xs text-muted font-medium font-mono">
                 <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
                    <Shield size={12} className="text-accent" />
                    <span>AES-GCM + RSA-2048</span>
                 </div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              {messages.map((msg) => {
                const isMine = msg.sender_id === user.id;
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`message-bubble ${isMine ? 'message-sent shadow-lg shadow-accent/20' : 'message-received'}`}>
                      {!msg.decrypted && <ShieldAlert size={14} className="text-red mb-2" />}
                      <p className={msg.decrypted ? '' : 'text-red font-mono text-xs italic'}>
                        {msg.plaintext}
                      </p>
                    </div>
                    <div className={`flex items-center gap-2 mt-2 px-1 text-[9px] font-black uppercase tracking-widest text-muted`}>
                      <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {msg.decrypted && <Shield size={10} className="text-green" />}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <form onSubmit={handleSendMessage} className="p-6 bg-surface border-t border-white/5">
              <div className="flex gap-3">
                <div className="flex-1 input-wrapper">
                  <textarea
                    rows="1"
                    placeholder="Type an encrypted message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="msg-input py-3 min-h-[48px]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="w-12 h-12 bg-accent hover:bg-accent2 text-white rounded-xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-3 px-1 text-[9px] font-black text-muted uppercase tracking-[0.2em] font-mono">
                 <Lock size={10} /> Chiffré avant l'envoi · Entrée pour envoyer
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-24 h-24 bg-accent-dim rounded-[2rem] flex items-center justify-center mb-10 border border-accent/20 shadow-2xl relative">
              <Shield size={48} className="text-accent2" />
              <div className="absolute -top-3 -right-3 w-10 h-10 bg-green rounded-full border-4 border-bg flex items-center justify-center shadow-xl">
                 <Lock size={18} className="text-white" />
              </div>
            </div>
            <h2 className="text-4xl font-black text-white mb-6 tracking-tighter">WHISPERBOX</h2>
            <p className="text-muted max-w-sm text-lg font-medium leading-relaxed mb-10">
              Sélectionnez une conversation pour démarrer un échange sécurisé de bout en bout.
            </p>
            <div className="grid grid-cols-3 gap-8 max-w-md w-full p-8 bg-surface2/50 rounded-3xl border border-white/5 backdrop-blur-md">
               <div className="text-center">
                  <p className="text-[10px] font-black text-accent uppercase tracking-widest mb-2">RSA-2048</p>
                  <p className="text-[9px] text-muted uppercase tracking-wider">Identité</p>
               </div>
               <div className="text-center border-x border-white/5">
                  <p className="text-[10px] font-black text-accent uppercase tracking-widest mb-2">AES-GCM</p>
                  <p className="text-[9px] text-muted uppercase tracking-wider">Messages</p>
               </div>
               <div className="text-center">
                  <p className="text-[10px] font-black text-accent uppercase tracking-widest mb-2">PFS</p>
                  <p className="text-[9px] text-muted uppercase tracking-wider">Session</p>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
);
};

export default Chat;

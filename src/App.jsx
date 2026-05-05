import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Auth from "./pages/Auth";
import Chat from "./pages/Chat";
import { Loader2, LogOut, Shield, Sun, Moon, Settings, Key, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ProtectedRoute = ({ children }) => {
  const { user, loading, privateKey } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-500" size={48} />
      </div>
    );
  }

  if (!user || !privateKey) {
    return <Navigate to="/auth" />;
  }

  return children;
};

const AppContent = () => {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <Router>
      <div className="app-container">
        {user && (
          <header className="app-header glass rounded-[32px] px-6 py-4 shadow-2xl shadow-black/30">
            <div className="brand-block">
              <div className="brand-icon glass p-3 rounded-3xl">
                <Shield className="text-accent" />
              </div>
              <div>
                <p className="text-sm text-text2 uppercase tracking-[0.35em] font-semibold mb-1">WhisperBox</p>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Secure messaging, simplified.</h1>
              </div>
            </div>

            <div className="header-actions">
              <div className="status-chip">
                <span className="status-dot"></span>
                <span>Connected</span>
              </div>
              <div className="user-info">
                <p className="text-sm font-semibold">{user.display_name}</p>
                <p className="text-xs text-text3">End-to-end encrypted session</p>
              </div>
              <button 
                onClick={toggleTheme}
                className="btn-ghost rounded-3xl px-4 py-3"
                title="Toggle Theme"
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                className="btn-ghost rounded-3xl px-4 py-3"
                title="Settings"
              >
                <Settings size={18} />
              </button>
              <button 
                onClick={logout}
                className="btn-ghost rounded-3xl px-4 py-3"
                title="Log Out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>
        )}

        <AnimatePresence>
          {showSettings && user && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed absolute top-0 left-0 w-full h-full z-50 flex items-center justify-center p-4"
              onClick={() => setShowSettings(false)}
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            >
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                className="glass rounded-3xl w-full max-w-lg p-6 relative"
                onClick={e => e.stopPropagation()}
                style={{ background: 'var(--surface)' }}
              >
                <button 
                  onClick={() => setShowSettings(false)}
                  className="absolute top-6 right-6 text-text3 hover:text-text transition-colors"
                >
                  <X size={20} />
                </button>
                
                <div className="flex items-center gap-3 mb-6">
                  <div style={{ width: '48px', height: '48px', backgroundColor: 'var(--accent-dim)', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                    <Key size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Security Settings</h2>
                    <p className="text-xs text-text3 uppercase tracking-wider">End-to-End Encryption</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '1rem' }}>
                    <p className="text-xs text-text2 uppercase mb-2 font-semibold" style={{ letterSpacing: '0.05em' }}>Your Identity</p>
                    <p className="text-sm"><strong>Display Name:</strong> {user.display_name}</p>
                    <p className="text-sm"><strong>Username:</strong> @{user.username}</p>
                  </div>
                  
                  <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '1rem' }}>
                    <p className="text-xs text-accent uppercase mb-2 font-semibold flex items-center gap-2" style={{ letterSpacing: '0.05em' }}>
                      <Shield size={14} /> Public Key Fingerprint
                    </p>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>
                      <p className="text-text2" style={{ fontSize: '10px', fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
                        {user.public_key}
                      </p>
                    </div>
                    <p className="text-text3 mt-2" style={{ fontSize: '11px' }}>
                      This key is shared with others to encrypt messages sent to you. Your private key never leaves this device.
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="app-main">
          <Routes>
            <Route path="/auth" element={user ? <Navigate to="/" /> : <Auth />} />
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </main>

        <footer className="app-footer text-center mt-4">
          <p className="text-[10px] text-text3 uppercase tracking-[0.35em] font-medium">
            E2EE Protocol v1.0 • AES-256-GCM • RSA-2048-OAEP
          </p>
        </footer>
      </div>
    </Router>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

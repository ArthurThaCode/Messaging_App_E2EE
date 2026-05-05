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
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="app-container">
        {user && (
          <>
            <header className="app-header">
              <div className="brand-block">
                <div className="brand-icon">
                  <Shield size={20} className="text-accent" />
                </div>
                <div>
                  <p className="text-xs text-text3 uppercase tracking-[0.2em] font-semibold mb-0.5">WhisperBox</p>
                  <p className="text-sm text-text2">Secure messaging</p>
                </div>
              </div>

              <div className="header-actions">
                <div className="status-chip">
                  <span className="status-dot"></span>
                  <span>Connected</span>
                </div>
                <div className="user-info">
                  <p className="text-sm font-semibold">{user.display_name}</p>
                </div>
                <button
                  onClick={toggleTheme}
                  className="btn-ghost"
                  title="Toggle Theme"
                >
                  {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="btn-ghost"
                  title="Settings"
                >
                  <Settings size={16} />
                </button>
                <button
                  onClick={logout}
                  className="btn-ghost"
                  title="Log Out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </header>
          </>
        )}

        <AnimatePresence>
          {showSettings && user && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed top-0 left-0 w-full h-full z-50 flex items-center justify-center p-4"
              onClick={() => setShowSettings(false)}
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
            >
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                className="settings-modal w-full max-w-lg relative"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => setShowSettings(false)}
                  className="absolute top-6 right-6 text-text3 hover:text-text transition-colors"
                >
                  <X size={18} />
                </button>

                <div className="settings-header">
                  <div className="settings-header-icon">
                    <Key size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Security Settings</h2>
                    <p className="text-xs text-text3 uppercase tracking-[0.15em]">End-to-End Encryption</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="settings-section">
                    <p>Your Identity</p>
                    <p><strong>Display Name:</strong> {user.display_name}</p>
                    <p><strong>Username:</strong> @{user.username}</p>
                  </div>

                  <div className="settings-section">
                    <p className="text-accent flex items-center gap-2">
                      <Shield size={12} /> Public Key Fingerprint
                    </p>
                    <div className="key-fingerprint">
                      <p>{user.public_key}</p>
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

        <main id="main-content" className="app-main">
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

import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Auth from "./pages/Auth";
import Chat from "./pages/Chat";
import { Loader2, LogOut, Shield } from "lucide-react";

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
                onClick={logout}
                className="btn-ghost rounded-3xl px-4 py-3"
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>
        )}

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

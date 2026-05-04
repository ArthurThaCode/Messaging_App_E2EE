import React from "react";
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
          <header className="flex items-center justify-between p-4 glass rounded-2xl mb-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 rounded-xl">
                <Shield className="text-indigo-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">WhisperBox</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold">{user.display_name}</p>
                <div className="flex items-center gap-1.5 justify-end">
                   <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full pulse"></div>
                   <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">SECURE NODE</p>
                </div>
              </div>
              <button 
                onClick={logout}
                className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 shadow-none hover:shadow-none transition-all rounded-xl"
              >
                <LogOut size={20} />
              </button>
            </div>
          </header>
        )}

        <main className="flex-1 flex flex-col min-h-0">
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

        <footer className="mt-6 pb-2 text-center">
          <p className="text-[10px] text-muted uppercase tracking-[0.3em] font-medium">
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

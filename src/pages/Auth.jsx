import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, User, AtSign, ShieldCheck, Loader2, Eye, EyeOff, AlertCircle, Shield, Zap } from "lucide-react";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { login, register } = useAuth();

  const [formData, setFormData] = useState({
    displayName: "",
    username: "",
    password: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isLogin) {
        await login(formData.username, formData.password);
      } else {
        await register(formData.displayName, formData.username, formData.password);
      }
    } catch (err) {
      console.error("Auth error:", err.response?.data || err.message);
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (err.response?.data?.message || err.message || "Authentication failed.");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-layout">
        <aside className="auth-sidepanel">
          <div className="auth-sidepanel-head">
            <ShieldCheck size={24} />
            <div>
              <p className="auth-eyebrow">WhisperBox</p>
              <h2>End-to-end encrypted messaging</h2>
            </div>
          </div>
          <p className="auth-sidepanel-copy">
            Send private messages with complete security. Your keys are generated locally, messages use AES-GCM encryption, and the server only stores encrypted data.
          </p>

          <div className="auth-sidepanel-features">
            <div className="auth-feature">
              <span><Lock size={18} /></span>
              <div>
                <p>Local key management</p>
                <p>Your private key never leaves your device.</p>
              </div>
            </div>
            <div className="auth-feature">
              <span><Shield size={18} /></span>
              <div>
                <p>Automatic encryption</p>
                <p>Messages encrypted before sending.</p>
              </div>
            </div>
            <div className="auth-feature">
              <span><Zap size={18} /></span>
              <div>
                <p>Modern interface</p>
                <p>Clean design that works on all screens.</p>
              </div>
            </div>
          </div>
        </aside>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="auth-box"
        >
          <div className="logo">
            <div className="logo-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="logo-title">WhisperBox</p>
              <p className="logo-subtitle">End-to-end encrypted</p>
            </div>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${isLogin ? 'active' : ''}`}
              onClick={() => { setIsLogin(true); setError(""); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab ${!isLogin ? 'active' : ''}`}
              onClick={() => { setIsLogin(false); setError(""); }}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="form-group mb-0"
                >
                  <label>Display Name</label>
                  <div className="input-wrapper relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3 pointer-events-none" size={16} />
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      className="pl-10"
                      autoComplete="name"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="form-group mb-0">
              <label>Username</label>
              <div className="input-wrapper relative">
                <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3 pointer-events-none" size={16} />
                <input
                  type="text"
                  required
                  placeholder="your_username"
                  className="pl-10"
                  autoComplete="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group mb-0">
              <label>Password</label>
              <div className="input-wrapper relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3 pointer-events-none" size={16} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Password"
                  className="pl-10 pr-10"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="auth-error"
              >
                <AlertCircle size={14} />
                <p>{error}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>Processing...</span>
                </>
              ) : (
                <span>{isLogin ? "Sign In" : "Create Account"}</span>
              )}
            </button>
          </form>

          <div className="e2ee-notice">
            <Shield size={16} />
            <p>Your private keys never leave your device. The server only stores encrypted data.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Auth;

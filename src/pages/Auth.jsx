import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, User, Mail, ShieldCheck, Loader2, Eye, EyeOff, AlertCircle, Shield } from "lucide-react";

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
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="auth-box"
      >
        <div className="logo">
          <div className="logo-icon">
            <ShieldCheck size={20} className="text-accent2" />
          </div>
          <div className="logo-text text-white">Whisper<span>Box</span></div>
        </div>

        <div className="auth-tabs">
          <div 
            className={`auth-tab ${isLogin ? 'active' : ''}`} 
            onClick={() => { setIsLogin(true); setError(""); }}
          >
            Sign In
          </div>
          <div 
            className={`auth-tab ${!isLogin ? 'active' : ''}`} 
            onClick={() => { setIsLogin(false); setError(""); }}
          >
            Register
          </div>
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
                <label>Nom d'affichage</label>
                <div className="input-wrapper relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3" size={16} />
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    className="pl-10"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="form-group mb-0">
            <label>Utilisateur</label>
            <div className="input-wrapper relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3" size={16} />
              <input
                type="text"
                required
                placeholder="your_username"
                className="pl-10"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group mb-0">
            <label>Mot de passe</label>
            <div className="input-wrapper relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3" size={16} />
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                className="pl-10 pr-10"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-transparent shadow-none hover:bg-white/5 text-text3 transition-colors rounded-lg"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-3 bg-red-dim border border-red/20 rounded-lg flex items-center gap-2 mt-2"
            >
              <AlertCircle size={14} className="text-red shrink-0" />
              <p className="text-red text-[11px] font-mono font-medium">{error}</p>
            </motion.div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="btn-primary mt-4 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                <span>Traitement...</span>
              </>
            ) : (
              <span>{isLogin ? "Se connecter" : "Générer l'identité"}</span>
            )}
          </button>
        </form>

        <div className="e2ee-notice flex gap-3 mt-6 p-4 bg-accent-glow rounded-xl border border-accent/10">
          <Shield size={16} className="text-accent shrink-0 mt-0.5" />
          <p className="text-[10px] text-text2 font-mono leading-relaxed">
            Chiffrement de bout en bout. Vos clés privées ne quittent jamais votre appareil. Le serveur ne stocke que du texte chiffré.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;

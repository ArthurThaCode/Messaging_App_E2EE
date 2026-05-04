import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, User, Mail, ShieldCheck, Loader2, Eye, EyeOff, AlertCircle, Shield, Zap } from "lucide-react";

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
        <aside className="auth-sidepanel glass rounded-[32px] p-8">
          <div className="auth-sidepanel-head">
            <ShieldCheck size={28} className="text-accent" />
            <div>
              <p className="text-sm uppercase tracking-[0.4em] text-text3 font-semibold">WhisperBox</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight">Messagerie sécurisée de bout en bout</h2>
            </div>
          </div>
          <p className="auth-sidepanel-copy mt-6 text-text2 leading-7">
            Une application simple, professionnelle et moderne pour envoyer des messages privés sans compromettre la sécurité. Clés générées localement, chiffrement AES-GCM et échange RSA-OAEP.
          </p>

          <div className="auth-sidepanel-features">
            <div className="auth-feature">
              <span><Lock size={20} /></span>
              <div>
                <p className="font-semibold">Clés gérées localement</p>
                <p className="text-sm text-text3">Votre clé privée ne quitte jamais votre appareil.</p>
              </div>
            </div>
            <div className="auth-feature">
              <span><Shield size={20} /></span>
              <div>
                <p className="font-semibold">Chiffrement transparent</p>
                <p className="text-sm text-text3">Les messages sont automatiquement chiffrés avant envoi.</p>
              </div>
            </div>
            <div className="auth-feature">
              <span><Zap size={20} /></span>
              <div>
                <p className="font-semibold">Design clair</p>
                <p className="text-sm text-text3">Interface moderne, fluide et adaptée à tous les écrans.</p>
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
              <ShieldCheck size={20} className="text-accent2" />
            </div>
            <div>
              <p className="logo-title">WhisperBox</p>
              <p className="logo-subtitle">Sécurité E2EE simple et claire</p>
            </div>
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
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3 pointer-events-none" size={16} />
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
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3 pointer-events-none" size={16} />
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
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3 pointer-events-none" size={16} />
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-text3 hover:text-accent transition-colors rounded-lg"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-3 bg-red-dim border border-red/20 rounded-xl flex items-center gap-2 mt-2"
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

          <div className="e2ee-notice flex gap-3 mt-8 p-4 bg-accent-dim/30 rounded-2xl border border-accent/20">
            <Shield size={18} className="text-accent shrink-0 mt-0.5" />
            <p className="text-[11px] text-text font-mono leading-relaxed opacity-90">
              Chiffrement de bout en bout. Vos clés privées ne quittent jamais votre appareil. Le serveur ne stocke que du texte chiffré.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Auth;

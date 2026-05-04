import { createContext, useContext, useState, useEffect } from "react";
import { get, set, del } from "idb-keyval";
import { authApi } from "../lib/api";
import { generateIdentity, wrapPrivateKey, unwrapPrivateKey } from "../lib/crypto";
import { wsService } from "../lib/websocket";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [privateKey, setPrivateKey] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("token");
      const userId = localStorage.getItem("userId");
      
      if (token && userId) {
        try {
          const { data } = await authApi.getProfile();
          // The backend might return { user: ... } or just the user object
          const userData = data.user || data;
          setUser(userData);
          
          // Try to load private key from IndexedDB using stored userId
          const savedKey = await get(`pk_${userId}`);
          if (savedKey) {
            setPrivateKey(savedKey);
          }
        } catch (err) {
          console.error("Auth init failed", err);
          // If profile fetch fails, token might be expired or invalid
          localStorage.removeItem("token");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("userId");
          setUser(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (username, password) => {
    try {
      const { data } = await authApi.login({ username, password });
      const token = data.access_token || data.token;
      const refreshToken = data.refresh_token;
      
      localStorage.setItem("token", token);
      if (refreshToken) {
        localStorage.setItem("refreshToken", refreshToken);
      }
      
      // Connect to WebSocket (non-blocking)
      wsService.connect(token).catch((wsErr) => {
        console.warn("WebSocket connection failed, will fall back to polling", wsErr);
      });
      
      const userData = data.user || data;
      if (userData.id) {
        localStorage.setItem("userId", userData.id);
      }
      setUser(userData);

      // Unwrap and store private key
      const wrappedKey = userData.wrapped_private_key;
      const salt = userData.pbkdf2_salt;

      if (wrappedKey && salt) {
        try {
          const decryptedPrivateKey = await unwrapPrivateKey(
            wrappedKey,
            password,
            salt
          );
          setPrivateKey(decryptedPrivateKey);
          if (userData.id) {
            await set(`pk_${userData.id}`, decryptedPrivateKey);
          }
        } catch (err) {
          throw new Error("Clé privée introuvable ou mot de passe incorrect pour le déchiffrement.");
        }
      } else {
        console.warn("User has no keys stored on server");
      }
      return userData;
    } catch (err) {
      throw err;
    }
  };

  const register = async (displayName, username, password) => {
    // 1. Generate keys
    const { publicKey, privateKey: rawPrivateKey } = await generateIdentity();
    
    // 2. Generate salt
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const saltBase64 = btoa(String.fromCharCode(...salt));

    // 3. Wrap private key
    const { wrappedKey } = await wrapPrivateKey(rawPrivateKey, password, saltBase64);

    // 4. Register on backend
    const { data } = await authApi.register({
      display_name: displayName,
      username,
      password,
      public_key: publicKey,
      wrapped_private_key: wrappedKey,
      pbkdf2_salt: saltBase64,
    });

    // 5. Backend for register might return token or we might need to login
    const token = data.access_token || data.token;
    const refreshToken = data.refresh_token;
    
    if (token) {
      localStorage.setItem("token", token);
      if (refreshToken) {
        localStorage.setItem("refreshToken", refreshToken);
      }
      
      // Connect to WebSocket
      try {
        await wsService.connect(token);
      } catch (wsErr) {
        console.warn("WebSocket connection failed, will fall back to polling", wsErr);
      }
      
      const userData = data.user || data;
      if (userData.id) {
        localStorage.setItem("userId", userData.id);
        await set(`pk_${userData.id}`, rawPrivateKey);
      }
      setUser(userData);
      setPrivateKey(rawPrivateKey);
      return userData;
    } else {
      // If no token, perform manual login
      return await login(username, password);
    }
  };

  const logout = async () => {
    const userId = localStorage.getItem("userId");
    if (userId) {
      await del(`pk_${userId}`);
    }
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userId");
    wsService.disconnect();
    setUser(null);
    setPrivateKey(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, privateKey, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

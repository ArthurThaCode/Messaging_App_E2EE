import React, { createContext, useContext, useState, useEffect } from "react";
import { get, set, del } from "idb-keyval";
import { authApi } from "../lib/api";
import { generateIdentity, wrapPrivateKey, unwrapPrivateKey } from "../lib/crypto";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [privateKey, setPrivateKey] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const { data } = await authApi.getProfile();
          // The backend might return { user: ... } or just the user object
          const userData = data.user || data;
          setUser(userData);
          
          // Try to load private key from IndexedDB
          const savedKey = await get(`pk_${userData.id}`);
          if (savedKey) {
            setPrivateKey(savedKey);
          }
        } catch (err) {
          console.error("Auth init failed", err);
          // If profile fetch fails, token might be expired
          localStorage.removeItem("token");
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
      localStorage.setItem("token", token);
      
      const userData = data.user || data;
      setUser(userData);

      // Unwrap and store private key
      // Note: backend should return wrapped_private_key, iv, and pbkdf2_salt
      const wrappedKey = userData.wrapped_private_key;
      const iv = userData.iv;
      const salt = userData.pbkdf2_salt;

      if (wrappedKey && salt) {
        try {
          const decryptedPrivateKey = await unwrapPrivateKey(
            wrappedKey,
            iv,
            password,
            salt
          );
          setPrivateKey(decryptedPrivateKey);
          await set(`pk_${userData.id}`, decryptedPrivateKey);
        } catch (cryptoErr) {
          console.error("Failed to unwrap private key", cryptoErr);
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
    const { wrappedKey, iv } = await wrapPrivateKey(rawPrivateKey, password, saltBase64);

    // 4. Register on backend
    const { data } = await authApi.register({
      display_name: displayName,
      username,
      password,
      public_key: publicKey,
      wrapped_private_key: wrappedKey,
      iv: iv,
      pbkdf2_salt: saltBase64,
    });

    // 5. Backend for register might return token or we might need to login
    const token = data.access_token || data.token;
    if (token) {
      localStorage.setItem("token", token);
      const userData = data.user || data;
      setUser(userData);
      setPrivateKey(rawPrivateKey);
      await set(`pk_${userData.id}`, rawPrivateKey);
      return userData;
    } else {
      // If no token, perform manual login
      return await login(username, password);
    }
  };

  const logout = async () => {
    if (user) {
      await del(`pk_${user.id}`);
    }
    localStorage.removeItem("token");
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

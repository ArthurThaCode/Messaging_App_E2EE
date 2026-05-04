import axios from "axios";

const API_BASE_URL = "https://whisperbox.koyeb.app";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor to add token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  getProfile: () => api.get("/auth/profile"),
};

export const userApi = {
  getPublicKey: (userId) => api.get(`/users/${userId}/public-key`),
  searchUsers: (query) => api.get(`/users/search?q=${query}`),
  getAllUsers: () => api.get("/users"),
};

export const messageApi = {
  getConversations: () => api.get("/conversations"),
  getMessages: (userId) => api.get(`/messages/${userId}`),
  sendMessage: (data) => api.post("/messages", data),
};

export default api;

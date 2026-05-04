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

// Interceptor to handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes("/auth/")) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem("refreshToken");
        console.log("Attempting token refresh with refreshToken:", refreshToken ? "exists" : "missing");
        
        if (refreshToken) {
          const { data } = await axios.post(
            "https://whisperbox.koyeb.app/auth/refresh",
            { refresh_token: refreshToken }
          );
          
          console.log("Token refresh successful, new token stored");
          const newToken = data.access_token || data.token;
          localStorage.setItem("token", newToken);
          
          // Store new refresh token if backend returns it
          if (data.refresh_token) {
            localStorage.setItem("refreshToken", data.refresh_token);
          }
          
          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } else {
          console.warn("No refreshToken available, clearing session");
        }
      } catch (refreshErr) {
        console.error("Token refresh failed:", refreshErr.response?.status, refreshErr.response?.data);
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("userId");
      }
    }
    
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  getProfile: () => api.get("/auth/me"),
};

export const userApi = {
  getPublicKey: (userId) => api.get(`/users/${userId}/public-key`),
  searchUsers: (query) => api.get(`/users/search?q=${query}`),
  getAllUsers: () => api.get("/users"),
};

export const messageApi = {
  getConversations: () => api.get("/conversations"),
  getMessages: (userId) => api.get(`/conversations/${userId}/messages`),
  sendMessage: (data) => api.post("/messages", data),
};

export default api;

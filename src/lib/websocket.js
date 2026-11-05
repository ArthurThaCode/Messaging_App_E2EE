/**
 * WebSocket service for real-time messaging
 * Connects to <API base URL>/ws?token=<access_token>
 * Handles message.receive and presence events
 */

import { API_BASE_URL } from "./config";

const WS_BASE_URL = `${API_BASE_URL.replace(/^http/, "ws")}/ws`;

class WebSocketService {
  constructor() {
    this.ws = null;
    this.token = null;
    this.listeners = {};
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
  }

  /**
   * Connect to WebSocket with token
   */
  connect(token) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }

    if (this.isConnecting) {
      return new Promise((resolve) => {
        const checkConnection = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            resolve();
          }
        }, 100);
      });
    }

    this.isConnecting = true;
    this.token = token;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${WS_BASE_URL}?token=${token}`);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.emit("connected");
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (err) {
            console.error("Failed to parse WebSocket message", err);
          }
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error", error);
          this.emit("error", error);
          reject(error);
        };

        this.ws.onclose = () => {
          this.isConnecting = false;
          this.emit("disconnected");
          this.attemptReconnect();
        };

        setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            reject(new Error("WebSocket connection timeout"));
          }
        }, 5000);
      } catch (err) {
        this.isConnecting = false;
        reject(err);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(data) {
    if (!data) {
      console.warn("Received empty WebSocket message");
      return;
    }

    const eventType = data.event || data.type;
    const payload = data.payload ?? data;

    if (eventType === "message.receive") {
      // The sender, recipient and id sit next to the encrypted payload, so listeners need the whole frame
      this.emit("message", data);
    } else if (eventType === "error") {
      this.emit("error", payload);
    } else if (eventType === "user.online" || eventType === "user.offline") {
      this.emit(eventType, payload);
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      if (this.token && !this.isConnecting) {
        this.connect(this.token).catch((err) => console.error("Reconnection failed", err));
      }
    }, delay);
  }

  /**
   * Register event listener
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  /**
   * Unregister event listener
   */
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
  }

  /**
   * Emit event to all listeners
   */
  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        console.error(`Error in listener for event ${event}`, err);
      }
    });
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();

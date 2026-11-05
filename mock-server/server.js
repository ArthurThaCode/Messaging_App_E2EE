// A MOCK of the WhisperBox API for local demos and tests. It follows the API guide, keeps everything in memory,
// and is not secure: passwords are stored as received. Never expose it or use it with real data.
import crypto from "node:crypto";
import http from "node:http";
import { WebSocketServer } from "ws";

const ACCESS_TOKEN_TTL_SECONDS = 900;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

export function createMockServer() {
  const users = new Map();
  const messages = [];
  const accessTokens = new Map();
  const refreshTokens = new Map();
  const sockets = new Map();

  const publicProfile = ({ password: _password, ...profile }) => profile;

  function issueTokens(user) {
    const accessToken = crypto.randomUUID();
    accessTokens.set(accessToken, { userId: user.id, expiresAt: Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000 });
    return { access_token: accessToken, token_type: "bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS };
  }

  function issueSession(user) {
    const refreshToken = crypto.randomUUID();
    refreshTokens.set(refreshToken, user.id);
    return { ...issueTokens(user), refresh_token: refreshToken, user: publicProfile(user) };
  }

  function userFromToken(token) {
    const session = accessTokens.get(token);
    if (!session || session.expiresAt < Date.now()) return null;
    return users.get(session.userId);
  }

  function send(socket, data) {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(data));
  }

  function broadcast(data, exceptUserId) {
    for (const [userId, socket] of sockets) {
      if (userId !== exceptUserId) send(socket, data);
    }
  }

  const receiveFrame = (message) => ({
    event: "message.receive",
    id: message.id,
    from_user_id: message.from_user_id,
    to_user_id: message.to_user_id,
    payload: message.payload,
    created_at: message.created_at,
  });

  // Stores a message and delivers it right away if the recipient is connected.
  function storeMessage(fromUserId, toUserId, payload) {
    const message = { id: crypto.randomUUID(), from_user_id: fromUserId, to_user_id: toUserId, payload, delivered: false, created_at: new Date().toISOString() };
    messages.push(message);
    const socket = sockets.get(toUserId);
    if (socket) {
      send(socket, receiveFrame(message));
      message.delivered = true;
    }
    return message;
  }

  const isValidPayload = (payload) =>
    Boolean(payload) && ["ciphertext", "iv", "encryptedKey", "encryptedKeyForSelf"].every((field) => typeof payload[field] === "string");

  async function route(request, url, body) {
    const { pathname: path, searchParams } = url;
    const method = request.method;

    if (method === "GET" && path === "/health") return [200, { status: "ok", environment: "mock" }];

    if (method === "POST" && path === "/auth/register") {
      const { username, display_name, password, public_key, wrapped_private_key, pbkdf2_salt } = body;
      const valid = USERNAME_PATTERN.test(username || "") && typeof password === "string" && password.length >= 8 && password.length <= 128 && display_name && public_key && wrapped_private_key && pbkdf2_salt;
      if (!valid) return [422, { detail: "Validation failed" }];
      const normalized = username.toLowerCase();
      if ([...users.values()].some((user) => user.username === normalized)) return [409, { detail: "Username already taken" }];
      const user = { id: crypto.randomUUID(), username: normalized, display_name, password, public_key, wrapped_private_key, pbkdf2_salt, created_at: new Date().toISOString() };
      users.set(user.id, user);
      return [201, issueSession(user)];
    }

    if (method === "POST" && path === "/auth/login") {
      const user = [...users.values()].find((candidate) => candidate.username === String(body.username || "").toLowerCase() && candidate.password === body.password);
      return user ? [200, issueSession(user)] : [401, { detail: "Invalid credentials" }];
    }

    if (method === "POST" && path === "/auth/refresh") {
      const user = users.get(refreshTokens.get(body.refresh_token));
      return user ? [200, issueTokens(user)] : [401, { detail: "Refresh token expired or revoked" }];
    }

    const me = userFromToken((request.headers.authorization || "").replace(/^Bearer /, ""));
    if (!me) return [401, { detail: "Unauthorized" }];

    if (method === "GET" && path === "/auth/me") return [200, publicProfile(me)];

    if (method === "POST" && path === "/auth/logout") {
      refreshTokens.delete(body.refresh_token);
      return [200, { detail: "Logged out successfully" }];
    }

    if (method === "GET" && path === "/users/search") {
      const query = (searchParams.get("q") || "").toLowerCase();
      const results = [...users.values()]
        .filter((user) => user.id !== me.id && (user.username.includes(query) || user.display_name.toLowerCase().includes(query)))
        .slice(0, 20)
        .map(({ id, username, display_name }) => ({ id, username, display_name }));
      return [200, results];
    }

    const publicKeyRoute = path.match(/^\/users\/([^/]+)\/public-key$/);
    if (method === "GET" && publicKeyRoute) {
      const user = users.get(publicKeyRoute[1]);
      return user ? [200, { public_key: user.public_key }] : [404, { detail: "User not found" }];
    }

    if (method === "GET" && path === "/conversations") {
      const lastMessageAt = new Map();
      for (const message of messages) {
        if (message.from_user_id !== me.id && message.to_user_id !== me.id) continue;
        lastMessageAt.set(message.from_user_id === me.id ? message.to_user_id : message.from_user_id, message.created_at);
      }
      const conversations = [...lastMessageAt]
        .sort(([, a], [, b]) => b.localeCompare(a))
        .map(([userId, last]) => {
          const user = users.get(userId);
          return { user_id: userId, display_name: user.display_name, username: user.username, last_message_at: last };
        });
      return [200, conversations];
    }

    const historyRoute = path.match(/^\/conversations\/([^/]+)\/messages$/);
    if (method === "GET" && historyRoute) {
      const limit = Number(searchParams.get("limit") || 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return [422, { detail: "limit must be between 1 and 100" }];
      const before = searchParams.get("before");
      const history = messages
        .filter((m) => (m.from_user_id === me.id && m.to_user_id === historyRoute[1]) || (m.to_user_id === me.id && m.from_user_id === historyRoute[1]))
        .filter((m) => !before || m.created_at < before)
        .slice(-limit)
        .reverse();
      return [200, history];
    }

    if (method === "POST" && path === "/messages") {
      if (body.to === me.id) return [400, { detail: "You cannot message yourself" }];
      if (!users.has(body.to)) return [404, { detail: "Recipient not found" }];
      if (!isValidPayload(body.payload)) return [422, { detail: "Validation failed" }];
      return [201, storeMessage(me.id, body.to, body.payload)];
    }

    return [404, { detail: "Not found" }];
  }

  const server = http.createServer((request, response) => {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
    if (request.method === "OPTIONS") {
      response.writeHead(204, cors);
      return response.end();
    }
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", async () => {
      let status, data;
      try {
        [status, data] = await route(request, new URL(request.url, "http://localhost"), raw ? JSON.parse(raw) : {});
      } catch {
        [status, data] = [400, { detail: "Invalid JSON" }];
      }
      response.writeHead(status, { ...cors, "Content-Type": "application/json" });
      response.end(JSON.stringify(data));
    });
  });

  const webSocketServer = new WebSocketServer({ server, path: "/ws" });

  webSocketServer.on("connection", (socket, request) => {
    const user = userFromToken(new URL(request.url, "http://localhost").searchParams.get("token"));
    if (!user) return socket.close(4401, "Unauthorized");

    sockets.set(user.id, socket);
    broadcast({ event: "user.online", user_id: user.id }, user.id);

    // Undelivered messages are flushed as soon as the recipient connects.
    for (const message of messages) {
      if (message.to_user_id === user.id && !message.delivered) {
        send(socket, receiveFrame(message));
        message.delivered = true;
      }
    }

    socket.on("message", (raw) => {
      let frame;
      try {
        frame = JSON.parse(raw);
      } catch {
        return send(socket, { event: "error", detail: "Invalid JSON" });
      }
      if (frame.event !== "message.send") return send(socket, { event: "error", detail: "Unknown event" });
      if (frame.to === user.id || !users.has(frame.to) || !isValidPayload(frame.payload)) return send(socket, { event: "error", detail: "Invalid message" });
      storeMessage(user.id, frame.to, frame.payload);
    });

    socket.on("close", () => {
      if (sockets.get(user.id) !== socket) return;
      sockets.delete(user.id);
      broadcast({ event: "user.offline", user_id: user.id }, user.id);
    });
  });

  return {
    listen: (port = 0) => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server.address().port))),
    close: () => new Promise((resolve) => {
      webSocketServer.clients.forEach((client) => client.terminate());
      webSocketServer.close(() => server.close(resolve));
    }),
  };
}

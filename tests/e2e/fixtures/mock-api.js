// In-memory stand-in for the WhisperBox API, following the API guide. It records everything the browser sends.
import crypto from "node:crypto";

const API = "https://whisperbox.koyeb.app";

export function createMockApi() {
  const users = [];
  const messages = [];
  const outgoing = [];
  const sockets = new Map();
  const tokens = new Map();
  const state = { failHistory: false };

  const publicProfile = (user) => {
    const profile = { ...user };
    delete profile.password;
    return profile;
  };

  const issueTokens = (user) => {
    const access = `access-${crypto.randomUUID()}`;
    tokens.set(access, user);
    return { access_token: access, refresh_token: `refresh-${crypto.randomUUID()}`, token_type: "bearer", expires_in: 900, user: publicProfile(user) };
  };

  async function attach(context) {
    await context.route(`${API}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });

      const body = request.postData() || "";
      outgoing.push({ method: request.method(), path: url.pathname, url: request.url(), body });
      const json = (status, data) => route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const me = tokens.get((request.headers().authorization || "").replace("Bearer ", ""));
      const path = url.pathname;

      if (path === "/auth/register") {
        const data = JSON.parse(body);
        const user = { ...data, id: crypto.randomUUID(), username: data.username.toLowerCase(), created_at: new Date().toISOString() };
        users.push(user);
        return json(201, issueTokens(user));
      }
      if (path === "/auth/login") {
        const data = JSON.parse(body);
        const user = users.find((u) => u.username === data.username && u.password === data.password);
        return user ? json(200, issueTokens(user)) : json(401, { detail: "Invalid credentials" });
      }
      if (!me) return json(401, { detail: "Unauthorized" });
      if (path === "/auth/me") return json(200, publicProfile(me));
      if (path === "/auth/logout") return json(200, { detail: "Logged out successfully" });
      if (path === "/users/search") {
        const query = url.searchParams.get("q").toLowerCase();
        return json(200, users.filter((u) => u.id !== me.id && u.username.includes(query)).map(({ id, username, display_name }) => ({ id, username, display_name })));
      }

      const publicKey = path.match(/^\/users\/([^/]+)\/public-key$/);
      if (publicKey) {
        const user = users.find((u) => u.id === publicKey[1]);
        return user ? json(200, { public_key: user.public_key }) : json(404, { detail: "Not found" });
      }
      if (path === "/conversations") {
        const ids = new Set(messages.filter((m) => m.from_user_id === me.id || m.to_user_id === me.id).map((m) => (m.from_user_id === me.id ? m.to_user_id : m.from_user_id)));
        return json(200, [...ids].map((id) => {
          const user = users.find((u) => u.id === id);
          return { user_id: id, display_name: user.display_name, username: user.username, last_message_at: new Date().toISOString() };
        }));
      }
      const history = path.match(/^\/conversations\/([^/]+)\/messages$/);
      if (history) {
        if (state.failHistory) return json(500, { detail: "History unavailable" });
        const other = history[1];
        return json(200, messages.filter((m) => (m.from_user_id === me.id && m.to_user_id === other) || (m.to_user_id === me.id && m.from_user_id === other)).slice().reverse());
      }
      if (path === "/messages" && request.method() === "POST") {
        const data = JSON.parse(body);
        const message = { id: crypto.randomUUID(), from_user_id: me.id, to_user_id: data.to, payload: data.payload, delivered: true, created_at: new Date().toISOString() };
        messages.push(message);
        return json(201, message);
      }
      return json(404, { detail: "No such route" });
    });

    await context.routeWebSocket(/whisperbox\.koyeb\.app\/ws/, (socket) => {
      const user = tokens.get(new URL(socket.url()).searchParams.get("token"));
      outgoing.push({ method: "WS-CONNECT", path: "/ws", url: "", body: "" });
      if (user) sockets.set(user.id, socket);
      socket.onMessage((frame) => outgoing.push({ method: "WS", path: "/ws", url: "", body: String(frame) }));
    });
  }

  return { attach, users, messages, outgoing, sockets, state };
}

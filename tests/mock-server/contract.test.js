// Checks the mock server against the contract in the WhisperBox API guide. Run with: npm run test:mock
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createMockServer } from "../../mock-server/server.js";

const payload = { ciphertext: "Y2lwaGVy", iv: "aXY=", encryptedKey: "a2V5", encryptedKeyForSelf: "c2VsZg==" };
let server, baseUrl;

async function call(method, path, { token, body } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

const register = async (username) =>
  (await call("POST", "/auth/register", { body: { username, display_name: username, password: "password123", public_key: `pk-${username}`, wrapped_private_key: `wk-${username}`, pbkdf2_salt: "salt" } })).data;

function connect(token) {
  const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/ws?token=${token}`);
  const frames = [];
  const waiters = [];
  socket.addEventListener("message", (event) => {
    const frame = JSON.parse(event.data);
    const waiter = waiters.shift();
    if (waiter) waiter(frame); else frames.push(frame);
  });
  const nextFrame = () => (frames.length ? Promise.resolve(frames.shift()) : new Promise((resolve) => waiters.push(resolve)));
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve({ socket, nextFrame }));
    socket.addEventListener("error", reject);
  });
}

before(async () => {
  server = createMockServer();
  baseUrl = `http://127.0.0.1:${await server.listen()}`;
});
after(() => server.close());

test("reports its health as a mock", async () => {
  assert.deepEqual((await call("GET", "/health")).data, { status: "ok", environment: "mock" });
});

test("registers, logs in, and validates accounts", async () => {
  const session = await register("Reg_User");
  assert.equal(session.user.username, "reg_user");
  assert.equal(session.expires_in, 900);
  assert.equal(session.user.password, undefined);
  assert.equal(session.user.wrapped_private_key, "wk-Reg_User");

  const base = { display_name: "x", password: "password123", public_key: "p", wrapped_private_key: "w", pbkdf2_salt: "s" };
  assert.equal((await call("POST", "/auth/register", { body: { ...base, username: "REG_USER" } })).status, 409);
  assert.equal((await call("POST", "/auth/register", { body: { ...base, username: "ab" } })).status, 422);
  assert.equal((await call("POST", "/auth/register", { body: { ...base, username: "valid_name", password: "short" } })).status, 422);

  assert.equal((await call("POST", "/auth/login", { body: { username: "reg_user", password: "password123" } })).status, 200);
  assert.equal((await call("POST", "/auth/login", { body: { username: "reg_user", password: "wrong-password" } })).status, 401);
});

test("protects routes, refreshes, and revokes on logout", async () => {
  const session = await register("token_user");
  assert.equal((await call("GET", "/auth/me")).status, 401);
  assert.equal((await call("GET", "/auth/me", { token: session.access_token })).data.username, "token_user");

  const refreshed = await call("POST", "/auth/refresh", { body: { refresh_token: session.refresh_token } });
  assert.equal(refreshed.status, 200);
  assert.deepEqual(Object.keys(refreshed.data).sort(), ["access_token", "expires_in", "token_type"]);

  const logout = await call("POST", "/auth/logout", { token: session.access_token, body: { refresh_token: session.refresh_token } });
  assert.deepEqual(logout.data, { detail: "Logged out successfully" });
  assert.equal((await call("POST", "/auth/refresh", { body: { refresh_token: session.refresh_token } })).status, 401);
});

test("searches users and returns public keys", async () => {
  const alice = await register("search_alice");
  const bob = await register("search_bob");
  const { data } = await call("GET", "/users/search?q=search_", { token: alice.access_token });
  assert.deepEqual(data, [{ id: bob.user.id, username: "search_bob", display_name: "search_bob" }]);
  assert.deepEqual((await call("GET", `/users/${bob.user.id}/public-key`, { token: alice.access_token })).data, { public_key: "pk-search_bob" });
  assert.equal((await call("GET", "/users/unknown/public-key", { token: alice.access_token })).status, 404);
});

test("stores messages and returns paginated history, newest first", async () => {
  const alice = await register("history_alice");
  const bob = await register("history_bob");
  const token = alice.access_token;
  assert.equal((await call("POST", "/messages", { token, body: { to: alice.user.id, payload } })).status, 400);
  assert.equal((await call("POST", "/messages", { token, body: { to: "unknown", payload } })).status, 404);

  const ids = [];
  for (let i = 0; i < 3; i += 1) {
    ids.push((await call("POST", "/messages", { token, body: { to: bob.user.id, payload } })).data.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const history = (await call("GET", `/conversations/${alice.user.id}/messages`, { token: bob.access_token })).data;
  assert.deepEqual(history.map((message) => message.id), [...ids].reverse());
  assert.deepEqual(history[0].payload, payload);

  const page = (await call("GET", `/conversations/${bob.user.id}/messages?limit=1&before=${encodeURIComponent(history[0].created_at)}`, { token })).data;
  assert.deepEqual(page.map((message) => message.id), [ids[1]]);
  assert.equal((await call("GET", `/conversations/${bob.user.id}/messages?limit=101`, { token })).status, 422);

  const conversations = (await call("GET", "/conversations", { token: bob.access_token })).data;
  assert.equal(conversations[0].user_id, alice.user.id);
  assert.equal(conversations[0].username, "history_alice");
});

test("rejects a WebSocket without a valid token", async () => {
  const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/ws?token=invalid`);
  const code = await new Promise((resolve) => socket.addEventListener("close", (event) => resolve(event.code)));
  assert.equal(code, 4401);
});

test("flushes undelivered messages on connect and sends presence", async () => {
  const alice = await register("ws_alice");
  const bob = await register("ws_bob");
  const stored = (await call("POST", "/messages", { token: alice.access_token, body: { to: bob.user.id, payload } })).data;
  assert.equal(stored.delivered, false);

  const aliceSocket = await connect(alice.access_token);
  const bobSocket = await connect(bob.access_token);
  const flushed = await bobSocket.nextFrame();
  assert.equal(flushed.event, "message.receive");
  assert.equal(flushed.id, stored.id);
  assert.equal(flushed.from_user_id, alice.user.id);
  assert.deepEqual(await aliceSocket.nextFrame(), { event: "user.online", user_id: bob.user.id });

  bobSocket.socket.close();
  assert.deepEqual(await aliceSocket.nextFrame(), { event: "user.offline", user_id: bob.user.id });
  aliceSocket.socket.close();
});

test("delivers message.send in real time and reports bad frames", async () => {
  const alice = await register("live_alice");
  const bob = await register("live_bob");
  const aliceSocket = await connect(alice.access_token);
  const bobSocket = await connect(bob.access_token);
  await aliceSocket.nextFrame();

  aliceSocket.socket.send(JSON.stringify({ event: "message.send", to: bob.user.id, payload }));
  const frame = await bobSocket.nextFrame();
  assert.deepEqual(Object.keys(frame).sort(), ["created_at", "event", "from_user_id", "id", "payload", "to_user_id"]);
  assert.deepEqual(frame.payload, payload);

  aliceSocket.socket.send("not json");
  assert.deepEqual(await aliceSocket.nextFrame(), { event: "error", detail: "Invalid JSON" });

  aliceSocket.socket.close();
  bobSocket.socket.close();
});

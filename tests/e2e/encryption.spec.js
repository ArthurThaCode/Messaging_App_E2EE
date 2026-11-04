import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { createMockApi } from "./fixtures/mock-api.js";

const SECRET_TEXT = "PLAINTEXT-MARKER-7f3a";
const ALICE = { name: "Alice", username: "alice_test", password: "CorrectHorse#7731" };
const BOB = { name: "Bob", username: "bob_test", password: "BatteryStaple#2290" };

const fromBase64 = (value) => Buffer.from(value, "base64");

async function register(page, { name, username, password }) {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByPlaceholder("Alex Morgan").fill(name);
  await page.getByPlaceholder("your_username").fill(username);
  await page.getByPlaceholder("Your private password").fill(password);
  await page.getByRole("button", { name: /Create WhisperBox/ }).click();
  await expect(page.locator(".chat-shell")).toBeVisible({ timeout: 30_000 });
}

async function login(page, { username, password }) {
  await page.goto("/auth");
  await page.getByPlaceholder("your_username").fill(username);
  await page.getByPlaceholder("Your private password").fill(password);
  await page.getByRole("button", { name: /Open WhisperBox/ }).click();
}

async function sendMessage(page, text) {
  await page.locator(".msg-input").fill(text);
  await page.locator(".msg-input").press("Enter");
  await expect(page.locator(".msg-input")).toHaveValue("");
}

async function openConversationWith(page, username) {
  await page.getByPlaceholder("Search users...").fill(username);
  await page.locator(".conv-item").first().click();
}

// Reads the saved private key without its bytes ever leaving IndexedDB.
const readStoredKey = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const entries = [];
          const cursor = open.result.transaction("keyval").objectStore("keyval").openCursor();
          cursor.onsuccess = async () => {
            if (cursor.result) {
              entries.push(cursor.result.value);
              cursor.result.continue();
              return;
            }
            const value = entries[0];
            if (!(value instanceof CryptoKey)) return resolve({ count: entries.length, isCryptoKey: false, type: typeof value });
            const exportable = await crypto.subtle.exportKey("pkcs8", value).then(() => true, () => false);
            resolve({ count: entries.length, isCryptoKey: true, extractable: value.extractable, keyType: value.type, algorithm: value.algorithm.name, exportable });
          };
        };
      })
  );

// Recovers a private key from the wrapped copy, using the password as only its owner should.
function unwrapPrivateKey(user, password) {
  const wrapped = fromBase64(user.wrapped_private_key);
  const key = crypto.pbkdf2Sync(password, fromBase64(user.pbkdf2_salt), 100000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, wrapped.subarray(0, 12));
  decipher.setAuthTag(wrapped.subarray(wrapped.length - 16));
  const pkcs8 = Buffer.concat([decipher.update(wrapped.subarray(12, wrapped.length - 16)), decipher.final()]);
  return crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
}

const rsaDecrypt = (privateKey, value) =>
  crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, fromBase64(value));

function aesDecrypt(aesKey, { iv, ciphertext }) {
  const data = fromBase64(ciphertext);
  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, fromBase64(iv));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString();
}

test.describe("WhisperBox encryption", () => {
  let api, alice, bob;

  test.beforeEach(async ({ browser }) => {
    api = createMockApi();
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    await api.attach(aliceContext);
    await api.attach(bobContext);
    alice = await aliceContext.newPage();
    bob = await bobContext.newPage();
    await register(alice, ALICE);
    await register(bob, BOB);
  });

  test("generates a 2048-bit RSA key and wraps the private key with PBKDF2", async () => {
    const [aliceRecord] = api.users;
    const publicKey = crypto.createPublicKey({ key: fromBase64(aliceRecord.public_key), format: "der", type: "spki" });
    expect(publicKey.asymmetricKeyDetails.modulusLength).toBe(2048);
    expect(fromBase64(aliceRecord.pbkdf2_salt)).toHaveLength(16);
    const derivedPublicKey = crypto.createPublicKey(unwrapPrivateKey(aliceRecord, ALICE.password)).export({ format: "der", type: "spki" });
    expect(derivedPublicKey.toString("base64")).toBe(aliceRecord.public_key);
    expect(() => unwrapPrivateKey(aliceRecord, "wrong-password")).toThrow();
  });

  test("sends no plaintext over the network", async () => {
    await openConversationWith(alice, "bob");
    await sendMessage(alice, SECRET_TEXT);
    await expect(alice.locator(".message-bubble").first()).toContainText(SECRET_TEXT);

    expect(api.messages).toHaveLength(1);
    expect(Object.keys(api.messages[0].payload).sort()).toEqual(["ciphertext", "encryptedKey", "encryptedKeyForSelf", "iv"]);
    const leaks = api.outgoing.filter((entry) => `${entry.url}${entry.body}`.includes(SECRET_TEXT));
    expect(leaks).toEqual([]);
    expect(JSON.stringify(await alice.evaluate(() => ({ ...localStorage })))).not.toContain(SECRET_TEXT);
  });

  test("uses a different key and IV for each message", async () => {
    await openConversationWith(alice, "bob");
    await sendMessage(alice, SECRET_TEXT);
    await sendMessage(alice, SECRET_TEXT);
    await expect.poll(() => api.messages.length).toBe(2);

    const privateKey = unwrapPrivateKey(api.users[0], ALICE.password);
    const [first, second] = api.messages.map((message) => message.payload);
    const firstKey = rsaDecrypt(privateKey, first.encryptedKeyForSelf);
    const secondKey = rsaDecrypt(privateKey, second.encryptedKeyForSelf);

    expect(firstKey).toHaveLength(32);
    expect(firstKey.equals(secondKey)).toBe(false);
    expect(fromBase64(first.iv)).toHaveLength(12);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(aesDecrypt(firstKey, first)).toBe(SECRET_TEXT);
  });

  test("lets the recipient and the sender decrypt, and only them", async () => {
    await openConversationWith(alice, "bob");
    await sendMessage(alice, SECRET_TEXT);
    await expect.poll(() => api.messages.length).toBe(1);

    await bob.locator(".conv-item").first().click({ timeout: 15_000 });
    await expect(bob.locator(".message-bubble").first()).toContainText(SECRET_TEXT);

    await alice.reload();
    await alice.locator(".conv-item").first().click({ timeout: 15_000 });
    await expect(alice.locator(".message-bubble").first()).toContainText(SECRET_TEXT);

    const aliceKey = unwrapPrivateKey(api.users[0], ALICE.password);
    expect(() => rsaDecrypt(aliceKey, api.messages[0].payload.encryptedKey)).toThrow();
  });

  test("shows a locked indicator when a message cannot be decrypted", async () => {
    await openConversationWith(alice, "bob");
    await sendMessage(alice, SECRET_TEXT);
    await expect.poll(() => api.messages.length).toBe(1);
    const [original] = api.messages;
    api.messages.push({ ...original, id: crypto.randomUUID(), payload: { ...original.payload, ciphertext: Buffer.from("corrupted-ciphertext").toString("base64") } });

    await bob.locator(".conv-item").first().click({ timeout: 15_000 });
    await expect(bob.locator(".message-locked-text")).toHaveText("[Encryption Locked]");
    await expect(bob.locator(".message-bubble").first()).toContainText(SECRET_TEXT);
  });

  test("stores a non-extractable private key in IndexedDB, including after login and reload", async () => {
    const expected = { count: 1, isCryptoKey: true, extractable: false, keyType: "private", algorithm: "RSA-OAEP", exportable: false };
    expect(await readStoredKey(alice)).toEqual(expected);

    await alice.reload();
    await expect(alice.locator(".chat-shell")).toBeVisible();
    expect(await readStoredKey(alice)).toEqual(expected);

    await alice.getByTitle("Log Out").click();
    await expect(alice.getByRole("button", { name: /Open WhisperBox/ })).toBeVisible();
    expect((await readStoredKey(alice)).count).toBe(0);

    await login(alice, ALICE);
    await expect(alice.locator(".chat-shell")).toBeVisible({ timeout: 30_000 });
    expect(await readStoredKey(alice)).toEqual(expected);

    const storage = JSON.stringify(await alice.evaluate(() => ({ ...localStorage })));
    expect(storage).not.toContain(ALICE.password);
    expect(storage).not.toContain("PRIVATE");
  });

  test("restores history after logging out and back in, and revokes the session on logout", async () => {
    await openConversationWith(alice, "bob");
    await sendMessage(alice, SECRET_TEXT);
    await expect.poll(() => api.messages.length).toBe(1);

    await alice.getByTitle("Log Out").click();
    await expect(alice.getByRole("button", { name: /Open WhisperBox/ })).toBeVisible();
    const logout = api.outgoing.find((entry) => entry.path === "/auth/logout");
    expect(JSON.parse(logout.body).refresh_token).toMatch(/^refresh-/);

    await login(alice, ALICE);
    await alice.locator(".conv-item").first().click({ timeout: 30_000 });
    await expect(alice.locator(".message-bubble").first()).toContainText(SECRET_TEXT);
  });

  test.describe("real-time messages", () => {
    const frameFor = (message) => JSON.stringify({ event: "message.receive", id: message.id, from_user_id: message.from_user_id, to_user_id: message.to_user_id, payload: message.payload, created_at: message.created_at });

    async function aliceSendsToBob() {
      await openConversationWith(alice, "bob");
      await sendMessage(alice, SECRET_TEXT);
      await expect.poll(() => api.messages.length).toBe(1);
      return api.messages[0];
    }

    test("displays a WebSocket message without waiting for polling, and only once", async () => {
      const message = await aliceSendsToBob();
      await bob.locator(".conv-item").first().click({ timeout: 15_000 });
      await expect(bob.locator(".message-bubble")).toHaveCount(1);

      api.state.failHistory = true;
      const realtime = { ...message, id: crypto.randomUUID() };
      api.sockets.get(api.users[1].id).send(frameFor(realtime));
      await expect(bob.locator(".message-bubble")).toHaveCount(2);

      api.sockets.get(api.users[1].id).send(frameFor(realtime));
      await bob.waitForTimeout(500);
      await expect(bob.locator(".message-bubble")).toHaveCount(2);
    });

    test("marks a conversation as unread when it is not open", async () => {
      const message = await aliceSendsToBob();
      await expect(bob.locator(".conv-item").first()).toBeVisible({ timeout: 15_000 });
      api.sockets.get(api.users[1].id).send(frameFor({ ...message, id: crypto.randomUUID() }));
      await expect(bob.locator(".unread-badge")).toHaveText("1");
    });

    test("reconnects after a page reload and shows the real connection state", async () => {
      await expect(alice.locator(".header-actions .status-chip")).toHaveText("Connected");
      const connections = () => api.outgoing.filter((entry) => entry.method === "WS-CONNECT").length;
      const before = connections();

      await alice.reload();
      await expect(alice.locator(".chat-shell")).toBeVisible();
      await expect.poll(connections).toBe(before + 1);
      await expect(alice.locator(".header-actions .status-chip")).toHaveText("Connected");

      await api.sockets.get(api.users[0].id).close();
      await expect(alice.locator(".header-actions .status-chip")).toHaveText("Disconnected");
    });
  });

  test("shows honest security labels", async () => {
    await expect(alice.getByText("PFS", { exact: true })).toHaveCount(0);
    await expect(alice.locator("body")).not.toContainText(/lovebox/i);

    await alice.getByTitle("Settings").click();
    const expected = crypto.createHash("sha256").update(fromBase64(api.users[0].public_key)).digest("hex").slice(0, 16).toUpperCase().match(/.{2}/g).join(":");
    await expect(alice.locator(".key-fingerprint")).toHaveText(expected);
  });
});

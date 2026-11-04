// Runs the whole app against the real mock server. Run with: npm run test:mock
import { test, expect } from "@playwright/test";

const SECRET_TEXT = "Hello from the mock demo";

async function register(page, name, username) {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByPlaceholder("Alex Morgan").fill(name);
  await page.getByPlaceholder("your_username").fill(username);
  await page.getByPlaceholder("Your private password").fill("demo-password-123");
  await page.getByRole("button", { name: /Create WhisperBox/ }).click();
  await expect(page.locator(".chat-shell")).toBeVisible({ timeout: 30_000 });
}

test("two users exchange an encrypted message through the mock server", async ({ browser }) => {
  const suffix = Date.now();
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  const framesReceivedByAlice = [];
  alice.on("websocket", (socket) => socket.on("framereceived", (frame) => framesReceivedByAlice.push(String(frame.payload))));
  await register(alice, "Alice", `alice_${suffix}`);
  await register(bob, "Bob", `bob_${suffix}`);
  await expect(alice.locator(".header-actions .status-chip")).toHaveText("Connected");

  await alice.getByPlaceholder("Search users...").fill(`bob_${suffix}`);
  await alice.locator(".conv-item").first().click();

  const sent = alice.waitForRequest((request) => request.url().endsWith("/messages") && request.method() === "POST");
  await alice.locator(".msg-input").fill(SECRET_TEXT);
  await alice.locator(".msg-input").press("Enter");
  expect((await sent).postData()).not.toContain(SECRET_TEXT);
  await expect(alice.locator(".message-bubble").first()).toContainText(SECRET_TEXT);

  await bob.locator(".conv-item").first().click({ timeout: 15_000 });
  await expect(bob.locator(".message-bubble").first()).toContainText(SECRET_TEXT);

  // The mock pushes this reply to Alice over the WebSocket; polling could also display it, so the frame is checked too.
  await bob.locator(".msg-input").fill("Reply over the mock");
  await bob.locator(".msg-input").press("Enter");
  await expect(alice.getByText("Reply over the mock")).toBeVisible({ timeout: 3_000 });
  await expect(alice.getByText("Reply over the mock")).toHaveCount(1);
  expect(framesReceivedByAlice.some((frame) => frame.includes('"event":"message.receive"'))).toBe(true);
});

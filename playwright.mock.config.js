import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 5190;

export default defineConfig({
  testDir: "./tests/mock-server",
  testMatch: "*.spec.js",
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL: `http://localhost:${WEB_PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev:mock",
    url: `http://localhost:${WEB_PORT}`,
    env: { MOCK_WEB_PORT: String(WEB_PORT), MOCK_API_PORT: "8797" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

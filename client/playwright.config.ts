import { defineConfig, devices } from "@playwright/test";

const clientUrl = "http://127.0.0.1:5173";
const serverUrl = "http://127.0.0.1:8080";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: clientUrl,
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: [
    {
      command: "go run ./cmd/server",
      cwd: "../server",
      url: `${serverUrl}/healthz`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: "8080",
        ALLOWED_ORIGINS: clientUrl,
        ROOM_EMPTY_TTL: "3s",
        LOG_LEVEL: "warn",
      },
    },
    {
      command: "pnpm dev --host 127.0.0.1 --port 5173",
      url: clientUrl,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { PUBLIC_SERVER_URL: serverUrl },
    },
  ],
});

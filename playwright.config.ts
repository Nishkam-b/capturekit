import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  timeout: 60_000,
  reporter: [["list"]],
  projects: [
    {
      name: "unit",
      testDir: "tests/unit",
    },
    {
      name: "e2e",
      testDir: "tests/e2e",
      // Screen capture needs a real, headed Chrome. Each describe block sets its own capture flags.
      workers: 1,
      use: {
        baseURL: `http://localhost:${PORT}`,
        channel: "chrome",
        headless: false,
        viewport: { width: 1280, height: 800 },
        acceptDownloads: true,
      },
    },
    {
      name: "e2e-edge",
      testDir: "tests/e2e",
      workers: 1,
      use: {
        baseURL: `http://localhost:${PORT}`,
        channel: "msedge",
        headless: false,
        viewport: { width: 1280, height: 800 },
        acceptDownloads: true,
      },
    },
    {
      // Cursor tracking with the real unpacked extension (launches its own Edge profile).
      name: "e2e-extension",
      testDir: "tests/extension",
      workers: 1,
    },
    {
      // Smoke test only. Needs `npx playwright install firefox`. Safari can't be automated on Windows.
      name: "e2e-firefox",
      testDir: "tests/firefox",
      workers: 1,
      use: {
        baseURL: `http://localhost:${PORT}`,
        browserName: "firefox",
        headless: false,
        viewport: { width: 1280, height: 800 },
        acceptDownloads: true,
        launchOptions: {
          firefoxUserPrefs: {
            "media.navigator.streams.fake": true, // fake camera + mic
            "media.navigator.permission.disabled": true, // skip camera/mic/screen prompts
            "permissions.default.camera": 1,
            "permissions.default.microphone": 1,
          },
        },
      },
    },
  ],
  webServer: {
    command: `node scripts/serve.mjs --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

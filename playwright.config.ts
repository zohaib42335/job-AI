import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
    ignoreHTTPSErrors: true,
  },
  outputDir: "reports/playwright",
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});

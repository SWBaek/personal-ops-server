import { defineConfig } from "@playwright/test";

const managedBaseUrl = "http://127.0.0.1:4321";
const configuredBaseUrl = process.env.OPS_E2E_BASE_URL?.trim();
const baseURL = configuredBaseUrl || managedBaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./var/playwright/test-results",
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "var/playwright/report", open: "never" }],
  ],
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  ...(configuredBaseUrl
    ? {}
    : { webServer: {
        command: "node --env-file-if-exists=.env --import tsx tests/e2e/server.ts",
        url: `${managedBaseUrl}/api/health`,
        reuseExistingServer: false,
        timeout: 30_000,
        env: {
          OPS_HOST: "127.0.0.1",
          OPS_PORT: "4321",
          OPS_DATA_DIR: "./var/playwright/data",
          OPS_RUNTIME_DIR: "./var/playwright/runtime",
          OPS_RUNTIME_ENV: "test",
        },
      } }),
});

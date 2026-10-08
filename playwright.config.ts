/**
 * Tests de bout en bout de l'administration (npm run test:e2e) : vrai navigateur, vraie API,
 * base et stockage locaux jetables (tests/e2e/serve.ts).
 */
import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./tests/e2e/constants.ts";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: E2E.baseUrl,
    locale: "fr-FR",
    timezoneId: "Africa/Casablanca",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Chrome installé sur le poste (ou « npx playwright install chrome » en intégration continue).
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: "npx tsx tests/e2e/serve.ts",
    url: `${E2E.baseUrl}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
  },
});

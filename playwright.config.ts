import { defineConfig } from "@playwright/test";

// 端到端测试：需要本地 Supabase（见 README）与 LLM_MOCK=1
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  use: { baseURL: process.env.E2E_BASE_URL || "http://localhost:3000", viewport: { width: 1440, height: 900 } },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", port: 3000, reuseExistingServer: true, timeout: 120_000 },
});

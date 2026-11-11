import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "apps/desktop/tests",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 30000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { trace: "retain-on-failure" },
});

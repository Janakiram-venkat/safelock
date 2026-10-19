import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02, threshold: 0.15 } },
  fullyParallel: false,
  workers: 1, // one GPU
  reporter: [["list"]],
  snapshotPathTemplate: "tests/e2e/__screenshots__/{arg}{ext}",
  use: {
    baseURL: "http://localhost:5180",
    viewport: { width: 1280, height: 900 },
    launchOptions: { args: ["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] },
  },
  webServer: {
    command: "npx vite",
    url: "http://localhost:5180",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

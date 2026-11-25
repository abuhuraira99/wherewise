import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the deployed site by default, so they check
 * what real visitors get. Point BASE_URL at `wrangler dev` to test locally.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 2,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://wherewise.iamabuhuraira7.workers.dev',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'phone-android', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'phone-iphone', use: { ...devices['iPhone 14'] } },
    { name: 'tablet', use: { ...devices['iPad Pro 11'] } },
  ],
});

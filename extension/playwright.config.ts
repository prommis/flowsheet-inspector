import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/e2e',
  timeout: 60000,
  use: {
    headless: true,
  },
});

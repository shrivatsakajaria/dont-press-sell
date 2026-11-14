import { defineConfig } from '@playwright/test';

// PW_PORT lets each worktree test its own build: Playwright reuses any server already on the port.
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    port,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

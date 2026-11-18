import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';

/** Umami's host (R66). Tests never reach it: every page blocks it, and a test may fulfil it with a stub. */
export const UMAMI = /^https:\/\/(cloud|gateway)\.umami\.is\//;

/** Every e2e page starts with Umami blocked, so no test ever sends or loads anything from it. */
export const test = base.extend<{ blockUmami: void }>({
  blockUmami: [
    async ({ page }, use) => {
      // Answered here with an empty script: nothing leaves the machine, and no failed load shows in the console.
      await page.route(UMAMI, (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
      await use();
    },
    { auto: true },
  ],
});

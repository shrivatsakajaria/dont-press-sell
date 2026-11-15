import { expect, test } from '@playwright/test';
import { pressStart } from './start';

test('with sharing unavailable, Challenge a friend shows the card full screen with the fallback, crash name hidden', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
  await page.clock.install();
  await page.goto('/?run=s2018');
  await pressStart(page);
  await page.clock.runFor(119_000); // R27: s2018 runs about 118 s
  await expect(page.getByText('Late edition')).toBeVisible();
  // Before the reveal: the name is covered.
  await expect(page.locator('.es-folio')).not.toContainText('wobble');
  await page.getByRole('button', { name: 'Challenge a friend' }).click();
  const overlay = page.locator('[data-share-fallback]');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByText('Press and hold to save')).toBeVisible();
  await expect(overlay.getByRole('img', { name: 'Your result card' })).toBeVisible();
  await expect(overlay).not.toContainText(/2018|wobble|autumn/i);
  await overlay.getByRole('button', { name: 'Copy link' }).click();
  await expect(overlay.getByRole('button', { name: 'Link copied' })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  // The link uses the address the page is served from, and names no crash.
  expect(link.startsWith(new URL(page.url()).origin + '/#c=')).toBe(true);
  expect(link).not.toMatch(/2018|wobble|s2018/i);
  await page.screenshot({ path: 'e2e/shots/W4/share-fallback.png' });
});

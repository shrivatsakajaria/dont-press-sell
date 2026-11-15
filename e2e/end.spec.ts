import { expect, test, type Page } from '@playwright/test';

const COVER = 'Tap to see what that was';
const NAME = 'That was the autumn 2014 wobble';

/** Plays s2014 (about 29 s since R27) with no taps, a second at a time, until the front page prints. */
async function finishWithoutTapping(page: Page) {
  await page.clock.install();
  await page.goto('/?run=s2014');
  await expect(page.locator('button.act')).toHaveText(/^Sell for/);
  for (let i = 0; i < 60 && (await page.locator('.es-h1').count()) === 0; i++) await page.clock.runFor(1000);
}

test('a run with no taps prints the level front page, with the crash name covered', async ({ page }) => {
  await finishWithoutTapping(page);
  await expect(page.locator('.es-h1')).toHaveText('Local investor does absolutely nothing, finishes level');
  await expect(page.getByRole('button', { name: COVER })).toBeVisible();
  await expect(page.locator('.es-folio')).not.toContainText(/2014|wobble/);
});

test('the crash name shows after a tap on the cover', async ({ page }) => {
  await finishWithoutTapping(page);
  await expect(page.locator('.es-folio')).not.toContainText('wobble');
  await page.getByRole('button', { name: COVER }).click();
  await expect(page.locator('.es-folio')).toContainText(NAME);
  await expect(page.getByRole('button', { name: COVER })).toHaveCount(0);
});

test('the crash name shows by itself after 4 seconds without a tap', async ({ page }) => {
  await finishWithoutTapping(page);
  // The page printed at most a second ago, so 2.5 s more is still before the 4 s mark.
  await page.clock.runFor(2500);
  await expect(page.locator('.es-folio')).not.toContainText('wobble');
  await page.clock.runFor(1600);
  await expect(page.locator('.es-folio')).toContainText(NAME);
});

import { expect, test, type Page } from '@playwright/test';
import { pressStart } from './start';

const COVER = 'Tap to see what that was';
const NAME = 'That was the autumn 2014 wobble';
const BACK = 'It was back in two weeks.';

/** Plays s2014 (about 29 s since R27) with no taps, a second at a time, until the front page prints. */
async function finishWithoutTapping(page: Page) {
  await page.clock.install();
  await page.goto('/?run=s2014');
  await pressStart(page);
  await expect(page.locator('button.act')).toHaveText(/^Sell for/);
  for (let i = 0; i < 60 && (await page.locator('.es-h1').count()) === 0; i++) await page.clock.runFor(1000);
}

test('a run with no taps prints the level front page, with the crash name covered', async ({ page }) => {
  await finishWithoutTapping(page);
  await expect(page.locator('.es-h1')).toHaveText('Local investor does absolutely nothing, finishes level');
  await expect(page.getByRole('button', { name: COVER })).toBeVisible();
  await expect(page.locator('main.es')).not.toContainText(/2014|wobble/);
});

test('the crash name shows after a tap on the cover', async ({ page }) => {
  await finishWithoutTapping(page);
  await expect(page.locator('main.es')).not.toContainText('wobble');
  await page.getByRole('button', { name: COVER }).click();
  // R44: the name prints large where the cover was, and how long it took to come back under it.
  await expect(page.locator('.es-name')).toHaveText(NAME);
  await expect(page.locator('.es-name-sub')).toHaveText(BACK);
  await expect(page.getByRole('button', { name: COVER })).toHaveCount(0);
});

test('the crash name shows by itself after 4 seconds without a tap', async ({ page }) => {
  await finishWithoutTapping(page);
  // The page printed at most a second ago, so 2.5 s more is still before the 4 s mark.
  await page.clock.runFor(2500);
  await expect(page.locator('main.es')).not.toContainText('wobble');
  await page.clock.runFor(1600);
  await expect(page.locator('.es-name')).toHaveText(NAME);
});

test('the cover is a large control: full width and at least 72 px tall (R44)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await finishWithoutTapping(page);
  const box = (await page.getByRole('button', { name: COVER }).boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(340);
  expect(box.height).toBeGreaterThanOrEqual(72);
  expect(box.y + box.height).toBeLessThanOrEqual(660);
});

test('no countdown starts the next game by itself (R44)', async ({ page }) => {
  await finishWithoutTapping(page);
  await page.clock.runFor(30_000);
  await expect(page.getByText(/Next mystery crash/)).toHaveCount(0);
  await expect(page.locator('.es-h1')).toBeVisible();
});

test('Rematch opens on a short start screen; after Start s2014 opens on its red day 1', async ({ page }) => {
  await finishWithoutTapping(page);
  await expect(page.locator('.es-h1')).toBeVisible();
  await page.clock.runFor(6000); // reveal and count
  await page.getByRole('button', { name: 'Rematch this crash' }).click();
  // R45: a later game's start screen is short: its label and Start (and the score to beat).
  await expect(page.locator('.intro .lead')).toHaveText('Rematch');
  await expect(page.locator('.intro')).not.toContainText('The market is falling');
  await page.clock.runFor(5000);
  await expect(page.locator('.folio')).toContainText('Day 1');
  await pressStart(page);
  // s2014's day 1 is a slow, falling day: the page turns red at once.
  await expect(page.locator('.play.is-worst')).toHaveCount(1);
  await expect(page.locator('.folio')).toContainText('Day 1');
});

test('a new game on a quiet day 1 moves on within half a second', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?run=c2020');
  await pressStart(page);
  for (let i = 0; i < 100 && (await page.locator('.es-h1').count()) === 0; i++) await page.clock.runFor(1000);
  await page.clock.runFor(6000);
  await page.getByRole('button', { name: 'Rematch this crash' }).click();
  await pressStart(page);
  await expect(page.locator('.folio')).toContainText('Day 1');
  await page.clock.runFor(500);
  await expect(page.locator('.folio')).not.toContainText('Day 1');
});

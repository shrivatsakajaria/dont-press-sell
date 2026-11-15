import { expect, test } from '@playwright/test';

// R46: the first game a player ever plays is a real crash: 1987, 2008, 2020 or 2022.
// The stored record decides "ever". A challenge link still opens its own run.
const FIRST = ['c1987', 'c2007', 'c2020', 'c2022'];

const picked = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('dps:recent') ?? '[]')[0] as string);

test('a new player gets one of the four real crashes, on the full start screen', async ({ page }) => {
  for (let i = 0; i < 6; i++) {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('button.act')).toHaveText('Start');
    await expect(page.locator('.intro p').first()).toHaveText('The market is falling. Nobody knows how far.');
    expect(FIRST).toContain(await picked(page));
  }
});

test('a player with a game on record gets the whole pool again', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dps:record', JSON.stringify({ games: 1, wins: 0, soldTooEarly: 0, played: ['c2007'], titles: [], bestStreak: 0 }));
  });
  const seen = new Set<string>();
  for (let i = 0; i < 30 && [...seen].every((id) => FIRST.includes(id)); i++) {
    await page.goto('/');
    await expect(page.locator('button.act')).toHaveText('Start');
    seen.add(await picked(page));
  }
  // Half of all picks are false alarms: thirty loads without one would be a 1 in a billion fluke.
  expect([...seen].some((id) => !FIRST.includes(id))).toBe(true);
});

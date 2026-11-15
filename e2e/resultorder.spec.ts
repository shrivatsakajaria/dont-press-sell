import { expect, test, type Page } from '@playwright/test';
import { pressStart } from './start';

// R28: on a 390 x 660 screen the reveal, the score and the main buttons are in view without scrolling far;
// the near-miss lines and the table sit below the buttons; the countdown stays under the score.

/** Plays c2007 at 390 x 660: sells after 4 s, buys back after `buyAfter` ms more (or never), and waits for the count. */
async function play(page: Page, buyAfter: number | null) {
  await page.setViewportSize({ width: 390, height: 660 });
  await page.clock.install();
  await page.goto('/?run=c2007');
  await pressStart(page);
  const act = page.locator('button.act');
  await page.clock.runFor(4000);
  await act.click();
  await expect(act).toHaveText(/^Buy back now/);
  if (buyAfter !== null) {
    await page.clock.runFor(buyAfter);
    await act.click();
    await expect(act).toHaveText(/^Sell for/);
  }
  for (let i = 0; i < 120 && (await page.locator('.es-h1').count()) === 0; i++) await page.clock.runFor(1000);
  await expect(page.locator('.es-h1')).toBeVisible();
  // Reveal, count up, and let the countdown start.
  await page.clock.runFor(6500);
  await expect(page.locator('.es-count')).toBeVisible();
  await expect(page.locator('.es-misses')).toContainText(/Out of the market for /);
  await expect(page.locator('.es-misses')).not.toContainText(/days? in cash/);
  await expect(page.getByText('Someone who did nothing kept all their money in the market the whole time.')).toBeVisible();
  return page.evaluate(() => {
    const r = (q: string) => document.querySelector(q)!.getBoundingClientRect();
    return {
      reveal: r('.es-reveal').bottom,
      lead: r('.es-lead').bottom,
      count: r('.es-count').top,
      countAfter: document.querySelector('.es-count')!.previousElementSibling!.className,
      /** The first pair of buttons: double or nothing when offered, else rematch and challenge. */
      button: r('.es-pair').bottom,
      double: !!document.querySelector('.es-double'),
      link: r('.es-link').bottom,
      table: r('.es-table').top,
      misses: r('.es-misses').top,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

test('behind after selling out: reveal, score, countdown and the buttons all on the first screen', async ({ page }) => {
  const m = await play(page, null);
  await page.screenshot({ path: 'e2e/shots/S/result-660-behind.png' });
  await page.screenshot({ path: 'e2e/shots/S/result-660-behind-full.png', fullPage: true });
  expect(m.double).toBe(false);
  expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
  expect(m.reveal).toBeLessThanOrEqual(660);
  expect(m.lead).toBeLessThanOrEqual(660);
  expect(m.button).toBeLessThanOrEqual(660);
  expect(m.count).toBeGreaterThan(m.lead);
  expect(m.countAfter).toMatch(/es-(perfect|vs)/);
  expect(m.table).toBeGreaterThan(m.link);
  expect(m.misses).toBeGreaterThan(m.table);
});

test('a win with double or nothing: the score on the first screen, its buttons a short scroll away', async ({ page }) => {
  const m = await play(page, 6000);
  await page.screenshot({ path: 'e2e/shots/S/result-660-win.png' });
  await page.screenshot({ path: 'e2e/shots/S/result-660-win-full.png', fullPage: true });
  expect(m.double).toBe(true);
  expect(m.reveal).toBeLessThanOrEqual(660);
  expect(m.lead).toBeLessThanOrEqual(660);
  // The double block (title, stake, ladder, buttons) is tall: its buttons are within a quarter screen of scrolling.
  expect(m.button).toBeLessThanOrEqual(660 * 1.25);
  expect(m.count).toBeGreaterThan(m.lead);
  expect(m.table).toBeGreaterThan(m.link);
  expect(m.misses).toBeGreaterThan(m.table);
});

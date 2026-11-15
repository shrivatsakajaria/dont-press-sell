import { expect, test, type Page } from '@playwright/test';
import { pressStart } from './start';

// R44: the result page, buttons included, fits one screen (390 x 660 and 390 x 844) with no scrolling,
// after a win and after a loss, before and after the reveal. After a win "Wins in a row: N" and
// "Double or nothing" are on that screen; after a loss there is no double or nothing.
// R28: the near misses and the table come after the buttons (left out when they do not fit).

/** Plays c2007: sells after 4 s, buys back after `buyAfter` ms more (or never), until the front page prints. */
async function play(page: Page, height: number, buyAfter: number | null) {
  await page.setViewportSize({ width: 390, height });
  await page.clock.install();
  await page.goto('/?run=c2007');
  await pressStart(page);
  const act = page.locator('button.act');
  await page.clock.runFor(4000);
  await act.click();
  await expect(act).toHaveText(/^Buy back/);
  if (buyAfter !== null) {
    await page.clock.runFor(buyAfter);
    await act.click();
    await expect(act).toHaveText(/^Sell for/);
  }
  for (let i = 0; i < 160 && (await page.locator('.es-h1').count()) === 0; i++) await page.clock.runFor(1000);
  await expect(page.locator('.es-h1')).toBeVisible();
}

/** Page height against the window, and every button that is not wholly on screen. */
function fit(page: Page) {
  return page.evaluate(() => {
    const out = Array.from(document.querySelectorAll('main.es button'))
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.height > 0 && (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth);
      })
      .map((b) => b.textContent);
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      out,
    };
  });
}

async function expectOneScreen(page: Page) {
  const m = await fit(page);
  expect(m.scrollHeight).toBeLessThanOrEqual(m.innerHeight);
  expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
  expect(m.out).toEqual([]);
}

for (const height of [660, 844]) {
  test(`a win fits one ${height} px screen before and after the reveal, with wins in a row and double or nothing`, async ({ page }) => {
    await play(page, height, 6000);
    await expect(page.getByRole('button', { name: 'Tap to see what that was' })).toBeVisible();
    await expectOneScreen(page);
    await page.screenshot({ path: `e2e/shots/D/result-${height}-win-cover.png` });
    await page.getByRole('button', { name: 'Tap to see what that was' }).click();
    await page.clock.runFor(3000);
    await expectOneScreen(page);
    await expect(page.locator('.es-double h2')).toHaveText('Wins in a row: 1');
    await expect(page.locator('.es-double h2')).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Double or nothing' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: /^Bank \$/ })).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.es-lead')).toHaveText(/ahead of someone who did nothing/);
    await expect(page.locator('.es-perfect')).toContainText('You finished with $');
    await expect(page.getByText(/Your pot/)).toHaveCount(0);
    await page.screenshot({ path: `e2e/shots/D/result-${height}-win.png` });
  });

  test(`a loss fits one ${height} px screen before and after the reveal, with no double or nothing`, async ({ page }) => {
    await play(page, height, null);
    await expectOneScreen(page);
    await page.screenshot({ path: `e2e/shots/D/result-${height}-loss-cover.png` });
    // Unopened: the page shows the name by itself after 4 s.
    await page.clock.runFor(4000 + 3000);
    await expect(page.locator('.es-name')).toHaveText('That was 2008');
    await expectOneScreen(page);
    await expect(page.getByRole('button', { name: 'Double or nothing' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rematch this crash' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Play a new mystery crash' })).toBeInViewport({ ratio: 1 });
    // A first game has no streak behind it: no "Best winning streak" line.
    await expect(page.getByText(/Best winning streak/)).toHaveCount(0);
    await expect(page.getByText(/Your pot/)).toHaveCount(0);
    await page.screenshot({ path: `e2e/shots/D/result-${height}-loss.png` });
  });
}

test('after a streak ends, the loss says the best winning streak', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dps:record', JSON.stringify({ games: 4, wins: 3, soldTooEarly: 0, played: ['c2007'], titles: [], bestStreak: 3 }));
  });
  await play(page, 660, null);
  await page.clock.runFor(7000);
  await expect(page.locator('.es-best')).toHaveText('Best winning streak: 3');
  await expectOneScreen(page);
});

test('the near misses and the table come after the buttons when they fit', async ({ page }) => {
  await play(page, 844, null);
  await page.clock.runFor(7000);
  const order = await page.evaluate(() => {
    const top = (q: string) => {
      const e = document.querySelector(q) as HTMLElement | null;
      return e && !e.hasAttribute('data-trim') ? e.getBoundingClientRect().top : null;
    };
    return { pair: top('.es-pair'), link: top('.es-link'), table: top('.es-table'), note: top('.es-note'), misses: top('.es-misses') };
  });
  expect(order.pair).not.toBeNull();
  for (const k of ['table', 'note', 'misses'] as const) if (order[k] !== null) expect(order[k]!).toBeGreaterThan(order.link!);
});

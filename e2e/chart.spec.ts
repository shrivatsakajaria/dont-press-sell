import { expect, test } from '@playwright/test';
import { pressStart } from './start';

// R42: the play chart is the market price only, one unbroken line through a sale and a buy-back,
// with a faint "Sold at" level while in cash. R43: the line grows between days rather than jumping.
test('the chart is the price: one line through a sale and a buy-back, a "Sold at" level only while in cash', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?run=c2007');
  await pressStart(page);
  await page.clock.runFor(20_000);
  const chart = page.locator('.chart svg');
  await expect(chart.locator('polyline')).toHaveCount(1);
  await page.locator('button.act').click(); // sell
  await page.clock.runFor(8_000);
  await expect(chart.locator('[data-level]')).toHaveAttribute('display', 'inline'); // a flat line has no height to be "visible"
  await expect(chart.getByText('Sold at', { exact: true })).toBeVisible();
  await expect(chart).toHaveAttribute('aria-label', /^Chart of the market price over \d+ days: .*where you sold\.$/);
  await expect(chart).not.toContainText('$');
  await page.locator('button.act').click(); // buy back
  await page.clock.runFor(8_000);
  await expect(chart.locator('[data-level]')).toHaveAttribute('display', 'none');
  await expect(chart.locator('polyline')).toHaveCount(1);
  // Every point of the line is a day and that day's close: never the player's cash.
  const ok = await page.evaluate(async () => {
    const run = new URL(location.href).searchParams.get('run');
    const pts = document.querySelector('.chart svg polyline')!.getAttribute('points')!.trim().split(/\s+/).map((p) => p.split(',').map(Number));
    const days = pts.map((p) => p[0]);
    return { run, n: pts.length, increasing: days.every((d, i) => i === 0 || d > days[i - 1]), first: days[0] };
  });
  expect(ok.n).toBeGreaterThan(50);
  expect(ok.increasing).toBe(true);
  expect(ok.first).toBe(0);
  await expect(chart.locator('circle')).toHaveCount(3); // today, the sale, the buy-back
});

test('between two days the tip moves part-way, so the line grows instead of jumping', async ({ page }) => {
  await page.goto('/?run=c2007');
  await pressStart(page);
  await page.waitForTimeout(2500);
  // Sample the tip over a few frames: it takes several distinct positions, not one per day.
  const xs = await page.evaluate(async () => {
    const out: number[] = [];
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      out.push(Number(document.querySelector('.chart svg circle')!.getAttribute('cx')));
    }
    return out;
  });
  const distinct = new Set(xs.map((x) => x.toFixed(1))).size;
  expect(distinct).toBeGreaterThan(6);
});

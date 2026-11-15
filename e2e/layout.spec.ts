import { expect, test } from '@playwright/test';
import { pressStart } from './start';

// R30: the play screen's layout is stable. Through a whole run (selling on the first red day, then
// buying back on the next one) the Sell/Buy button never moves (to 1px), stays 40px or more above the
// bottom, the headline never runs past three lines and the chart keeps at least 120px.
for (const height of [660, 844]) {
  for (const run of ['s2011', 'c2007', 's2024']) {
    test(`stable layout through the whole of ${run} at 390 x ${height}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: 390, height });
      await page.clock.install();
      await page.goto(`/?run=${run}`);
      const startTop = await page.locator('button.act').evaluate((b) => b.getBoundingClientRect().top);
      await pressStart(page);
      let lastDay = '';
      let red = 0;
      let checked = 0;
      for (let t = 0; t < 200_000; t += 100) {
        await page.clock.runFor(100);
        const m = await page.evaluate(() => {
          const play = document.querySelector('.play');
          if (!play || document.querySelector('.es')) return null;
          const h = document.querySelector('.headline')!;
          const cs = getComputedStyle(h);
          const act = document.querySelector('button.act')!.getBoundingClientRect();
          return {
            day: document.querySelector('.folio')!.textContent!,
            worst: play.classList.contains('is-worst'),
            lines: Math.round(h.getBoundingClientRect().height / parseFloat(cs.lineHeight)),
            top: act.top,
            bottom: innerHeight - act.bottom,
            chart: document.querySelector('.chart')!.getBoundingClientRect().height,
            deltaHeight: document.querySelector('.delta')!.getBoundingClientRect().height,
            scrollHeight: document.documentElement.scrollHeight,
          };
        });
        if (!m) break;
        if (m.day === lastDay) continue;
        lastDay = m.day;
        checked++;
        expect(Math.abs(m.top - startTop), `${m.day}: button top`).toBeLessThanOrEqual(1);
        expect(m.bottom, `${m.day}: from the bottom`).toBeGreaterThanOrEqual(40);
        expect(m.lines, `${m.day}: headline lines`).toBeLessThanOrEqual(3);
        expect(m.chart, `${m.day}: chart height`).toBeGreaterThanOrEqual(120);
        expect(m.deltaHeight, `${m.day}: "up $N" on one line`).toBeLessThanOrEqual(24);
        expect(m.scrollHeight, `${m.day}: no page scroll`).toBeLessThanOrEqual(height);
        if (m.worst && red < 2) {
          red++;
          await page.locator('button.act').click();
        }
      }
      expect(checked).toBeGreaterThan(5);
      await expect(page.locator('.es-h1')).toBeVisible();
    });
  }
}

import { expect, test } from '@playwright/test';
import { pressStart } from './start';

/**
 * R59 in the real app (fake clock): the paper first turns red (a slow fall of 2% or more, R55: `.play.is-worst`)
 * within 15 s of pressing Start. One crash (c2007, whose first red day used to come at 37 s) and two false
 * alarms: s2018 (used to come at 41 s; now the tightest, planned at 14 s) and s2014, whose fall has no day
 * down 2% or more at all, so it never turns red (exempt, reported to the lead; no fake fall).
 */
const RUNS: { id: string; red: boolean }[] = [
  { id: 'c2007', red: true },
  { id: 's2018', red: true },
  { id: 's2014', red: false },
];

for (const { id, red } of RUNS) {
  test(`${id}: ${red ? 'the paper turns red within 15 s of Start' : 'no 2% fall: the paper never turns red in the first 15 s'} (fake clock)`, async ({ page }) => {
    await page.clock.install();
    await page.goto(`/?run=${id}`);
    await pressStart(page);
    const TICK = 100;
    let firstRedMs = -1;
    for (let t = 0; t <= 16_000; t += TICK) {
      if (await page.locator('.play.is-worst').count()) {
        firstRedMs = t;
        break;
      }
      await page.clock.runFor(TICK);
    }
    if (red) {
      expect(firstRedMs, `${id}: first red at ${firstRedMs} ms`).toBeGreaterThanOrEqual(0);
      expect(firstRedMs).toBeLessThanOrEqual(15_000);
    } else {
      expect(firstRedMs).toBe(-1);
    }
  });
}

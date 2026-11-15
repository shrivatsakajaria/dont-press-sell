import { expect, test } from '@playwright/test';
import { pressStart } from './start';

// R36 and R37 in the real app: no headline stays more than 8 s, and no line under it comes back
// once replaced. (The 4 s hold, with its slow-day and trade exceptions, is swept in
// tests/game/narrator-sweep.test.ts over every run.)
test('headlines change within 8 s and lines under them never come back (s2018, fake clock)', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?run=s2018');
  await pressStart(page);
  const TICK = 100;
  let head = '';
  let headSince = 0;
  let line = '';
  let longestHead = 0;
  const gone = new Set<string>();
  const back: string[] = [];
  for (let t = 0; t < 116_000; t += TICK) {
    if ((await page.locator('.es-h1').count()) > 0) break;
    const w = await page.evaluate(() => ({
      h: document.querySelector('.headline')?.textContent ?? '',
      c: document.querySelector('.standfirst')?.textContent ?? '',
    }));
    if (w.h !== head) {
      head = w.h;
      headSince = t;
    }
    longestHead = Math.max(longestHead, t - headSince);
    if (w.c !== line) {
      if (w.c && gone.has(w.c)) back.push(w.c);
      gone.add(line);
      line = w.c;
    }
    await page.clock.runFor(TICK);
  }
  expect(longestHead).toBeLessThanOrEqual(8_000);
  expect(back).toEqual([]);
});

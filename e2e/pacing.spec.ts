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

/** Records, in the page, the clock time of every day change and of every change of the line under the headline. */
async function watchWords(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __days: { t: number; day: string }[]; __lines: { t: number; c: string }[] };
    w.__days = [];
    w.__lines = [];
    const day = document.querySelector('.folio span:nth-child(2)')!;
    const line = document.querySelector('.standfirst')!;
    new MutationObserver(() => {
      const d = day.textContent ?? '';
      if (!w.__days.length || w.__days[w.__days.length - 1].day !== d) w.__days.push({ t: performance.now(), day: d });
    }).observe(day, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => {
      const c = line.textContent ?? '';
      if (!w.__lines.length || w.__lines[w.__lines.length - 1].c !== c) w.__lines.push({ t: performance.now(), c });
    }).observe(line, { childList: true, characterData: true, subtree: true });
  });
}

for (const id of ['c2007', 's2018']) {
  test(`${id}: R54 in the real app, no day is shown more than 2.2x longer or shorter than the one before, and the line is never blank for long (fake clock)`, async ({ page }) => {
    await page.clock.install();
    await page.goto(`/?run=${id}`);
    await pressStart(page);
    await watchWords(page);
    for (let t = 0; t < 125_000 && (await page.locator('.es-h1').count()) === 0; t += 1000) await page.clock.runFor(1000);
    const { days, lines } = await page.evaluate(() => {
      const w = window as unknown as { __days: { t: number; day: string }[]; __lines: { t: number; c: string }[] };
      return { days: w.__days, lines: w.__lines };
    });
    // The fall's day labels (several fast-forward steps can share one "Year N" label).
    const fall = days.filter((d) => d.day.startsWith('Day'));
    expect(fall.length).toBeGreaterThan(50);
    const gaps = fall.slice(1).map((d, k) => d.t - fall[k].t);
    const worst = { r: 0, at: '' };
    for (let k = 1; k < gaps.length; k++) {
      const r = Math.max(gaps[k] / gaps[k - 1], gaps[k - 1] / gaps[k]);
      if (r > worst.r) Object.assign(worst, { r, at: `${fall[k].day} -> ${fall[k + 1].day}: ${gaps[k - 1]} -> ${gaps[k]} ms` });
    }
    // Whole-ms timers: allow one millisecond either side of a 133 ms step.
    expect(worst.r, worst.at).toBeLessThanOrEqual(2.2 * (135 / 133));
    // R51: never a blank line for more than one step (at most a 3 s slow day).
    for (let k = 0; k < lines.length - 1; k++) {
      if (!lines[k].c) expect(lines[k + 1].t - lines[k].t, `blank at ${lines[k].t} ms`).toBeLessThanOrEqual(3_000);
    }
  });
}

test('R52: a sale changes the line at the press, and it stays at least 4 s (c2007, fake clock)', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?run=c2007');
  await pressStart(page);
  await page.clock.runFor(6_000);
  const before = await page.locator('.standfirst').textContent();
  await watchWords(page);
  await page.locator('button.act').click();
  // At once: the first sale on this phone says how to win.
  await expect(page.locator('.standfirst')).toHaveText('You are out. To win, buy back in for less than you sold.');
  expect(before).not.toBe('You are out. To win, buy back in for less than you sold.');
  await page.clock.runFor(6_000);
  const { lines } = await page.evaluate(() => {
    const w = window as unknown as { __days: { t: number; day: string }[]; __lines: { t: number; c: string }[] };
    return { lines: w.__lines };
  });
  const sold = lines.findIndex((l) => l.c.startsWith('You are out'));
  expect(sold).toBeGreaterThanOrEqual(0);
  expect(lines[sold + 1].t - lines[sold].t, lines[sold + 1].c).toBeGreaterThanOrEqual(4_000);
});

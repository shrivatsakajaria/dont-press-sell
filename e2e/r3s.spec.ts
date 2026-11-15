import { expect, test, type Page } from '@playwright/test';
import { pressStart } from './start';

// Round 3, lane S: the progress line (R60), "Game over" (R61) and "more expensive" on one line (R63).

const scaleOf = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.masthead .progress')!;
    const m = /scaleX\(([\d.e-]+)\)/.exec(el.style.transform);
    return { target: m ? Number(m[1]) : NaN, transition: el.style.transition, visible: getComputedStyle(el).visibility };
  });

const boxes = (page: Page) =>
  page.evaluate(() => {
    const r = (q: string) => {
      const b = document.querySelector(q)!.getBoundingClientRect();
      return { top: Math.round(b.top), height: Math.round(b.height), left: Math.round(b.left), width: Math.round(b.width) };
    };
    return { masthead: r('.masthead'), folio: r('.folio'), act: r('button.act'), box: r('.act-box') };
  });

for (const height of [660, 844]) {
  test(`progress line and "Game over" at 390 x ${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await page.clock.install();
    await page.goto('/?run=s2014');
    await expect(page.locator('button.act')).toHaveText('Start');
    const gate = await scaleOf(page);
    expect(gate.target).toBe(0);
    expect(gate.visible).toBe('hidden');
    const before = await boxes(page);
    await pressStart(page);
    await expect(page.locator('button.act')).toHaveText(/^Sell for/);
    const seen: number[] = [];
    for (let i = 0; i < 60 && !(await page.locator('main.play.is-over').count()); i++) {
      const s = await scaleOf(page);
      expect(s.visible).toBe('visible');
      seen.push(s.target);
      if (i === 6) {
        // Paused: the line stands still where it is.
        await page.locator('button.pause').click();
        const p = await scaleOf(page);
        expect(p.transition).toBe('none');
        await page.clock.runFor(3000);
        expect((await scaleOf(page)).target).toBe(p.target);
        await page.screenshot({ path: `e2e/shots/r3-S/paused-${height}.png` });
        await page.locator('button.pause').click();
      }
      if (i === 10) await page.screenshot({ path: `e2e/shots/r3-S/progress-${height}.png` });
      await page.clock.runFor(500);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[0]).toBeLessThan(0.2); // s2014 is short and opens on a slow day 1
    // The line never moves anything: masthead and folio where they were on the Start screen.
    const during = await boxes(page);
    expect(during.masthead).toEqual(before.masthead);
    expect(during.folio).toEqual(before.folio);

    // R61: the final hold: "Game over" in the button's own box, full progress, no layout shift.
    await expect(page.locator('main.play')).toHaveClass(/is-over/);
    expect((await scaleOf(page)).target).toBe(1);
    const over = page.locator('.over');
    await expect(over).toBeVisible();
    await expect(over).toHaveText('Game over');
    await expect(over).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('button.act')).toBeHidden();
    const end = await boxes(page);
    expect(end.box).toEqual(before.act);
    const ob = (await over.boundingBox())!;
    expect(Math.round(ob.y)).toBe(before.act.top);
    expect(Math.round(ob.height)).toBe(before.act.height);
    const style = await over.evaluate((e) => {
      const cs = getComputedStyle(e);
      return { size: parseFloat(cs.fontSize), color: cs.color, bg: cs.backgroundColor, lines: Math.round(e.scrollHeight / parseFloat(cs.lineHeight)) };
    });
    expect(style.size).toBeGreaterThanOrEqual(32);
    await page.screenshot({ path: `e2e/shots/r3-S/game-over-${height}.png` });
  });
}

for (const width of [360, 390]) {
  test(`the buy-back label stays on one line at ${width} px (R63)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 660 });
    await page.goto('/?run=c2020');
    await pressStart(page);
    const act = page.locator('button.act');
    await expect(act).toHaveText(/^Sell for/);
    await act.click();
    await expect(act).toHaveText(/^Buy back /);
    const lines = async (words: [string, string, string]) =>
      act.evaluate((b, w) => {
        const spans = b.querySelectorAll(':scope > span');
        // Stop the live label from changing under the measure.
        spans[0].textContent = w[0];
        spans[1].textContent = w[1];
        spans[2].textContent = w[2];
        const r = document.createRange();
        r.selectNodeContents(b);
        const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
        return { lines: tops.size, fits: b.scrollWidth <= b.clientWidth };
      }, words);
    await page.locator('button.pause').click();
    for (const w of [
      ['Buy back ', '$9,999', ' more expensive'],
      ['Buy back ', '$99,999', ' more expensive'],
      ['Buy back ', '$99,999', ' cheaper'],
      ['Buy back at the same price', '', ''],
    ] as [string, string, string][]) {
      const m = await lines(w);
      expect(m.lines, w.join('')).toBe(1);
      expect(m.fits, w.join('')).toBe(true);
    }
    await lines(['Buy back ', '$4,321', ' more expensive']);
    await page.screenshot({ path: `e2e/shots/r3-S/more-expensive-${width}.png` });
  });
}

import { expect, test } from './fixtures';
import { pressStart } from './start';

// R30: the play screen's layout is stable. Through a whole run (selling on the first red day, then
// buying back on the next one) the Sell/Buy button never moves (to 1px), stays 40px or more above the
// bottom, the headline never runs past three lines and the chart keeps at least 120px.
// R57: the chart and the balance block keep one height through the whole game (no jumps on new headlines,
// red days or at $10,000).
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
      let firstChart = -1;
      let firstFigures = -1;
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
            figures: document.querySelector('.figures')!.getBoundingClientRect().height,
            scrollHeight: document.documentElement.scrollHeight,
            newsOverflow: (() => { const n = document.querySelector('.news')!; return n.scrollHeight - n.clientHeight; })(),
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
        if (firstChart < 0) [firstChart, firstFigures] = [m.chart, m.figures];
        expect(Math.abs(m.chart - firstChart), `${m.day}: chart height constant`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(m.figures - firstFigures), `${m.day}: balance block height constant`).toBeLessThanOrEqual(0.5);
        expect(m.deltaHeight, `${m.day}: "up $N" on one line`).toBeLessThanOrEqual(24);
        expect(m.scrollHeight, `${m.day}: no page scroll`).toBeLessThanOrEqual(height);
        // The line under the headline is never cut off by the fixed news block.
        expect(m.newsOverflow, `${m.day}: headline and line fit the news block`).toBeLessThanOrEqual(1);
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

// R64 (SK, iPhone): on red days the headline and the line under it were cut off. On red-day heavy runs, at three
// phone sizes, every day: the news block never overflows, the headline is three lines or fewer, and the line
// under it ends inside the block (whole lines only: when it is clamped, its box is whole lines).
for (const [w, h] of [[390, 660], [390, 844], [375, 667]]) {
  for (const run of ['c2007', 'c2020', 'c1987']) {
    test(`R64: headline and the line under it never cut off through ${run} at ${w} x ${h}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: w, height: h });
      await page.clock.install();
      await page.goto(`/?run=${run}`);
      await pressStart(page);
      let lastDay = '';
      let red = 0;
      let checked = 0;
      let clamped = 0;
      for (let t = 0; t < 200_000; t += 100) {
        await page.clock.runFor(100);
        const m = await page.evaluate(() => {
          const play = document.querySelector('.play');
          if (!play || document.querySelector('.es')) return null;
          const n = document.querySelector('.news') as HTMLElement;
          const hl = document.querySelector('.headline') as HTMLElement;
          const sf = document.querySelector('.standfirst') as HTMLElement;
          const lh = parseFloat(getComputedStyle(hl).lineHeight);
          const slh = parseFloat(getComputedStyle(sf).lineHeight);
          const nr = n.getBoundingClientRect();
          const sr = sf.getBoundingClientRect();
          return {
            day: document.querySelector('.folio')!.textContent!,
            worst: play.classList.contains('is-worst'),
            overflow: n.scrollHeight - n.clientHeight,
            lines: Math.round(hl.offsetHeight / lh),
            sfBottom: sr.height > 0 ? sr.bottom - nr.top - n.clientHeight : -1,
            sfLines: sr.height / slh,
            clamped: sf.classList.contains('clamped'),
          };
        });
        if (!m) break;
        if (m.day === lastDay) continue;
        lastDay = m.day;
        checked++;
        if (m.clamped) clamped++;
        expect(m.overflow, `${m.day}: news block overflow`).toBeLessThanOrEqual(1);
        expect(m.lines, `${m.day}: headline lines`).toBeLessThanOrEqual(3);
        expect(m.sfBottom, `${m.day}: the line under the headline ends inside the block`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.sfLines - Math.round(m.sfLines)), `${m.day}: whole lines`).toBeLessThanOrEqual(0.05);
        if (m.worst) {
          red++;
          if (red === 1) await page.screenshot({ path: `e2e/shots/T/r64-${run}-${w}x${h}-red1.png` });
        }
      }
      expect(checked).toBeGreaterThan(5);
      expect(red).toBeGreaterThan(0);
      test.info().annotations.push({ type: 'r64', description: `${run} ${w}x${h}: ${checked} days, ${red} red, ${clamped} clamped` });
    });
  }
}

// R64: the hidden probe can disagree with the real block (SK's iPhone: WebKit, fonts arriving late). Here the
// real headline and line set wider than the probe's copies, as an engine that disagrees would: the fit must
// still correct itself on the real block every day (stepping down, and clamping to whole lines at the floor).
for (const [w, h] of [[390, 660], [375, 667]]) {
  for (const [run, spread] of [['c2020', '0.06em'], ['c1987', '0.06em'], ['c2020', '0.16em']] as const) {
    test(`R64: the fit corrects itself when the probe disagrees with the real block (${run}, +${spread}) at ${w} x ${h}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: w, height: h });
      await page.clock.install();
      await page.goto(`/?run=${run}`);
      await page.addStyleTag({ content: `.play > .news .headline, .play > .news .standfirst { letter-spacing: ${spread}; }` });
      await pressStart(page);
      let lastDay = '';
      let checked = 0;
      let red = 0;
      for (let t = 0; t < 200_000; t += 100) {
        await page.clock.runFor(100);
        const m = await page.evaluate(() => {
          const play = document.querySelector('.play');
          if (!play || document.querySelector('.es')) return null;
          const n = document.querySelector('.news') as HTMLElement;
          const hl = document.querySelector('.headline') as HTMLElement;
          const sf = document.querySelector('.standfirst') as HTMLElement;
          const nr = n.getBoundingClientRect();
          const sr = sf.getBoundingClientRect();
          return {
            day: document.querySelector('.folio')!.textContent!,
            worst: play.classList.contains('is-worst'),
            overflow: n.scrollHeight - n.clientHeight,
            lines: Math.round(hl.offsetHeight / parseFloat(getComputedStyle(hl).lineHeight)),
            sfBottom: sr.height > 0 ? sr.bottom - nr.top - n.clientHeight : -1,
            sfLines: sr.height / parseFloat(getComputedStyle(sf).lineHeight),
          };
        });
        if (!m) break;
        if (m.day === lastDay) continue;
        lastDay = m.day;
        checked++;
        if (m.worst && ++red === 1) await page.screenshot({ path: `e2e/shots/T/r64-disagree-${run}-${spread}-${w}x${h}.png` });
        expect(m.overflow, `${m.day}: news block overflow`).toBeLessThanOrEqual(1);
        expect(m.sfBottom, `${m.day}: the line under the headline ends inside the block`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.sfLines - Math.round(m.sfLines)), `${m.day}: whole lines`).toBeLessThanOrEqual(0.05);
      }
      expect(checked).toBeGreaterThan(5);
    });
  }
}

// The balance and the figure beside it ("down $1,450", "in cash") always fit inside the 24px gutters.
for (const [w, h] of [[360, 780], [375, 812], [390, 660], [390, 844]]) {
  const edges = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      // Measure the settled layout: the red-day jolt shakes the page by a few px for 240 ms.
      // (The green buy-back pulse, R38, runs forever and cannot be finished; it moves nothing.)
      for (const a of document.getAnimations()) if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish();
      const r = (q: string) => document.querySelector(q)!.getBoundingClientRect();
      return { day: document.querySelector('.folio')!.textContent!, balance: r('.balance').right, delta: r('.delta').right,
        deltaLeft: r('.delta').left, act: r('button.act').top, worst: !!document.querySelector('.play.is-worst'), text: document.querySelector('.delta')!.textContent };
    });

  test(`balance and delta inside the gutters at ${w} x ${h}: a carried $15,400 on falling days`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.clock.install();
    await page.goto('/');
    // A double-or-nothing run carried from $15,400 (the stored game a reload resumes).
    await page.evaluate(() =>
      sessionStorage.setItem('dps:resume', JSON.stringify({ mode: 'mystery', runId: 'c2007', start: 15400, double: true, gate: true })),
    );
    await page.reload();
    await pressStart(page);
    await expect(page.locator('.balance')).toHaveText('$15,400');
    const actTop = (await edges(page)).act;
    let reds = 0;
    let last = '';
    for (let t = 0; t < 40_000 && reds < 2; t += 100) {
      await page.clock.runFor(100);
      const m = await edges(page);
      if (m.day === last) continue;
      last = m.day;
      if (m.worst) reds++;
      // The delta moving under the balance never moves the button (R30).
      expect(Math.abs(m.act - actTop), `${m.day} button top`).toBeLessThanOrEqual(1);
      expect(m.balance, `${m.day} balance`).toBeLessThanOrEqual(w - 24);
      expect(m.delta, `${m.day} ${m.text}`).toBeLessThanOrEqual(w - 24);
    }
    expect(reds).toBeGreaterThan(0);
    await page.screenshot({ path: `e2e/shots/S/edges-15400-${w}x${h}.png` });
  });

  test(`balance and delta inside the gutters at ${w} x ${h}: winning in cash`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.clock.install();
    await page.goto('/?run=c2020');
    await pressStart(page);
    await page.clock.runFor(700);
    await page.locator('button.act').click();
    let ahead = false;
    let last = '';
    for (let t = 0; t < 15_000; t += 100) {
      await page.clock.runFor(100);
      const m = await edges(page);
      if (m.day === last) continue;
      last = m.day;
      expect(m.balance, `${m.day} balance`).toBeLessThanOrEqual(w - 24);
      expect(m.delta, `${m.day} ${m.text}`).toBeLessThanOrEqual(w - 24);
      // R38: winning in cash reads "Buy back $N cheaper".
      if (/cheaper$/.test((await page.locator('button.act').textContent()) ?? '')) ahead = true;
    }
    expect(ahead).toBe(true);
    await page.screenshot({ path: `e2e/shots/S/edges-cash-${w}x${h}.png` });
  });
}

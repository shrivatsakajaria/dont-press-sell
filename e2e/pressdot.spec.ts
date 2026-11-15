import { expect, test, type Page } from '@playwright/test';
import { pressStart } from './start';

// R65 (SK): the Sold dot sits on the tip of the line at the moment of the press and a frame later, for presses
// early, in the middle and late in a step, and across the step boundary (a press pinned to the painted step).
// Then the tip stays on that close through the 0.5 s hold.

/** The trade dot's centre and the line's tip, in screen px. */
const where = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector('.chart svg') as SVGSVGElement;
    const at = (e: SVGGraphicsElement, x: number, y: number) => {
      const p = new DOMPoint(x, y).matrixTransform(e.getScreenCTM()!);
      return [p.x, p.y];
    };
    const tipPath = svg.querySelector('[data-tip]') as SVGPathElement;
    let tip: number[];
    if (tipPath.getAttribute('d')) {
      const p = tipPath.getPointAtLength(tipPath.getTotalLength());
      tip = at(tipPath, p.x, p.y);
    } else {
      const pl = svg.querySelector('polyline') as SVGPolylineElement;
      const p = pl.points.getItem(pl.points.numberOfItems - 1);
      tip = at(pl, p.x, p.y);
    }
    const dot = svg.children[3].lastElementChild as SVGCircleElement | null;
    return {
      tip,
      dot: dot ? at(dot, dot.cx.baseVal.value, dot.cy.baseVal.value) : null,
      day: document.querySelector('.folio')!.textContent!,
    };
  });

const gap = (w: Awaited<ReturnType<typeof where>>) => Math.hypot(w.dot![0] - w.tip[0], w.dot![1] - w.tip[1]);

/** Runs 16 ms frames until the day changes; returns the time it took. */
async function toNextDay(page: Page): Promise<number> {
  const day = (await where(page)).day;
  for (let t = 16; t < 20_000; t += 16) {
    await page.clock.runFor(16);
    if ((await where(page)).day !== day) return t;
  }
  throw new Error('no new day');
}

async function begin(page: Page) {
  await page.clock.install();
  await page.goto('/?run=c2007');
  await pressStart(page);
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 20);
  for (let i = 0; i < 4; i++) await toNextDay(page);
  // A step's length, to press at a share of the next one (R54: neighbouring steps differ by 2.2x at most).
  return toNextDay(page);
}

for (const [when, share] of [['early', 0.05], ['in the middle', 0.5], ['late', 0.85]] as const) {
  test(`R65: a press ${when} in a step puts the Sold dot on the tip, and the tip holds there`, async ({ page }) => {
    const len = await begin(page);
    await page.clock.runFor(Math.max(16, Math.round((len * share) / 2.2)));
    await page.locator('button.act').dispatchEvent('pointerdown');
    await page.locator('button.act').dispatchEvent('click');
    const w0 = await where(page);
    expect(w0.dot, 'a Sold dot').not.toBeNull();
    expect(gap(w0), 'at the press').toBeLessThanOrEqual(1);
    await page.clock.runFor(16);
    expect(gap(await where(page)), 'a frame later').toBeLessThanOrEqual(1);
    await page.clock.runFor(100);
    const caught = await where(page);
    expect(gap(caught), 'after the catch-up').toBeLessThanOrEqual(1);
    await page.clock.runFor(300);
    const held = await where(page);
    if (held.day === caught.day) {
      expect(Math.hypot(held.tip[0] - caught.tip[0], held.tip[1] - caught.tip[1]), 'the tip holds through the hold').toBeLessThanOrEqual(0.5);
    }
    await page.screenshot({ path: `e2e/shots/T/r65-${when.replace(/ /g, '-')}.png` });
  });
}

test('R65: a press across the step boundary (pinned to the painted step) puts the Sold dot on the tip', async ({ page }) => {
  await begin(page);
  // The finger goes down on this step; the next step arrives before it lifts.
  await page.locator('button.act').dispatchEvent('pointerdown');
  await toNextDay(page);
  await page.locator('button.act').dispatchEvent('click');
  const w0 = await where(page);
  expect(w0.dot, 'a Sold dot').not.toBeNull();
  expect(gap(w0), 'at the press').toBeLessThanOrEqual(1);
  await page.clock.runFor(16);
  expect(gap(await where(page)), 'a frame later').toBeLessThanOrEqual(1);
  await page.clock.runFor(300);
  expect(gap(await where(page)), 'through the hold').toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'e2e/shots/T/r65-pinned.png' });
});

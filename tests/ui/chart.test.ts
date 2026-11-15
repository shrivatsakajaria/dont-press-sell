// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartGeometry, drawChart, extend, extendChart, MIN_RANGE, type ChartModel } from '../../src/ui/chart';
import { paperFor } from '../../src/ui/paper';

/** R42: the chart is the market price only, one unbroken line, with trade dots on it. */

const NS = 'http://www.w3.org/2000/svg';
const calm = paperFor({ lossFrac: 0, inCash: false, worstDay: false });
const cash = paperFor({ lossFrac: 0, inCash: true, worstDay: false });
const svgEl = () => document.createElementNS(NS, 'svg') as SVGSVGElement;

const base: ChartModel = {
  closes: [100, 98, 96, 95, 92, 90, 91, 89, 88, 86, 80],
  trades: [],
  soldAt: null,
  worst: false,
  label: 'Chart of the market',
};

/** Points of a polyline's "points" attribute. */
function pts(el: Element | null): [number, number][] {
  return (el?.getAttribute('points') ?? '').trim().split(/\s+/).filter(Boolean).map((p) => p.split(',').map(Number) as [number, number]);
}

describe('chartGeometry: the market price', () => {
  it('grows left to right, a lower price is lower on screen, the start line sits at day 1', () => {
    const g = chartGeometry(base, 342, 200);
    const xs = g.line.map((p) => p[0]);
    expect(xs[0]).toBe(0);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(g.line[10][1]).toBeGreaterThan(g.line[0][1]);
    expect(g.startY).toBeCloseTo(g.line[0][1]);
    expect(g.today).toEqual(g.line[g.line.length - 1]);
  });

  it('is one unbroken line through a sale and a buy-back: every day is the close, never the cash', () => {
    const m: ChartModel = { ...base, trades: [{ dayIndex: 3, side: 'sell' }, { dayIndex: 7, side: 'buy' }] };
    const g = chartGeometry(m, 342, 200);
    const plain = chartGeometry(base, 342, 200);
    expect(g.line).toEqual(plain.line);
    // The dots sit on the price line at their days.
    expect(g.marks).toEqual([
      { x: g.line[3][0], y: g.line[3][1], side: 'sell' },
      { x: g.line[7][0], y: g.line[7][1], side: 'buy' },
    ]);
  });

  it('while in cash, a flat level at the sale close runs from the sale dot to the right edge', () => {
    const m: ChartModel = { ...base, closes: base.closes.slice(0, 9), trades: [{ dayIndex: 3, side: 'sell' }], soldAt: 95 };
    const g = chartGeometry(m, 342, 200);
    expect(g.soldAt).not.toBeNull();
    expect(g.soldAt!.y).toBeCloseTo(g.line[3][1]);
    expect(g.soldAt!.x0).toBeCloseTo(g.line[3][0]);
    // Today (88) is cheaper than the sale (95): the dot sits below the level.
    expect(g.today[1]).toBeGreaterThan(g.soldAt!.y);
    expect(chartGeometry(base, 342, 200).soldAt).toBeNull();
  });

  it('keeps today inside the box with room for the dot, however long the run', () => {
    const closes = Array.from({ length: 900 }, (_, i) => 100 - i * 0.05 + Math.sin(i) * 2);
    const g = chartGeometry({ ...base, closes }, 342, 200);
    for (const [x, y] of g.line) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(342 - 8);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(200);
    }
    // Thinned to about a point per pixel, but the low and the high are kept.
    expect(g.line.length).toBeLessThanOrEqual(400);
    const ys = g.line.map((p) => p[1]);
    const all = closes.map((_, i) => i);
    const lowDay = all.reduce((a, b) => (closes[b] < closes[a] ? b : a));
    const yLow = chartGeometry({ ...base, closes: closes.slice(0, lowDay + 1) }, 342, 200);
    expect(Math.max(...ys)).toBeGreaterThan(0);
    expect(yLow.line.length).toBeGreaterThan(1);
  });

  it('early in a run the line does not stretch across the whole width', () => {
    const g = chartGeometry({ ...base, closes: [100, 99] }, 342, 200);
    expect(g.today[0]).toBeLessThan(342 / 2);
  });

  it('tiny moves never fill the height: the range spans 2% either side of day 1', () => {
    const g = chartGeometry({ ...base, closes: [100, 100.5, 101] }, 342, 200);
    const span = Math.abs(g.line[2][1] - g.line[0][1]);
    expect(span).toBeLessThan((200 - 36) * 0.6);
    expect(MIN_RANGE).toBe(0.02);
  });

  it('at a fractional day the tip sits between the two closes, so the line can grow smoothly', () => {
    const m: ChartModel = { ...base, closes: [100, 90, 96, 95, 92, 94] };
    const g4 = chartGeometry(m, 342, 200, 4);
    const g5 = chartGeometry(m, 342, 200, 5);
    const half = chartGeometry(m, 342, 200, 4.5);
    expect(half.today[0]).toBeGreaterThan(g4.today[0]);
    expect(half.today[0]).toBeLessThan(g5.today[0]);
    expect(half.today[1]).toBeLessThan(g4.today[1]);
    expect(half.today[1]).toBeGreaterThan(g5.today[1]);
  });
});

describe('drawChart', () => {
  it('fills an svg with the price line, a start line, today dot and the text alternative', () => {
    const svg = svgEl();
    drawChart(svg, base, calm, 342, 200);
    expect(svg.querySelector('polyline')).not.toBeNull();
    expect(svg.querySelectorAll('circle').length).toBe(1);
    expect(svg.getAttribute('aria-label')).toBe('Chart of the market');
    expect(svg.getAttribute('role')).toBe('img');
    // No money anywhere on the chart.
    expect(svg.textContent).not.toMatch(/\$/);
  });

  it('on the worst day draws a fill beneath the line', () => {
    const svg = svgEl();
    drawChart(svg, { ...base, worst: true }, paperFor({ lossFrac: 0, inCash: false, worstDay: true }), 390, 200);
    const fill = svg.querySelector('polygon');
    expect(fill).not.toBeNull();
    expect(fill!.getAttribute('display')).not.toBe('none');
    drawChart(svg, base, calm, 342, 200);
    expect(svg.querySelector('polygon')?.getAttribute('display') ?? 'none').toBe('none');
  });

  it('draws only the price line: no dashed market line, no money line, no previous go', () => {
    const svg = svgEl();
    const m: ChartModel = { ...base, trades: [{ dayIndex: 3, side: 'sell' }, { dayIndex: 7, side: 'buy' }] };
    drawChart(svg, m, calm, 342, 200);
    const lines = [...svg.querySelectorAll('polyline')];
    expect(lines.length).toBe(1);
    expect(lines[0].getAttribute('stroke-dasharray')).toBeNull();
    expect(pts(lines[0]).length).toBe(11);
  });

  it('marks the sale and the buy-back with dots and labels them "Sold" and "Bought"', () => {
    const svg = svgEl();
    const m: ChartModel = { ...base, trades: [{ dayIndex: 3, side: 'sell' }, { dayIndex: 7, side: 'buy' }] };
    drawChart(svg, m, calm, 342, 200);
    const circles = [...svg.querySelectorAll('circle')];
    expect(circles.length).toBe(3);
    expect(circles.some((c) => c.getAttribute('fill') === calm.accent)).toBe(true);
    const words = [...svg.querySelectorAll('text')].map((t) => t.textContent);
    expect(words).toContain('Sold');
    expect(words).toContain('Bought');
  });

  it('in cash: a faint dotted level at the sale close, labelled "Sold at"', () => {
    const svg = svgEl();
    const m: ChartModel = { ...base, closes: base.closes.slice(0, 9), trades: [{ dayIndex: 3, side: 'sell' }], soldAt: 95 };
    drawChart(svg, m, cash, 342, 200);
    const level = svg.querySelector('[data-level]');
    expect(level).not.toBeNull();
    expect(level!.getAttribute('display')).not.toBe('none');
    expect(level!.getAttribute('stroke-dasharray')).toBeTruthy();
    const words = [...svg.querySelectorAll('text')];
    expect(words.map((t) => t.textContent)).toEqual(['Sold at']); // the level names the sale: no second "Sold"
    // The words sit on the level's own stretch (right of the sale dot), or just left of the dot itself.
    const g = chartGeometry(m, 342, 200);
    const t = words[0];
    const x = Number(t.getAttribute('x'));
    const right = t.getAttribute('text-anchor') === 'end' ? x : x + 7 * 8.4;
    const left = right - 7 * 8.4;
    expect(left >= g.soldAt!.x0 - 2 || (right <= g.soldAt!.x0 && right >= g.soldAt!.x0 - 16)).toBe(true);
    // Bought back: the level goes.
    drawChart(svg, { ...m, closes: base.closes, trades: [...m.trades, { dayIndex: 9, side: 'buy' }], soldAt: null }, calm, 342, 200);
    expect(svg.querySelector('[data-level]')?.getAttribute('display')).toBe('none');
    expect([...svg.querySelectorAll('text')].map((t) => t.textContent)).not.toContain('Sold at');
    // R48: small text at least 14px.
    drawChart(svg, m, cash, 342, 200);
    for (const t of svg.querySelectorAll('text')) expect(t.getAttribute('font-size')).toBe('14');
  });

  it('updates in place: the same elements are reused from one day to the next', () => {
    const svg = svgEl();
    drawChart(svg, { ...base, closes: base.closes.slice(0, 5) }, calm, 342, 200);
    const line = svg.querySelector('polyline');
    const dot = svg.querySelector('circle');
    drawChart(svg, { ...base, closes: base.closes.slice(0, 6) }, calm, 342, 200);
    expect(svg.querySelector('polyline')).toBe(line);
    expect(svg.querySelector('circle')).toBe(dot);
    expect(pts(line).length).toBe(6);
  });
});

describe('drawChart animates the new day', () => {
  let queue: FrameRequestCallback[] = [];
  let now = 0;
  const origRaf = globalThis.requestAnimationFrame;
  const origNow = performance.now.bind(performance);
  beforeEach(() => {
    queue = [];
    now = 1000;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    }) as typeof requestAnimationFrame;
    performance.now = () => now;
  });
  afterEach(() => {
    globalThis.requestAnimationFrame = origRaf;
    performance.now = origNow;
  });
  const flush = (ms: number) => {
    now += ms;
    const q = queue;
    queue = [];
    for (const cb of q) cb(now);
  };
  const tipX = (svg: SVGSVGElement) => Number(svg.querySelector('circle')!.getAttribute('cx'));

  it('the tip grows from yesterday to today over animateMs instead of jumping', () => {
    const svg = svgEl();
    const m5 = { ...base, closes: base.closes.slice(0, 5) };
    const m6 = { ...base, closes: base.closes.slice(0, 6) };
    drawChart(svg, m5, calm, 342, 200);
    const x5 = tipX(svg);
    drawChart(svg, m6, calm, 342, 200, { animateMs: 400 });
    const x6 = chartGeometry(m6, 342, 200).today[0];
    expect(tipX(svg)).toBeCloseTo(x5, 1);
    flush(200);
    expect(tipX(svg)).toBeGreaterThan(x5 + 0.1);
    expect(tipX(svg)).toBeLessThan(x6 - 0.1);
    flush(250);
    expect(tipX(svg)).toBeCloseTo(x6, 1);
    expect(queue.length).toBe(0);
  });

  it('R43: mid-growth frames move the tip and the scale only; the long line itself is not rewritten', () => {
    const svg = svgEl();
    const closes = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 7) * 5 - i * 0.02);
    drawChart(svg, { ...base, closes: closes.slice(0, 250) }, calm, 342, 200);
    drawChart(svg, { ...base, closes: closes.slice(0, 251) }, calm, 342, 200, { animateMs: 400 });
    const line = svg.querySelector('polyline')!;
    const plot = svg.querySelector('[data-plot]')!;
    const set = vi.spyOn(line, 'setAttribute');
    const setPlot = vi.spyOn(plot, 'setAttribute');
    flush(100);
    flush(100);
    expect(set.mock.calls.filter(([k]) => k === 'points')).toEqual([]);
    // R57: the scale moves with the tip through one transform on the plot, not on the line.
    expect(setPlot.mock.calls.some(([k]) => k === 'transform')).toBe(true);
    set.mockRestore();
    setPlot.mockRestore();
    // The stroke keeps its width however the scale stretches.
    expect(line.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    // Once the tip reaches today the transform is gone: the line is drawn in today's scale.
    flush(300);
    expect(plot.hasAttribute('transform')).toBe(false);
  });

  it('a new day mid-animation carries on from where the tip is, never jumping back', () => {
    const svg = svgEl();
    drawChart(svg, { ...base, closes: base.closes.slice(0, 5) }, calm, 342, 200);
    drawChart(svg, { ...base, closes: base.closes.slice(0, 6) }, calm, 342, 200, { animateMs: 400 });
    flush(200);
    const mid = tipX(svg);
    drawChart(svg, { ...base, closes: base.closes.slice(0, 7) }, calm, 342, 200, { animateMs: 400 });
    expect(tipX(svg)).toBeCloseTo(mid, 1);
    flush(450);
    expect(tipX(svg)).toBeCloseTo(chartGeometry({ ...base, closes: base.closes.slice(0, 7) }, 342, 200).today[0], 1);
  });

  it('a redraw of the same day mid-animation (a press, a pause) keeps the growth going, without a jump', () => {
    const svg = svgEl();
    drawChart(svg, { ...base, closes: base.closes.slice(0, 5) }, calm, 342, 200);
    const m6 = { ...base, closes: base.closes.slice(0, 6) };
    drawChart(svg, m6, calm, 342, 200, { animateMs: 400 });
    flush(100);
    const mid = tipX(svg);
    drawChart(svg, { ...m6, trades: [{ dayIndex: 4, side: 'sell' as const }], soldAt: 92 }, cash, 342, 200);
    expect(tipX(svg)).toBeCloseTo(mid, 1);
    flush(400);
    expect(tipX(svg)).toBeCloseTo(chartGeometry(m6, 342, 200).today[0], 1);
  });

  it('without animateMs (reduced motion, resize) it draws today at once', () => {
    const svg = svgEl();
    drawChart(svg, { ...base, closes: base.closes.slice(0, 5) }, calm, 342, 200);
    drawChart(svg, { ...base, closes: base.closes.slice(0, 6) }, calm, 342, 200);
    expect(tipX(svg)).toBeCloseTo(chartGeometry({ ...base, closes: base.closes.slice(0, 6) }, 342, 200).today[0], 1);
    expect(queue.length).toBe(0);
  });
});

describe('R57: the line grows at an even pace across the whole step', () => {
  let queue: FrameRequestCallback[] = [];
  let now = 0;
  const origRaf = globalThis.requestAnimationFrame;
  const origNow = performance.now.bind(performance);
  beforeEach(() => {
    queue = [];
    now = 1000;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    }) as typeof requestAnimationFrame;
    performance.now = () => now;
  });
  afterEach(() => {
    globalThis.requestAnimationFrame = origRaf;
    performance.now = origNow;
  });
  const flush = (ms: number) => {
    now += ms;
    const q = queue;
    queue = [];
    for (const cb of q) cb(now);
  };
  /** Runs frames of 16 ms for `ms`. */
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 16) flush(Math.min(16, ms - t));
  };
  /** Today's dot where it is seen: its cx/cy through the plot's transform. */
  const seen = (svg: SVGSVGElement): [number, number] => {
    const dot = svg.querySelector('circle')!;
    let x = Number(dot.getAttribute('cx'));
    let y = Number(dot.getAttribute('cy'));
    for (let e: Element | null = dot.parentElement; e && e !== svg.parentElement; e = e.parentElement) {
      const t = e.getAttribute('transform');
      const mm = t && /matrix\(([^)]+)\)/.exec(t);
      if (mm) {
        const [a, , , d, e1, f] = mm[1].split(/[\s,]+/).map(Number);
        x = a * x + e1;
        y = d * y + f;
      }
    }
    return [x, y];
  };
  const days = (n: number) => ({ ...base, closes: Array.from({ length: n }, (_, i) => 100 - i * 0.4 + Math.sin(i) * 1.5) });

  it('a 3 s day is still growing at 900 ms and at 2 s, and is about halfway at 1.5 s (no 900 ms cap, no ease-out)', () => {
    const svg = svgEl();
    drawChart(svg, days(5), calm, 342, 200);
    const x0 = seen(svg)[0];
    drawChart(svg, days(6), calm, 342, 200, { animateMs: 3000 });
    const x1 = chartGeometry(days(6), 342, 200).today[0];
    run(1500);
    const half = (seen(svg)[0] - x0) / (x1 - x0);
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
    run(500);
    expect(seen(svg)[0]).toBeLessThan(x1 - 0.5);
    run(1100);
    expect(seen(svg)[0]).toBeCloseTo(x1, 1);
  });

  it('day after day at a steady step, the chart moves on every frame and never jumps back', () => {
    // Early days (the tip walks right) and late ones (the tip holds at 90% and the line squeezes left).
    for (const startDay of [8, 60]) {
      const svg = svgEl();
      drawChart(svg, days(startDay), calm, 342, 200);
      const state = () => `${svg.querySelector('circle')!.getAttribute('cx')},${svg.querySelector('circle')!.getAttribute('cy')}|${svg.querySelector('[data-plot]')!.getAttribute('transform')}`;
      let prev = state();
      let prevX = seen(svg)[0];
      let still = 0;
      let back = 0;
      for (let d = startDay + 1; d <= startDay + 30; d++) {
        drawChart(svg, days(d), calm, 342, 200, { animateMs: 128 });
        for (let k = 0; k < 8; k++) {
          flush(16);
          const now = state();
          if (now === prev) still++;
          const x = seen(svg)[0];
          if (x < prevX - 0.1) back++;
          prev = now;
          prevX = x;
        }
      }
      expect(still).toBe(0);
      expect(back).toBe(0);
    }
  });

  /** Where a circle is seen, through the plot's transform (none on the dots' own layer). */
  const seenOf = (svg: SVGSVGElement, c: Element): [number, number] => {
    let x = Number(c.getAttribute('cx'));
    let y = Number(c.getAttribute('cy'));
    for (let e: Element | null = c.parentElement; e && e !== svg.parentElement; e = e.parentElement) {
      const t = e.getAttribute('transform');
      const mm = t && /matrix\(([^)]+)\)/.exec(t);
      if (mm) {
        const [a, , , d, e1, f] = mm[1].split(/[\s,]+/).map(Number);
        x = a * x + e1;
        y = d * y + f;
      }
    }
    return [x, y];
  };
  /** The tip of the line as seen: the end of the tip path (or of the line), through the plot's transform. */
  const tipSeen = (svg: SVGSVGElement): [number, number] => {
    const d = svg.querySelector('[data-tip]')!.getAttribute('d') ?? '';
    const nums = d.match(/-?[\d.]+/g)?.map(Number) ?? [];
    let x: number;
    let y: number;
    if (nums.length >= 2) [x, y] = nums.slice(-2) as [number, number];
    else [x, y] = pts(svg.querySelector('polyline')).slice(-1)[0];
    const t = svg.querySelector('[data-plot]')!.getAttribute('transform');
    const mm = t && /matrix\(([^)]+)\)/.exec(t);
    if (mm) {
      const [a, , , dd, e1, f] = mm[1].split(/[\s,]+/).map(Number);
      return [a * x + e1, dd * y + f];
    }
    return [x, y];
  };
  const saleDot = (svg: SVGSVGElement) => [...svg.querySelectorAll('circle')].find((c) => c.getAttribute('fill') === cash.accent)!;
  const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const sold = (n: number, day: number): ChartModel => ({ ...days(n), trades: [{ dayIndex: day, side: 'sell' }], soldAt: days(n).closes[day] });

  for (const [when, at] of [['early', 16], ['in the middle', 480], ['late', 944]] as const) {
    it(`R65: a press ${when} in a step: the dot sits on the tip at the press and a frame later, the tip catches up within 80 ms, then holds`, () => {
      const svg = svgEl();
      drawChart(svg, days(5), calm, 342, 200);
      drawChart(svg, days(6), calm, 342, 200, { animateMs: 1000 });
      const x1 = chartGeometry(days(6), 342, 200).today;
      run(at);
      // The press: the screen redraws with the trade, then the clock holds 0.5 s.
      drawChart(svg, sold(6, 5), cash, 342, 200, { animateMs: 1000 });
      extendChart(svg, 500);
      expect(near(seenOf(svg, saleDot(svg)), tipSeen(svg))).toBeLessThanOrEqual(1);
      run(16);
      expect(near(seenOf(svg, saleDot(svg)), tipSeen(svg))).toBeLessThanOrEqual(1);
      run(80);
      expect(near(tipSeen(svg), x1)).toBeLessThanOrEqual(0.2);
      expect(near(seenOf(svg, saleDot(svg)), x1)).toBeLessThanOrEqual(0.2);
      // The hold (and the rest of the step) keeps the tip on today's close; the redraw with the held step changes nothing.
      drawChart(svg, sold(6, 5), cash, 342, 200, { animateMs: 1500 });
      run(1000);
      expect(near(tipSeen(svg), x1)).toBeLessThanOrEqual(0.2);
      // The next day grows from there.
      drawChart(svg, sold(7, 5), cash, 342, 200, { animateMs: 1000 });
      expect(near(tipSeen(svg), x1)).toBeLessThanOrEqual(1.5);
      run(500);
      expect(tipSeen(svg)[0]).toBeGreaterThan(x1[0] + 0.5);
    });
  }

  it('R65: a press pinned to the painted step (the day before): the tip goes back to that close under the dot, holds 0.5 s, then grows', () => {
    const svg = svgEl();
    drawChart(svg, days(5), calm, 342, 200);
    drawChart(svg, days(6), calm, 342, 200, { animateMs: 1000 });
    const x1 = chartGeometry(days(6), 342, 200).today[0];
    run(16);
    drawChart(svg, sold(6, 4), cash, 342, 200, { animateMs: 1000 });
    extendChart(svg, 500);
    const dot = () => seenOf(svg, saleDot(svg));
    expect(near(dot(), tipSeen(svg))).toBeLessThanOrEqual(1);
    run(16);
    expect(near(dot(), tipSeen(svg))).toBeLessThanOrEqual(1);
    run(400);
    expect(near(dot(), tipSeen(svg))).toBeLessThanOrEqual(1);
    run(400);
    expect(tipSeen(svg)[0]).toBeGreaterThan(dot()[0] + 0.5);
    run(1000);
    expect(tipSeen(svg)[0]).toBeCloseTo(x1, 1);
  });

  it('K2: extend (the name lane FC calls) is the same press', () => {
    const svg = svgEl();
    drawChart(svg, days(5), calm, 342, 200);
    drawChart(svg, days(6), calm, 342, 200, { animateMs: 1000 });
    const x1 = chartGeometry(days(6), 342, 200).today;
    run(300);
    drawChart(svg, sold(6, 5), cash, 342, 200, { animateMs: 1000 });
    extend(svg, 500);
    run(96);
    expect(near(tipSeen(svg), x1)).toBeLessThanOrEqual(0.2);
  });

  it('a pause holds the line where it is; on resume it carries on from there', () => {
    const svg = svgEl();
    drawChart(svg, days(5), calm, 342, 200);
    drawChart(svg, days(6), calm, 342, 200, { animateMs: 1000 });
    const x1 = chartGeometry(days(6), 342, 200).today[0];
    run(400);
    drawChart(svg, days(6), calm, 342, 200, { animateMs: 1000, paused: true });
    const held = seen(svg)[0];
    run(3000);
    expect(seen(svg)[0]).toBeCloseTo(held, 2);
    expect(queue.length).toBe(0); // no frames are spent while paused
    drawChart(svg, days(6), calm, 342, 200, { animateMs: 1000 });
    expect(seen(svg)[0]).toBeCloseTo(held, 1);
    run(300);
    expect(seen(svg)[0]).toBeGreaterThan(held + 0.5);
    expect(seen(svg)[0]).toBeLessThan(x1 - 0.5);
    run(400);
    expect(seen(svg)[0]).toBeCloseTo(x1, 1);
  });

  it("a trade made today shows its dot at once, on the tip while the line is still growing", () => {
    const svg = svgEl();
    drawChart(svg, days(5), calm, 342, 200);
    drawChart(svg, days(6), calm, 342, 200, { animateMs: 1000 });
    run(200);
    drawChart(svg, { ...days(6), trades: [{ dayIndex: 5, side: 'sell' }], soldAt: days(6).closes[5] }, cash, 342, 200, { animateMs: 1000 });
    const dots = [...svg.querySelectorAll('circle')].filter((c) => c.getAttribute('fill') === cash.accent);
    expect(dots.length).toBe(1);
    // R65: until the tip reaches today's close, the dot rides on the tip.
    expect(near(seenOf(svg, dots[0]), tipSeen(svg))).toBeLessThanOrEqual(1);
    run(1100);
    const g = chartGeometry(days(6), 342, 200);
    expect(Number(dots[0].getAttribute('cx'))).toBeCloseTo(g.today[0], 0);
  });

  it('frames inside a day touch only the tip, the scale and positions: no line points, no label layout', () => {
    const svg = svgEl();
    const m = (n: number) => ({ ...days(n), trades: [{ dayIndex: 20, side: 'sell' as const }], soldAt: days(n).closes[20] });
    drawChart(svg, m(200), cash, 342, 200);
    drawChart(svg, m(201), cash, 342, 200, { animateMs: 1000 });
    run(400); // past the scale's short ease
    const writes: string[] = [];
    const orig = Element.prototype.setAttribute;
    const spy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, k: string, v: string) {
      writes.push(`${this.tagName.toLowerCase()}${this.hasAttribute('data-tip') ? '[tip]' : ''}.${k}`);
      orig.call(this, k, v);
    });
    run(200);
    spy.mockRestore();
    expect(writes.length).toBeGreaterThan(0);
    const allowed = new Set(['path[tip].d', 'g.transform', 'circle.cx', 'circle.cy', 'text.x', 'text.y', 'rect.width']);
    expect(writes.filter((w) => !allowed.has(w))).toEqual([]);
  });
});

describe('the "Sold at" label keeps clear of the stamp (design minor 1)', () => {
  it('when the level sits in the middle band, the label moves above or below the band', () => {
    // A sale whose close lands about halfway up the chart.
    const closes = [100, 104, 108, 110, 106, 100, 96, 92, 90, 94];
    const m: ChartModel = { ...base, closes, trades: [{ dayIndex: 5, side: 'sell' }], soldAt: 100 };
    const h = 200;
    const g = chartGeometry(m, 342, h);
    expect(Math.abs(g.soldAt!.y - h / 2)).toBeLessThan(20);
    const svg = svgEl();
    drawChart(svg, m, cash, 342, h);
    const t = [...svg.querySelectorAll('text')].find((x) => x.textContent === 'Sold at')!;
    expect(t).toBeDefined();
    const y = Number(t.getAttribute('y'));
    // Box y-13..y+3 must miss the stamp's band (h/2-22 .. h/2+26).
    expect(y + 3 <= h / 2 - 22 || y - 13 >= h / 2 + 26).toBe(true);
  });
});

describe('label placement holds on many charts (no crossings, 12px inset, clear of each other)', () => {
  function rand(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }
  const CW = 8.4; // 14px labels (R48)
  const box = (t: Element) => {
    const x = Number(t.getAttribute('x'));
    const y = Number(t.getAttribute('y'));
    const w = (t.textContent ?? '').length * CW;
    const x0 = t.getAttribute('text-anchor') === 'end' ? x - w : x;
    return { x0, x1: x0 + w, y0: y - 11, y1: y + 3 };
  };
  const hits = (b: ReturnType<typeof box>, pl: [number, number][]) => {
    for (let i = 1; i < pl.length; i++) {
      const [x1, y1] = pl[i - 1];
      const [x2, y2] = pl[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
      for (let k = 0; k <= n; k++) {
        const x = x1 + ((x2 - x1) * k) / n;
        const y = y1 + ((y2 - y1) * k) / n;
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
      }
    }
    return false;
  };
  for (let seed = 1; seed <= 60; seed++) {
    it(`chart ${seed}`, () => {
      const r = rand(seed);
      const n = 20 + Math.floor(r() * 300);
      const closes = [100];
      for (let i = 1; i < n; i++) closes.push(closes[i - 1] * (1 + (r() - 0.55) * 0.06));
      const sell = Math.floor(r() * (n - 2));
      const buy = r() < 0.5 ? sell + 1 + Math.floor(r() * (n - sell - 1)) : null;
      const trades: ChartModel['trades'] = [{ dayIndex: sell, side: 'sell' }];
      if (buy !== null) trades.push({ dayIndex: buy, side: 'buy' });
      const inCash = buy === null;
      const worst = !inCash && r() < 0.4;
      const w = worst ? 390 : 342;
      const h = 120 + Math.floor(r() * 168);
      const m: ChartModel = { ...base, closes, trades, soldAt: inCash ? closes[sell] : null, worst };
      const svg = svgEl();
      drawChart(svg, m, paperFor({ lossFrac: 0, inCash, worstDay: worst }), w, h);
      const g = chartGeometry(m, w, h);
      const lines: [number, number][][] = [g.line, [[0, g.startY], [w, g.startY]]];
      if (g.soldAt) lines.push([[g.soldAt.x0, g.soldAt.y], [w, g.soldAt.y]]);
      const texts = [...svg.querySelectorAll('text')].filter((t) => t.getAttribute('display') !== 'none');
      const boxes = texts.map(box);
      texts.forEach((_t, i) => {
        const b = boxes[i];
        expect(b.x0).toBeGreaterThanOrEqual(12);
        expect(b.x1).toBeLessThanOrEqual(w - 12);
        expect(b.y0).toBeGreaterThanOrEqual(0);
        expect(b.y1).toBeLessThanOrEqual(h);
        for (const pl of lines) expect(hits(b, pl)).toBe(false);
        for (let j = 0; j < i; j++) {
          const o = boxes[j];
          expect(b.x0 < o.x1 + 4 && o.x0 < b.x1 + 4 && b.y0 < o.y1 + 4 && o.y0 < b.y1 + 4).toBe(false);
        }
        if (worst) expect(g.line.some(([x, y]) => x >= b.x0 && x <= b.x1 && b.y1 > y)).toBe(false);
        // "Sold at" reads as the level's words: it stays near the level, even when it steps off the stamp's band.
        if (texts[i].textContent === 'Sold at') expect(Math.abs((b.y0 + b.y1) / 2 - g.soldAt!.y)).toBeLessThanOrEqual(42);
      });
    });
  }
});

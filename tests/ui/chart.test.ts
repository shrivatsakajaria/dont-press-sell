// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartGeometry, drawChart, MIN_RANGE, type ChartModel } from '../../src/ui/chart';
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
    const right = t.getAttribute('text-anchor') === 'end' ? x : x + 7 * 7.2;
    const left = right - 7 * 7.2;
    expect(left >= g.soldAt!.x0 - 2 || (right <= g.soldAt!.x0 && right >= g.soldAt!.x0 - 16)).toBe(true);
    // Bought back: the level goes.
    drawChart(svg, { ...m, closes: base.closes, trades: [...m.trades, { dayIndex: 9, side: 'buy' }], soldAt: null }, calm, 342, 200);
    expect(svg.querySelector('[data-level]')?.getAttribute('display')).toBe('none');
    expect([...svg.querySelectorAll('text')].map((t) => t.textContent)).not.toContain('Sold at');
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
    const set = vi.spyOn(line, 'setAttribute');
    flush(100);
    flush(100);
    expect(set.mock.calls.filter(([k]) => k === 'points')).toEqual([]);
    expect(set.mock.calls.some(([k]) => k === 'transform')).toBe(true);
    set.mockRestore();
    // The stroke keeps its width however the scale stretches.
    expect(line.getAttribute('vector-effect')).toBe('non-scaling-stroke');
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

describe('label placement holds on many charts (no crossings, 12px inset, clear of each other)', () => {
  function rand(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }
  const CW = 7.2;
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
      });
    });
  }
});

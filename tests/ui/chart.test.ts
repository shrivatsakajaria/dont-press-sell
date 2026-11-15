// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { chartGeometry, drawChart, type ChartModel } from '../../src/ui/chart';
import { paperFor } from '../../src/ui/paper';

/** The box a 12px label covers (about 6.5px per character), from its anchor. */
function labelBox(t: Element) {
  const x = Number(t.getAttribute('x'));
  const y = Number(t.getAttribute('y'));
  const w = (t.textContent ?? '').length * 6.5;
  const anchor = t.getAttribute('text-anchor') ?? 'start';
  const x0 = anchor === 'end' ? x - w : x;
  return { x0, x1: x0 + w, y0: y - 11, y1: y + 3 };
}
function overlap(a: ReturnType<typeof labelBox>, b: ReturnType<typeof labelBox>) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

const base: ChartModel = {
  start: 10000,
  points: [
    { dayIndex: 0, balance: 10000, ghost: null },
    { dayIndex: 5, balance: 9000, ghost: null },
    { dayIndex: 10, balance: 8000, ghost: null },
  ],
  trades: [],
  worst: false,
  inCash: false,
  label: 'Chart of your balance',
};

describe('chartGeometry', () => {
  it('grows left to right, lower balance is lower on screen, start line at start', () => {
    const g = chartGeometry(base, 342, 200);
    const xs = g.line.map((p) => p[0]);
    expect(xs[0]).toBe(0);
    expect(xs[1]).toBeGreaterThan(xs[0]);
    expect(xs[2]).toBeGreaterThan(xs[1]);
    expect(g.line[2][1]).toBeGreaterThan(g.line[0][1]);
    expect(g.startY).toBeCloseTo(g.line[0][1]);
    expect(g.today).toEqual(g.line[2]);
  });

  it('keeps today inside the box with room for the dot, however long the run', () => {
    const long: ChartModel = {
      ...base,
      points: Array.from({ length: 300 }, (_, i) => ({ dayIndex: i * 3, balance: 10000 - i * 10, ghost: null })),
    };
    const g = chartGeometry(long, 342, 200);
    for (const [x, y] of g.line) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(342 - 8);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(200);
    }
  });

  it('early in a run the line does not stretch across the whole width', () => {
    const g = chartGeometry({ ...base, points: base.points.slice(0, 2) }, 342, 200);
    expect(g.today[0]).toBeLessThan(342 / 2);
  });

  it('draws ghost segments and trade marks', () => {
    const m: ChartModel = {
      ...base,
      points: [
        { dayIndex: 0, balance: 10000, ghost: null },
        { dayIndex: 5, balance: 9000, ghost: 9000 },
        { dayIndex: 10, balance: 9000, ghost: 9500 },
      ],
      trades: [{ dayIndex: 5, side: 'sell' }],
      inCash: true,
    };
    const g = chartGeometry(m, 342, 200);
    expect(g.ghosts.length).toBe(1);
    expect(g.ghosts[0].length).toBe(2);
    expect(g.marks).toEqual([{ x: g.line[1][0], y: g.line[1][1], side: 'sell' }]);
    // The ghost above the flat line: market rose.
    expect(g.ghosts[0][1][1]).toBeLessThan(g.line[2][1]);
  });
});

describe('drawChart', () => {
  it('fills an svg with a line, a start line, today dot and the label', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    drawChart(svg, base, paperFor({ lossFrac: 0, inCash: false, worstDay: false }), 342, 200);
    expect(svg.querySelector('polyline')).not.toBeNull();
    expect(svg.querySelectorAll('circle').length).toBe(1);
    expect(svg.getAttribute('aria-label')).toBe('Chart of your balance');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.textContent).toContain('Started at $10,000');
  });

  it('on the worst day draws a fill beneath the line', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    drawChart(svg, { ...base, worst: true }, paperFor({ lossFrac: 0, inCash: false, worstDay: true }), 390, 200);
    expect(svg.querySelector('polygon')).not.toBeNull();
  });

  it('keeps the market label clear of the start label', () => {
    // Ghost ends right on the start line at the right edge: the labels would sit on top of each other.
    const m: ChartModel = {
      ...base,
      points: [
        { dayIndex: 0, balance: 10000, ghost: null },
        { dayIndex: 5, balance: 9000, ghost: 9000 },
        { dayIndex: 60, balance: 9000, ghost: 10000 },
      ],
      trades: [{ dayIndex: 5, side: 'sell' }],
      inCash: true,
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    drawChart(svg, m, paperFor({ lossFrac: 0, inCash: true, worstDay: false }), 342, 120);
    const texts = [...svg.querySelectorAll('text')];
    expect(texts.map((t) => t.textContent).sort()).toEqual(['Sold', 'Started at $10,000', 'The market']);
    const boxes = texts.map(labelBox);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j])).toBe(false);
  });

  it('draws the sale and buy marks above today\'s dot and labels the sale', () => {
    const m: ChartModel = {
      ...base,
      points: [
        { dayIndex: 0, balance: 10000, ghost: null },
        { dayIndex: 5, balance: 9000, ghost: 9000 },
      ],
      trades: [{ dayIndex: 5, side: 'sell' }],
      inCash: true,
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    drawChart(svg, m, paperFor({ lossFrac: 0, inCash: true, worstDay: false }), 342, 200);
    const circles = [...svg.querySelectorAll('circle')];
    const last = circles[circles.length - 1];
    expect(last.getAttribute('fill')).toBe('#a3201a');
    expect([...svg.querySelectorAll('text')].some((t) => t.textContent === 'Sold')).toBe(true);
  });

  it('keeps the start label clear of the player\'s line', () => {
    // The line runs flat along the start level right under where the label would sit.
    const m: ChartModel = {
      ...base,
      points: [
        { dayIndex: 0, balance: 10000, ghost: null },
        { dayIndex: 30, balance: 10060, ghost: null },
        { dayIndex: 60, balance: 10040, ghost: null },
        { dayIndex: 85, balance: 10050, ghost: null },
        { dayIndex: 90, balance: 8000, ghost: null },
      ],
    };
    const g = chartGeometry(m, 342, 200);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    drawChart(svg, m, paperFor({ lossFrac: 0, inCash: false, worstDay: false }), 342, 200);
    const t = [...svg.querySelectorAll('text')].find((e) => e.textContent === 'Started at $10,000');
    expect(t).toBeDefined();
    {
      const b = labelBox(t!);
      for (let i = 1; i < g.line.length; i++) {
        const [x1, y1] = g.line[i - 1];
        const [x2, y2] = g.line[i];
        // Sample the segment and check no sample falls inside the label box.
        for (let k = 0; k <= 20; k++) {
          const x = x1 + ((x2 - x1) * k) / 20;
          const y = y1 + ((y2 - y1) * k) / 20;
          expect(x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1).toBe(false);
        }
      }
    }
  });
});

describe('a rematch draws the previous run as a dashed line', () => {
  const other = Array.from({ length: 100 }, (_, i) => 10000 - i * 30);
  it('spans the chart from day 1 to the right edge, and its low widens the range', () => {
    const g = chartGeometry({ ...base, other }, 342, 200);
    expect(g.other.length).toBeGreaterThan(10);
    expect(g.other[0][0]).toBe(0);
    expect(g.other[g.other.length - 1][0]).toBeLessThanOrEqual(342 - 8);
    expect(g.other[g.other.length - 1][0]).toBeGreaterThan(300);
    const ys = g.other.map((p) => p[1]);
    expect(Math.max(...ys)).toBeLessThanOrEqual(200);
  });
  it('is drawn dashed, and there is none without a previous run', () => {
    document.body.innerHTML = '<svg></svg>';
    const svg = document.querySelector('svg')!;
    drawChart(svg, { ...base, other }, paperFor({ lossFrac: 0, inCash: false, worstDay: false }), 342, 200);
    expect(svg.querySelectorAll('polyline[data-other]').length).toBe(1);
    expect(chartGeometry(base, 342, 200).other).toEqual([]);
  });
});


describe('label placement holds on many charts (no crossings, 12px inset, clear space, right line)', () => {
  /** Seeded random walk charts with a sale (and sometimes a buy-back), in cash or not, red days or not. */
  function rand(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }
  const CW = 7.2; // the placement's own width estimate, a little generous
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
  const dist = (b: ReturnType<typeof box>, pl: [number, number][]) => {
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    let best = Infinity;
    for (let i = 0; i < pl.length; i++) {
      const [x1, y1] = pl[Math.max(0, i - 1)];
      const [x2, y2] = pl[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
      for (let k = 0; k <= n; k++) best = Math.min(best, Math.hypot(x1 + ((x2 - x1) * k) / n - cx, y1 + ((y2 - y1) * k) / n - cy));
    }
    return best;
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
      const step = 1 + Math.floor(r() * 4);
      const points: ChartModel['points'] = [];
      let cash = 0;
      for (let d = 0; d < n; d += step) {
        const out = d >= sell && (buy === null || d <= buy);
        const held = (10000 * closes[d]) / closes[0];
        if (d === sell || (out && cash === 0)) cash = (10000 * closes[sell]) / closes[0];
        points.push({ dayIndex: d, balance: out ? cash : held, ghost: out ? (cash * closes[d]) / closes[sell] : null });
      }
      const inCash = buy === null;
      const worst = !inCash && r() < 0.4;
      const w = worst ? 390 : 342;
      const h = 120 + Math.floor(r() * 168);
      const m: ChartModel = { ...base, points, trades: trades.filter((t) => t.dayIndex <= points[points.length - 1].dayIndex), inCash, worst };
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      drawChart(svg, m, paperFor({ lossFrac: 0, inCash, worstDay: worst }), w, h);
      const g = chartGeometry(m, w, h);
      const lines = [g.line, ...g.ghosts, [[0, g.startY], [w, g.startY]] as [number, number][]];
      const texts = [...svg.querySelectorAll('text')];
      const boxes = texts.map(box);
      texts.forEach((t, i) => {
        const b = boxes[i];
        expect(b.x0).toBeGreaterThanOrEqual(12);
        expect(b.x1).toBeLessThanOrEqual(w - 12);
        expect(b.y0).toBeGreaterThanOrEqual(0);
        expect(b.y1).toBeLessThanOrEqual(h);
        const isStart = (t.textContent ?? '').startsWith('Started at');
        for (const pl of lines) expect(hits(b, pl)).toBe(false);
        if (isStart) expect(hits(b, [[0, g.startY], [w, g.startY]])).toBe(false);
        for (let j = 0; j < i; j++) {
          const o = boxes[j];
          const gap = 4;
          expect(b.x0 < o.x1 + gap && o.x0 < b.x1 + gap && b.y0 < o.y1 + gap && o.y0 < b.y1 + gap).toBe(false);
        }
        if (t.textContent === 'The market') {
          const ghost = g.ghosts[g.ghosts.length - 1];
          expect(dist(b, ghost)).toBeLessThan(dist(b, g.line));
        }
        if (worst) {
          // Never inside the red fill under the line.
          const below = g.line.some(([x, y]) => x >= b.x0 && x <= b.x1 && b.y1 > y);
          expect(below).toBe(false);
        }
      });
    });
  }

  it('tiny moves never fill the height: the range always spans 2% either side of the start', () => {
    const m: ChartModel = {
      ...base,
      points: [
        { dayIndex: 0, balance: 10000, ghost: null },
        { dayIndex: 5, balance: 10100, ghost: null },
        { dayIndex: 9, balance: 10256, ghost: null },
      ],
    };
    const g = chartGeometry(m, 342, 200);
    const span = Math.abs(g.line[2][1] - g.line[0][1]);
    expect(span).toBeLessThan((200 - 24) * 0.6);
    const flat = chartGeometry({ ...base, points: [{ dayIndex: 0, balance: 10000, ghost: null }, { dayIndex: 3, balance: 10010, ghost: null }] }, 342, 200);
    expect(Math.abs(flat.line[1][1] - flat.line[0][1])).toBeLessThan(10);
  });
});

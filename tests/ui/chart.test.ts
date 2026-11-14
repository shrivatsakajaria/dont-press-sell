// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { chartGeometry, drawChart, type ChartModel } from '../../src/ui/chart';
import { paperFor } from '../../src/ui/paper';

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
    const texts = [...svg.querySelectorAll('text')].map((t) => Number(t.getAttribute('y')));
    if (texts.length === 2) expect(Math.abs(texts[0] - texts[1])).toBeGreaterThanOrEqual(14);
    expect([...svg.querySelectorAll('text')].some((t) => t.textContent === 'The market')).toBe(true);
  });
});

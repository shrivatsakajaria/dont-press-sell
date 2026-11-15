// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import type { Trade } from '../../src/engine/types';
import { CHART_W, endChart, marketInCash } from '../../src/ui/endchart';
import { c2007, c2020 } from '../fixtures/sample-result';

const pts = (d: string): [number, number][] =>
  [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

function draw(closes: number[], trades: Trade[], other?: number[], height?: number) {
  const r = simulate(closes, trades);
  return {
    r,
    svg: endChart({
      balances: r.balances, trades: r.trades, start: 10000, other, label: 'x', ink: '#000', red: '#a00', paper: '#fff', height,
      market: marketInCash(r.balances, r.trades, closes),
    }),
  };
}

describe('the market in the result chart (audit 4)', () => {
  it('is the cash a sale took out, carried on with the market until the buy-back, dashed', () => {
    const closes = [100, 90, 80, 70, 85, 100];
    const r = simulate(closes, [{ dayIndex: 1, side: 'sell' }, { dayIndex: 3, side: 'buy' }]);
    const m = marketInCash(r.balances, r.trades, closes);
    expect(m.slice(0, 1)).toEqual([null]);
    expect(m[1]).toBeCloseTo(9000);
    expect(m[2]).toBeCloseTo(8000);
    expect(m[3]).toBeCloseTo(7000);
    expect(m.slice(4)).toEqual([null, null]);
    // Never bought back: to the end.
    const r2 = simulate(closes, [{ dayIndex: 2, side: 'sell' }]);
    expect(marketInCash(r2.balances, r2.trades, closes)[5]).toBeCloseTo(10000);
    expect(marketInCash(simulate(closes, []).balances, [], closes).every((v) => v === null)).toBe(true);
  });

  it('draws a dashed market line only for a player who sold', () => {
    const held = draw(c2020.closes, []).svg;
    expect(held.querySelector('[data-line="market"]')).toBeNull();
    const sold = draw(c2020.closes, [{ dayIndex: 2, side: 'sell' }, { dayIndex: 20, side: 'buy' }]).svg;
    const path = sold.querySelector('[data-line="market"]')!;
    expect(path.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(pts(path.getAttribute('d')!).length).toBeGreaterThan(5);
  });
});

describe('result chart labels and range', () => {
  const CW = 7.2;
  const boxOf = (t: Element) => {
    const x = Number(t.getAttribute('x'));
    const y = Number(t.getAttribute('y'));
    const w = (t.textContent ?? '').length * CW;
    const a = t.getAttribute('text-anchor');
    const x0 = a === 'end' ? x - w : a === 'middle' ? x - w / 2 : x;
    return { x0, x1: x0 + w, y0: y - 11, y1: y + 3 };
  };
  const crosses = (b: ReturnType<typeof boxOf>, pl: [number, number][]) => {
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
  const cases: [string, number[], Trade[]][] = [];
  for (const [name, run] of [['c2007', c2007], ['c2020', c2020]] as const) {
    const n = run.closes.length;
    for (const f of [0.02, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) {
      const s = Math.floor(n * f);
      cases.push([`${name} sold at ${f}`, run.closes, [{ dayIndex: s, side: 'sell' }]]);
      for (const g of [0.05, 0.15, 0.3]) {
        const b = Math.min(n - 1, s + Math.max(1, Math.floor(n * g)));
        cases.push([`${name} sold at ${f}, back ${g} later`, run.closes, [{ dayIndex: s, side: 'sell' }, { dayIndex: b, side: 'buy' }]]);
      }
    }
  }
  for (const [name, closes, trades] of cases) {
    for (const height of [104, 68]) {
      it(`${name} (${height}px): "Sold" and "Bought" cross no line and stay inside`, () => {
        const other = closes.map((c) => (10000 * c) / closes[0] * 0.97);
        const { svg } = draw(closes, trades, other, height);
        const lines = [...svg.querySelectorAll('path')].map((p) => pts(p.getAttribute('d')!));
        const start = svg.querySelector('line')!;
        lines.push([[0, Number(start.getAttribute('y1'))], [CHART_W, Number(start.getAttribute('y1'))]]);
        const words = [...svg.querySelectorAll('text')];
        for (const t of words) {
          const b = boxOf(t);
          expect(b.x0).toBeGreaterThanOrEqual(0);
          expect(b.x1).toBeLessThanOrEqual(CHART_W);
          expect(b.y0).toBeGreaterThanOrEqual(0);
          expect(b.y1).toBeLessThanOrEqual(height);
          for (const pl of lines) expect(crosses(b, pl)).toBe(false);
        }
        if (words.length === 2) {
          const [a, c] = words.map(boxOf);
          expect(a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1).toBe(false);
        }
      });
    }
  }

  it('tiny moves never fill the height: the range spans 2% either side of the start', () => {
    const closes = [100, 100.5, 101, 100.8, 101.3];
    const { svg } = draw(closes, []);
    const you = pts(svg.querySelector('[data-line="you"]')!.getAttribute('d')!);
    const ys = you.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan((104 - 40) * 0.4);
  });
});

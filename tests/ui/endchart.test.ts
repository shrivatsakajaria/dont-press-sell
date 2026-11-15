// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import type { Trade } from '../../src/engine/types';
import { CHART_W, endChart, marketInCash, priceFromPlay } from '../../src/ui/endchart';
import { c2007, c2020 } from '../fixtures/sample-result';

const pts = (d: string): [number, number][] =>
  [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

function draw(closes: number[], trades: Trade[], other?: number[], height?: number, withCloses = true) {
  const r = simulate(closes, trades);
  return {
    r,
    svg: endChart({
      balances: r.balances, trades: r.trades, start: 10000, other, label: 'x', ink: '#000', red: '#a00', paper: '#fff', height,
      market: marketInCash(r.balances, r.trades, closes), closes: withCloses ? closes : undefined,
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

  it('R42: the chart is the market price only, one unbroken line through the trades; no money line, no previous go', () => {
    const closes = [100, 90, 80, 70, 85, 100];
    const trades: Trade[] = [{ dayIndex: 1, side: 'sell' }, { dayIndex: 3, side: 'buy' }];
    const { svg } = draw(closes, trades, closes.map((c) => c * 97));
    expect(svg.querySelector('[data-line="you"]')).toBeNull();
    expect(svg.querySelector('[data-line="market"]')).toBeNull();
    expect(svg.querySelector('[data-line="other"]')).toBeNull();
    const price = pts(svg.querySelector('[data-line="price"]')!.getAttribute('d')!);
    expect(price.length).toBe(6);
    // Lower close, lower on the chart: 100, 90, 80, 70 fall, then 85, 100 rise.
    for (let i = 1; i < 4; i++) expect(price[i][1]).toBeGreaterThan(price[i - 1][1]);
    expect(price[5][1]).toBeCloseTo(price[0][1]);
    // The dots sit on the price line.
    const dots = [...svg.querySelectorAll('circle')].map((c) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]);
    expect(dots).toEqual([price[1], price[3]]);
    expect(svg.textContent).not.toMatch(/\$/);
    // R48: the words are at least 14px, whatever the page's stylesheet says.
    for (const t of svg.querySelectorAll('text')) expect((t as SVGElement).style.fontSize).toBe('14px');
    expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
  });

  it('a faint dotted level at the sale close runs from each sale to its buy-back (or the end)', () => {
    const closes = [100, 90, 80, 70, 85, 100];
    const { svg } = draw(closes, [{ dayIndex: 1, side: 'sell' }, { dayIndex: 3, side: 'buy' }]);
    const price = pts(svg.querySelector('[data-line="price"]')!.getAttribute('d')!);
    const levels = [...svg.querySelectorAll('[data-line="level"]')];
    expect(levels.length).toBe(1);
    expect(levels[0].getAttribute('stroke-dasharray')).toBeTruthy();
    const lv = pts(levels[0].getAttribute('d')!);
    expect(lv).toEqual([[price[1][0], price[1][1]], [price[3][0], price[1][1]]]);
    const held = draw(closes, []).svg;
    expect(held.querySelector('[data-line="level"]')).toBeNull();
    const out = draw(closes, [{ dayIndex: 2, side: 'sell' }]).svg;
    expect(pts(out.querySelector('[data-line="level"]')!.getAttribute('d')!)[1][0]).toBeCloseTo(price[5][0]);
  });

  it('without the closes, the price is rebuilt from the balances and the market in cash', () => {
    const closes = [100, 90, 80, 70, 85, 100, 96, 99];
    const trades: Trade[] = [{ dayIndex: 1, side: 'sell' }, { dayIndex: 3, side: 'buy' }, { dayIndex: 5, side: 'sell' }, { dayIndex: 6, side: 'buy' }];
    const r = simulate(closes, trades);
    const p = priceFromPlay(r.balances, r.trades, marketInCash(r.balances, r.trades, closes));
    p.forEach((v, i) => expect(v / p[0]).toBeCloseTo(closes[i] / closes[0], 9));
    const a = pts(draw(closes, trades).svg.querySelector('[data-line="price"]')!.getAttribute('d')!);
    const b = pts(draw(closes, trades, undefined, undefined, false).svg.querySelector('[data-line="price"]')!.getAttribute('d')!);
    expect(b).toEqual(a);
  });
});

describe('result chart labels and range', () => {
  const CW = 8.4; // 14px words (R48)
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
    const price = pts(svg.querySelector('[data-line="price"]')!.getAttribute('d')!);
    const ys = price.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan((104 - 40) * 0.4);
  });
});

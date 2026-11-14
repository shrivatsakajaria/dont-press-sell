// The end screen's full-run chart (spec 6.6, 9): one 2.5px ink line, a dotted start line,
// a red dot where the player sold and a hollow dot where they bought back, labelled
// "Sold" and "Bought". An optional dashed line shows a previous go or a challenger (6.7).
// Hand-drawn SVG, no library.
import type { Trade } from '../engine/types';
import { MARKET_DASH } from './paper';

const NS = 'http://www.w3.org/2000/svg';
export const CHART_W = 342;
export const CHART_H = 104;
const TOP = 20;
const BOTTOM = 20;
const SIDE = 7;

export interface EndChartInput {
  balances: number[];
  trades: Trade[];
  start: number;
  other?: number[];
  label: string;
  ink: string;
  red: string;
  paper: string;
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Days to draw: about two per point of width, plus the high, the low and every edge of a flat (in-cash) stretch. */
export function keep(vals: number[], target = 170): number[] {
  const n = vals.length;
  if (n <= target) return vals.map((_, i) => i);
  const step = Math.ceil(n / target);
  let lo = 0;
  let hi = 0;
  vals.forEach((v, i) => {
    if (v < vals[lo]) lo = i;
    if (v > vals[hi]) hi = i;
  });
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const flatBefore = i > 0 && vals[i] === vals[i - 1];
    const flatAfter = i < n - 1 && vals[i + 1] === vals[i];
    if (i % step === 0 || i === n - 1 || i === lo || i === hi || flatBefore !== flatAfter) out.push(i);
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function endChart(input: EndChartInput): SVGSVGElement {
  const { balances, trades, start, other, ink, red, paper } = input;
  const all = [start, ...balances, ...(other ?? [])].filter((v) => Number.isFinite(v));
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 1) {
    hi += 1;
    lo -= 1;
  }
  const n = Math.max(balances.length, other?.length ?? 0, 2);
  const x = (i: number) => SIDE + (i / (n - 1)) * (CHART_W - 2 * SIDE);
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * (CHART_H - TOP - BOTTOM);
  const path = (vals: number[]) =>
    keep(vals)
      .map((i, k) => `${k ? 'L' : 'M'}${r1(x(i))} ${r1(y(vals[i]))}`)
      .join('');

  const svg = el('svg', {
    viewBox: `0 0 ${CHART_W} ${CHART_H}`,
    role: 'img',
    'aria-label': input.label,
    class: 'es-chart',
  });

  svg.appendChild(
    el('line', { x1: 0, x2: CHART_W, y1: r1(y(start)), y2: r1(y(start)), stroke: ink, 'stroke-width': 1, 'stroke-dasharray': '1 4' }),
  );
  if (other && other.length > 1) {
    svg.appendChild(
      el('path', {
        d: path(other),
        fill: 'none',
        stroke: MARKET_DASH,
        'stroke-width': 1.5,
        'stroke-dasharray': '5 4',
        'stroke-linejoin': 'round',
        'data-line': 'other',
      }),
    );
  }
  if (balances.length > 0) {
    svg.appendChild(
      el('path', {
        d: path(balances),
        fill: 'none',
        stroke: ink,
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'data-line': 'you',
      }),
    );
  }

  // Dots for every trade; words on the first sale and the first buy-back after it.
  const firstSell = trades.find((t) => t.side === 'sell');
  const firstBuy = firstSell ? trades.find((t) => t.side === 'buy' && t.dayIndex >= firstSell.dayIndex) : undefined;
  const placed: { x: number; y: number }[] = [];
  for (const t of trades) {
    const v = balances[t.dayIndex];
    if (v === undefined) continue;
    const cx = r1(x(t.dayIndex));
    const cy = r1(y(v));
    svg.appendChild(
      t.side === 'sell'
        ? el('circle', { cx, cy, r: 6, fill: red })
        : el('circle', { cx, cy, r: 5, fill: paper, stroke: ink, 'stroke-width': 2.5 }),
    );
  }
  for (const [t, word] of [
    [firstSell, 'Sold'],
    [firstBuy, 'Bought'],
  ] as const) {
    if (!t) continue;
    const v = balances[t.dayIndex];
    if (v === undefined) continue;
    const cx = x(t.dayIndex);
    const cy = y(v);
    // Above the dot when there is room, else below; flip if it would sit on the other label.
    let ty = cy - 12 >= 12 ? cy - 12 : cy + 22;
    const clash = placed.find((p) => Math.abs(p.x - cx) < 52 && Math.abs(p.y - ty) < 14);
    if (clash) ty = ty < cy ? cy + 22 : cy - 12;
    ty = Math.min(CHART_H - 2, Math.max(11, ty));
    placed.push({ x: cx, y: ty });
    const anchor = cx < 28 ? 'start' : cx > CHART_W - 28 ? 'end' : 'middle';
    const text = el('text', {
      x: r1(anchor === 'start' ? Math.max(0, cx - 6) : anchor === 'end' ? Math.min(CHART_W, cx + 6) : cx),
      y: r1(ty),
      'text-anchor': anchor,
      fill: ink,
      class: 'es-chart-word',
    });
    text.textContent = word;
    svg.appendChild(text);
  }
  return svg;
}

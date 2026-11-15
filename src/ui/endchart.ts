// The end screen's full-run chart (spec 6.6, 9): one 2.5px ink line, a dotted start line,
// a red dot where the player sold and a hollow dot where they bought back, labelled
// "Sold" and "Bought". While the player was in cash the market carries on as a dashed line,
// as on the play screen (audit 4). An optional dashed line shows a previous go or a challenger (6.7).
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
  /** Drawing height (default CHART_H); shorter on short viewports. */
  height?: number;
  /** What the cash would be worth had it stayed in, for every day in cash (else null): see marketInCash. */
  market?: (number | null)[];
}

/** Least vertical range, as a share of the start, either side of the start line. */
const MIN_RANGE = 0.02;

/**
 * The market while the player is in cash: from each sale to the buy-back (or the end), both days
 * included, the cash taken out times the market's move since the sale. Null on invested days.
 */
export function marketInCash(balances: number[], trades: Trade[], closes: number[]): (number | null)[] {
  const out: (number | null)[] = balances.map(() => null);
  let sell: number | null = null;
  const fill = (a: number, b: number) => {
    const cash = balances[a];
    for (let d = a; d <= b && d < out.length; d++) out[d] = (cash * closes[d]) / closes[a];
  };
  for (const t of trades) {
    if (t.side === 'sell' && sell === null) sell = t.dayIndex;
    else if (t.side === 'buy' && sell !== null) {
      fill(sell, t.dayIndex);
      sell = null;
    }
  }
  if (sell !== null) fill(sell, out.length - 1);
  return out;
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

interface Box { x0: number; x1: number; y0: number; y1: number }
/** Generous width of a 12px bold label, per character. */
const WORD_W = 7.2;
const hit = (a: Box, b: Box, gap: number) => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
/** True when the line passes through the box (with room for the stroke). */
function crosses(b: Box, pl: [number, number][]): boolean {
  const pad = 2;
  for (let i = 1; i < pl.length; i++) {
    const [x1, y1] = pl[i - 1];
    const [x2, y2] = pl[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
    for (let k = 0; k <= n; k++) {
      const px = x1 + ((x2 - x1) * k) / n;
      const py = y1 + ((y2 - y1) * k) / n;
      if (px >= b.x0 - pad && px <= b.x1 + pad && py >= b.y0 - pad && py <= b.y1 + pad) return true;
    }
  }
  return false;
}

export function endChart(input: EndChartInput): SVGSVGElement {
  const { balances, trades, start, other, ink, red, paper } = input;
  const market = input.market ?? [];
  const H = input.height ?? CHART_H;
  const all = [start, ...balances, ...(other ?? []), ...market.filter((v): v is number => v !== null)].filter((v) =>
    Number.isFinite(v),
  );
  // Tiny moves never fill the height: the range spans 2% of the start either side of it.
  const lo = Math.min(...all, start * (1 - MIN_RANGE));
  const hi = Math.max(...all, start * (1 + MIN_RANGE));
  const n = Math.max(balances.length, other?.length ?? 0, 2);
  const x = (i: number) => SIDE + (i / (n - 1)) * (CHART_W - 2 * SIDE);
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * (H - TOP - BOTTOM);
  const path = (vals: number[]) =>
    keep(vals)
      .map((i, k) => `${k ? 'L' : 'M'}${r1(x(i))} ${r1(y(vals[i]))}`)
      .join('');

  const svg = el('svg', {
    viewBox: `0 0 ${CHART_W} ${H}`,
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
  // The market while in cash: one dashed segment per cash period, thinned like the lines.
  const marketPts: [number, number][][] = [];
  if (market.some((v) => v !== null)) {
    const every = Math.max(1, Math.ceil(market.length / 170));
    let seg: [number, number][] = [];
    market.forEach((v, i) => {
      const edge = v !== null && (market[i - 1] == null || market[i + 1] == null);
      if (v === null) {
        if (seg.length > 1) marketPts.push(seg);
        seg = [];
      } else if (edge || i % every === 0) seg.push([r1(x(i)), r1(y(v))]);
    });
    if (seg.length > 1) marketPts.push(seg);
    for (const sg of marketPts) {
      svg.appendChild(
        el('path', {
          d: sg.map(([px, py], k) => `${k ? 'L' : 'M'}${px} ${py}`).join(''),
          fill: 'none',
          stroke: MARKET_DASH,
          'stroke-width': 2,
          'stroke-dasharray': '3 4',
          'stroke-linecap': 'round',
          'data-line': 'market',
        }),
      );
    }
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
  const dots: Box[] = [];
  for (const t of trades) {
    const v = balances[t.dayIndex];
    if (v === undefined) continue;
    const cx = r1(x(t.dayIndex));
    const cy = r1(y(v));
    dots.push({ x0: cx - 8, x1: cx + 8, y0: cy - 8, y1: cy + 8 });
    svg.appendChild(
      t.side === 'sell'
        ? el('circle', { cx, cy, r: 6, fill: red })
        : el('circle', { cx, cy, r: 5, fill: paper, stroke: ink, 'stroke-width': 2.5 }),
    );
  }
  // Every line a word must keep clear of: the player's, the market's, the other go's and the start line.
  const pathPts = (vals: number[]) => keep(vals).map((i) => [x(i), y(vals[i])] as [number, number]);
  const lines: [number, number][][] = [
    pathPts(balances), ...marketPts, ...(other && other.length > 1 ? [pathPts(other)] : []),
    [[0, y(start)], [CHART_W, y(start)]],
  ];
  const placed: Box[] = [];
  for (const [t, word] of [
    [firstSell, 'Sold'],
    [firstBuy, 'Bought'],
  ] as const) {
    if (!t) continue;
    const v = balances[t.dayIndex];
    if (v === undefined) continue;
    const cx = x(t.dayIndex);
    const cy = y(v);
    const w = word.length * WORD_W;
    // Above or below the dot, then beside it on either side, then further out: the first clear spot.
    const spots: { x: number; y: number; anchor: 'start' | 'middle' | 'end' }[] = [];
    for (const dy of [-12, 22, -22, 32]) {
      spots.push({ x: cx, y: cy + dy, anchor: 'middle' }, { x: cx - 4, y: cy + dy, anchor: 'end' }, { x: cx + 4, y: cy + dy, anchor: 'start' });
    }
    for (const dy of [4, -4, 12]) spots.push({ x: cx - 10, y: cy + dy, anchor: 'end' }, { x: cx + 10, y: cy + dy, anchor: 'start' });
    const boxAt = (sp: (typeof spots)[number]): Box => {
      const x0 = sp.anchor === 'end' ? sp.x - w : sp.anchor === 'middle' ? sp.x - w / 2 : sp.x;
      return { x0, x1: x0 + w, y0: sp.y - 11, y1: sp.y + 3 };
    };
    const spot = spots.find((sp) => {
      const b = boxAt(sp);
      return b.x0 >= 0 && b.x1 <= CHART_W && b.y0 >= 0 && b.y1 <= H && !placed.some((p) => hit(p, b, 2)) &&
        !dots.some((d) => hit(d, b, 0)) && !lines.some((pl) => crosses(b, pl));
    });
    if (!spot) continue; // no clear spot: no word rather than a word through a line
    placed.push(boxAt(spot));
    const text = el('text', { x: r1(spot.x), y: r1(spot.y), 'text-anchor': spot.anchor, fill: ink, class: 'es-chart-word' });
    text.textContent = word;
    svg.appendChild(text);
  }
  return svg;
}

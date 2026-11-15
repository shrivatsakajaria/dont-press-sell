// The end screen's full-run chart (spec 6.6, 9; ruling R42): the market price only, one unbroken
// 2.5px ink line from day 1 to the last day, a dotted start line at day 1's close, a red dot where
// the player sold and a hollow dot where they bought back, labelled "Sold" and "Bought". Each spell
// in cash has a faint dotted level at the sale close, so a buy-back under it reads as cheaper.
// No money line (not the player's, not a previous go's): money is shown only as numbers.
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
  /** A previous go or a challenger: no longer drawn (R42, money only as numbers); kept for callers. */
  other?: number[];
  label: string;
  ink: string;
  red: string;
  paper: string;
  /** Drawing height (default CHART_H); shorter on short viewports. */
  height?: number;
  /** What the cash would be worth had it stayed in, for every day in cash (else null): see marketInCash. */
  market?: (number | null)[];
  /** The run's closes: the line drawn. Without them the price is rebuilt from the play (priceFromPlay). */
  closes?: number[];
}

/** Least vertical range, as a share of day 1's close, either side of it. */
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

/**
 * The market's moves rebuilt from a play, for callers that pass no closes: day to day, the balance's
 * move while invested and the market-in-cash's move while out, scaled to the first balance. Borrowed
 * money (whose balance moves more than the market) needs the closes passed instead.
 */
export function priceFromPlay(balances: number[], trades: Trade[], market: (number | null)[]): number[] {
  if (!balances.length) return [];
  const ordered = [...trades].sort((a, b) => a.dayIndex - b.dayIndex);
  let invested = true;
  let k = 0;
  const applyDay = (d: number) => {
    while (k < ordered.length && ordered[k].dayIndex === d) {
      invested = ordered[k].side === 'buy';
      k++;
    }
  };
  applyDay(0);
  const out = [balances[0]];
  for (let d = 1; d < balances.length; d++) {
    const a = invested ? balances[d - 1] : market[d - 1];
    const b = invested ? balances[d] : market[d];
    const ratio = a && b !== null && b !== undefined && Number.isFinite(b / a) ? b / a : 1;
    out.push(out[d - 1] * ratio);
    applyDay(d);
  }
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
/** Generous width of a 14px bold label, per character (R48: small text at least 14px). */
const WORD_W = 8.4;
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

const pathD = (pl: [number, number][]) => pl.map(([px, py], k) => `${k ? 'L' : 'M'}${px} ${py}`).join('');

export function endChart(input: EndChartInput): SVGSVGElement {
  const { balances, trades, ink, red, paper } = input;
  const H = input.height ?? CHART_H;
  const prices = input.closes?.length
    ? input.closes.slice(0, Math.max(balances.length, 1))
    : priceFromPlay(balances, trades, input.market ?? []);
  const base = prices[0] ?? input.start;
  // Tiny moves never fill the height: the range spans 2% of day 1's close either side of it.
  const fin = prices.filter((v) => Number.isFinite(v));
  const lo = Math.min(...fin, base * (1 - MIN_RANGE));
  const hi = Math.max(...fin, base * (1 + MIN_RANGE));
  const n = Math.max(prices.length, 2);
  const x = (i: number) => SIDE + (i / (n - 1)) * (CHART_W - 2 * SIDE);
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * (H - TOP - BOTTOM);
  const inRun = (t: Trade) => t.dayIndex >= 0 && t.dayIndex < prices.length;
  // About two days a point, with the high, the low and every trade day kept, so the dots sit on the line.
  const kept = [...new Set([...keep(prices), ...trades.filter(inRun).map((t) => t.dayIndex)])].sort((a, b) => a - b);
  const pricePts = kept.map((i) => [r1(x(i)), r1(y(prices[i]))] as [number, number]);

  const svg = el('svg', {
    viewBox: `0 0 ${CHART_W} ${H}`,
    role: 'img',
    'aria-label': input.label,
    class: 'es-chart',
  });

  svg.appendChild(
    el('line', { x1: 0, x2: CHART_W, y1: r1(y(base)), y2: r1(y(base)), stroke: ink, 'stroke-width': 1, 'stroke-dasharray': '1 4' }),
  );
  // Each spell in cash: a faint dotted level at the sale close, from the sale to the buy-back (or the end).
  const levels: [number, number][][] = [];
  const level = (from: number, to: number) => {
    const ly = r1(y(prices[from]));
    levels.push([[r1(x(from)), ly], [r1(x(to)), ly]]);
  };
  let sold: number | null = null;
  for (const t of [...trades].filter(inRun).sort((a, b) => a.dayIndex - b.dayIndex)) {
    if (t.side === 'sell' && sold === null) sold = t.dayIndex;
    else if (t.side === 'buy' && sold !== null) {
      level(sold, t.dayIndex);
      sold = null;
    }
  }
  if (sold !== null) level(sold, prices.length - 1);
  for (const lv of levels) {
    if (lv[1][0] - lv[0][0] < 1) continue;
    svg.appendChild(
      el('path', {
        d: pathD(lv), fill: 'none', stroke: MARKET_DASH, 'stroke-width': 1.5, 'stroke-dasharray': '2 4', 'stroke-linecap': 'round',
        'data-line': 'level',
      }),
    );
  }
  if (prices.length > 0) {
    svg.appendChild(
      el('path', {
        d: pathD(pricePts),
        fill: 'none',
        stroke: ink,
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'data-line': 'price',
      }),
    );
  }

  // Dots for every trade, on the price line; words on the first sale and the first buy-back after it.
  const firstSell = trades.find((t) => t.side === 'sell');
  const firstBuy = firstSell ? trades.find((t) => t.side === 'buy' && t.dayIndex >= firstSell.dayIndex) : undefined;
  const dots: Box[] = [];
  for (const t of trades) {
    const v = prices[t.dayIndex];
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
  // Every line a word must keep clear of: the price, the levels and the start line.
  const lines: [number, number][][] = [pricePts, ...levels, [[0, y(base)], [CHART_W, y(base)]]];
  const placed: Box[] = [];
  for (const [t, word] of [
    [firstSell, 'Sold'],
    [firstBuy, 'Bought'],
  ] as const) {
    if (!t) continue;
    const v = prices[t.dayIndex];
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
      return { x0, x1: x0 + w, y0: sp.y - 13, y1: sp.y + 3 };
    };
    const spot = spots.find((sp) => {
      const b = boxAt(sp);
      return b.x0 >= 0 && b.x1 <= CHART_W && b.y0 >= 0 && b.y1 <= H && !placed.some((p) => hit(p, b, 2)) &&
        !dots.some((d) => hit(d, b, 0)) && !lines.some((pl) => crosses(b, pl));
    });
    if (!spot) continue; // no clear spot: no word rather than a word through a line
    placed.push(boxAt(spot));
    const text = el('text', { x: r1(spot.x), y: r1(spot.y), 'text-anchor': spot.anchor, fill: ink, class: 'es-chart-word' });
    text.style.fontSize = '14px'; // R48, over the page's 12px rule
    text.textContent = word;
    svg.appendChild(text);
  }
  return svg;
}

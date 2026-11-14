// The balance chart (spec 9): one 2.5px ink line growing left to right, a dotted
// start line, a filled dot for today. No grid, no axis, no price scale, no dates.
// While in cash a dashed line shows the market carrying on without the player.
import { dollars } from '../content/copy';
import type { Trade } from '../engine/types';
import { MARKET_DASH, type Paper } from './paper';

export interface ChartPoint {
  dayIndex: number;
  balance: number;
  /** What the cash would be worth had the player held since the sale (in-cash days), else null. */
  ghost: number | null;
}

export interface ChartModel {
  start: number;
  points: ChartPoint[];
  trades: Trade[];
  worst: boolean;
  inCash: boolean;
  /** Text alternative for the chart; it updates every step. */
  label: string;
  /** Rematch: the previous go's balance for every day of the run, drawn dashed across the chart (spec 6.7). */
  other?: number[];
}

export interface ChartGeometry {
  line: [number, number][];
  ghosts: [number, number][][];
  startY: number;
  today: [number, number];
  marks: { x: number; y: number; side: Trade['side'] }[];
  /** The previous go, from day 1 to the chart's right edge; empty without one. */
  other: [number, number][];
}

/** The fewest days the x-axis ever spans, so day 2 does not fill the width. */
const MIN_SPAN_DAYS = 40;
/** Today's dot sits at most this far across, leaving the right edge as "the future". */
const TODAY_AT = 0.9;
const PAD_Y = 12;
const PAD_RIGHT = 8;

/** Worst-day fill beneath the cream line (mock-up 2). */
const WORST_FILL = '#96102a';
const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_FONT = "'Libre Franklin', Arial, sans-serif";

export const STARTED_AT = (n: number) => `Started at ${dollars(n)}`;
export const THE_MARKET = 'The market';

export function chartGeometry(m: ChartModel, w: number, h: number): ChartGeometry {
  const pts = m.points.length ? m.points : [{ dayIndex: 0, balance: m.start, ghost: null }];
  const lastDay = pts[pts.length - 1].dayIndex;
  const span = Math.max(MIN_SPAN_DAYS, lastDay / TODAY_AT);
  const usableW = w - PAD_RIGHT;
  const xOf = (d: number) => Math.min(usableW, (d / span) * usableW);

  let lo = m.start;
  let hi = m.start;
  for (const p of pts) {
    lo = Math.min(lo, p.balance, p.ghost ?? Infinity);
    hi = Math.max(hi, p.balance, p.ghost ?? -Infinity);
  }
  // The previous go, as far as the chart's right edge reaches (thinned to about one point per 2px).
  const otherDays: number[] = [];
  if (m.other?.length) {
    const lastVisible = Math.min(m.other.length - 1, Math.floor(span));
    const every = Math.max(1, Math.ceil(lastVisible / (usableW / 2)));
    for (let d = 0; d <= lastVisible; d += every) otherDays.push(d);
    if (otherDays[otherDays.length - 1] !== lastVisible) otherDays.push(lastVisible);
    for (const d of otherDays) {
      lo = Math.min(lo, m.other[d]);
      hi = Math.max(hi, m.other[d]);
    }
  }
  // A minimum vertical range of 4% of the start, so small wobbles do not look like cliffs.
  const minRange = m.start * 0.04;
  if (hi - lo < minRange) {
    const mid = (hi + lo) / 2;
    lo = mid - minRange / 2;
    hi = mid + minRange / 2;
  }
  const yOf = (v: number) => PAD_Y + ((hi - v) / (hi - lo)) * (h - 2 * PAD_Y);

  const line = pts.map((p) => [xOf(p.dayIndex), yOf(p.balance)] as [number, number]);
  const ghosts: [number, number][][] = [];
  let seg: [number, number][] = [];
  for (const p of pts) {
    if (p.ghost === null) {
      if (seg.length > 1) ghosts.push(seg);
      seg = [];
    } else seg.push([xOf(p.dayIndex), yOf(p.ghost)]);
  }
  if (seg.length > 1) ghosts.push(seg);

  const marks = m.trades.map((t) => {
    let i = pts.findIndex((p) => p.dayIndex >= t.dayIndex);
    if (i < 0) i = pts.length - 1;
    return { x: line[i][0], y: line[i][1], side: t.side };
  });

  const other = otherDays.map((d) => [xOf(d), yOf(m.other![d])] as [number, number]);
  return { line, ghosts, startY: yOf(m.start), today: line[line.length - 1], marks, other };
}

const fmt = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function el(name: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

export function drawChart(svg: SVGSVGElement | SVGElement, m: ChartModel, paper: Paper, w: number, h: number): void {
  const g = chartGeometry(m, w, h);
  const ink = paper.ink;
  const kids: SVGElement[] = [];
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', m.label);

  if (m.worst) {
    const fill = [...g.line, [g.today[0], h], [0, h]] as [number, number][];
    kids.push(el('polygon', { fill: WORST_FILL, points: fmt(fill) }));
  }
  kids.push(el('line', { x1: 0, y1: g.startY, x2: w, y2: g.startY, stroke: ink, 'stroke-width': 1, 'stroke-dasharray': '1 4' }));

  if (g.other.length > 1) {
    kids.push(
      el('polyline', {
        'data-other': '', fill: 'none', stroke: m.worst ? paper.ink : MARKET_DASH, 'stroke-width': 2,
        'stroke-dasharray': '4 4', 'stroke-linecap': 'round', points: fmt(g.other),
      }),
    );
  }
  for (const seg of g.ghosts) {
    kids.push(
      el('polyline', {
        fill: 'none', stroke: m.worst ? paper.ink : MARKET_DASH, 'stroke-width': 2.5,
        'stroke-dasharray': '3 5', 'stroke-linecap': 'round', points: fmt(seg),
      }),
    );
  }
  kids.push(
    el('polyline', {
      fill: 'none', stroke: ink, 'stroke-width': m.worst ? 3 : 2.5,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round', points: fmt(g.line),
    }),
  );
  kids.push(el('circle', { cx: g.today[0], cy: g.today[1], r: m.worst ? 8 : 6, fill: ink }));
  // Sale and buy marks sit above today's dot, so a trade made today stays visible.
  for (const mk of g.marks) {
    kids.push(
      mk.side === 'sell'
        ? el('circle', { cx: mk.x, cy: mk.y, r: 6, fill: paper.accent })
        : el('circle', { cx: mk.x, cy: mk.y, r: 5, fill: paper.bg, stroke: ink, 'stroke-width': 2 }),
    );
  }
  kids.push(...placeLabels(m, g, paper, w, h));
  svg.replaceChildren(...kids);
}

// --- Labels -------------------------------------------------------------------

interface Box { x0: number; x1: number; y0: number; y1: number }
interface Spot { x: number; y: number; anchor: 'start' | 'end' }

/** Rough width of a 12px Libre Franklin label. */
const CHAR_W = 6.5;
export const SOLD = 'Sold';

function boxOf(s: Spot, text: string): Box {
  const wd = text.length * CHAR_W;
  const x0 = s.anchor === 'end' ? s.x - wd : s.x;
  return { x0, x1: x0 + wd, y0: s.y - 11, y1: s.y + 3 };
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** True when any line passes through the box (sampled every 2px, with room for the stroke). */
function crossesLine(b: Box, lines: [number, number][][]): boolean {
  const pad = 2;
  for (const pl of lines) {
    for (let i = 0; i < pl.length; i++) {
      const [x1, y1] = pl[Math.max(0, i - 1)];
      const [x2, y2] = pl[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2));
      for (let k = 0; k <= n; k++) {
        const x = x1 + ((x2 - x1) * k) / n;
        const y = y1 + ((y2 - y1) * k) / n;
        if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) return true;
      }
    }
  }
  return false;
}

/**
 * The chart's words, each placed at the first of its candidate spots that stays inside
 * the chart, clear of the other labels, the dots and the lines, in this order: "Sold",
 * the start label, "The market". "Sold" and "The market" fall back to a spot clear of
 * other labels only; the start label is dropped rather than drawn across a line.
 */
function placeLabels(m: ChartModel, g: ChartGeometry, paper: Paper, w: number, h: number): SVGElement[] {
  const lines = [g.line, ...g.ghosts];
  const taken: Box[] = [];
  const dot = (x: number, y: number, r: number): Box => ({ x0: x - r - 2, x1: x + r + 2, y0: y - r - 2, y1: y + r + 2 });
  const dots = [dot(g.today[0], g.today[1], 8), ...g.marks.map((mk) => dot(mk.x, mk.y, 6))];
  const out: SVGElement[] = [];
  const inside = (b: Box) => b.x0 >= 0 && b.x1 <= w && b.y0 >= 0 && b.y1 <= h;

  function place(text: string, spots: Spot[], strict: boolean, fill: string, weight: number) {
    const fits = (s: Spot, avoidLines: boolean) => {
      const b = boxOf(s, text);
      return inside(b) && !taken.some((t) => overlaps(t, b)) && !dots.some((d) => overlaps(d, b)) &&
        (!avoidLines || !crossesLine(b, lines));
    };
    const spot = spots.find((s) => fits(s, true)) ?? (strict ? undefined : spots.find((s) => fits(s, false)));
    if (!spot) return;
    taken.push(boxOf(spot, text));
    out.push(
      el('text', {
        x: spot.x, y: spot.y, 'text-anchor': spot.anchor, fill,
        'font-family': LABEL_FONT, 'font-weight': weight, 'font-size': 12,
      }, text),
    );
  }

  const around = (x: number, y: number): Spot[] => [
    { x: x - 10, y: y + 18, anchor: 'end' },
    { x: x - 10, y: y - 10, anchor: 'end' },
    { x: x + 10, y: y + 18, anchor: 'start' },
    { x: x + 10, y: y - 10, anchor: 'start' },
    { x: x - 12, y: y + 4, anchor: 'end' },
  ];

  const sale = [...g.marks].reverse().find((mk) => mk.side === 'sell');
  if (sale) place(SOLD, around(sale.x, sale.y), false, paper.ink, 700);

  const sy = g.startY;
  // Along the dotted line from the right, above then below it, then from the left edge.
  const startSpots: Spot[] = [];
  for (const shift of [0, 60, 120, 180]) {
    startSpots.push({ x: w - shift, y: sy - 6, anchor: 'end' }, { x: w - shift, y: sy + 16, anchor: 'end' });
  }
  startSpots.push({ x: 0, y: sy - 6, anchor: 'start' }, { x: 0, y: sy + 16, anchor: 'start' });
  place(STARTED_AT(m.start), startSpots, true, paper.secondary, 500);
  if (m.inCash && g.ghosts.length) {
    const last = g.ghosts[g.ghosts.length - 1];
    const [gx, gy] = last[last.length - 1];
    const up = gy <= g.today[1];
    // Close to the end of the dashed line first, then further out, on the side away from the player's line.
    const dys = up ? [-10, 18, -24, 32] : [18, -10, 32, -24];
    const spots: Spot[] = [];
    for (const dx of [0, 40, 80]) {
      for (const dy of dys) {
        spots.push({ x: gx - 10 - dx, y: gy + dy, anchor: 'end' });
      }
    }
    spots.push(...around(gx, gy));
    place(THE_MARKET, spots, false, paper.secondary, 500);
  }

  return out;
}

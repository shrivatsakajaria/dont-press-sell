// The balance chart (spec 9): one 2.5px ink line growing left to right, a dotted
// start line, a filled dot for today. No grid, no axis, no price scale, no dates.
// While in cash a dashed line shows the market carrying on without the player.
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
/** Room above the highest point, and below the lowest for a label under it ("Sold" at the low). */
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const PAD_RIGHT = 8;
/** Least vertical range, as a share of the start, either side of the start line. */
export const MIN_RANGE = 0.02;

/** Worst-day fill beneath the cream line (mock-up 2). */
const WORST_FILL = '#96102a';
const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_FONT = "'Libre Franklin', Arial, sans-serif";

export { STARTED_AT, THE_MARKET, SOLD } from '../content/copy';
import { STARTED_AT, THE_MARKET, SOLD } from '../content/copy';

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
  // The range always spans 2% of the start either side of it, so small wobbles never look like cliffs.
  lo = Math.min(lo, m.start * (1 - MIN_RANGE));
  hi = Math.max(hi, m.start * (1 + MIN_RANGE));
  const yOf = (v: number) => PAD_TOP + ((hi - v) / (hi - lo)) * (h - PAD_TOP - PAD_BOTTOM);

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

/** Generous width of a 12px Libre Franklin label, per character. */
const CHAR_W = 7.2;
/** Labels keep this far from the chart's sides (on red days the chart bleeds to the screen edge). */
const INSET = 12;
/** Space kept between two labels. */
const GAP = 4;

function boxOf(s: Spot, text: string): Box {
  const wd = text.length * CHAR_W;
  const x0 = s.anchor === 'end' ? s.x - wd : s.x;
  return { x0, x1: x0 + wd, y0: s.y - 11, y1: s.y + 3 };
}
const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

/** Points along a polyline about every pixel. */
function samples(pl: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pl.length; i++) {
    const [x1, y1] = pl[Math.max(0, i - 1)];
    const [x2, y2] = pl[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
    for (let k = 0; k <= n; k++) out.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]);
  }
  return out;
}

/** True when any line passes through the box (with room for the stroke). */
function crossesLine(b: Box, lines: [number, number][][]): boolean {
  const pad = 3;
  return lines.some((pl) => samples(pl).some(([x, y]) => x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad));
}

/** Distance from the box's centre to the nearest point of a line. */
function distTo(b: Box, pl: [number, number][]): number {
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  let best = Infinity;
  for (const [x, y] of samples(pl)) best = Math.min(best, Math.hypot(x - cx, y - cy));
  return best;
}

/**
 * The chart's words, each at the first of its candidate spots that is inside the chart (12px from its
 * sides), clear of the other labels, the dots, every line (the start line included) and, on a red day,
 * the fill under the line. A word with no such spot is left out. "The market" must also sit nearer the
 * dashed market line than the player's line. Order: "Sold", "The market", then the start label.
 */
function placeLabels(m: ChartModel, g: ChartGeometry, paper: Paper, w: number, h: number): SVGElement[] {
  const startLine: [number, number][] = [[0, g.startY], [w, g.startY]];
  const lines = [g.line, ...g.ghosts, g.other, startLine].filter((pl) => pl.length > 1);
  const taken: Box[] = [];
  const dot = (x: number, y: number, r: number): Box => ({ x0: x - r - 2, x1: x + r + 2, y0: y - r - 2, y1: y + r + 2 });
  const dots = [dot(g.today[0], g.today[1], 8), ...g.marks.map((mk) => dot(mk.x, mk.y, 6))];
  const out: SVGElement[] = [];
  const inside = (b: Box) => b.x0 >= INSET && b.x1 <= w - INSET && b.y0 >= 0 && b.y1 <= h;
  // Red day: the area under the player's line is filled.
  const lineY = (x: number): number | null => {
    const pl = g.line;
    if (!pl.length || x < pl[0][0] || x > pl[pl.length - 1][0]) return null;
    for (let i = 1; i < pl.length; i++) {
      const [x1, y1] = pl[i - 1];
      const [x2, y2] = pl[i];
      if (x <= x2) return x2 === x1 ? Math.min(y1, y2) : y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
    }
    return pl[0][1];
  };
  const inFill = (b: Box) => {
    if (!m.worst) return false;
    for (let x = b.x0; x <= b.x1; x += 2) {
      const y = lineY(x);
      if (y !== null && b.y1 > y) return true;
    }
    return false;
  };

  function place(text: string, spots: Spot[], fill: string, weight: number, also?: (b: Box) => boolean) {
    const spot = spots.find((s) => {
      const b = boxOf(s, text);
      return inside(b) && !taken.some((t) => overlaps(t, b, GAP)) && !dots.some((d) => overlaps(d, b)) &&
        !crossesLine(b, lines) && !inFill(b) && (!also || also(b));
    });
    if (!spot) return;
    taken.push(boxOf(spot, text));
    out.push(
      el('text', {
        x: spot.x, y: spot.y, 'text-anchor': spot.anchor, fill,
        'font-family': LABEL_FONT, 'font-weight': weight, 'font-size': 12,
      }, text),
    );
  }

  const around = (x: number, y: number): Spot[] => {
    const spots: Spot[] = [];
    for (const [dx, dy] of [[10, 18], [10, -10], [14, 28], [14, -20], [12, 4], [24, 36], [24, -30]]) {
      spots.push({ x: x - dx, y: y + dy, anchor: 'end' }, { x: x + dx, y: y + dy, anchor: 'start' });
    }
    return spots;
  };

  const sale = [...g.marks].reverse().find((mk) => mk.side === 'sell');
  if (sale) place(SOLD, around(sale.x, sale.y), paper.ink, 700);

  if (m.inCash && g.ghosts.length) {
    const ghost = g.ghosts[g.ghosts.length - 1];
    const [gx, gy] = ghost[ghost.length - 1];
    const up = gy <= g.today[1];
    // Close to the end of the dashed line first, then further back along it, on the side away from the player's line.
    const dys = up ? [-10, -18, 18, -28, 28] : [18, 26, -10, 34, -20];
    const spots: Spot[] = [];
    for (let back = 0; back < ghost.length; back = back ? back * 2 : 1) {
      const [px, py] = ghost[ghost.length - 1 - back];
      for (const dy of dys) spots.push({ x: px - 6, y: py + dy, anchor: 'end' }, { x: px + 6, y: py + dy, anchor: 'start' });
    }
    spots.push(...around(gx, gy));
    place(THE_MARKET, spots, paper.secondary, 500, (b) => distTo(b, ghost) < distTo(b, g.line));
  }

  const sy = g.startY;
  // Last, and only where it has clear space: along the dotted line from the right, above then below it, then from the left.
  const startSpots: Spot[] = [];
  for (let shift = 0; shift <= w - 2 * INSET; shift += 30) {
    startSpots.push({ x: w - INSET - shift, y: sy - 6, anchor: 'end' }, { x: w - INSET - shift, y: sy + 16, anchor: 'end' });
  }
  place(STARTED_AT(m.start), startSpots, paper.secondary, 500);


  return out;
}

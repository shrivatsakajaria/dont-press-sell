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

  const clampY = (y: number) => Math.min(h - 4, Math.max(12, y));
  const label = (x: number, y: number, text: string) =>
    el('text', {
      x, y, 'text-anchor': 'end', fill: paper.secondary,
      'font-family': LABEL_FONT, 'font-weight': 500, 'font-size': 12,
      // Knocked out of the lines behind it in the paper colour, as print does.
      stroke: m.worst ? 'none' : paper.bg, 'stroke-width': 4, 'stroke-linejoin': 'round', 'paint-order': 'stroke',
    }, text);

  // "The market" sits by the end of the dashed line: above it when the market is
  // above the player's flat line, below it otherwise.
  let marketY: number | null = null;
  let marketLabel: SVGElement | null = null;
  if (m.inCash && g.ghosts.length) {
    const last = g.ghosts[g.ghosts.length - 1];
    const [gx, gy] = last[last.length - 1];
    marketY = clampY(gy <= g.today[1] ? gy - 10 : gy + 18);
    marketLabel = label(Math.max(72, gx - 10), marketY, THE_MARKET);
  }
  // The start label sits at the right, above the dotted line, or below it, whichever is clear.
  const startY = [g.startY - 6, g.startY + 16]
    .map(clampY)
    .find((y) => marketY === null || Math.abs(y - marketY) >= 14);

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
  for (const mk of g.marks) {
    kids.push(
      mk.side === 'sell'
        ? el('circle', { cx: mk.x, cy: mk.y, r: 6, fill: paper.accent })
        : el('circle', { cx: mk.x, cy: mk.y, r: 5, fill: paper.bg, stroke: ink, 'stroke-width': 2 }),
    );
  }
  kids.push(el('circle', { cx: g.today[0], cy: g.today[1], r: m.worst ? 8 : 6, fill: ink }));
  if (startY !== undefined) kids.push(label(w, startY, STARTED_AT(m.start)));
  if (marketLabel) kids.push(marketLabel);
  svg.replaceChildren(...kids);
}

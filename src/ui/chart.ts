// The play chart (spec 9, ruling R42): the market price only, one unbroken 2.5px ink line growing
// left to right, a dotted start line at day 1's close and a filled dot for today. Sales and buy-backs
// are dots on the price line, labelled "Sold" and "Bought". While in cash a faint dotted level marks
// the latest sale close ("Sold at"), so a price under it reads as cheaper at a glance. No money
// anywhere: money is only the big number. No grid, no axis, no price scale, no dates.
//
// R43 (smoothness): the chart is built once per <svg> and updated in place. A new day's segment grows
// over the step (animateMs), the scale easing along with it, so the line moves rather than jumps.
import type { Trade } from '../engine/types';
import type { Paper } from './paper';
import { BOUGHT, SOLD, SOLD_AT } from '../content/copy';

export interface ChartModel {
  /** The market's closes from day 1 to today: closes[i] is day i's close (today is the last). */
  closes: number[];
  /** Sales and buy-backs so far, by day index. */
  trades: Trade[];
  /** While in cash: the close on the day of the latest sale; null when invested. */
  soldAt: number | null;
  /** A slow-motion falling day: the area under the line is filled. */
  worst: boolean;
  /** Text alternative for the chart; it updates every step. */
  label: string;
  /** How long today's step is on screen: the play screen grows the new day's segment over it. */
  growMs?: number;
}

export interface ChartGeometry {
  line: [number, number][];
  startY: number;
  today: [number, number];
  marks: { x: number; y: number; side: Trade['side'] }[];
  /** The "Sold at" level while in cash: from the sale dot (x0) to the right edge, at height y. */
  soldAt: { x0: number; y: number } | null;
  /** The whole days drawn (thinned on long runs), the tip excluded. */
  days: number[];
  /** From data (day, close) to the chart: x = sx * day, y = sy * close + ty. */
  map: { sx: number; sy: number; ty: number };
  /** The growing tip in data units: from the last whole day [day, close] to [day, close] at `at`; null on a whole day. */
  tip: [number, number, number, number] | null;
}

export interface DrawOpts {
  /** Grow the new day's segment over this long (the step's length); 0 or absent draws at once. */
  animateMs?: number;
}

/** The fewest days the x-axis ever spans, so day 2 does not fill the width. */
const MIN_SPAN_DAYS = 40;
/** Today's dot sits at most this far across, leaving the right edge as "the future". */
const TODAY_AT = 0.9;
/** Room above the highest point, and below the lowest for a label under it ("Sold" at the low). */
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const PAD_RIGHT = 8;
/** Least vertical range, as a share of day 1's close, either side of it. */
export const MIN_RANGE = 0.02;
/** The longest a new day takes to draw: a slow day's line arrives well inside its hold. */
const MAX_ANIM_MS = 900;
/** Shorter steps than this run back to back, so their segments move at an even pace (no ease). */
const LINEAR_BELOW_MS = 400;

/** Worst-day fill beneath the cream line (mock-up 2). */
const WORST_FILL = '#96102a';
const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_FONT = "'Libre Franklin', Arial, sans-serif";

/** Day index of the latest sale, or null. */
function lastSaleDay(trades: Trade[]): number | null {
  for (let i = trades.length - 1; i >= 0; i--) if (trades[i].side === 'sell') return trades[i].dayIndex;
  return null;
}

/**
 * Where everything sits with the line drawn up to day `at` (default today). A fractional `at` puts
 * the tip part-way along the next segment and eases the scale with it, so every frame of the growth
 * is a continuous step from the one before.
 */
export function chartGeometry(m: ChartModel, w: number, h: number, at?: number): ChartGeometry {
  const closes = m.closes.length ? m.closes : [1];
  const last = closes.length - 1;
  const t = Math.max(0, Math.min(last, at ?? last));
  const full = Math.floor(t);
  const frac = t - full;
  const tipV = frac > 0 ? closes[full] + (closes[full + 1] - closes[full]) * frac : closes[full];

  const span = Math.max(MIN_SPAN_DAYS, t / TODAY_AT);
  const usableW = w - PAD_RIGHT;
  const xOf = (d: number) => Math.min(usableW, (d / span) * usableW);

  const base = closes[0];
  let lo = base * (1 - MIN_RANGE);
  let hi = base * (1 + MIN_RANGE);
  let loI = 0;
  let hiI = 0;
  for (let i = 0; i <= full; i++) {
    const v = closes[i];
    if (v < closes[loI]) loI = i;
    if (v > closes[hiI]) hiI = i;
  }
  lo = Math.min(lo, closes[loI], tipV);
  hi = Math.max(hi, closes[hiI], tipV);
  if (m.soldAt !== null) {
    lo = Math.min(lo, m.soldAt);
    hi = Math.max(hi, m.soldAt);
  }
  const innerH = h - PAD_TOP - PAD_BOTTOM;
  const yOf = (v: number) => PAD_TOP + ((hi - v) / (hi - lo)) * innerH;

  // About a point per pixel on long runs; the high, the low and the trade days are always kept.
  const n = full + 1;
  const maxPts = Math.max(50, Math.floor(usableW));
  let days: number[];
  if (n <= maxPts) days = Array.from({ length: n }, (_, i) => i);
  else {
    const stride = Math.ceil(n / maxPts);
    const keep = new Set<number>([loI, hiI, full]);
    for (const tr of m.trades) if (tr.dayIndex <= full) keep.add(tr.dayIndex);
    days = [];
    for (let i = 0; i < n; i++) if (i % stride === 0 || keep.has(i)) days.push(i);
  }
  const line = days.map((d) => [xOf(d), yOf(closes[d])] as [number, number]);
  if (frac > 0) line.push([xOf(t), yOf(tipV)]);

  const marks = m.trades
    .filter((tr) => tr.dayIndex <= t + 1e-9 && tr.dayIndex <= last)
    .map((tr) => ({ x: xOf(tr.dayIndex), y: yOf(closes[tr.dayIndex]), side: tr.side }));

  let soldAt: ChartGeometry['soldAt'] = null;
  if (m.soldAt !== null) {
    const sd = lastSaleDay(m.trades);
    soldAt = { x0: xOf(Math.min(t, sd ?? t)), y: yOf(m.soldAt) };
  }
  return {
    line, startY: yOf(base), today: line[line.length - 1], marks, soldAt, days,
    map: { sx: usableW / span, sy: -innerH / (hi - lo), ty: PAD_TOP + (hi * innerH) / (hi - lo) },
    tip: frac > 0 ? [full, closes[full], t, tipV] : null,
  };
}

const fmt = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Sets attributes, touching the DOM only where a value changed. */
function set(e: Element, attrs: Record<string, string | number>) {
  for (const [k, v] of Object.entries(attrs)) {
    const s = String(v);
    if (e.getAttribute(k) !== s) e.setAttribute(k, s);
  }
}

// --- The chart on one <svg>, kept between days -------------------------------

interface Els {
  fill: SVGElement;
  start: SVGElement;
  level: SVGElement;
  line: SVGElement;
  /** The part of today's segment drawn so far (mid-growth), in data units like the line. */
  tip: SVGElement;
  today: SVGElement;
  marks: SVGElement;
  labels: SVGElement;
}

interface State {
  els: Els;
  m: ChartModel;
  paper: Paper;
  w: number;
  h: number;
  /** The day the line is drawn to on screen now (fractional mid-growth). */
  at: number;
  from: number;
  target: number;
  t0: number;
  dur: number;
  /** Bumped on every draw, so a stale animation frame stops. */
  token: number;
  /** Each label's last spot, tried first so words do not hop between frames. */
  spots: Map<string, number>;
  /** What the line's points were last written from, so they are rewritten only when a day is added. */
  lineKey: string;
}

const states = new WeakMap<Element, State>();

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function build(svg: SVGSVGElement | SVGElement): Els {
  const els: Els = {
    fill: el('polygon', { fill: WORST_FILL, display: 'none' }),
    start: el('line', { 'stroke-width': 1, 'stroke-dasharray': '1 4' }),
    level: el('line', { 'data-level': '', 'stroke-width': 1.5, 'stroke-dasharray': '2 4', 'stroke-linecap': 'round', display: 'none' }),
    line: el('polyline', { fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }),
    tip: el('line', { 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }),
    today: el('circle', {}),
    marks: el('g', {}),
    labels: el('g', {}),
  };
  svg.replaceChildren(els.fill, els.start, els.level, els.line, els.tip, els.today, els.marks, els.labels);
  return els;
}

export function drawChart(
  svg: SVGSVGElement | SVGElement, m: ChartModel, paper: Paper, w: number, h: number, opts: DrawOpts = {},
): void {
  set(svg, { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': m.label });
  let s = states.get(svg);
  if (!s || s.els.line.parentNode !== svg) {
    s = {
      els: build(svg), m, paper, w, h, at: 0, from: 0, target: 0, t0: 0, dur: 0, token: 0, spots: new Map(), lineKey: '',
    };
    states.set(svg, s);
  }
  const target = Math.max(0, m.closes.length - 1);
  const shown = s.at;
  if (shown < s.target && target === s.target) {
    // The same day redrawn mid-growth (a press, a pause, a resize): the running growth carries on.
    s.m = m;
    s.paper = paper;
    s.w = w;
    s.h = h;
    paint(s);
    return;
  }
  const animate = (opts.animateMs ?? 0) > 0 && !reducedMotion() && s.m.closes.length > 0 && target > shown &&
    typeof requestAnimationFrame === 'function';
  s.m = m;
  s.paper = paper;
  s.w = w;
  s.h = h;
  const token = ++s.token;
  if (!animate) {
    s.at = target;
    s.target = target;
    paint(s);
    return;
  }
  s.from = shown;
  s.target = target;
  s.t0 = nowMs();
  s.dur = Math.min(opts.animateMs!, MAX_ANIM_MS);
  paint(s);
  const st = s;
  const tick = () => {
    if (st.token !== token) return;
    const p = Math.min(1, (nowMs() - st.t0) / st.dur);
    const e = st.dur < LINEAR_BELOW_MS ? p : 1 - (1 - p) ** 3;
    st.at = p >= 1 ? st.target : st.from + (st.target - st.from) * e;
    paint(st);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Draws the chart with the line up to s.at, updating the kept elements in place. */
function paint(s: State) {
  const { m, paper, w, h, els } = s;
  const g = chartGeometry(m, w, h, s.at);
  const ink = paper.ink;

  if (m.worst) {
    set(els.fill, { display: 'inline', points: fmt([...g.line, [g.today[0], h], [g.line[0][0], h]]) });
  } else set(els.fill, { display: 'none' });
  set(els.start, { x1: 0, y1: g.startY.toFixed(1), x2: w, y2: g.startY.toFixed(1), stroke: ink });
  if (g.soldAt) {
    set(els.level, {
      display: 'inline', x1: g.soldAt.x0.toFixed(1), x2: w, y1: g.soldAt.y.toFixed(1), y2: g.soldAt.y.toFixed(1),
      stroke: paper.secondary,
    });
  } else set(els.level, { display: 'none' });
  // R43: the line is written in data units (day, close) once per new day; each frame of growth only
  // moves the tip and the transform that maps data to the chart.
  const days = g.days;
  const key = `${m.closes.length}|${days.length}|${days[days.length - 1]}|${days[1] ?? 0}|${m.closes[0]}`;
  if (key !== s.lineKey) {
    s.lineKey = key;
    els.line.setAttribute('points', days.map((d) => `${d},${m.closes[d]}`).join(' '));
  }
  const { sx, sy, ty } = g.map;
  const transform = `matrix(${sx} 0 0 ${sy} 0 ${ty})`;
  const width = m.worst ? 3 : 2.5;
  set(els.line, { transform, stroke: ink, 'stroke-width': width });
  if (g.tip) {
    set(els.tip, { display: 'inline', transform, stroke: ink, 'stroke-width': width, x1: g.tip[0], y1: g.tip[1], x2: g.tip[2], y2: g.tip[3] });
  } else set(els.tip, { display: 'none' });
  set(els.today, { cx: g.today[0].toFixed(1), cy: g.today[1].toFixed(1), r: m.worst ? 8 : 6, fill: ink });

  // Sale and buy dots sit above today's dot, so a trade made today stays visible.
  const kids = els.marks.children;
  while (kids.length > g.marks.length) kids[kids.length - 1].remove();
  g.marks.forEach((mk, i) => {
    let c = kids[i] as SVGElement | undefined;
    if (!c) {
      c = el('circle', {});
      els.marks.append(c);
    }
    const at = { cx: mk.x.toFixed(1), cy: mk.y.toFixed(1) };
    if (mk.side === 'sell') set(c, { ...at, r: 6, fill: paper.accent, stroke: 'none', 'stroke-width': 0 });
    else set(c, { ...at, r: 5, fill: paper.bg, stroke: ink, 'stroke-width': 2 });
  });

  placeLabels(s, g);
}

// --- Labels -------------------------------------------------------------------

interface Box { x0: number; x1: number; y0: number; y1: number }
interface Spot { x: number; y: number; anchor: 'start' | 'end' }

/** Generous width of a 14px Libre Franklin label, per character (R48: small text at least 14px). */
const CHAR_W = 8.4;
/** Labels keep this far from the chart's sides (on red days the chart bleeds to the screen edge). */
const INSET = 12;
/** Space kept between two labels. */
const GAP = 4;

function boxOf(s: Spot, text: string): Box {
  const wd = text.length * CHAR_W;
  const x0 = s.anchor === 'end' ? s.x - wd : s.x;
  return { x0, x1: x0 + wd, y0: s.y - 13, y1: s.y + 3 };
}
const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

/** True when the segment (x1,y1)-(x2,y2) passes through the box (Liang-Barsky clipping). */
function segHits(x1: number, y1: number, x2: number, y2: number, b: Box): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [[-dx, x1 - b.x0], [dx, b.x1 - x1], [-dy, y1 - b.y0], [dy, b.y1 - y1]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

/** First index whose x is at least x (the line's x only grows). */
function firstAtLeast(pl: [number, number][], x: number): number {
  let a = 0;
  let b = pl.length;
  while (a < b) {
    const mid = (a + b) >> 1;
    if (pl[mid][0] < x) a = mid + 1;
    else b = mid;
  }
  return a;
}

/** True when the line passes through the box, with room for the stroke. Only the segments under the box are tested. */
function crossesLine(b0: Box, pl: [number, number][]): boolean {
  const pad = 3;
  const b = { x0: b0.x0 - pad, x1: b0.x1 + pad, y0: b0.y0 - pad, y1: b0.y1 + pad };
  if (pl.length === 1) return pl[0][0] >= b.x0 && pl[0][0] <= b.x1 && pl[0][1] >= b.y0 && pl[0][1] <= b.y1;
  const from = Math.max(1, firstAtLeast(pl, b.x0));
  for (let i = from; i < pl.length; i++) {
    if (segHits(pl[i - 1][0], pl[i - 1][1], pl[i][0], pl[i][1], b)) return true;
    if (pl[i - 1][0] > b.x1) break;
  }
  return false;
}

/** The line's height at x (null outside it). */
function lineY(pl: [number, number][], x: number): number | null {
  if (!pl.length || x < pl[0][0] || x > pl[pl.length - 1][0]) return null;
  const i = Math.max(1, firstAtLeast(pl, x));
  if (i >= pl.length) return pl[pl.length - 1][1];
  const [x1, y1] = pl[i - 1];
  const [x2, y2] = pl[i];
  return x2 === x1 ? Math.min(y1, y2) : y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
}

/**
 * The chart's words, each at the first of its candidate spots (its last spot first) that is inside the
 * chart (12px from its sides), clear of the other words, the dots, every line and, on a red day, the
 * fill under the line. A word with no such spot is left out. Order: "Sold at", "Sold", "Bought".
 */
function placeLabels(s: State, g: ChartGeometry): void {
  const { m, paper, w, h, els } = s;
  const lines: [number, number][][] = [g.line, [[0, g.startY], [w, g.startY]]];
  if (g.soldAt) lines.push([[g.soldAt.x0, g.soldAt.y], [w, g.soldAt.y]]);
  const taken: Box[] = [];
  const dot = (x: number, y: number, r: number): Box => ({ x0: x - r - 2, x1: x + r + 2, y0: y - r - 2, y1: y + r + 2 });
  const dots = [dot(g.today[0], g.today[1], 8), ...g.marks.map((mk) => dot(mk.x, mk.y, 6))];
  const inside = (b: Box) => b.x0 >= INSET && b.x1 <= w - INSET && b.y0 >= 0 && b.y1 <= h;
  const inFill = (b: Box) => {
    if (!m.worst) return false;
    for (let x = b.x0; x <= b.x1 + 1; x += 2) {
      const y = lineY(g.line, Math.min(x, b.x1));
      if (y !== null && b.y1 > y) return true;
    }
    return false;
  };
  const placed: { text: string; spot: Spot; fill: string; weight: number }[] = [];

  function place(key: string, text: string, spots: Spot[], fill: string, weight: number) {
    const ok = (sp: Spot) => {
      const b = boxOf(sp, text);
      return inside(b) && !taken.some((t) => overlaps(t, b, GAP)) && !dots.some((d) => overlaps(d, b)) &&
        !lines.some((pl) => crossesLine(b, pl)) && !inFill(b);
    };
    const prev = s.spots.get(key);
    let i = prev !== undefined && prev < spots.length && ok(spots[prev]) ? prev : spots.findIndex(ok);
    if (i < 0) {
      s.spots.delete(key);
      return;
    }
    s.spots.set(key, i);
    taken.push(boxOf(spots[i], text));
    placed.push({ text, spot: spots[i], fill, weight });
  }

  const around = (x: number, y: number): Spot[] => {
    const spots: Spot[] = [];
    for (const [dx, dy] of [[10, 18], [10, -10], [14, 28], [14, -20], [12, 4], [24, 36], [24, -30]]) {
      spots.push({ x: x - dx, y: y + dy, anchor: 'end' }, { x: x + dx, y: y + dy, anchor: 'start' });
    }
    return spots;
  };

  let levelNamed = false;
  if (g.soldAt) {
    // Small, on the level's own stretch: its right-hand end, above it then below it, sliding left as far
    // as the sale dot; failing that, just left of the dot ("Sold at" then the dot and the level).
    const { x0, y: ly } = g.soldAt;
    const wd = SOLD_AT.length * CHAR_W;
    const spots: Spot[] = [];
    for (let right = w - INSET; right - wd >= x0 + 8; right -= 12) {
      spots.push({ x: right, y: ly - 7, anchor: 'end' }, { x: right, y: ly + 17, anchor: 'end' });
    }
    for (const dy of [4, -6, 14]) spots.push({ x: x0 - 10, y: ly + dy, anchor: 'end' });
    place('soldAt', SOLD_AT, spots, paper.secondary, 500);
    levelNamed = s.spots.has('soldAt');
  }
  const sale = [...g.marks].reverse().find((mk) => mk.side === 'sell');
  // In cash the level names the sale; "Sold" only when it could not be placed, or once bought back.
  if (sale && !levelNamed) place('sold', SOLD, around(sale.x, sale.y), paper.ink, 700);
  const buy = [...g.marks].reverse().find((mk) => mk.side === 'buy');
  if (buy) place('bought', BOUGHT, around(buy.x, buy.y), paper.ink, 700);

  // Reuse the text elements, in order; drop the ones not placed this frame.
  const texts = els.labels.children;
  while (texts.length > placed.length) texts[texts.length - 1].remove();
  placed.forEach((p, i) => {
    let t = texts[i] as SVGElement | undefined;
    if (!t) {
      t = el('text', { 'font-family': LABEL_FONT, 'font-size': 14 });
      els.labels.append(t);
    }
    if (t.textContent !== p.text) t.textContent = p.text;
    set(t, { x: p.spot.x.toFixed(1), y: p.spot.y.toFixed(1), 'text-anchor': p.spot.anchor, fill: p.fill, 'font-weight': p.weight });
  });
}

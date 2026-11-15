// The play chart (spec 9, ruling R42): the market price only, one unbroken 2.5px ink line growing
// left to right, a dotted start line at day 1's close and a filled dot for today. Sales and buy-backs
// are dots on the price line, labelled "Sold" and "Bought". While in cash a faint dotted level marks
// the latest sale close ("Sold at"), so a price under it reads as cheaper at a glance. No money
// anywhere: money is only the big number. No grid, no axis, no price scale, no dates.
//
// R43/R57 (smoothness): the chart is built once per <svg> and updated in place. A new day's segment grows
// at an even pace over the whole step (animateMs), so the line never stops while the clock runs.
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
  /**
   * K2: how long today's step is on screen. The new day's segment grows at an even pace across all of
   * it (R57); a redraw of the same day with a longer step (a hold) stretches the growth. 0 or absent draws at once.
   */
  animateMs?: number;
  /** The clock is paused: the growth holds where it is, and carries on when a draw comes without it. */
  paused?: boolean;
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
    // A power of two, so the days kept change only when the stride doubles (the line does not shimmer).
    const stride = 2 ** Math.ceil(Math.log2(n / maxPts));
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
//
// R57: the layout is worked out once per day (and on a press, a pause or a resize): the whole line to
// the last whole day in pixels, at today's scale, with the dots, the levels and the words. Each frame in
// between only grows the tip, and moves the scale with it through one transform on the plot (the span
// widens and a new low or high stretches the range as the tip gets there; at the end of the step the
// transform is gone). Today's dot, the trade dots and the words follow by their x and y, so they never
// stretch. The tip grows at an even pace across the whole step.

interface Els {
  /** The line, the tip, the fill and the levels; carries the scale's motion as one transform. */
  plot: SVGElement;
  fill: SVGElement;
  /** Clips the worst-day fill to the tip, so it grows with the line. */
  clip: SVGElement;
  start: SVGElement;
  level: SVGElement;
  line: SVGElement;
  /** The part of the line grown since the last whole day drawn, to the tip. */
  tip: SVGElement;
  today: SVGElement;
  marks: SVGElement;
  labels: SVGElement;
}

/** From data (day, close) to the chart: x = sx * day, y = sy * close + ty. */
type MapXY = ChartGeometry['map'];

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
  /** The step's length the growth was given (animateMs plus any extendChart), to spot a hold in a redraw. */
  stepMs: number;
  /** When the clock paused (null while running). */
  pausedAt: number | null;
  /** A frame is booked. */
  ticking: boolean;
  /** The scale the layout is drawn in (today's, with the line to today). */
  map: MapXY;
  /** The last whole day in the drawn line: the tip runs from it. */
  base: number;
  /** Lowest and highest close from day 1 to each day of this step (index d - base), with the floor of the range. */
  lows: number[];
  highs: number[];
  /** Dots and words in today's scale, moved with the scale each frame. A dot ahead of the tip rides on it (R65). */
  marks: { x: number; y: number; day: number }[];
  words: { x: number; y: number }[];
  /** Each label's last spot, tried first so words do not hop between days. */
  spots: Map<string, number>;
}

/** The growth ends this long after the step, so a day that arrives a frame late never finds the line still. */
const TRAIL_MS = 34;
/** R65: on a press the growing segment finishes within this long, so the tip reaches today's close. */
export const CATCH_UP_MS = 80;

const states = new WeakMap<Element, State>();
let clipIds = 0;

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function build(svg: SVGSVGElement | SVGElement): Els {
  const id = `dps-grow-${++clipIds}`;
  const clip = el('rect', { x: -40, y: -10000, width: 0, height: 20000 });
  const clipPath = el('clipPath', { id });
  clipPath.append(clip);
  const defs = el('defs', {});
  defs.append(clipPath);
  // The strokes keep their width while the scale moves.
  const keepWidth = { 'vector-effect': 'non-scaling-stroke' };
  const els: Els = {
    plot: el('g', { 'data-plot': '' }),
    fill: el('polygon', { fill: WORST_FILL, display: 'none', 'clip-path': `url(#${id})` }),
    clip,
    start: el('line', { 'stroke-width': 1, 'stroke-dasharray': '1 4', ...keepWidth }),
    level: el('line', { 'data-level': '', 'stroke-width': 1.5, 'stroke-dasharray': '2 4', 'stroke-linecap': 'round', display: 'none', ...keepWidth }),
    line: el('polyline', { fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...keepWidth }),
    tip: el('path', { 'data-tip': '', fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...keepWidth }),
    today: el('circle', {}),
    marks: el('g', {}),
    labels: el('g', {}),
  };
  els.plot.append(els.fill, els.start, els.level, els.line, els.tip);
  // Today's dot first: the trade dots sit above it, so a trade made today stays visible.
  svg.replaceChildren(defs, els.plot, els.today, els.marks, els.labels);
  // Its own layer: the growing tip repaints the chart, not the page around it.
  const st = (svg as SVGElement).style;
  if (st) st.willChange = 'transform';
  return els;
}

export function drawChart(
  svg: SVGSVGElement | SVGElement, m: ChartModel, paper: Paper, w: number, h: number, opts: DrawOpts = {},
): void {
  set(svg, { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': m.label });
  if (!m.closes.length) m = { ...m, closes: [1] };
  let s = states.get(svg);
  const fresh = !s || s.els.plot.parentNode !== svg;
  if (!s || fresh) {
    s = {
      els: build(svg), m, paper, w, h, at: 0, from: 0, target: 0, t0: 0, dur: 0, stepMs: 0, pausedAt: null, ticking: false,
      map: { sx: 1, sy: 1, ty: 0 }, base: 0, lows: [], highs: [], marks: [], words: [], spots: new Map(),
    };
    states.set(svg, s);
  }
  const now = nowMs();
  const target = Math.max(0, m.closes.length - 1);
  const ms = opts.animateMs ?? 0;
  s.m = m;
  s.paper = paper;
  s.w = w;
  s.h = h;
  const pauseNow = !!opts.paused;

  if (!fresh && target === s.target) {
    // The same day redrawn (a press, a pause, a resize): the running growth carries on, stretched if
    // the step grew (a hold), frozen while paused.
    if (pauseNow && s.pausedAt === null) s.pausedAt = now;
    if (!pauseNow && s.pausedAt !== null) {
      s.t0 += now - s.pausedAt;
      s.pausedAt = null;
    }
    if (ms > s.stepMs) {
      if (s.at < s.target) stretch(s, ms - s.stepMs, now);
      s.stepMs = ms;
    }
    layout(s);
    frame(s, s.pausedAt ?? now);
    loop(s);
    return;
  }

  const animate = !fresh && ms > 0 && !reducedMotion() && target > s.at && typeof requestAnimationFrame === 'function';
  s.pausedAt = null;
  if (!animate) {
    s.at = target;
    s.from = target;
    s.target = target;
    s.stepMs = 0;
    s.dur = 0;
    layout(s);
    frame(s, now);
    return;
  }
  s.from = s.at;
  s.target = target;
  s.t0 = now;
  s.dur = ms + TRAIL_MS;
  s.stepMs = ms;
  if (pauseNow) s.pausedAt = now;
  layout(s);
  frame(s, now);
  loop(s);
}

/**
 * R65, a press (the clock holds `ms`, K2). The trade is the newest in the model the screen just drew.
 * - A trade at today's close: the growing segment finishes at once (a catch-up of at most CATCH_UP_MS, none
 *   with reduced motion), so the tip reaches today's close under the dot; it stays there through the hold
 *   and the rest of the step, and the next day grows from there.
 * - A trade pinned to the step before (the step painted when the finger went down): the tip goes back to
 *   that day's close (it had only just left it) under the dot, stays there for the hold, then grows to
 *   today over what was left of the step.
 * Until the tip gets there, a trade dot ahead of it rides on the tip (frame), so it is never off the line.
 */
export function extendChart(svg: SVGSVGElement | SVGElement, ms: number): void {
  const s = states.get(svg);
  if (!s) return;
  const hold = ms > 0 && Number.isFinite(ms) ? ms : 0;
  s.stepMs += hold;
  const trades = s.m.trades;
  const day = trades.length ? Math.min(trades[trades.length - 1].dayIndex, s.target) : s.target;
  const ref = s.pausedAt ?? nowMs();
  const left = Math.max(0, s.t0 + s.dur - ref);
  if (day >= s.target) {
    if (s.at >= s.target) return;
    const catchUp = reducedMotion() ? 0 : Math.min(CATCH_UP_MS, left);
    s.from = s.at;
    s.t0 = ref;
    s.dur = catchUp;
    if (!(catchUp > 0)) s.at = s.target;
    frame(s, ref);
    loop(s);
    return;
  }
  // Pinned to the day before: back to its close, still for the hold, then the rest of the step's growth.
  s.at = day;
  s.from = day;
  s.t0 = ref + hold;
  s.dur = Math.max(1, left);
  layout(s);
  frame(s, ref);
  loop(s);
}

/** K2, the name lane FC's press handler calls: the same as extendChart. */
export function extend(svg: SVGSVGElement | SVGElement, ms: number): void {
  extendChart(svg, ms);
}

function stretch(s: State, ms: number, now: number) {
  const ref = s.pausedAt ?? now;
  const end = s.t0 + s.dur;
  s.from = s.at;
  s.t0 = ref;
  s.dur = Math.max(1, end - ref) + ms;
}

function loop(s: State) {
  if (s.ticking || s.pausedAt !== null || s.at >= s.target || typeof requestAnimationFrame !== 'function') return;
  s.ticking = true;
  requestAnimationFrame(() => {
    s.ticking = false;
    if (s.pausedAt !== null) return;
    frame(s, nowMs());
    loop(s);
  });
}

/** Once per day (and on a press, a pause or a resize): the line to the last whole day, dots, levels, words. */
function layout(s: State) {
  const { m, paper, w, h, els } = s;
  const g = chartGeometry(m, w, h, s.target);
  s.map = g.map;
  const ink = paper.ink;
  const closes = m.closes;
  const full = Math.floor(s.at + 1e-9);
  const { sx, sy, ty } = g.map;
  const px = (d: number) => `${(sx * d).toFixed(1)},${(sy * closes[d] + ty).toFixed(1)}`;
  let k = g.days.length;
  while (k > 1 && g.days[k - 1] > full) k--;
  s.base = g.days[k - 1] ?? 0;
  const width = m.worst ? 3 : 2.5;
  set(els.line, { points: g.days.slice(0, k).map(px).join(' '), stroke: ink, 'stroke-width': width });
  set(els.tip, { stroke: ink, 'stroke-width': width });

  // The range from day 1 to each day of this step, so a frame finds its scale without a loop over the run.
  const b = closes[0] ?? 1;
  let lo = Math.min(b * (1 - MIN_RANGE), m.soldAt ?? Infinity);
  let hi = Math.max(b * (1 + MIN_RANGE), m.soldAt ?? -Infinity);
  for (let d = 0; d <= s.base; d++) {
    lo = Math.min(lo, closes[d]);
    hi = Math.max(hi, closes[d]);
  }
  s.lows = [];
  s.highs = [];
  for (let d = s.base; d <= s.target; d++) {
    lo = Math.min(lo, closes[d]);
    hi = Math.max(hi, closes[d]);
    s.lows.push(lo);
    s.highs.push(hi);
  }

  if (m.worst) set(els.fill, { display: 'inline', points: fmt([...g.line, [g.today[0], h], [g.line[0][0], h]]) });
  else set(els.fill, { display: 'none' });
  set(els.start, { x1: 0, y1: g.startY.toFixed(1), x2: w, y2: g.startY.toFixed(1), stroke: ink });
  if (g.soldAt) {
    set(els.level, {
      display: 'inline', x1: g.soldAt.x0.toFixed(1), x2: w, y1: g.soldAt.y.toFixed(1), y2: g.soldAt.y.toFixed(1),
      stroke: paper.secondary,
    });
  } else set(els.level, { display: 'none' });
  set(els.today, { r: m.worst ? 8 : 6, fill: ink });

  // A trade made today shows at once, at today's close, and the line grows into it.
  const kids = els.marks.children;
  while (kids.length > g.marks.length) kids[kids.length - 1].remove();
  g.marks.forEach((mk, i) => {
    let c = kids[i] as SVGElement | undefined;
    if (!c) {
      c = el('circle', {});
      els.marks.append(c);
    }
    if (mk.side === 'sell') set(c, { r: 6, fill: paper.accent, stroke: 'none', 'stroke-width': 0 });
    else set(c, { r: 5, fill: paper.bg, stroke: ink, 'stroke-width': 2 });
  });
  const markDays = m.trades.filter((tr) => tr.dayIndex <= s.target + 1e-9 && tr.dayIndex <= closes.length - 1).map((tr) => tr.dayIndex);
  s.marks = g.marks.map((mk, i) => ({ x: mk.x, y: mk.y, day: markDays[i] ?? s.target }));
  s.words = placeLabels(s, g);
}

/** One frame: the tip at the time `now`, the scale it brings, and the dots and words moved with it. */
function frame(s: State, now: number) {
  const { m, els, w, h } = s;
  const p = s.dur > 0 ? Math.max(0, Math.min(1, (now - s.t0) / s.dur)) : 1;
  s.at = p >= 1 ? s.target : s.from + (s.target - s.from) * p;
  const { sx, sy, ty } = s.map;
  const closes = m.closes;
  const full = Math.min(s.target, Math.floor(s.at + 1e-9));
  const frac = s.at - full;
  const tipV = frac > 1e-6 && full + 1 < closes.length ? closes[full] + (closes[full + 1] - closes[full]) * frac : closes[full];
  let d = `M${(sx * s.base).toFixed(1)} ${(sy * closes[s.base] + ty).toFixed(1)}`;
  for (let i = s.base + 1; i <= full; i++) d += `L${(sx * i).toFixed(1)} ${(sy * closes[i] + ty).toFixed(1)}`;
  const tx = sx * s.at;
  const tyv = sy * tipV + ty;
  if (frac > 1e-6) d += `L${tx.toFixed(2)} ${tyv.toFixed(2)}`;
  set(els.tip, { d: full > s.base || frac > 1e-6 ? d : '' });
  if (m.worst) set(els.clip, { width: (tx + 40).toFixed(1) });

  // The scale on screen is the one the line has to the tip (as chartGeometry would draw it at s.at):
  // in the layout's scale, a transform that is gone once the tip reaches today.
  const k = Math.max(0, Math.min(s.lows.length - 1, full - s.base));
  const lo = Math.min(s.lows[k] ?? tipV, tipV);
  const hi = Math.max(s.highs[k] ?? tipV, tipV);
  const usableW = w - PAD_RIGHT;
  const innerH = h - PAD_TOP - PAD_BOTTOM;
  const curSx = usableW / Math.max(MIN_SPAN_DAYS, s.at / TODAY_AT);
  const curSy = -innerH / (hi - lo);
  const curTy = PAD_TOP + (hi * innerH) / (hi - lo);
  const kx = curSx / sx;
  const ky = curSy / sy;
  const f = curTy - ky * ty;
  const still = Math.abs(kx - 1) < 1e-5 && Math.abs(ky - 1) < 1e-5 && Math.abs(f) < 0.01;
  if (still) {
    if (els.plot.hasAttribute('transform')) els.plot.removeAttribute('transform');
  } else set(els.plot, { transform: `matrix(${kx.toFixed(5)} 0 0 ${ky.toFixed(5)} 0 ${f.toFixed(2)})` });
  const X = (x: number) => (still ? x : kx * x).toFixed(1);
  const Y = (y: number) => (still ? y : ky * y + f).toFixed(1);

  set(els.today, { cx: X(tx), cy: Y(tyv) });
  const dots = els.marks.children;
  // R65: a trade dot the tip has not reached yet rides on the tip, so it is always on the line.
  s.marks.forEach((mk, i) => {
    if (!dots[i]) return;
    if (mk.day > s.at + 1e-9) set(dots[i], { cx: X(tx), cy: Y(tyv) });
    else set(dots[i], { cx: X(mk.x), cy: Y(mk.y) });
  });
  const texts = els.labels.children;
  s.words.forEach((wd, i) => texts[i] && set(texts[i], { x: X(wd.x), y: Y(wd.y) }));
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
/** The press stamp's band about the chart's middle (44px line, 2px rules, margin -22px; 2px spare). */
const STAMP_UP = 24;
const STAMP_DOWN = 28;
/** "Sold at" moved off the stamp's band stays at most this far from its level. */
const NEAR_LEVEL = 40;

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
function placeLabels(s: State, g: ChartGeometry): { x: number; y: number }[] {
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

  // The press stamp (screen.ts .stamp) sits across the middle of the chart: words keep out of that band
  // when they can, so "Sold at" never pokes out from behind "Sold at $9,750".
  const band = { y0: h / 2 - STAMP_UP, y1: h / 2 + STAMP_DOWN };
  const clearOfStamp = (b: Box) => b.y1 <= band.y0 || b.y0 >= band.y1;

  function place(key: string, text: string, spots: Spot[], fill: string, weight: number) {
    let strict = true;
    const ok = (sp: Spot) => {
      const b = boxOf(sp, text);
      return inside(b) && (!strict || clearOfStamp(b)) && !taken.some((t) => overlaps(t, b, GAP)) &&
        !dots.some((d) => overlaps(d, b)) && !lines.some((pl) => crossesLine(b, pl)) && !inFill(b);
    };
    const prev = s.spots.get(key);
    const pick = () => (prev !== undefined && prev < spots.length && ok(spots[prev]) ? prev : spots.findIndex(ok));
    let i = pick();
    if (i < 0) {
      strict = false;
      i = pick();
    }
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
    // A level inside the stamp's band: the words step just above or below the band.
    // Only spots that still read as the level's own words (box centre within NEAR_LEVEL of it).
    const near = [band.y0 - 3, band.y1 + 13].filter((y) => Math.abs(y - 5 - ly) <= NEAR_LEVEL);
    for (const y of near) {
      for (let right = w - INSET; right - wd >= x0 + 8; right -= 12) spots.push({ x: right, y, anchor: 'end' });
    }
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
    set(t, { 'text-anchor': p.spot.anchor, fill: p.fill, 'font-weight': p.weight });
  });
  return placed.map((p) => ({ x: p.spot.x, y: p.spot.y }));
}

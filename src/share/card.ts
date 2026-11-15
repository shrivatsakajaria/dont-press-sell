// The shareable result card: 1080 x 1350 (4:5), the result front page (spec 10, mock-ups 4 and 6).
// A blind card hides the crash and shows no dated headline; a practice card names it.

import {
  BEAT_ME, BOUGHT, CARD_GUESS, FOOTER_RESULT, LATE_EDITION, MASTHEAD, MYSTERY_LABEL, PERFECT_TIMING, SOLD, SOMEONE_WHO_DID_NOTHING, YOU,
  dailyLabel, dollars, leadLine, perfectLine, practiceFolio, practiceGo, shareAhead, shareAheadPractice, shareBehind, shareBehindPractice,
  SHARE_LEVEL, shareLevelPractice, survivedLine,
} from '../content/copy';
import type { Trade } from '../engine/types';
import { paperFor } from '../ui/paper';

export const CARD_W = 1080;
export const CARD_H = 1350;

export interface ResultCardModel {
  /** Verdict headline about the player, e.g. "Local investor sells three days before the bottom". */
  headline: string;
  verdictTitle: string;
  verdictLine: string;
  /** Final balances. */
  you: number;
  holder: number;
  perfect: number;
  /** you - holder. */
  lead: number;
  /** The line to chart: the run's prices (R42: never money); no dates are ever drawn. */
  series: number[];
  trades: Trade[];
  /** The page's own address, read by the caller at the time; never hard-coded here. */
  url: string;
  /** Daily crash number, when this was the daily run. */
  dailyNumber?: number;
  /** Double-or-nothing wins in a row; the card says so from 2. */
  streak?: number;
  /** Present on practice runs (rematch): the crash is named. Absent on blind runs. */
  practice?: { crashName: string; attempt: number };
}

export interface CardLines {
  masthead: string;
  folioLeft: string;
  folioRight: string;
  headline: string;
  verdictTitle: string;
  verdictLine: string;
  rows: [string, string][];
  lead: string;
  leadBehind: boolean;
  perfect: string;
  streak: string | null;
  beatMe: string;
  url: string;
  footer: string;
  /** The pre-filled share sentence (spec 10 and 6.11). */
  shareLine: string;
}

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

function ordinal(n: number): string {
  if (n >= 1 && n <= 10) return ORDINALS[n];
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function shareLine(m: ResultCardModel): string {
  const level = Math.round(m.lead) === 0;
  const ahead = m.lead > 0;
  if (m.practice) {
    const go = practiceGo(ordinal(Math.max(2, m.practice.attempt)), m.practice.crashName);
    return level ? shareLevelPractice(go) : ahead ? shareAheadPractice(m.lead, go) : shareBehindPractice(m.lead, go);
  }
  return level ? SHARE_LEVEL : ahead ? shareAhead(m.lead) : shareBehind(m.lead);
}

const DATED = /\b(1[89]\d\d|20\d\d)\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

/** A blind card never prints a dated headline: the verdict headline about the player, or the verdict title if it carries a date. */
function undatedHeadline(m: ResultCardModel): string {
  return DATED.test(m.headline) ? m.verdictTitle : m.headline;
}

/** Every string the card prints, in one pure place so it can be tested without a canvas. */
export function cardLines(m: ResultCardModel): CardLines {
  const practice = m.practice;
  const run = m.dailyNumber !== undefined ? dailyLabel(m.dailyNumber) : MYSTERY_LABEL;
  return {
    masthead: MASTHEAD,
    folioLeft: practice ? practiceFolio(practice.crashName) : run,
    folioRight: practice ? LATE_EDITION : CARD_GUESS,
    headline: practice ? m.headline : undatedHeadline(m),
    verdictTitle: m.verdictTitle,
    verdictLine: m.verdictLine,
    rows: [
      [YOU, dollars(m.you)],
      [SOMEONE_WHO_DID_NOTHING, dollars(m.holder)],
      [PERFECT_TIMING, dollars(m.perfect)],
    ],
    lead: leadLine(m.lead),
    leadBehind: Math.round(m.lead) < 0,
    perfect: perfectLine(m.perfect, m.you), // R49: lane D words it ("You finished with")
    streak: !practice && m.streak !== undefined && m.streak >= 2 ? survivedLine(m.streak) : null,
    beatMe: BEAT_ME,
    url: m.url,
    footer: FOOTER_RESULT,
    shareLine: shareLine(m),
  };
}

const SERIF = "'Newsreader', Georgia, serif";
const SANS = "'Libre Franklin', Arial, sans-serif";
const MX = 72;
const CW = CARD_W - MX * 2;

type Ctx = CanvasRenderingContext2D;

function setFont(ctx: Ctx, weight: number, px: number, family: string, tracking = 0): void {
  ctx.font = `${weight} ${px}px ${family}`;
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${tracking * px}px`;
  } catch {
    /* older canvases ignore it */
  }
}

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(t).width > maxW) {
      out.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

/** Narrows the measure while the line count holds, so the last line is not a single word. */
function balance(ctx: Ctx, text: string, n: number): string[] {
  let lo = 0;
  let hi = CW;
  let best = wrap(ctx, text, CW);
  if (n < 2) return best;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    const l = wrap(ctx, text, mid);
    if (l.length <= n && l.every((ln) => ctx.measureText(ln).width <= mid + 0.5)) {
      best = l;
      hi = mid;
    } else lo = mid;
  }
  return best;
}

/** Shrinks the size until the text fits `maxLines`. */
function fit(
  ctx: Ctx, text: string, weight: number, family: string,
  from: number, to: number, maxLines: number, tracking: number,
): { px: number; lines: string[] } {
  let px = from;
  for (;;) {
    setFont(ctx, weight, px, family, tracking);
    const lines = wrap(ctx, text, CW);
    if (lines.length <= maxLines || px <= to) return { px, lines: balance(ctx, text, lines.length) };
    px -= 4;
  }
}

function hair(ctx: Ctx, y: number, w: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(MX, y, CW, w);
}

interface Box { x0: number; y0: number; x1: number; y1: number }

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/** True when the segment passes through the box (Liang-Barsky clipping). */
function segHits(x1: number, y1: number, x2: number, y2: number, b: Box): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, x1 - b.x0], [dx, b.x1 - x1], [-dy, y1 - b.y0], [dy, b.y1 - y1]]) {
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

function crossesLine(b: Box, pl: [number, number][], pad: number): boolean {
  const e = { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
  for (let i = 1; i < pl.length; i++) if (segHits(pl[i - 1][0], pl[i - 1][1], pl[i][0], pl[i][1], e)) return true;
  return false;
}

/** Least vertical range, as a share of day 1's close, either side of it (as on the play chart). */
const MIN_RANGE = 0.02;
/** Trade dot radius on the card. */
const DOT_R = 15;
/** Label height (32px bold sans) and the paper kept around it. */
const LABEL_H = 28;
const LABEL_PAD = 4;

export interface CardChart {
  /** The price line, thinned, with every trade day kept so the dots sit on it. */
  line: [number, number][];
  startY: number;
  /** One dotted level per spell in cash: from the sale to the buy-back (or the end), at the sale close. */
  levels: [number, number][][];
  marks: { side: Trade['side']; cx: number; cy: number }[];
  /** "Sold" and "Bought": text left edge and baseline, and the box they keep clear. */
  labels: { text: string; tx: number; baseline: number; box: Box }[];
}

/**
 * The card chart's layout (R42): the market price only, one unbroken line, trade dots on it, a dotted
 * level at each sale close while in cash. "Sold" and "Bought" go only where they are clear of every line,
 * the dots, each other and the chart's edges; a word with no such spot is left out.
 */
export function cardChart(
  m: ResultCardModel, x: number, y: number, w: number, h: number, measure: (s: string) => number,
): CardChart {
  const s = m.series.map((v) => (Number.isFinite(v) ? v : NaN));
  const n = s.length;
  const base = s[0];
  let lo = base * (1 - MIN_RANGE);
  let hi = base * (1 + MIN_RANGE);
  for (const v of s) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const padT = Math.min(36, h * 0.2);
  const padB = Math.min(40, h * 0.22);
  const px = (i: number) => x + 20 + (i / Math.max(1, n - 1)) * (w - 40);
  const py = (v: number) => y + padT + (1 - (v - lo) / span) * (h - padT - padB);

  const inRun = (d: number) => Number.isInteger(d) && d >= 0 && d < n;
  const step = Math.max(1, Math.floor(n / 140));
  const days = new Set<number>([n - 1]);
  for (let i = 0; i < n; i += step) days.add(i);
  for (const t of m.trades) if (inRun(t.dayIndex)) days.add(t.dayIndex);
  const line = [...days].sort((a, b) => a - b).filter((i) => Number.isFinite(s[i])).map((i) => [px(i), py(s[i])] as [number, number]);

  const marks = m.trades.filter((t) => inRun(t.dayIndex)).map((t) => ({ side: t.side, cx: px(t.dayIndex), cy: py(s[t.dayIndex]) }));

  const levels: [number, number][][] = [];
  let sold: number | null = null;
  for (const t of [...m.trades].filter((t) => inRun(t.dayIndex)).sort((a, b) => a.dayIndex - b.dayIndex)) {
    if (t.side === 'sell' && sold === null) sold = t.dayIndex;
    else if (t.side === 'buy' && sold !== null) {
      levels.push([[px(sold), py(s[sold])], [px(t.dayIndex), py(s[sold])]]);
      sold = null;
    }
  }
  if (sold !== null) levels.push([[px(sold), py(s[sold])], [px(n - 1), py(s[sold])]]);

  const startY = py(base);
  const labels: CardChart['labels'] = [];
  // The first sale and the first buy-back after it, only when there are few trades.
  if (m.trades.length <= 2) {
    // Words keep clear of the price line; the faint dotted lines may run behind one (drawn on a paper-coloured edge).
    const lines = [line];
    const dots: Box[] = marks.map((k) => ({ x0: k.cx - DOT_R - 4, y0: k.cy - DOT_R - 4, x1: k.cx + DOT_R + 4, y1: k.cy + DOT_R + 4 }));
    const firstSell = marks.find((k) => k.side === 'sell');
    const sellDay = m.trades.find((t) => t.side === 'sell')?.dayIndex ?? Infinity;
    const firstBuy = marks.find((k, i) => k.side === 'buy' && m.trades.filter((t) => inRun(t.dayIndex))[i].dayIndex >= sellDay);
    for (const [k, word] of [[firstSell, SOLD], [firstBuy, BOUGHT]] as const) {
      if (!k) continue;
      const tw = measure(word);
      const spots: { tx: number; top: number }[] = [];
      for (const dy of [0, 22, 44]) {
        for (const below of [true, false]) {
          const top = below ? k.cy + DOT_R + 6 + dy : k.cy - DOT_R - 6 - LABEL_H - dy;
          spots.push({ tx: k.cx - tw / 2, top }, { tx: k.cx - DOT_R - 8 - tw, top }, { tx: k.cx + DOT_R + 8, top });
        }
      }
      for (const dy of [0, -16, 16]) {
        const top = k.cy - LABEL_H / 2 + dy;
        spots.push({ tx: k.cx - DOT_R - 10 - tw, top }, { tx: k.cx + DOT_R + 10, top });
      }
      // Near a side, the same spots pulled in to sit inside the chart.
      const lo = x + LABEL_PAD;
      const hi = x + w - LABEL_PAD - tw;
      for (const sp of spots.slice()) if (sp.tx < lo || sp.tx > hi) spots.push({ tx: Math.min(hi, Math.max(lo, sp.tx)), top: sp.top });
      const boxOf = (sp: { tx: number; top: number }): Box => ({
        x0: sp.tx - LABEL_PAD, y0: sp.top - LABEL_PAD, x1: sp.tx + tw + LABEL_PAD, y1: sp.top + LABEL_H + LABEL_PAD,
      });
      const spot = spots.find((sp) => {
        const b = boxOf(sp);
        return b.x0 >= x && b.x1 <= x + w && b.y0 >= y && b.y1 <= y + h &&
          !labels.some((l) => boxesOverlap(l.box, b)) && !dots.some((d) => boxesOverlap(d, b)) &&
          !lines.some((pl) => crossesLine(b, pl, 3));
      });
      if (!spot) continue;
      labels.push({ text: word, tx: spot.tx, baseline: spot.top + LABEL_H - 5, box: boxOf(spot) });
    }
  }
  return { line, startY, levels, marks, labels };
}

function drawChart(ctx: Ctx, m: ResultCardModel, x: number, y: number, w: number, h: number, ink: string, bg: string, faint: string): void {
  if (m.series.filter((n) => Number.isFinite(n)).length < 2) return;
  setFont(ctx, 700, 32, SANS);
  const c = cardChart(m, x, y, w, h, (t) => ctx.measureText(t).width);
  const stroke = (pl: [number, number][]) => {
    ctx.beginPath();
    pl.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  // dotted start line
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.setLineDash([3, 14]);
  stroke([[x, c.startY], [x + w, c.startY]]);
  // the sale close while in cash: faint, dotted
  ctx.strokeStyle = faint;
  ctx.lineWidth = 4;
  ctx.setLineDash([4, 12]);
  for (const lv of c.levels) stroke(lv);
  ctx.setLineDash([]);
  // the market price: one unbroken line
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  stroke(c.line);
  // trade marks: filled red dot = sold, hollow dot = bought
  for (const k of c.marks) {
    ctx.beginPath();
    ctx.arc(k.cx, k.cy, DOT_R, 0, Math.PI * 2);
    if (k.side === 'sell') {
      ctx.fillStyle = '#a3201a';
      ctx.fill();
    } else {
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
  }
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // a paper-coloured edge keeps a word clear where a dotted line runs behind it
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = bg;
  for (const l of c.labels) {
    ctx.strokeText(l.text, l.tx, l.baseline);
    ctx.fillText(l.text, l.tx, l.baseline);
  }
}

/** Draws the card on a 1080 x 1350 canvas. Fonts should already be loaded (see renderCard). Throws if there is no 2D context. */
export function drawCard(canvas: HTMLCanvasElement, m: ResultCardModel): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');
  const L = cardLines(m);
  const paper = paperFor({ lossFrac: m.lead < 0 ? 0.3 : 0, inCash: false, worstDay: false });
  const ink = paper.ink;
  const sec = paper.secondary;
  const red = paper.accent;

  ctx.fillStyle = paper.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Masthead
  let y = 56;
  hair(ctx, y, 11, ink);
  setFont(ctx, 700, 72, SERIF, -0.02);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.fillText(L.masthead, CARD_W / 2, y + 11 + 18 + 58);
  ctx.textAlign = 'left';
  y += 11 + 18 + 58 + 12;
  hair(ctx, y, 3, ink);

  // Folio
  setFont(ctx, 500, 32, SANS);
  ctx.fillStyle = sec;
  const fy = y + 3 + 20 + 26;
  ctx.fillText(L.folioLeft, MX, fy);
  ctx.textAlign = 'right';
  ctx.fillText(L.folioRight, MX + CW, fy);
  ctx.textAlign = 'left';
  y = fy + 16;
  hair(ctx, y, 3, ink);

  // Foot position and the room between the folio and the foot
  const footTop = CARD_H - 56 - 26 - 28 - 76;
  const CHART_MAX = 200;
  const CHART_MIN = 120;
  const vpx = 36;
  setFont(ctx, 700, vpx, SERIF);
  const tw = ctx.measureText(L.verdictTitle + '. ').width;
  setFont(ctx, 500, vpx, SERIF);
  const verdictWrapped = wrap(ctx, L.verdictLine, CW - tw).length > 1;
  const verdictH = vpx + (verdictWrapped ? 92 : 0) + 28;
  const ldPx = fit(ctx, L.lead, 700, SERIF, 60, 44, 1, -0.02).px;
  const tailH = 14 + ldPx + 8 + 28 + (L.streak ? 46 : 0);
  const tableH = 3 * 64 + 8;
  const chartExtra = 3 + 12 + 12 + 3;
  let hd = fit(ctx, L.headline, 700, SERIF, 92, 48, 3, -0.02);
  const room = (px: number, lines: number) =>
    footTop - 16 - (y + 3 + 36 + lines * Math.round(px * 0.98) + 16 + verdictH + chartExtra + tableH + tailH);
  while (room(hd.px, hd.lines.length) < CHART_MIN && hd.px > 48) {
    hd = fit(ctx, L.headline, 700, SERIF, hd.px - 4, 48, 3, -0.02);
  }
  const chartH = Math.max(CHART_MIN, Math.min(CHART_MAX, room(hd.px, hd.lines.length)));

  // Headline
  y += 3 + 36;
  setFont(ctx, 700, hd.px, SERIF, -0.02);
  ctx.fillStyle = ink;
  const hlh = Math.round(hd.px * 0.98);
  hd.lines.forEach((ln, i) => ctx.fillText(ln, MX, y + hd.px * 0.8 + i * hlh));
  y += hd.lines.length * hlh + 16;

  // Verdict title in bold, then the plain line
  setFont(ctx, 700, vpx, SERIF);
  ctx.fillStyle = m.lead < 0 ? red : ink;
  ctx.fillText(L.verdictTitle + '.', MX, y + vpx);
  setFont(ctx, 500, vpx, SERIF);
  ctx.fillStyle = sec;
  let ly = y + vpx;
  if (!verdictWrapped) {
    ctx.fillText(L.verdictLine, MX + tw, ly);
  } else {
    for (const ln of wrap(ctx, L.verdictLine, CW).slice(0, 2)) {
      ly += 46;
      ctx.fillText(ln, MX, ly);
    }
  }
  y = ly + 28;

  // Chart between two hairlines
  hair(ctx, y, 3, ink);
  drawChart(ctx, m, MX, y + 3 + 12, CW, chartH, ink, paper.bg, sec);
  y += 3 + 12 + chartH + 12;
  hair(ctx, y, 3, ink);
  y += 3 + 8;

  // Table
  const rowH = 64;
  L.rows.forEach(([a, b], i) => {
    setFont(ctx, i === 0 ? 700 : 500, 36, SANS);
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.fillText(a, MX, y + 44);
    ctx.textAlign = 'right';
    ctx.fillText(b, MX + CW, y + 44);
    ctx.textAlign = 'left';
    y += rowH;
    hair(ctx, y - 2, i === 2 ? 3 : 2, i === 2 ? ink : 'rgba(28,26,23,0.25)');
  });

  // Lead line, the perfect-timing line, the streak line
  y += 14;
  const ld = fit(ctx, L.lead, 700, SERIF, 60, 44, 1, -0.02);
  setFont(ctx, 700, ld.px, SERIF, -0.02);
  ctx.fillStyle = L.leadBehind ? red : ink;
  ctx.fillText(ld.lines[0], MX, y + ld.px * 0.85);
  y += ld.px + 8;
  setFont(ctx, 500, 30, SANS);
  ctx.fillStyle = sec;
  ctx.fillText(L.perfect, MX, y + 28);
  y += 28;
  if (L.streak) {
    setFont(ctx, 700, 34, SANS);
    ctx.fillStyle = ink;
    ctx.fillText(L.streak, MX, y + 16 + 30);
  }

  // Foot: "Beat me" and the page's own address, then the footer
  hair(ctx, footTop, 11, ink);
  const by = footTop + 11 + 14 + 48;
  setFont(ctx, 700, 60, SERIF, -0.02);
  ctx.fillStyle = ink;
  ctx.fillText(L.beatMe, MX, by);
  const beatW = ctx.measureText(L.beatMe).width;
  setFont(ctx, 700, 36, SANS);
  let upx = 36;
  while (upx > 20 && ctx.measureText(L.url).width > CW - beatW - 32) {
    upx -= 2;
    setFont(ctx, 700, upx, SANS);
  }
  ctx.textAlign = 'right';
  ctx.fillText(L.url, MX + CW, by);
  ctx.textAlign = 'left';
  setFont(ctx, 500, 28, SANS);
  ctx.fillStyle = sec;
  ctx.fillText(L.footer, MX, CARD_H - 56);
}

async function loadFonts(): Promise<void> {
  try {
    const f = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!f) return;
    await Promise.all([
      f.load(`700 80px 'Newsreader'`),
      f.load(`500 40px 'Newsreader'`),
      f.load(`500 32px 'Libre Franklin'`),
      f.load(`700 32px 'Libre Franklin'`),
    ]).catch(() => undefined);
    await f.ready;
  } catch {
    /* draw with fallback fonts */
  }
}

/** Waits for the self-hosted fonts, draws the card and returns it as a PNG. */
export async function renderCard(m: ResultCardModel): Promise<Blob> {
  await loadFonts();
  const canvas = document.createElement('canvas');
  drawCard(canvas, m);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Card could not be drawn'))), 'image/png');
  });
}

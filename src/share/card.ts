// The shareable result card: 1080 x 1350 (4:5), the result front page (spec 10, mock-ups 4 and 6).
// A blind card hides the crash and shows no dated headline; a practice card names it.

import { CARD_GUESS, FOOTER_RESULT, MASTHEAD, dollars, leadLine, perfectLine } from '../content/copy';
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
  /** The line to chart (the run's prices); no dates are ever drawn. */
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
  const ahead = m.lead >= 0;
  if (m.practice) {
    const go = `on my ${ordinal(Math.max(2, m.practice.attempt))} go at ${m.practice.crashName}`;
    return ahead
      ? `I beat the market by ${dollars(m.lead)} ${go}. Beat me.`
      : `I finished ${dollars(m.lead)} behind someone who did nothing ${go}. Beat me.`;
  }
  return ahead
    ? `I beat the market by ${dollars(m.lead)} in a crash I could not see coming. Beat me.`
    : `I finished ${dollars(m.lead)} behind someone who did nothing. Beat me.`;
}

const DATED = /\b(1[89]\d\d|20\d\d)\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

/** A blind card never prints a dated headline: the verdict headline about the player, or the verdict title if it carries a date. */
function undatedHeadline(m: ResultCardModel): string {
  return DATED.test(m.headline) ? m.verdictTitle : m.headline;
}

/** Every string the card prints, in one pure place so it can be tested without a canvas. */
export function cardLines(m: ResultCardModel): CardLines {
  const practice = m.practice;
  const run = m.dailyNumber !== undefined ? `Daily crash ${m.dailyNumber}` : 'Mystery crash';
  return {
    masthead: MASTHEAD,
    folioLeft: practice ? `Rematch, ${practice.crashName}` : run,
    folioRight: practice ? 'Late edition' : CARD_GUESS,
    headline: practice ? m.headline : undatedHeadline(m),
    verdictTitle: m.verdictTitle,
    verdictLine: m.verdictLine,
    rows: [
      ['You', dollars(m.you)],
      ['Someone who did nothing', dollars(m.holder)],
      ['Perfect timing', dollars(m.perfect)],
    ],
    lead: leadLine(m.lead),
    leadBehind: m.lead < 0,
    perfect: perfectLine(m.perfect, m.you),
    streak: !practice && m.streak !== undefined && m.streak >= 2 ? `Survived ${m.streak} crashes in a row` : null,
    beatMe: 'Beat me',
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

function boxHits(b: Box, pts: [number, number][]): number {
  let n = 0;
  for (const [x, y] of pts) if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) n++;
  return n;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function drawChart(ctx: Ctx, m: ResultCardModel, x: number, y: number, w: number, h: number, ink: string, bg: string): void {
  const s = m.series.filter((n) => Number.isFinite(n));
  if (s.length < 2) return;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of s) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const padT = Math.min(36, h * 0.2);
  const padB = Math.min(40, h * 0.22);
  const px = (i: number) => x + 20 + (i / (s.length - 1)) * (w - 40);
  const py = (v: number) => y + padT + (1 - (v - lo) / span) * (h - padT - padB);
  // dotted start line
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.setLineDash([3, 14]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, py(s[0]));
  ctx.lineTo(x + w, py(s[0]));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const step = Math.max(1, Math.floor(s.length / 140));
  const pts: [number, number][] = [];
  for (let i = 0; i < s.length; i += step) {
    pts.push([px(i), py(s[i])]);
    if (i) ctx.lineTo(px(i), py(s[i]));
    else ctx.moveTo(px(i), py(s[i]));
  }
  ctx.lineTo(px(s.length - 1), py(s[s.length - 1]));
  ctx.stroke();
  // densify the sample so label placement sees the whole line
  const dense: [number, number][] = [];
  for (let k = 1; k < pts.length; k++) {
    for (let t = 0; t < 1; t += 0.25) {
      dense.push([pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t]);
    }
  }
  // trade marks: filled red dot = sold, hollow dot = bought
  const marks = m.trades.map((t) => {
    const i = Math.min(s.length - 1, Math.max(0, t.dayIndex));
    return { side: t.side, cx: px(i), cy: py(s[i]) };
  });
  const R = 15;
  const dotBoxes: Box[] = marks.map((k) => ({ x0: k.cx - R - 4, y0: k.cy - R - 4, x1: k.cx + R + 4, y1: k.cy + R + 4 }));
  for (const k of marks) {
    ctx.beginPath();
    ctx.arc(k.cx, k.cy, R, 0, Math.PI * 2);
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
  // Labels: the first sale and the first buy-back, only when there are few trades.
  if (m.trades.length > 2) return;
  const placed: Box[] = [];
  setFont(ctx, 700, 32, SANS);
  for (const side of ['sell', 'buy'] as const) {
    const idx = marks.findIndex((k) => k.side === side);
    if (idx < 0) continue;
    const k = marks[idx];
    const word = side === 'sell' ? 'Sold' : 'Bought';
    const tw = ctx.measureText(word).width;
    const th = 28;
    let best: { box: Box; score: number } | null = null;
    for (const below of [true, false]) {
      for (const align of [0, -1, 1]) {
        const cx0 = align === 0 ? k.cx - tw / 2 : align < 0 ? k.cx - R - 8 - tw : k.cx + R + 8;
        const x0 = Math.min(x + w - tw, Math.max(x, cx0));
        const y0 = below ? k.cy + R + 6 : k.cy - R - 6 - th;
        const box: Box = { x0: x0 - 4, y0: y0 - 4, x1: x0 + tw + 4, y1: y0 + th + 4 };
        let score = boxHits(box, dense) * 10 + (below ? 0 : 1) + Math.abs(align) * 0.5;
        if (box.y0 < y + 2 || box.y1 > y + h - 2) score += 500;
        for (const o of [...placed, ...dotBoxes]) if (boxesOverlap(box, o)) score += 1000;
        if (!best || score < best.score) best = { box, score };
      }
    }
    if (!best) continue;
    placed.push(best.box);
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // a thin paper-coloured edge keeps the word legible where the line passes behind it
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = bg;
    ctx.strokeText(word, best.box.x0 + 4, best.box.y1 - 4 - 5);
    ctx.fillText(word, best.box.x0 + 4, best.box.y1 - 4 - 5);
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
  drawChart(ctx, m, MX, y + 3 + 12, CW, chartH, ink, paper.bg);
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

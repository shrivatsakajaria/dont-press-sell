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

/** Every string the card prints, in one pure place so it can be tested without a canvas. */
export function cardLines(m: ResultCardModel): CardLines {
  const practice = m.practice;
  const run = m.dailyNumber !== undefined ? `Daily crash ${m.dailyNumber}` : 'Mystery crash';
  return {
    masthead: MASTHEAD,
    folioLeft: practice ? `Rematch, ${practice.crashName}` : run,
    folioRight: practice ? 'Late edition' : CARD_GUESS,
    headline: m.headline,
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
    streak: m.streak !== undefined && m.streak >= 2 ? `Survived ${m.streak} crashes in a row` : null,
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
  const padT = 36;
  const padB = 40;
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
  for (let i = 0; i < s.length; i += step) (i ? ctx.lineTo(px(i), py(s[i])) : ctx.moveTo(px(i), py(s[i])));
  ctx.lineTo(px(s.length - 1), py(s[s.length - 1]));
  ctx.stroke();
  // trade marks: filled red dot = sold, hollow dot = bought
  const label = m.trades.length <= 2;
  let labelledSell = false;
  let labelledBuy = false;
  for (const t of m.trades) {
    const i = Math.min(s.length - 1, Math.max(0, t.dayIndex));
    const cx = px(i);
    const cy = py(s[i]);
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    if (t.side === 'sell') {
      ctx.fillStyle = '#a3201a';
      ctx.fill();
    } else {
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
    const done = t.side === 'sell' ? labelledSell : labelledBuy;
    if (label && !done) {
      if (t.side === 'sell') labelledSell = true;
      else labelledBuy = true;
      setFont(ctx, 700, 32, SANS);
      ctx.fillStyle = ink;
      const word = t.side === 'sell' ? 'Sold' : 'Bought';
      const tw = ctx.measureText(word).width;
      const above = cy > y + h / 2;
      const ty = above ? cy - 30 : cy + 58;
      const tx = Math.min(x + w - tw, Math.max(x, cx - tw / 2));
      ctx.textAlign = 'left';
      // a thin paper-coloured edge keeps the word legible where the line passes behind it
      ctx.lineJoin = 'round';
      ctx.lineWidth = 9;
      ctx.strokeStyle = bg;
      ctx.strokeText(word, tx, ty);
      ctx.fillText(word, tx, ty);
    }
  }
}

/** Draws the card on a 1080 x 1350 canvas. Fonts should already be loaded (see renderCard). */
export function drawCard(canvas: HTMLCanvasElement, m: ResultCardModel): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
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

  // Headline
  y += 3 + 36;
  const hd = fit(ctx, L.headline, 700, SERIF, 92, 68, 3, -0.02);
  setFont(ctx, 700, hd.px, SERIF, -0.02);
  ctx.fillStyle = ink;
  const hlh = Math.round(hd.px * 0.98);
  hd.lines.forEach((ln, i) => ctx.fillText(ln, MX, y + hd.px * 0.8 + i * hlh));
  y += hd.lines.length * hlh + 16;

  // Verdict title in bold, then the plain line
  const vpx = 36;
  setFont(ctx, 700, vpx, SERIF);
  const title = L.verdictTitle + '.';
  const tw = ctx.measureText(title + ' ').width;
  ctx.fillStyle = m.lead < 0 ? red : ink;
  ctx.fillText(title, MX, y + vpx);
  setFont(ctx, 500, vpx, SERIF);
  ctx.fillStyle = sec;
  const beside = wrap(ctx, L.verdictLine, CW - tw);
  let ly = y + vpx;
  if (beside.length <= 1) {
    ctx.fillText(beside[0] ?? '', MX + tw, ly);
  } else {
    for (const ln of wrap(ctx, L.verdictLine, CW).slice(0, 2)) {
      ly += 46;
      ctx.fillText(ln, MX, ly);
    }
  }
  y = ly + 28;

  // Chart between two hairlines
  const chartH = 200;
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
  const footTop = CARD_H - 56 - 26 - 28 - 76;
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

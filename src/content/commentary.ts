// The line under each day's headline, worked out from the prices (spec 8.5).
// Every template is guarded by a condition computed from the pre-run closes
// and closes[0..dayIndex], so no line can state something the data does not
// support. Future days are never read. House rules: no digit-years, no emoji,
// no exclamation marks, British spelling, no advice.

import { dollars } from './copy';

export interface CommentaryCtx {
  /** Every trading day of the run, day 1 first. Never one close per screen step. */
  closes: number[];
  dayIndex: number;
  /** The player held through today's move (in the market at yesterday's close). */
  invested: boolean;
  /** The player has made no sale so far in this run. */
  neverSold: boolean;
  balance: number;
  start: number;
  sombre: boolean;
  rng: () => number;
  /** The market's reference high before the run (the run starts about 7% below it). */
  high: number;
  /** Closes of the 30 trading days before day 1, oldest first, ending the day before closes[0]. */
  preCloses: number[];
  /** The line shown the day before. The function is pure, so the caller passes it to avoid a repeat. */
  previous?: string;
}

/** Facts about the run so far, from preCloses and closes up to and including dayIndex. */
interface State {
  /** Today's move in percent; null when there is no earlier close at all. */
  chg: number | null;
  /** Consecutive falling / rising closes ending today, and ending yesterday. */
  dn: number;
  up: number;
  prevDn: number;
  prevUp: number;
  /** A falling streak that reaches the start of the data may be longer than counted. */
  dnCut: boolean;
  prevDnCut: boolean;
  /** Percent below max(high, highest close so far). */
  dd: number;
  /** Percent above the lowest close so far in the run. */
  fromLow: number;
  /** Percent below the first close of the run (0 when at or above it). */
  belowFirst: number;
  /** Today's close is above the reference high. */
  aboveHigh: boolean;
  /** Yesterday's close was below the highest level seen up to then. */
  yesterdayBelowPeak: boolean;
  newLow: boolean;
  /** Today is the best (worst) day in the whole window: this many weeks at least. */
  bestWeeks: number;
  worstWeeks: number;
  /** Rose yesterday, then fell today to a close below every earlier close in the run. */
  dippedAgain: boolean;
  /** The last five changes were each smaller than half a percent. */
  quiet: boolean;
  /** Change over the last five trading days in percent, or null. */
  week: number | null;
  invested: boolean;
  neverSold: boolean;
  /** Percent of the starting amount lost, or gained; 0 when the other way. */
  loss: number;
  gain: number;
  balance: number;
  start: number;
  /** True when the balance and start differ as whole dollars. */
  moneyDiffers: boolean;
}

const pct = (x: number) => Math.round(x);

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const word = (n: number) => (n < WORDS.length ? WORDS[n] : String(n));

function compute(ctx: CommentaryCtx): State {
  const i = ctx.dayIndex;
  if (!Number.isInteger(i) || i < 0 || i >= ctx.closes.length) {
    throw new RangeError(`commentaryFor: dayIndex ${i} is outside closes (length ${ctx.closes.length})`);
  }
  const series = [...ctx.preCloses, ...ctx.closes.slice(0, i + 1)];
  const idx = series.length - 1;
  const c = series[idx];

  // ch[k - 1] is the move into series[k], in percent.
  const ch: number[] = [];
  for (let k = 1; k <= idx; k++) ch.push((series[k] / series[k - 1] - 1) * 100);
  const chg = idx >= 1 ? ch[idx - 1] : null;

  const streak = (end: number, dir: 1 | -1): number => {
    let n = 0;
    for (let k = end; k >= 1; k--) {
      if ((series[k] - series[k - 1]) * dir > 0) n++;
      else break;
    }
    return n;
  };

  const runCloses = ctx.closes.slice(0, i + 1);
  let peak = ctx.high;
  for (const x of series) peak = Math.max(peak, x);
  let peakBefore = ctx.high;
  for (let k = 0; k < idx; k++) peakBefore = Math.max(peakBefore, series[k]);
  const low = Math.min(...runCloses);
  const priorRunLow = i >= 1 ? Math.min(...ctx.closes.slice(0, i)) : Infinity;

  const earlier = ch.slice(0, -1);
  const maxEarlier = earlier.length ? Math.max(...earlier) : -Infinity;
  const minEarlier = earlier.length ? Math.min(...earlier) : Infinity;
  const weeks = Math.floor(idx / 5);

  const first = ctx.closes[0];
  const ratio = ctx.start > 0 ? ctx.balance / ctx.start : 1;
  const prevDn = idx >= 1 ? streak(idx - 1, -1) : 0;
  const dn = streak(idx, -1);

  return {
    chg,
    dn,
    up: streak(idx, 1),
    prevDn,
    prevUp: idx >= 1 ? streak(idx - 1, 1) : 0,
    dnCut: dn === idx,
    prevDnCut: prevDn === idx - 1,
    dd: ((peak - c) / peak) * 100,
    fromLow: ((c - low) / low) * 100,
    belowFirst: c < first ? ((first - c) / first) * 100 : 0,
    aboveHigh: c > ctx.high,
    yesterdayBelowPeak: idx >= 1 && series[idx - 1] < peakBefore,
    newLow: i >= 1 && c < priorRunLow,
    bestWeeks: chg !== null && weeks >= 2 && chg >= 1 && chg > maxEarlier ? weeks : 0,
    worstWeeks: chg !== null && weeks >= 2 && chg <= -1 && chg < minEarlier ? weeks : 0,
    dippedAgain:
      i >= 1 && chg !== null && chg < 0 && idx >= 2 && ch[idx - 2] > 0 && c < priorRunLow,
    quiet: idx >= 5 && ch.slice(-5).every((x) => Math.abs(x) < 0.5),
    week: idx >= 5 ? (c / series[idx - 5] - 1) * 100 : null,
    invested: ctx.invested,
    neverSold: ctx.neverSold,
    loss: ratio < 1 ? (1 - ratio) * 100 : 0,
    gain: ratio > 1 ? (ratio - 1) * 100 : 0,
    balance: ctx.balance,
    start: ctx.start,
    moneyDiffers: Math.round(ctx.balance) !== Math.round(ctx.start),
  };
}

interface Template {
  when: (s: State) => boolean;
  text: (s: State) => string;
  /** Pick weight among eligible lines (default 1). */
  w?: number | ((s: State) => number);
  /** If any eligible, pick only among these. Used where the line must be said. */
  must?: boolean;
}

const up = (s: State) => s.chg !== null && s.chg > 0;
const down = (s: State) => s.chg !== null && s.chg < 0;
const chgAbs = (s: State) => Math.abs(s.chg ?? 0);
const money = (s: State) => s.balance >= 0 && s.start > 0;

const TEMPLATES: Template[] = [
  // Falling streaks (counted back through the pre-run closes; never cut off by the data start)
  { w: 4, when: (s) => s.dn >= 3 && !s.dnCut, text: (s) => `Prices down ${word(s.dn)} days in a row. This is fine.` },
  { w: 4, when: (s) => s.dn >= 3 && !s.dnCut, text: (s) => `Prices down ${word(s.dn)} days in a row. The chart has made its point.` },
  { w: 3, when: (s) => s.dn >= 5 && !s.dnCut, text: (s) => `Prices down ${word(s.dn)} days in a row. Gravity is working as intended.` },
  { w: 3, when: (s) => s.dn >= 2 && !s.dnCut, text: (s) => `Prices down ${word(s.dn)} days in a row. A habit is forming.` },

  // Rising streaks and bounces
  { w: 3, when: (s) => s.up >= 3, text: (s) => `Prices up ${word(s.up)} days in a row. The mood is improving.` },
  { w: 3, when: (s) => s.up >= 3, text: (s) => `Prices up ${word(s.up)} days in a row. Everyone is waiting for the catch.` },
  {
    w: 2,
    when: (s) => up(s) && s.prevDn >= 3 && !s.prevDnCut,
    text: (s) => `A bounce after ${word(s.prevDn)} falling days. It may not mean anything.`,
  },
  { when: (s) => up(s) && s.prevDn >= 1, text: () => 'An up day, after a down one. Nobody is celebrating yet.' },
  { when: (s) => up(s) && s.prevDn >= 2, text: () => 'A rise at last. Nobody trusts it yet.' },
  { when: (s) => up(s) && s.prevUp >= 1, text: () => 'Up again. Noted, cautiously.' },
  { when: (s) => down(s) && s.prevUp >= 1, text: () => 'Down today. Yesterday was kinder.' },
  { when: (s) => down(s) && s.prevDn >= 1, text: () => 'Another down day. The ledger records it without comment.' },
  { w: 2, when: (s) => s.dippedAgain, text: () => 'A rally, then a fall to a new low. The dip kept dipping.' },

  // Big single days (whole-number percentages are rounded, as people read them)
  { when: (s) => s.chg !== null && s.chg <= -3, text: (s) => `A fall of ${pct(chgAbs(s))}% in one day. Not a quiet one.` },
  { when: (s) => s.chg !== null && s.chg <= -5, text: (s) => `Down ${pct(chgAbs(s))}% in one day. That is not a rounding error.` },
  { when: (s) => s.chg !== null && s.chg >= 3, text: (s) => `Up ${pct(chgAbs(s))}% in a day. The market has not made up its mind.` },
  { when: (s) => s.chg !== null && s.chg >= 5 && s.prevDn >= 1, text: (s) => `Up ${pct(chgAbs(s))}% in a day. Whiplash.` },
  { when: (s) => s.chg !== null && Math.abs(s.chg) < 0.25 && s.dd >= 3, text: () => 'Barely moved. A pause, after all that.' },
  { when: (s) => s.quiet && s.dd >= 3, text: () => 'Five quiet days in a row. Suspicious.' },
  { when: (s) => s.week !== null && s.week <= -5, text: (s) => `Prices are down ${pct(-(s.week as number))}% in a week.` },
  { when: (s) => s.week !== null && s.week >= 5, text: (s) => `Prices are up ${pct(s.week as number)}% in a week.` },

  // Distance from the peak (the higher of the reference high and the run's highest close)
  {
    w: (s) => (s.dd >= 40 ? 3 : 1),
    when: (s) => pct(s.dd) >= 10,
    text: (s) =>
      `Down ${pct(s.dd)}% from the peak.` +
      (s.invested && s.neverSold ? ' Still holding?' : !s.invested ? " You sat out today's move." : ''),
  },
  { when: (s) => s.dd >= 10 && s.dd < 20, text: (s) => `Down ${pct(s.dd)}% from the peak. The polite word for this is a correction.` },
  { when: (s) => s.dd >= 20, text: (s) => `Down ${pct(s.dd)}% from the peak. Officially a bear market.` },
  { w: 2, when: (s) => s.dd >= 100 / 3, text: () => 'A third gone from the peak. Nobody is calling this a wobble.' },
  { w: 2, when: (s) => s.dd >= 50, text: () => 'Down by half from the peak. Half of it is still there.' },
  { when: (s) => s.belowFirst >= 5, text: (s) => `Down ${pct(s.belowFirst)}% since day one. The paper is keeping count.` },
  { when: (s) => s.dd > 0 && s.dd <= 3 && s.fromLow >= 5, text: () => 'Back within three percent of the peak.' },
  { when: (s) => s.aboveHigh && s.fromLow >= 5, text: () => 'Above the old peak again. Memories are short.' },

  // Lows, worst and best days
  { w: 2, when: (s) => s.newLow, text: () => 'A fresh low. Nobody is cheering.' },
  { w: 2, when: (s) => s.newLow, text: () => 'Lower than anything so far.' },
  {
    w: 3,
    when: (s) => s.worstWeeks > 0,
    text: (s) => `The worst day in at least ${word(s.worstWeeks)} weeks. Earlier days now look polite.`,
  },
  {
    must: true,
    when: (s) => s.bestWeeks > 0 && !s.invested,
    text: (s) => `The best day in at least ${word(s.bestWeeks)} weeks, and you watched it from the sidelines.`,
  },
  {
    w: 3,
    when: (s) => s.bestWeeks > 0 && s.invested,
    text: (s) => `The best day in at least ${word(s.bestWeeks)} weeks, and you were there for it.`,
  },

  // Recovery from the low so far
  { when: (s) => s.fromLow >= 10 && s.dd > 0, text: (s) => `Up ${pct(s.fromLow)}% from the lowest point so far.` },
  {
    when: (s) => s.fromLow >= 10 && s.dd >= 10,
    text: (s) => `Up ${pct(s.fromLow)}% off the low, and still ${pct(s.dd)}% below the peak.`,
  },

  // Your money (against where you started; no claims about the holder)
  { when: (s) => money(s) && s.loss >= 10, text: (s) => `Down ${pct(s.loss)}% on your money.` },
  { when: (s) => money(s) && s.gain >= 10, text: (s) => `Up ${pct(s.gain)}% on your money. For now.` },
  {
    when: (s) => money(s) && s.moneyDiffers && s.balance < s.start,
    text: (s) => `Your ${dollars(s.start)} is now ${dollars(s.balance)}. Check the sums if you like.`,
  },
  {
    when: (s) => money(s) && s.moneyDiffers && s.balance > s.start,
    text: (s) => `Your ${dollars(s.start)} is now ${dollars(s.balance)}. No fuss.`,
  },
  {
    when: (s) => money(s) && s.invested && s.neverSold && s.moneyDiffers && s.balance < s.start,
    text: () => 'Holding, and below where you started.',
  },
  {
    when: (s) => money(s) && s.invested && s.neverSold && s.moneyDiffers && s.balance > s.start,
    text: () => 'Holding, and above where you started.',
  },
  {
    when: (s) => s.invested && s.neverSold && s.dd >= 20,
    text: (s) => `You have held through a fall of ${pct(s.dd)}% so far.`,
  },

  // In the market, or not, for today's move
  { when: (s) => s.invested && up(s), text: () => 'An up day, and you were in the market for it.' },
  { when: (s) => s.invested && down(s), text: () => 'A down day, and you were in the market for it.' },
  { when: (s) => !s.invested, text: () => "You sat out today's move." },
  { when: (s) => !s.invested, text: () => "Today's move happened without you." },
  { when: (s) => !s.invested && s.belowFirst > 0, text: () => 'Out for today, with prices below where this all began.' },
  { when: (s) => !s.invested && down(s), text: () => 'Prices fell and you were out of it. A calm day, for cash.' },
  { when: (s) => !s.invested && up(s), text: () => 'Prices rose and you missed it. Cash did not rise.' },

  // Always true
  { when: () => true, text: () => 'Another day on the markets.' },
  { when: () => true, text: () => 'Prices move. Opinions move faster.' },
  { when: () => true, text: () => 'The market has made no promises.' },
  { when: () => true, text: () => 'Somewhere, a chart is being refreshed.' },
  { when: () => true, text: () => 'Everyone has a view. Prices have the final say.' },
  { when: () => true, text: () => 'The chart does not care how you feel.' },
];

/**
 * Plain lines for sombre days and the day after (headlines about deaths,
 * attacks or disasters). No jokes, no slang. Each is guarded so it is true.
 */
interface NeutralLine {
  text: string;
  when: (s: State) => boolean;
}

const NEUTRAL: NeutralLine[] = [
  { text: 'Markets fall again.', when: (s) => down(s) && s.prevDn >= 1 },
  { text: 'Another day of losses.', when: (s) => down(s) && s.prevDn >= 1 },
  { text: 'Prices fall.', when: (s) => down(s) },
  { text: 'The market closes lower.', when: (s) => down(s) },
  { text: 'Markets close higher.', when: (s) => up(s) },
  { text: 'Prices rise.', when: (s) => up(s) },
  { text: 'Markets recover some ground.', when: (s) => up(s) && s.yesterdayBelowPeak },
  { text: 'Prices are below where they were.', when: (s) => s.dd >= 5 },
  { text: 'Trading continues.', when: () => true },
  { text: 'Markets remain open.', when: () => true },
];

/** The fixed neutral set, exported for tests. */
export const NEUTRAL_LINES: string[] = NEUTRAL.map((n) => n.text);

function pick(candidates: { text: string; w: number }[], rng: () => number): string {
  const total = candidates.reduce((a, c) => a + c.w, 0);
  let r = rng() * total;
  for (const c of candidates) {
    r -= c.w;
    if (r < 0) return c.text;
  }
  return candidates[candidates.length - 1].text;
}

export function commentaryFor(ctx: CommentaryCtx): string {
  const s = compute(ctx);

  if (ctx.sombre) {
    const all = NEUTRAL.filter((n) => n.when(s)).map((n) => ({ text: n.text, w: 1 }));
    const fresh = all.filter((c) => c.text !== ctx.previous);
    return pick(fresh.length ? fresh : all, ctx.rng);
  }

  const eligible = TEMPLATES.filter((t) => t.when(s));
  const musts = eligible.filter((t) => t.must).map((t) => ({ text: t.text(s), w: 1 }));
  const mustFresh = musts.filter((c) => c.text !== ctx.previous);
  if (mustFresh.length) return pick(mustFresh, ctx.rng);

  const weight = (t: Template) => (typeof t.w === 'function' ? t.w(s) : t.w ?? 1);
  const all = eligible.map((t) => ({ text: t.text(s), w: weight(t) }));
  const fresh = all.filter((c) => c.text !== ctx.previous);
  return pick(fresh.length ? fresh : all, ctx.rng);
}


// The line under each day's headline, worked out from the prices (spec 8.5, ruling R37).
// A line stays up for several steps, so each one is chosen for a window of days: a "state" line
// must be true on every day of the window, an "event" line is about the day it goes up and is
// worded so it stays true for a few days after. Every template is guarded by a condition computed
// from the pre-run closes and closes up to the day in question. House rules: no digit-years, no
// emoji, no exclamation marks, British spelling, no advice, no filler.

import { dollars } from './copy';

export type Dir = 'up' | 'down' | null;

/** Facts about the market up to and including one day (no player facts). */
export interface MarketState {
  day: number;
  /** Today's move in percent; null when there is no earlier close at all. */
  chg: number | null;
  /** Yesterday's move in percent, or null. */
  prevChg: number | null;
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
  aboveHigh: boolean;
  /** Yesterday's close was below the highest level seen up to then. */
  yesterdayBelowPeak: boolean;
  newLow: boolean;
  /** Today is the best (worst) day in the whole window: this many weeks at least. */
  bestWeeks: number;
  worstWeeks: number;
  /** Rose a percent or more yesterday, then fell today to a close below every earlier close in the run. */
  dippedAgain: boolean;
  /** The last five changes were each smaller than half a percent. */
  quiet: boolean;
  /** Change over the last five trading days in percent, or null. */
  week: number | null;
  /** Deepest fall from the peak seen so far, in percent. */
  maxDd: number;
  /** The fall from the run's highest close so far (an investor from day one). */
  runFall: number;
  /** Today's close is above the run's first close. */
  aboveFirst: boolean;
  /** Falling and rising days among the last ten (counting through the pre-run closes). */
  downOfTen: number;
  upOfTen: number;
  /** The last five days include a rise and a fall of a percent or more. */
  swings: boolean;
  /** Every close of the run so far is below the reference high. */
  allBelowHigh: boolean;
  /** Trading days since the run's lowest close so far (0 when today is it). */
  lowAge: number;
  /**
   * Trading days without a new high: since the last close at or above both the reference high and every
   * earlier close in the run (0 when today is one); day + 1 when no close in the run has been one.
   */
  highAge: number;
}

/** A day's market facts plus the player's position on it. */
export interface State extends MarketState {
  /** Held shares through today's move (not on day one). */
  invested: boolean;
  /** Not in the market through today's move (not on day one). */
  out: boolean;
  neverSold: boolean;
  loss: number;
  gain: number;
  balance: number;
  start: number;
  moneyDiffers: boolean;
}

const pct = (x: number) => Math.round(x);
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const word = (n: number) => (n < WORDS.length ? WORDS[n] : String(n));

/** The market facts for day i. */
export function marketState(closes: number[], preCloses: number[], high: number, i: number): MarketState {
  if (!Number.isInteger(i) || i < 0 || i >= closes.length) {
    throw new RangeError(`commentary: dayIndex ${i} is outside closes (length ${closes.length})`);
  }
  const series = [...preCloses, ...closes.slice(0, i + 1)];
  const idx = series.length - 1;
  const c = series[idx];
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
  const runCloses = closes.slice(0, i + 1);
  let peak = high;
  for (const x of series) peak = Math.max(peak, x);
  let peakBefore = high;
  for (let k = 0; k < idx; k++) peakBefore = Math.max(peakBefore, series[k]);
  const low = Math.min(...runCloses);
  const priorRunLow = i >= 1 ? Math.min(...closes.slice(0, i)) : Infinity;
  const earlier = ch.slice(0, -1);
  const maxEarlier = earlier.length ? Math.max(...earlier) : -Infinity;
  const minEarlier = earlier.length ? Math.min(...earlier) : Infinity;
  const weeks = Math.floor(idx / 5);
  let maxDd = 0;
  let runPeak = high;
  for (const x of series) {
    runPeak = Math.max(runPeak, x);
    maxDd = Math.max(maxDd, ((runPeak - x) / runPeak) * 100);
  }
  const first = closes[0];
  const prevDn = idx >= 1 ? streak(idx - 1, -1) : 0;
  const dn = streak(idx, -1);
  const runHigh = Math.max(...runCloses);
  let lastHigh = -1;
  let best = high;
  for (let k = 0; k <= i; k++) {
    if (closes[k] >= best) lastHigh = k;
    best = Math.max(best, closes[k]);
  }
  return {
    day: i,
    chg,
    prevChg: idx >= 2 ? ch[idx - 2] : null,
    dn,
    up: streak(idx, 1),
    prevDn,
    prevUp: idx >= 1 ? streak(idx - 1, 1) : 0,
    dnCut: dn === idx,
    prevDnCut: prevDn === idx - 1,
    dd: ((peak - c) / peak) * 100,
    fromLow: ((c - low) / low) * 100,
    belowFirst: c < first ? ((first - c) / first) * 100 : 0,
    aboveHigh: c > high,
    yesterdayBelowPeak: idx >= 1 && series[idx - 1] < peakBefore,
    newLow: i >= 1 && c < priorRunLow,
    bestWeeks: chg !== null && weeks >= 2 && chg >= 1 && chg > maxEarlier ? weeks : 0,
    worstWeeks: chg !== null && weeks >= 2 && chg <= -1 && chg < minEarlier ? weeks : 0,
    dippedAgain: i >= 1 && chg !== null && chg < 0 && idx >= 2 && ch[idx - 2] >= 1 && c < priorRunLow,
    quiet: idx >= 5 && ch.slice(-5).every((x) => Math.abs(x) < 0.5),
    week: idx >= 5 ? (c / series[idx - 5] - 1) * 100 : null,
    maxDd,
    runFall: ((runHigh - c) / runHigh) * 100,
    aboveFirst: c > first,
    downOfTen: idx >= 10 ? ch.slice(-10).filter((x) => x < 0).length : 0,
    upOfTen: idx >= 10 ? ch.slice(-10).filter((x) => x > 0).length : 0,
    swings: idx >= 5 && ch.slice(-5).some((x) => x >= 1) && ch.slice(-5).some((x) => x <= -1),
    allBelowHigh: runHigh < high,
    lowAge: i - runCloses.lastIndexOf(low),
    highAge: lastHigh < 0 ? i + 1 : i - lastHigh,
  };
}

/** Adds the player's position to a day's market facts. `held`: in the market at yesterday's close. */
export function withPlayer(m: MarketState, p: { held: boolean; neverSold: boolean; balance: number; start: number }): State {
  const ratio = p.start > 0 ? p.balance / p.start : 1;
  return {
    ...m,
    invested: p.held && m.day > 0,
    out: !p.held && m.day > 0,
    neverSold: p.neverSold,
    loss: ratio < 1 ? (1 - ratio) * 100 : 0,
    gain: ratio > 1 ? (ratio - 1) * 100 : 0,
    balance: p.balance,
    start: p.start,
    moneyDiffers: Math.round(p.balance) !== Math.round(p.start),
  };
}

interface Template {
  key: string;
  /** event: about the first day of the window; state: true on every day of it. */
  kind: 'event' | 'state';
  dir: Dir;
  /** No jokes and no slang: may stand on a sombre day. */
  plain?: boolean;
  /** Reads the player's balance, so it is only checked where the balance is known (see lineCandidates). */
  money?: boolean;
  /** If any eligible, pick only among these. */
  must?: boolean;
  /** Most uses in one game (default 2). */
  max?: number;
  /** R51: a plain line used only when nothing else fresh is true, so the line is never blank for long. */
  fallback?: boolean;
  w?: number;
  when: (s: State) => boolean;
  /** The words, true for every state given (event: just the first); null when no true wording exists. */
  text: (ss: State[]) => string | null;
}

/** An event line stays up at most this many trading days after its day. */
export const EVENT_DAYS = 4;

const up = (s: State) => s.chg !== null && s.chg > 0;
const down = (s: State) => s.chg !== null && s.chg < 0;
const chgAbs = (s: State) => Math.abs(s.chg ?? 0);
const minOf = (ss: State[], f: (s: State) => number) => Math.min(...ss.map(f));
/** The largest multiple of `step` strictly below x (so "more than N%" is true). */
const under = (x: number, step: number) => Math.ceil(x / step - 1) * step;
/** The same words on every day, or null. */
function same(ss: State[], f: (s: State) => string): string | null {
  const t = f(ss[0]);
  return ss.every((s) => f(s) === t) ? t : null;
}
const fixed = (t: string) => () => t;
/** Money lines about gains and losses: only in the market (in cash they read as the cash still moving). */
const money = (s: State) => s.balance >= 0 && s.start > 0 && !s.out;
const cashMoney = (s: State) => s.balance >= 0 && s.start > 0 && s.out;
/** "more than N%" below the peak, N a multiple of five and at least `least`. */
const peakFloor = (ss: State[], least: number) => {
  const n = under(minOf(ss, (s) => s.dd), 5);
  return n >= least ? n : null;
};

/** Trading days as words: "nine days", "412 days"; from 1,000 on in weeks (five trading days make at least a week), so no count reads like a year. */
const daysOrWeeks = (n: number) => (n < 1000 ? `${word(n)} days` : `${Math.floor(n / 5)} weeks`);

const TEMPLATES: Template[] = [
  // ---- Events: the day the line goes up.
  { key: 'fell', kind: 'event', dir: 'down', w: 4, when: (s) => s.chg !== null && s.chg <= -3, text: (ss) => `The market fell ${pct(chgAbs(ss[0]))}% in a single day. Not a quiet one.` },
  { key: 'fell-plain', kind: 'event', dir: 'down', plain: true, w: 3, when: (s) => s.chg !== null && s.chg <= -3, text: (ss) => `The market fell ${pct(chgAbs(ss[0]))}% in a single day.` },
  { key: 'lost', kind: 'event', dir: 'down', w: 4, when: (s) => s.chg !== null && s.chg <= -5, text: (ss) => `The market lost ${pct(chgAbs(ss[0]))}% in one day. That is not a rounding error.` },
  { key: 'rose', kind: 'event', dir: 'up', w: 4, when: (s) => s.chg !== null && s.chg >= 3, text: (ss) => `The market rose ${pct(chgAbs(ss[0]))}% in a single day. It has not made up its mind.` },
  { key: 'rose-plain', kind: 'event', dir: 'up', plain: true, w: 3, when: (s) => s.chg !== null && s.chg >= 3, text: (ss) => `The market rose ${pct(chgAbs(ss[0]))}% in a single day.` },
  { key: 'whiplash', kind: 'event', dir: 'up', w: 4, when: (s) => s.chg !== null && s.chg >= 5 && s.prevDn >= 1, text: (ss) => `The market rose ${pct(chgAbs(ss[0]))}% in a day, straight after a fall. Whiplash.` },
  { key: 'worst', kind: 'event', dir: 'down', w: 5, when: (s) => s.worstWeeks > 0, text: (ss) => `The worst day in at least ${word(ss[0].worstWeeks)} weeks. Earlier days now look polite.` },
  { key: 'best-out', kind: 'event', dir: 'up', must: true, when: (s) => s.bestWeeks > 0 && s.out, text: (ss) => `The best day in at least ${word(ss[0].bestWeeks)} weeks, and you watched it from the sidelines.` },
  { key: 'best-in', kind: 'event', dir: 'up', w: 5, when: (s) => s.bestWeeks > 0 && s.invested, text: (ss) => `The best day in at least ${word(ss[0].bestWeeks)} weeks, and you were there for it.` },
  { key: 'dip', kind: 'event', dir: 'down', w: 3, max: 1, when: (s) => s.dippedAgain, text: fixed('A rise of a percent or more, then a fall to a new low. The dip kept dipping.') },
  { key: 'low', kind: 'event', dir: 'down', w: 2, max: 1, when: (s) => s.newLow, text: fixed('A fresh low. Nobody is cheering.') },
  { key: 'low-plain', kind: 'event', dir: 'down', plain: true, w: 1, max: 1, when: (s) => s.newLow, text: fixed('Prices hit a new low.') },
  { key: 'bounce', kind: 'event', dir: 'up', w: 3, when: (s) => up(s) && s.prevDn >= 3 && !s.prevDnCut, text: (ss) => `A bounce after ${word(ss[0].prevDn)} falling days. It may not mean anything.` },
  { key: 'at-last', kind: 'event', dir: 'up', w: 2, max: 1, when: (s) => up(s) && s.prevDn >= 2, text: fixed('A rise at last. Nobody trusts it yet.') },

  // ---- Distance from the peak (the higher of the reference high and the run's highest close).
  {
    key: 'peak', kind: 'state', dir: null, plain: true, max: 4, when: (s) => s.dd >= 5,
    text: (ss) => { const n = peakFloor(ss, 5); return n === null ? null : `The market is more than ${n}% below the peak.`; },
  },
  {
    key: 'peak-hold', kind: 'state', dir: null, max: 4, w: 2, when: (s) => s.dd >= 10 && s.invested && s.neverSold,
    text: (ss) => { const n = peakFloor(ss, 10); return n === null ? null : `The market is more than ${n}% below the peak. Still holding?`; },
  },
  {
    key: 'peak-out', kind: 'state', dir: null, max: 4, w: 2, when: (s) => s.dd >= 10 && s.out,
    text: (ss) => { const n = peakFloor(ss, 10); return n === null ? null : `The market is more than ${n}% below the peak. You are out of it, for now.`; },
  },
  {
    key: 'correction', kind: 'state', dir: null, max: 1, when: (s) => s.dd >= 10 && s.dd < 20 && s.maxDd < 20,
    text: (ss) => { const n = peakFloor(ss, 5); return n === null ? null : `More than ${n}% off the peak. The polite word for this is a correction.`; },
  },
  {
    key: 'bear', kind: 'state', dir: null, max: 1, w: 3, when: (s) => s.dd >= 20,
    text: (ss) => { const n = peakFloor(ss, 15); return n === null ? null : `More than ${n}% below the peak. Officially a bear market.`; },
  },
  { key: 'tenth', kind: 'state', dir: null, plain: true, max: 1, when: (s) => s.dd >= 8 && s.dd <= 12, text: fixed('About a tenth below the peak.') },
  { key: 'fifth', kind: 'state', dir: null, max: 1, when: (s) => s.dd >= 18 && s.dd <= 22, text: fixed('About a fifth gone from the peak. Hard to call that a blip.') },
  { key: 'quarter', kind: 'state', dir: null, max: 1, when: (s) => s.dd >= 23 && s.dd <= 27, text: fixed('About a quarter gone from the peak. It has stopped looking temporary.') },
  { key: 'third', kind: 'state', dir: null, max: 1, w: 2, when: (s) => s.dd >= 30 && s.dd <= 40, text: fixed('About a third gone from the peak. Nobody is calling this a wobble.') },
  { key: 'half', kind: 'state', dir: null, max: 1, w: 2, when: (s) => s.dd >= 45 && s.dd <= 55, text: fixed('About half gone from the peak. About half of it is still there.') },
  { key: 'over-half', kind: 'state', dir: null, max: 1, w: 2, when: (s) => s.dd > 55, text: fixed('More than half gone from the peak. Less than half is still there.') },
  {
    key: 'day-one', kind: 'state', dir: null, max: 2, when: (s) => s.belowFirst >= 5,
    text: (ss) => { const n = under(minOf(ss, (s) => s.belowFirst), 1); return n >= 5 ? `The market is more than ${n}% down since day one. The paper is keeping count.` : null; },
  },
  {
    key: 'day-one-plain', kind: 'state', dir: null, plain: true, max: 2, when: (s) => s.belowFirst >= 5,
    text: (ss) => { const n = under(minOf(ss, (s) => s.belowFirst), 1); return n >= 5 ? `The market is more than ${n}% below where it began.` : null; },
  },
  { key: 'near-peak', kind: 'state', dir: 'up', max: 1, when: (s) => s.dd > 0 && s.dd <= 3 && s.fromLow >= 5, text: fixed('Back within three percent of the peak.') },
  { key: 'above-peak', kind: 'state', dir: 'up', max: 1, when: (s) => s.aboveHigh && s.fromLow >= 5, text: fixed('Above the old peak again. Memories are short.') },

  // ---- Recovery from the low so far.
  {
    key: 'from-low', kind: 'state', dir: 'up', plain: true, max: 4, when: (s) => s.fromLow >= 10 && s.dd > 0,
    text: (ss) => { const n = under(minOf(ss, (s) => s.fromLow), 5); return n >= 10 ? `The market is more than ${n}% up from its lowest close so far.` : null; },
  },
  {
    key: 'from-low-peak', kind: 'state', dir: 'up', max: 4, when: (s) => s.fromLow >= 10 && s.dd >= 10,
    text: (ss) => {
      const a = under(minOf(ss, (s) => s.fromLow), 5);
      const b = peakFloor(ss, 10);
      return a >= 10 && b !== null ? `More than ${a}% up from the lowest close, and still more than ${b}% below the peak.` : null;
    },
  },

  // ---- Streaks (counted back through the pre-run closes; never cut off by the data start). R53: a line held over
  // several days names the shortest streak in its window ("at least"), so the count never goes stale.
  { key: 'down-fine', kind: 'state', dir: 'down', w: 3, when: (s) => s.dn >= 3 && !s.dnCut, text: (ss) => `Prices down at least ${word(minOf(ss, (s) => s.dn))} days in a row. This is fine.` },
  { key: 'down-habit', kind: 'state', dir: 'down', w: 3, when: (s) => s.dn >= 3 && !s.dnCut, text: (ss) => `Prices down at least ${word(minOf(ss, (s) => s.dn))} days in a row. A habit is forming.` },
  { key: 'down-gravity', kind: 'state', dir: 'down', w: 3, when: (s) => s.dn >= 5 && !s.dnCut, text: (ss) => `Prices down at least ${word(minOf(ss, (s) => s.dn))} days in a row. Gravity is working as intended.` },
  { key: 'down-plain', kind: 'state', dir: 'down', plain: true, w: 2, when: (s) => s.dn >= 3 && !s.dnCut, text: (ss) => `Prices have fallen at least ${word(minOf(ss, (s) => s.dn))} days in a row.` },
  { key: 'up-mood', kind: 'state', dir: 'up', w: 3, when: (s) => s.up >= 3, text: (ss) => `Prices up at least ${word(minOf(ss, (s) => s.up))} days in a row. The mood is improving.` },
  { key: 'up-catch', kind: 'state', dir: 'up', w: 3, when: (s) => s.up >= 3, text: (ss) => `Prices up at least ${word(minOf(ss, (s) => s.up))} days in a row. Everyone is waiting for the catch.` },
  { key: 'down-again', kind: 'state', dir: 'down', max: 1, when: (s) => down(s) && s.prevDn >= 1, text: fixed('Another down day. The ledger records it without comment.') },
  { key: 'up-again', kind: 'state', dir: 'up', max: 1, when: (s) => up(s) && s.prevUp >= 1, text: fixed('Up again. Noted, cautiously.') },
  { key: 'barely', kind: 'state', dir: null, max: 1, when: (s) => s.chg !== null && Math.abs(s.chg) < 0.25 && s.dd >= 3, text: fixed('Barely moved. A pause, after all that.') },
  { key: 'quiet', kind: 'state', dir: null, max: 1, when: (s) => s.quiet && s.dd >= 3, text: fixed('At least five quiet days in a row. Suspicious.') },
  {
    key: 'week-down', kind: 'state', dir: 'down', max: 4, plain: true, when: (s) => s.week !== null && s.week <= -5,
    text: (ss) => `Prices are down at least ${Math.floor(minOf(ss, (s) => -(s.week as number)))}% on the week.`,
  },
  {
    key: 'week-up', kind: 'state', dir: 'up', max: 4, plain: true, when: (s) => s.week !== null && s.week >= 5,
    text: (ss) => `Prices are up at least ${Math.floor(minOf(ss, (s) => s.week as number))}% on the week.`,
  },

  // ---- Your money (against where you started; no claims about the holder).
  { key: 'money-down', kind: 'state', dir: null, money: true, when: (s) => money(s) && s.loss >= 10, text: (ss) => same(ss, (s) => `Down ${pct(s.loss)}% on your money.`) },
  { key: 'money-up', kind: 'state', dir: null, money: true, when: (s) => money(s) && s.gain >= 10, text: (ss) => same(ss, (s) => `Up ${pct(s.gain)}% on your money. For now.`) },
  {
    key: 'sums', kind: 'state', dir: null, money: true, max: 1, when: (s) => money(s) && s.moneyDiffers && s.balance < s.start,
    text: (ss) => same(ss, (s) => `Your ${dollars(s.start)} is now ${dollars(s.balance)}. Check the sums if you like.`),
  },
  {
    key: 'no-fuss', kind: 'state', dir: null, money: true, max: 1, when: (s) => money(s) && s.moneyDiffers && s.balance > s.start,
    text: (ss) => same(ss, (s) => `Your ${dollars(s.start)} is now ${dollars(s.balance)}. No fuss.`),
  },
  // Never sold: the balance follows the price (borrowed money too, until a wipe-out), so these read the price.
  { key: 'hold-below', kind: 'state', dir: null, max: 1, when: (s) => s.invested && s.neverSold && s.belowFirst > 0, text: fixed('Holding, and below where you started.') },
  { key: 'hold-above', kind: 'state', dir: null, max: 1, when: (s) => s.invested && s.neverSold && s.aboveFirst, text: fixed('Holding, and above where you started.') },
  {
    key: 'held-fall', kind: 'state', dir: null, w: 2, max: 4, when: (s) => s.invested && s.neverSold && s.runFall >= 20,
    text: (ss) => { const n = under(minOf(ss, (s) => s.runFall), 5); return n >= 15 ? `You have held through a fall of more than ${n}% so far.` : null; },
  },

  // ---- In the market, or not, for the day's move.
  { key: 'in-up', kind: 'state', dir: 'up', max: 1, when: (s) => s.invested && up(s), text: fixed('An up day, and you were in the market for it.') },
  { key: 'in-down', kind: 'state', dir: 'down', max: 1, when: (s) => s.invested && down(s), text: fixed('A down day, and you were in the market for it.') },
  { key: 'sat-out', kind: 'state', dir: null, max: 1, when: (s) => s.out, text: fixed("You sat out today's move.") },
  { key: 'without-you', kind: 'state', dir: null, max: 1, when: (s) => s.out, text: fixed("Today's move happened without you.") },
  { key: 'out-below', kind: 'state', dir: null, max: 1, when: (s) => s.out && s.belowFirst > 0, text: fixed('Out for today, with prices below where this all began.') },
  { key: 'out-fell', kind: 'state', dir: 'down', max: 1, when: (s) => s.out && down(s), text: fixed('Prices fell and you were out of it. A calm day, for cash.') },
  { key: 'out-rose', kind: 'state', dir: 'up', max: 1, when: (s) => s.out && up(s), text: fixed('Prices rose and you missed it. Cash did not rise.') },

  // ---- Over the last days (true on every day of the window).
  { key: 'week-lower', kind: 'state', dir: 'down', plain: true, max: 1, when: (s) => s.week !== null && s.week < 0, text: fixed('Prices are lower than a week ago.') },
  { key: 'week-higher', kind: 'state', dir: 'up', plain: true, max: 1, when: (s) => s.week !== null && s.week > 0, text: fixed('Prices are higher than a week ago.') },
  {
    key: 'ten-down', kind: 'state', dir: 'down', max: 4, plain: true, when: (s) => s.downOfTen >= 6,
    text: (ss) => `The market has fallen on at least ${word(minOf(ss, (s) => s.downOfTen))} of the last ten days.`,
  },
  {
    key: 'ten-up', kind: 'state', dir: 'up', max: 4, plain: true, when: (s) => s.upOfTen >= 6,
    text: (ss) => `The market has risen on at least ${word(minOf(ss, (s) => s.upOfTen))} of the last ten days.`,
  },
  { key: 'swings', kind: 'state', dir: null, max: 1, when: (s) => s.swings, text: fixed('Moves of a percent or more both ways this week. Nobody is bored.') },
  { key: 'never-above', kind: 'state', dir: null, plain: true, max: 1, when: (s) => s.day >= 5 && s.allBelowHigh, text: fixed('Not one close so far has made it back to the old peak.') },
  {
    key: 'near-low', kind: 'state', dir: null, plain: true, max: 2, when: (s) => s.day >= 5 && s.dd >= 5 && s.fromLow < 3,
    text: (ss) => { const n = Math.ceil(Math.max(...ss.map((s) => s.fromLow)) + 1e-9); return `The market is within ${word(Math.max(1, n))} percent of its lowest close so far.`; },
  },
  { key: 'below-start', kind: 'state', dir: null, plain: true, max: 1, when: (s) => s.day >= 1 && s.belowFirst > 0, text: fixed('Prices are below where this all began.') },

  {
    key: 'no-low', kind: 'state', dir: null, plain: true, max: 2, when: (s) => s.lowAge >= 3,
    text: (ss) => {
      // Trading days: five make at least a calendar week, sixty-five at least three months.
      const n = minOf(ss, (s) => s.lowAge);
      if (n <= 12) return `No new low for at least ${word(n)} days.`;
      if (n < 65) return `No new low for at least ${word(Math.floor(n / 5))} weeks.`;
      return 'No new low for months.';
    },
  },
  // ---- Day one (R51: no opening line any more, so the first step has a true line of its own; it is about
  // day one by name, so it stays true while the window runs on).
  {
    key: 'day-one-close', kind: 'state', dir: null, plain: true, max: 1, when: () => true,
    text: (ss) => {
      if (ss[0].day !== 0) return null;
      const dd = ss[0].dd;
      if (dd <= 0) return 'On day one the market closed at its peak.';
      const n = under(dd, 1);
      return n >= 1 ? `On day one the market closed more than ${n}% below the peak.` : 'On day one the market closed within one percent of the peak.';
    },
  },
  // ---- Fallbacks (R51: never a blank line for more than one step). The count grows day by day, so a new
  // window almost always gives new words; "at least" keeps it true on every day of the window.
  {
    key: 'fb-high', kind: 'state', dir: null, plain: true, fallback: true, max: 1000, when: (s) => s.highAge >= 3,
    text: (ss) => `No new high for at least ${daysOrWeeks(minOf(ss, (s) => s.highAge))}.`,
  },
  {
    key: 'fb-low', kind: 'state', dir: null, plain: true, fallback: true, max: 1000, when: (s) => s.lowAge >= 3,
    text: (ss) => `No new low for at least ${daysOrWeeks(minOf(ss, (s) => s.lowAge))}.`,
  },
  // ---- The player's position (constant inside a window: a trade brings a new line).
  { key: 'all-shares', kind: 'state', dir: null, max: 1, when: (s) => s.invested && s.neverSold && s.day >= 3, text: fixed('You still hold every share you started with.') },
  { key: 'back-in', kind: 'state', dir: null, max: 1, when: (s) => s.invested && !s.neverSold, text: fixed('You are back in the market, for better or worse.') },
  {
    key: 'cash', kind: 'state', dir: null, money: true, max: 1, when: cashMoney,
    text: (ss) => same(ss, (s) => `Your ${dollars(s.balance)} is sitting in cash. Whatever the market does, it stays put.`),
  },
  {
    key: 'cash-peak', kind: 'state', dir: null, money: true, max: 2, when: (s) => cashMoney(s) && s.dd >= 5,
    text: (ss) => {
      const n = peakFloor(ss, 5);
      const t = same(ss, (s) => `Your ${dollars(s.balance)} is sitting in cash.`);
      return n === null || t === null ? null : `${t} The market is more than ${n}% below the peak.`;
    },
  },
  {
    key: 'cash-start', kind: 'state', dir: null, money: true, max: 1, when: (s) => cashMoney(s) && s.belowFirst >= 5,
    text: (ss) => {
      const n = under(minOf(ss, (s) => s.belowFirst), 1);
      const t = same(ss, (s) => `Your ${dollars(s.balance)} is sitting in cash.`);
      return n < 5 || t === null ? null : `${t} The market is more than ${n}% below where it began.`;
    },
  },

  // ---- Plain daily lines (also for sombre days).
  { key: 'n-again', kind: 'state', dir: 'down', plain: true, max: 1, when: (s) => down(s) && s.prevDn >= 1, text: fixed('Markets fall again.') },
  { key: 'n-fall', kind: 'state', dir: 'down', plain: true, max: 1, when: down, text: fixed('Prices fall.') },
  { key: 'n-lower', kind: 'state', dir: 'down', plain: true, max: 1, when: down, text: fixed('The market closes lower.') },
  { key: 'n-higher', kind: 'state', dir: 'up', plain: true, max: 1, when: up, text: fixed('Markets close higher.') },
  { key: 'n-rise', kind: 'state', dir: 'up', plain: true, max: 1, when: up, text: fixed('Prices rise.') },
  { key: 'n-recover', kind: 'state', dir: 'up', plain: true, max: 1, when: (s) => up(s) && s.yesterdayBelowPeak, text: fixed('Markets recover some ground.') },
  { key: 'n-below', kind: 'state', dir: null, plain: true, max: 1, when: (s) => s.dd >= 5, text: fixed('Prices are below where they were.') },
];

export interface LineCandidate {
  text: string;
  key: string;
  dir: Dir;
  plain: boolean;
  must: boolean;
  /** About the day the line goes up (a big day's own news). */
  event: boolean;
  /** Only when nothing else fresh fits (R51). */
  fallback: boolean;
  w: number;
  max: number;
}

/**
 * Every line that is true for a window of days (one State per visible day, in order, no trade in
 * between). `exactMoney`: the balances in the states are exact (otherwise money lines are left out).
 */
export function lineCandidates(states: State[], opts: { exactMoney?: boolean } = {}): LineCandidate[] {
  if (!states.length) return [];
  const s0 = states[0];
  const span = states[states.length - 1].day - s0.day;
  const exactMoney = opts.exactMoney ?? states.length === 1;
  const out: LineCandidate[] = [];
  for (const t of TEMPLATES) {
    if (t.money && !exactMoney) continue;
    if (t.kind === 'event') {
      if (span > EVENT_DAYS || !t.when(s0)) continue;
    } else if (!states.every(t.when)) continue;
    const text = t.text(t.kind === 'event' ? [s0] : states);
    if (text === null) continue;
    out.push({
      text, key: t.key, dir: t.dir, plain: !!t.plain, must: !!t.must, event: t.kind === 'event', fallback: !!t.fallback, w: t.w ?? 1, max: t.max ?? 2,
    });
  }
  return out;
}

/** Weighted pick (the rng gives [0, 1)). */
export function pickLine(candidates: LineCandidate[], rng: () => number): LineCandidate {
  const musts = candidates.filter((c) => c.must);
  const from = musts.length ? musts : candidates;
  const total = from.reduce((a, c) => a + c.w, 0);
  let r = rng() * total;
  for (const c of from) {
    r -= c.w;
    if (r < 0) return c;
  }
  return from[from.length - 1];
}

const PLAIN = new Set<string>();
/** Whether a line is from the plain set (no jokes, no slang): the only lines for sombre days. */
export function isPlainLine(text: string): boolean {
  if (PLAIN.has(text)) return true;
  return (
    /^The market (fell|rose) \d+% in a single day\.$/.test(text) ||
    /^The market is more than \d+% (below the peak|below where it began|up from its lowest close so far)\.$/.test(text) ||
    /^Prices have fallen at least \w+ days in a row\.$/.test(text) ||
    /^Prices are (down|up) at least \d+% on the week\.$/.test(text) ||
    /^The market has (fallen|risen) on at least \w+ of the last ten days\.$/.test(text) ||
    /^The market is within \w+ percent of its lowest close so far\.$/.test(text) ||
    /^No new low for (at least \w+ (days|weeks)|months)\.$/.test(text) ||
    /^No new high for at least \w+ (days|weeks)\.$/.test(text) ||
    /^On day one the market closed /.test(text) ||
    // The narrator's lines at a press and in a rematch (copy.ts): plain statements of fact.
    /^(You are out\. To win, buy back in|You sold\. Your \$|Out of the market, with \$|\$[\d,]+ in cash\. Prices can move|You bought back in|Back in the market,|In again,|Last time, you sold on day)/.test(text) ||
    NEUTRAL_LINES.includes(text)
  );
}

/** The fixed plain lines, exported for tests. */
export const NEUTRAL_LINES: string[] = [
  'Prices hit a new low.', 'Markets fall again.', 'Prices fall.', 'The market closes lower.', 'Markets close higher.',
  'Prices rise.', 'Markets recover some ground.', 'Prices are below where they were.',
  'Prices are lower than a week ago.', 'Prices are higher than a week ago.',
  'Not one close so far has made it back to the old peak.', 'Prices are below where this all began.',
  'About a tenth below the peak.',
];
for (const t of NEUTRAL_LINES) PLAIN.add(t);

// ---- Single-day use (one step, nothing remembered): kept for callers and tests.

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
  /** The line shown the step before; never repeated. */
  previous?: string;
}

/** One day's line on its own (empty when nothing true fits). */
export function commentaryFor(ctx: CommentaryCtx): string {
  const m = marketState(ctx.closes, ctx.preCloses, ctx.high, ctx.dayIndex);
  const s = withPlayer(m, { held: ctx.invested, neverSold: ctx.neverSold, balance: ctx.balance, start: ctx.start });
  const any = lineCandidates([s], { exactMoney: true }).filter((c) => !ctx.sombre || c.plain);
  const all = any.some((c) => !c.fallback) ? any.filter((c) => !c.fallback) : any;
  const fresh = all.filter((c) => c.text !== ctx.previous);
  const from = fresh.length ? fresh : all;
  return from.length ? pickLine(from, ctx.rng).text : '';
}

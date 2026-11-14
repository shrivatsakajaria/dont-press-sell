// The line under each day's headline, worked out from the prices (spec 8.5).
// Every template is guarded by a condition computed from closes[0..dayIndex],
// so no line can state something the run's own data does not support.
// Future days are never read. House rules: no digit-years, no emoji, no
// exclamation marks, British spelling, no advice.

import { dollars } from './copy';

export interface CommentaryCtx {
  closes: number[];
  dayIndex: number;
  invested: boolean;
  balance: number;
  start: number;
  sombre: boolean;
  rng: () => number;
  /** The line shown the day before. The function is pure, so the caller passes it to avoid a repeat. */
  previous?: string;
}

/** Facts about the run so far, from closes up to and including dayIndex. */
interface State {
  i: number;
  /** Today's move in percent; null on the first day (no earlier close in the run). */
  chg: number | null;
  /** Consecutive falling closes ending today, and ending yesterday. */
  dn: number;
  up: number;
  prevDn: number;
  prevUp: number;
  /** Percent below the highest close so far in the run. */
  dd: number;
  /** Percent above the lowest close so far in the run. */
  fromLow: number;
  /** Percent below the first close of the run (0 when at or above it). */
  belowFirst: number;
  newLow: boolean;
  bestDaySoFar: boolean;
  worstDaySoFar: boolean;
  invested: boolean;
  /** Percent of the starting amount lost, or gained; 0 when the other way. */
  loss: number;
  gain: number;
  balance: number;
  start: number;
  /** True when the balance and start differ as whole dollars. */
  moneyDiffers: boolean;
}

const EPS = 1e-9;
const whole = (x: number) => Math.floor(x + EPS);
const tens = (x: number) => Math.floor(x / 10 + EPS) * 10;

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const word = (n: number) => (n < WORDS.length ? WORDS[n] : String(n));

function compute(ctx: CommentaryCtx): State {
  const last = ctx.closes.length - 1;
  const i = Math.max(0, Math.min(ctx.dayIndex, last));
  const c = ctx.closes[i];

  const changes: number[] = [];
  for (let k = 1; k <= i; k++) changes.push((ctx.closes[k] / ctx.closes[k - 1] - 1) * 100);
  const chg = i >= 1 ? changes[i - 1] : null;

  const streak = (end: number, dir: 1 | -1): number => {
    let n = 0;
    for (let k = end; k >= 1; k--) {
      const d = ctx.closes[k] - ctx.closes[k - 1];
      if (d * dir > 0) n++;
      else break;
    }
    return n;
  };

  let peak = -Infinity;
  let low = Infinity;
  for (let k = 0; k <= i; k++) {
    peak = Math.max(peak, ctx.closes[k]);
    low = Math.min(low, ctx.closes[k]);
  }
  let priorLow = Infinity;
  for (let k = 0; k < i; k++) priorLow = Math.min(priorLow, ctx.closes[k]);

  const earlier = changes.slice(0, -1);
  const maxEarlier = earlier.length ? Math.max(...earlier) : -Infinity;
  const minEarlier = earlier.length ? Math.min(...earlier) : Infinity;

  const first = ctx.closes[0];
  const ratio = ctx.start > 0 ? ctx.balance / ctx.start : 1;

  return {
    i,
    chg,
    dn: streak(i, -1),
    up: streak(i, 1),
    prevDn: i >= 1 ? streak(i - 1, -1) : 0,
    prevUp: i >= 1 ? streak(i - 1, 1) : 0,
    dd: ((peak - c) / peak) * 100,
    fromLow: ((c - low) / low) * 100,
    belowFirst: c < first ? ((first - c) / first) * 100 : 0,
    newLow: i >= 1 && c < priorLow,
    bestDaySoFar: chg !== null && i >= 3 && chg > 0 && chg > maxEarlier,
    worstDaySoFar: chg !== null && i >= 3 && chg < 0 && chg < minEarlier,
    invested: ctx.invested,
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
  w?: number;
  /** If any eligible, pick only among these. Used where the line must be said. */
  must?: boolean;
}

const up = (s: State) => s.chg !== null && s.chg > 0;
const down = (s: State) => s.chg !== null && s.chg < 0;

const TEMPLATES: Template[] = [
  // Falling streaks
  { w: 4, when: (s) => s.dn >= 3, text: (s) => `Down ${word(s.dn)} days in a row. This is fine.` },
  { w: 4, when: (s) => s.dn >= 3, text: (s) => `Down ${word(s.dn)} days in a row. The chart has made its point.` },
  { w: 3, when: (s) => s.dn >= 5, text: (s) => `Down ${word(s.dn)} days in a row. Gravity is working as intended.` },
  { w: 3, when: (s) => s.dn >= 2, text: (s) => `Down ${word(s.dn)} days in a row. A habit is forming.` },

  // Rising streaks and bounces
  { w: 3, when: (s) => s.up >= 3, text: (s) => `Up ${word(s.up)} days in a row. Do not get used to it.` },
  { w: 3, when: (s) => s.up >= 3, text: (s) => `Up ${word(s.up)} days in a row. Everyone is waiting for the catch.` },
  { w: 2, when: (s) => up(s) && s.prevDn >= 3, text: (s) => `A bounce after ${word(s.prevDn)} falling days. It may not mean anything.` },
  { when: (s) => up(s) && s.prevDn >= 1, text: () => 'An up day. Do not get used to it.' },
  { when: (s) => up(s) && s.prevDn >= 2, text: () => 'A rise at last. Enjoy it.' },
  { when: (s) => up(s) && s.prevUp >= 1, text: () => 'Up again. Noted, cautiously.' },
  { when: (s) => down(s) && s.prevUp >= 1, text: () => 'Down today. Yesterday was kinder.' },
  { when: (s) => down(s) && s.prevDn >= 1, text: () => 'Another down day. The ledger records it without comment.' },

  // Big single days
  { when: (s) => s.chg !== null && s.chg <= -3, text: (s) => `A fall of ${whole(-(s.chg as number))}% in one day. Ouch.` },
  { when: (s) => s.chg !== null && s.chg <= -5, text: (s) => `Down ${whole(-(s.chg as number))}% in one day. That is not a rounding error.` },
  { when: (s) => s.chg !== null && s.chg >= 3, text: (s) => `Up ${whole(s.chg as number)}% in a day. The market has not made up its mind.` },
  { when: (s) => s.chg !== null && s.chg >= 5, text: (s) => `Up ${whole(s.chg as number)}% in a day. Whiplash.` },
  { when: (s) => s.chg !== null && Math.abs(s.chg) < 0.25 && s.dd >= 3, text: () => 'Barely moved. A pause, after all that.' },

  // Distance from the peak so far in this run
  { w: 3, when: (s) => s.dd >= 40 && s.invested, text: (s) => `Down ${tens(s.dd)}% from the peak. Still holding?` },
  { w: 3, when: (s) => s.dd >= 40 && !s.invested, text: (s) => `Down ${tens(s.dd)}% from the peak. You are watching from the sidelines.` },
  { when: (s) => s.dd >= 10 && s.invested, text: (s) => `Down ${tens(s.dd)}% from the peak. Still holding?` },
  { when: (s) => s.dd >= 10 && !s.invested, text: (s) => `Down ${tens(s.dd)}% from the peak. You are watching from the sidelines.` },
  { when: (s) => s.dd >= 10, text: (s) => `Down ${tens(s.dd)}% from the peak. Past the point where it is called a correction.` },
  { w: 2, when: (s) => s.dd >= 100 / 3, text: () => 'A third gone from the peak. The headlines have stopped being subtle.' },
  { w: 2, when: (s) => s.dd >= 50, text: () => 'Down by half from the peak. Halfway to nothing.' },
  { when: (s) => s.belowFirst >= 5, text: (s) => `Down ${whole(s.belowFirst)}% since day one.` },

  // Lows, worst and best days
  { w: 2, when: (s) => s.newLow, text: () => 'A fresh low for this whole mess.' },
  { w: 2, when: (s) => s.newLow, text: () => 'Lower than anything so far.' },
  { w: 3, when: (s) => s.worstDaySoFar, text: () => 'The worst day of this whole mess so far.' },
  { must: true, when: (s) => s.bestDaySoFar && !s.invested, text: () => 'The best day of this whole mess so far. You watched it from the sidelines.' },
  { w: 3, when: (s) => s.bestDaySoFar && s.invested, text: () => 'The best day of this whole mess so far. You are still in the market.' },

  // Recovery from the low so far
  { when: (s) => s.fromLow >= 10 && s.dd > 0, text: (s) => `Up ${whole(s.fromLow)}% from the lowest close so far.` },
  {
    when: (s) => s.fromLow >= 10 && s.dd >= 10,
    text: (s) => `Up ${whole(s.fromLow)}% off the low, and still ${whole(s.dd)}% below the peak.`,
  },

  // Your money
  { when: (s) => s.loss >= 10, text: (s) => `Down ${tens(s.loss)}% on your money.` },
  { when: (s) => s.gain >= 10, text: (s) => `Up ${tens(s.gain)}% on your money. For now.` },
  { when: (s) => s.moneyDiffers && s.balance < s.start, text: (s) => `Your ${dollars(s.start)} is now ${dollars(s.balance)}. Not a typo.` },
  { when: (s) => s.moneyDiffers && s.balance > s.start, text: (s) => `Your ${dollars(s.start)} is now ${dollars(s.balance)}. Quietly.` },
  { when: (s) => s.invested && s.moneyDiffers && s.balance < s.start, text: () => 'Still holding. Still behind.' },
  { when: (s) => s.invested && s.moneyDiffers && s.balance > s.start, text: () => 'Still in, and still ahead of where you started.' },

  // In the market or in cash
  { when: (s) => s.invested && up(s), text: () => 'An up day, and you are in the market for it.' },
  { when: (s) => s.invested && down(s), text: () => 'A down day, and you are in the market for it.' },
  { when: (s) => !s.invested, text: () => 'You are in cash. The market carries on without you.' },
  { when: (s) => !s.invested, text: () => 'In cash. Safe from today’s move, and unable to enjoy it either.' },
  { when: (s) => !s.invested && s.belowFirst > 0, text: () => 'Out of the market, with prices below where the run began.' },
  { when: (s) => !s.invested && down(s), text: () => 'Prices fell and you are in cash. The sidelines are quiet.' },
  { when: (s) => !s.invested && up(s), text: () => 'Prices rose and you are in cash. The sidelines have a view.' },

  // Always true
  { when: () => true, text: () => 'Another day on the markets.' },
  { when: () => true, text: () => 'Prices move. Opinions move faster.' },
  { when: () => true, text: () => 'The market has made no promises.' },
  { when: () => true, text: () => 'Somewhere, a chart is being refreshed.' },
  { when: () => true, text: () => 'Everyone has a view. Prices have the final say.' },
  { when: () => true, text: () => 'The tape does not care how you feel.' },
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
  { text: 'Markets recover some ground.', when: (s) => up(s) },
  { text: 'Prices rise.', when: (s) => up(s) },
  { text: 'A difficult time for markets.', when: (s) => s.dd >= 5 },
  { text: 'Trading continues.', when: () => true },
  { text: 'Another day on the markets.', when: () => true },
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

  const all = eligible.map((t) => ({ text: t.text(s), w: t.w ?? 1 }));
  const fresh = all.filter((c) => c.text !== ctx.previous);
  return pick(fresh.length ? fresh : all, ctx.rng);
}

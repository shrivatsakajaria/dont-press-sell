import type { Headline, RunData } from '../engine/types';
import { hashString, mulberry32 } from './rng';

/**
 * The game clock (spec 7.4, 6.4, 6.6): the list of screen steps for one run.
 *
 * The fall is days 0 .. fallEndIndex - 1; the fast-forward is fallEndIndex .. the
 * last day. Each step shows one trading day (`dayIndex`) for `holdMs`; a press
 * during the step trades at that day's close. In quiet stretches one step covers
 * several days (the day counter jumps) and shows the last of them.
 */
export interface Step {
  dayIndex: number;
  holdMs: number;
  phase: 'fall' | 'forward';
  slow: boolean;
}

/*
 * Pacing (ruling R27, after the player panel): a game lasts about 120 s so players
 * can read the headlines and decide. Normal runs: 108 s of fall + 10 s of
 * fast-forward. Long falls about 140 s (ceiling 150 s). Short falls finish sooner.
 */
/** Time for the whole fall, slow steps included (R27). */
export const FALL_BUDGET_MS = 108_000;
/**
 * Fall budget for the long falls (ruling R17: c1929 and c2000, whose falls run
 * past LONG_FALL_DAYS trading days); R27: about 140 s in all, never over 150 s.
 */
export const LONG_FALL_BUDGET_MS = 130_000;
/** A fall of more than this many trading days takes LONG_FALL_BUDGET_MS (only c1929 and c2000 today). */
export const LONG_FALL_DAYS = 500;
/**
 * Longest hold of an ordinary fall step (R16, R27), so slow days always feel slower.
 * Falls too short to fill the budget under this cap finish sooner.
 */
export const MAX_QUIET_MS = 1_500;
/** Time for the whole fast-forward (R27). */
export const FORWARD_BUDGET_MS = 10_000;
/** Hold of a slow-motion (big, red or decoy) day: long enough to read the headline (R27). */
export const SLOW_MS = 3_000;
/** The floor: the screen never changes more than eight times a second. */
export const MIN_STEP_MS = 125;
/** The first slow step must begin by this time (R27: relaxed from 10 s to 15 s for the slower game). */
export const FIRST_SLOW_BY_MS = 15_000;
/** Most slow steps in a fall, decoys included (R20). */
export const MAX_SLOW = 10;
/** True slow days: big headline days, then the largest daily moves (either direction), up to this many (R20). */
export const MAX_TRUE_SLOW = 7;
/** Decoy slow days added after the true ones so slow motion is not a reliable signal (R20). */
export const DECOYS = 3;
/** Decoys come from days whose absolute move lies between these percentiles of the fall's moves. */
const DECOY_LOW_PCT = 0.5;
/**
 * Very short falls (R22): a fall of fewer than this many days gets a shorter
 * fast-forward (SHORT_FORWARD_MS_PER_DAY per forward day, up to FORWARD_BUDGET_MS)
 * and the run simply finishes sooner. Rule-based, never by run id.
 */
export const SHORT_FALL_DAYS = 20;
export const SHORT_FORWARD_MS_PER_DAY = 400;
/** Short-fall fast-forward floor (R23, R27): max(SHORT_FORWARD_MIN_MS, days x 400 ms), up to FORWARD_BUDGET_MS. */
export const SHORT_FORWARD_MIN_MS = 5_000;
/**
 * Pacing of a fall under SHORT_FALL_DAYS (R23): every fall day is its own step,
 * ordinary days hold SHORT_QUIET_MS and slow days SHORT_SLOW_MS (still the longer).
 * No fall budget applies; the run is as long as its days make it.
 */
export const SHORT_QUIET_MS = 3_000;
export const SHORT_SLOW_MS = 4_000;
/** Fall days per true slow day, and per decoy, when the fall is too short for the full 7 + 3 (R22). */
const DAYS_PER_TRUE_SLOW = 4;
const DAYS_PER_DECOY = 8;
const DECOY_HIGH_PCT = 0.85;

/** Opening days are squeezed to begin the first slow step by this time (margin under FIRST_SLOW_BY_MS for rounding and floors). */
const OPENING_TARGET_MS = FIRST_SLOW_BY_MS - 1_500;
/** Days in the trailing window that measures the recent swing. */
const SWING_WINDOW = 5;

/**
 * How many true slow days and decoys a fall of `fallDays` days gets (R22):
 * truth = min(7, max(1, floor(days / 4))), decoys = min(3, floor(days / 8)).
 * From 28 fall days on this is the full 7 + 3; a 7-day fall gets 1 + 0.
 */
export function slowCountsFor(fallDays: number): { truth: number; decoys: number } {
  return {
    truth: Math.min(MAX_TRUE_SLOW, Math.max(1, Math.floor(fallDays / DAYS_PER_TRUE_SLOW))),
    decoys: Math.min(DECOYS, Math.floor(fallDays / DAYS_PER_DECOY)),
  };
}

/**
 * The fast-forward budget: FORWARD_BUDGET_MS; after a fall under SHORT_FALL_DAYS,
 * max(SHORT_FORWARD_MIN_MS, forward days x SHORT_FORWARD_MS_PER_DAY) capped at FORWARD_BUDGET_MS (R22, R23, R27).
 */
export function forwardBudgetFor(run: RunData): number {
  const n = run.closes.length;
  const fe = Math.min(Math.max(run.fallEndIndex, 1), n);
  const days = n - fe;
  if (days <= 0) return 0;
  if (fe >= SHORT_FALL_DAYS) return FORWARD_BUDGET_MS;
  return Math.min(FORWARD_BUDGET_MS, Math.max(SHORT_FORWARD_MIN_MS, days * SHORT_FORWARD_MS_PER_DAY));
}

/** The fall budget for a run: the long-fall budget for falls over LONG_FALL_DAYS days. */
export function fallBudgetFor(run: RunData): number {
  return run.fallEndIndex > LONG_FALL_DAYS ? LONG_FALL_BUDGET_MS : FALL_BUDGET_MS;
}

/** Shares `budget` across `days` by weight, no day above `cap`; whatever the cap refuses is left unspent. */
function fillCapped(days: number[], weight: (d: number) => number, budget: number, cap: number, out: Map<number, number>) {
  let free = days.slice();
  let left = budget;
  while (free.length && left > 0) {
    const total = free.reduce((a, d) => a + weight(d), 0);
    const over = free.filter((d) => (total > 0 ? (left * weight(d)) / total : 0) > cap);
    if (!over.length) {
      for (const d of free) out.set(d, total > 0 ? (left * weight(d)) / total : 0);
      return;
    }
    for (const d of over) out.set(d, cap);
    left -= cap * over.length;
    free = free.filter((d) => !over.includes(d));
  }
  for (const d of free) out.set(d, 0);
}

/**
 * The slow-motion days of a run's fall (R20).
 * truth: big headline days in the fall, then the largest absolute daily moves, up to
 * slowCountsFor(fall days).truth in all (7 from 28 days on; every big headline day is kept even beyond that).
 * decoys: up to DECOYS more, picked with mulberry32(hashString(run.id)) from ordinary
 * fall days whose absolute move lies between the 50th and 85th percentile, at least one
 * rising and one falling when such days exist, never next to another slow day, and never
 * taking the total above MAX_SLOW. Same run id, same decoys.
 */
export function pickSlowDays(run: RunData, headlines: Headline[]): { truth: number[]; decoys: number[] } {
  const closes = run.closes;
  const n = closes.length;
  const fe = Math.min(Math.max(run.fallEndIndex, 1), n);
  const move = (d: number) => Math.abs(closes[d] / closes[d - 1] - 1);

  const slow = new Set<number>();
  for (const h of headlines) {
    if (h.big && Number.isInteger(h.dayIndex) && h.dayIndex >= 0 && h.dayIndex < fe) slow.add(h.dayIndex);
  }
  const byMove: number[] = [];
  for (let d = 1; d < fe; d++) if (!slow.has(d)) byMove.push(d);
  byMove.sort((a, b) => move(b) - move(a) || a - b);
  const counts = slowCountsFor(fe);
  for (const d of byMove.slice(0, Math.max(0, counts.truth - slow.size))) slow.add(d);
  const truth = [...slow].sort((a, b) => a - b);

  const want = Math.min(counts.decoys, Math.max(0, MAX_SLOW - slow.size));
  const decoys: number[] = [];
  if (want > 0 && fe > 2) {
    const sorted: number[] = [];
    for (let d = 1; d < fe; d++) sorted.push(move(d));
    sorted.sort((a, b) => a - b);
    const lo = sorted[Math.floor(DECOY_LOW_PCT * (sorted.length - 1))];
    const hi = sorted[Math.floor(DECOY_HIGH_PCT * (sorted.length - 1))];
    let pool: number[] = [];
    for (let d = 1; d < fe; d++) {
      if (slow.has(d) || slow.has(d - 1) || slow.has(d + 1)) continue;
      if (move(d) >= lo && move(d) <= hi) pool.push(d);
    }
    const rnd = mulberry32(hashString(run.id));
    const rising = (d: number) => closes[d] > closes[d - 1];
    const take = (from: number[]) => {
      if (!from.length) return;
      const d = from[Math.floor(rnd() * from.length)];
      decoys.push(d);
      slow.add(d);
      pool = pool.filter((x) => Math.abs(x - d) > 1);
    };
    // One rising and one falling first, then the rest from either direction.
    take(pool.filter(rising));
    if (decoys.length < want) take(pool.filter((d) => !rising(d)));
    while (decoys.length < want && pool.length) take(pool);
  }
  return { truth, decoys: decoys.sort((a, b) => a - b) };
}

interface Group {
  dayIndex: number;
  ms: number;
  slow: boolean;
}

export function buildSchedule(run: RunData, headlines: Headline[]): Step[] {
  const closes = run.closes;
  const n = closes.length;
  if (n === 0) return [];
  // Fall days are 0 .. fe - 1 (at least day 0); forward days are fe .. n - 1.
  const fe = Math.min(Math.max(run.fallEndIndex, 1), n);

  const move = (d: number) => (d >= 1 ? Math.abs(closes[d] / closes[d - 1] - 1) : 0);

  // --- Slow days: the true ones, then the seeded decoys (R20).
  const picked = pickSlowDays(run, headlines);
  const slow = new Set<number>([...picked.truth, ...picked.decoys]);

  // --- A very short fall (R23): one step a day at fixed holds, then the fast-forward.
  if (fe < SHORT_FALL_DAYS) {
    const steps: Step[] = [];
    for (let d = 0; d < fe; d++) {
      const isSlow = slow.has(d);
      steps.push({ dayIndex: d, holdMs: isSlow ? SHORT_SLOW_MS : SHORT_QUIET_MS, phase: 'fall', slow: isSlow });
    }
    return appendForward(steps, run, fe);
  }

  // --- Per-day hold for the other fall days: shorter as the recent swing grows.
  const swing: number[] = [];
  for (let d = 0; d < fe; d++) {
    let s = 0;
    let c = 0;
    for (let k = Math.max(1, d - SWING_WINDOW + 1); k <= d; k++) {
      s += move(k);
      c++;
    }
    swing.push(c ? s / c : NaN);
  }
  const known = swing.filter((s) => !Number.isNaN(s)).sort((a, b) => a - b);
  const median = known.length ? known[Math.floor(known.length / 2)] : 0;
  const weight = (d: number) => {
    const s = Number.isNaN(swing[d]) ? median : swing[d];
    return median > 0 ? 1 / (s + median) : 1;
  };

  const quiet: number[] = [];
  for (let d = 0; d < fe; d++) if (!slow.has(d)) quiet.push(d);
  const fallBudget = fallBudgetFor(run);
  const budget = Math.max(0, fallBudget - SLOW_MS * slow.size);
  const ms = new Map<number, number>();
  fillCapped(quiet, weight, budget, MAX_QUIET_MS, ms);

  // --- Opening: if the first slow day comes too late, the opening days run faster
  // and the time saved goes to the quiet days after it.
  const firstSlow = Math.min(...slow, fe);
  const before = quiet.filter((d) => d < firstSlow);
  const after = quiet.filter((d) => d > firstSlow);
  const prefix = before.reduce((a, d) => a + (ms.get(d) ?? 0), 0);
  if (prefix > OPENING_TARGET_MS && after.length) {
    for (const d of before) ms.set(d, ((ms.get(d) ?? 0) * OPENING_TARGET_MS) / prefix);
    fillCapped(after, weight, budget - OPENING_TARGET_MS, MAX_QUIET_MS, ms);
  }

  // --- Group quiet days into steps of at least MIN_STEP_MS. Day 0 and every slow
  // day are steps of their own; a group never crosses a slow day.
  const groups: Group[] = [];
  let acc = 0;
  const close = (d: number) => {
    const prev = groups[groups.length - 1];
    // A short group joins the quiet step just before it (contiguous, since slow days
    // are steps of their own); day 0 stays alone.
    if (acc < MIN_STEP_MS && prev && !prev.slow && prev.dayIndex !== 0 && prev.ms + acc <= MAX_QUIET_MS) {
      prev.dayIndex = d;
      prev.ms += acc;
    } else {
      groups.push({ dayIndex: d, ms: acc, slow: false });
    }
    acc = 0;
  };
  for (let d = 0; d < fe; d++) {
    if (slow.has(d)) {
      groups.push({ dayIndex: d, ms: SLOW_MS, slow: true });
      continue;
    }
    acc += ms.get(d) ?? 0;
    const nextBreaks = d + 1 >= fe || slow.has(d + 1);
    if (d === 0 || acc >= MIN_STEP_MS || nextBreaks) close(d);
  }

  // --- Floors, then give back any excess from quiet steps after the first slow step.
  for (const g of groups) if (!g.slow) g.ms = Math.max(g.ms, MIN_STEP_MS);
  for (let pass = 0; pass < 8; pass++) {
    const total = groups.reduce((a, g) => a + g.ms, 0);
    const excess = total - fallBudget;
    if (excess <= 0.5) break;
    const flexible = groups.filter((g) => !g.slow && g.dayIndex > firstSlow && g.ms > MIN_STEP_MS);
    const room = flexible.reduce((a, g) => a + (g.ms - MIN_STEP_MS), 0);
    if (room <= 0) break;
    const take = Math.min(1, excess / room);
    for (const g of flexible) g.ms -= (g.ms - MIN_STEP_MS) * take;
  }

  const steps: Step[] = groups.map((g) => ({
    dayIndex: g.dayIndex,
    holdMs: g.slow ? SLOW_MS : Math.min(MAX_QUIET_MS, Math.max(MIN_STEP_MS, Math.round(g.ms))),
    phase: 'fall',
    slow: g.slow,
  }));

  return appendForward(steps, run, fe);
}

/** Fast-forward: sample the days after the fall evenly, ending on the last day, sharing forwardBudgetFor(run). */
function appendForward(steps: Step[], run: RunData, fe: number): Step[] {
  const days = run.closes.length - fe;
  if (days > 0) {
    const fwd = forwardBudgetFor(run);
    const k = Math.min(days, Math.floor(fwd / MIN_STEP_MS));
    const base = Math.floor(fwd / k);
    const extra = fwd - base * k;
    for (let j = 1; j <= k; j++) {
      steps.push({
        dayIndex: fe - 1 + Math.ceil((j * days) / k),
        holdMs: base + (j <= extra ? 1 : 0),
        phase: 'forward',
        slow: false,
      });
    }
  }
  return steps;
}

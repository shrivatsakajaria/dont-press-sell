import type { Headline, RunData } from '../engine/types';

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

/** Time for the whole fall, slow steps included. SK may change it (checkpoint 2). */
export const FALL_BUDGET_MS = 37_000;
/**
 * Fall budget for the long falls (ruling R17: c1929 and c2000, whose falls run
 * past LONG_FALL_DAYS trading days); spec 7.4 lets them run to about 60 s in all.
 */
export const LONG_FALL_BUDGET_MS = 50_000;
/** A fall of more than this many trading days takes LONG_FALL_BUDGET_MS (only c1929 and c2000 today). */
export const LONG_FALL_DAYS = 500;
/**
 * Longest hold of an ordinary fall step (ruling R16), so slow days (800 ms) always
 * feel slower. Falls too short to fill the budget under this cap finish sooner.
 */
export const MAX_QUIET_MS = 700;
/** Time for the whole fast-forward. SK may change it (checkpoint 2); keep it within 7,000 to 8,000. */
export const FORWARD_BUDGET_MS = 7_500;
/** Hold of a slow-motion (big) day. */
export const SLOW_MS = 800;
/** The floor: the screen never changes more than eight times a second. */
export const MIN_STEP_MS = 125;
/** The first slow step must begin by this time. */
export const FIRST_SLOW_BY_MS = 10_000;
/** Most slow steps taken from the largest daily moves (big headline days count towards it). */
export const MAX_SLOW = 10;

/** Opening days are squeezed to begin the first slow step by this time (margin under 10 s for rounding and floors). */
const OPENING_TARGET_MS = 9_000;
/** Days in the trailing window that measures the recent swing. */
const SWING_WINDOW = 5;

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

  // --- Slow days: big headline days in the fall, then the largest moves up to MAX_SLOW.
  const slow = new Set<number>();
  for (const h of headlines) {
    if (h.big && Number.isInteger(h.dayIndex) && h.dayIndex >= 0 && h.dayIndex < fe) slow.add(h.dayIndex);
  }
  const byMove: number[] = [];
  for (let d = 1; d < fe; d++) if (!slow.has(d)) byMove.push(d);
  byMove.sort((a, b) => move(b) - move(a) || a - b);
  for (const d of byMove.slice(0, Math.max(0, MAX_SLOW - slow.size))) slow.add(d);

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

  // --- Fast-forward: sample the remaining days evenly, ending on the last day.
  const days = n - fe;
  if (days > 0) {
    const k = Math.min(days, Math.floor(FORWARD_BUDGET_MS / MIN_STEP_MS));
    const base = Math.floor(FORWARD_BUDGET_MS / k);
    const extra = FORWARD_BUDGET_MS - base * k;
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

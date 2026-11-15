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
  /** The hold while the player is in cash (quiet fall days run quicker, R35); holdMs when absent. */
  cashMs?: number;
}

/**
 * R54: a step is never more than MAX_STEP_RATIO times longer or shorter than the step before: into and
 * out of slow days, in or out of the market, into the fast-forward and into the end hold.
 */
export const MAX_STEP_RATIO = 2.2;
/** R35: a quiet step holds at most RAMP_UP times the step before (the climb into a slow day may use MAX_STEP_RATIO)... */
export const RAMP_UP = 1.6;
/** ...and at least RAMP_DOWN times it (R54: the slow-down out of a slow day takes the full ratio). */
export const RAMP_DOWN = 1 / MAX_STEP_RATIO;
/** One frame at 60 Hz. Every hold is a whole number of frames, so a day never alternates 7 and 8 frames (smooth #4). */
export const FRAME_MS = 1000 / 60;
/** The shortest step: 8 frames (133 ms), so the screen never changes more than eight times a second. */
export const MIN_STEP_FRAMES = 8;
/** R49: the last day stays on screen this long before the result (the play screen's end hold); the run brakes into it. */
export const END_HOLD_MS = 1_200;
/** R35: quiet fall days while the player is in cash hold this fraction of their usual time. */
export const CASH_FACTOR = 0.8;

/** ms rounded to whole frames: to the nearest, or up / down. */
function frames(ms: number, how: 'round' | 'ceil' | 'floor' = 'round'): number {
  const f = ms / FRAME_MS;
  const n = how === 'ceil' ? Math.ceil(f - 1e-9) : how === 'floor' ? Math.floor(f + 1e-9) : Math.round(f);
  return n * FRAME_MS;
}

/** How long a step holds for a player in the market (`invested`) or in cash. */
export function stepHold(step: Step, invested: boolean): number {
  return invested ? step.holdMs : step.cashMs ?? step.holdMs;
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

/**
 * The first step (day 1) of a quiet start holds at most this long, so a new game visibly starts at once
 * (a tap on the end screen used to sit on day 1 for up to 3 s before anything moved).
 */
export const FIRST_STEP_MAX_MS = 500;
/** A falling day of at least this much in the first FIRST_SLOW_BY_MS must reach a red (slow, falling) step. */
export const RED_FALL = 0.01;

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
function basePick(run: RunData, headlines: Headline[]): { truth: number[]; decoys: number[] } {
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

/** The run's own move on day d; day 0 uses the close before the run (preCloses), when the file has it. */
export function dayMove(run: RunData, d: number): number {
  if (d >= 1) return run.closes[d] / run.closes[d - 1] - 1;
  const pre = run.preCloses;
  return pre && pre.length ? run.closes[0] / pre[pre.length - 1] - 1 : 0;
}

/**
 * The slow-motion days (R20), plus the first-red-day rule: when a day falling RED_FALL or more is shown
 * in the first FIRST_SLOW_BY_MS and no slow falling (red) step is, the largest such fall from day 2 on
 * becomes slow (`promoted`), keeping at most MAX_SLOW slow steps and the decoy rules. Same run, same days.
 */
export function pickSlowDays(run: RunData, headlines: Headline[]): { truth: number[]; decoys: number[]; promoted: number[] } {
  const base = basePick(run, headlines);
  const fe = Math.min(Math.max(run.fallEndIndex, 1), run.closes.length);
  const steps = layoutFall(run, new Set([...base.truth, ...base.decoys]), fe);
  let t = 0;
  let lastDay = 0;
  let red = false;
  for (const st of steps) {
    if (t >= FIRST_SLOW_BY_MS) break;
    lastDay = st.dayIndex;
    // A slow step's previous step shows the day before it, so its colour follows the day's own move.
    if (st.slow && dayMove(run, st.dayIndex) < 0) red = true;
    t += st.holdMs;
  }
  if (red) return { ...base, promoted: [] };
  let best = -1;
  for (let d = 1; d <= lastDay && d < fe; d++) {
    if (dayMove(run, d) <= -RED_FALL && (best < 0 || dayMove(run, d) < dayMove(run, best))) best = d;
  }
  // No real fall in the opening (a shallow run): exempt. Also exempt when only day 1 fell that far.
  if (best < 0) return { ...base, promoted: [] };

  const big = new Set(headlines.filter((h) => h.big).map((h) => h.dayIndex));
  let decoys = base.decoys.filter((d) => Math.abs(d - best) > 1);
  let truth = base.truth.slice();
  const rising = (d: number) => run.closes[d] > run.closes[d - 1];
  while (truth.length + decoys.length + 1 > MAX_SLOW && decoys.length) {
    // Drop the latest decoy, keeping one rising and one falling while two or more remain.
    const r = decoys.filter(rising).length;
    const f = decoys.length - r;
    const pool = decoys.length > 2 ? decoys : decoys.filter((d) => (rising(d) ? r > 1 : f > 1));
    const drop = (pool.length ? pool : decoys)[(pool.length ? pool : decoys).length - 1];
    decoys = decoys.filter((d) => d !== drop);
  }
  while (truth.length + decoys.length + 1 > MAX_SLOW) {
    // The latest day that is only a big move; if every slow day is a big headline day, the latest of
    // those keeps its headline at ordinary speed (MAX_SLOW wins, by ruling).
    const drop = [...truth].reverse().find((d) => !big.has(d)) ?? truth[truth.length - 1];
    if (drop === undefined) break;
    truth = truth.filter((d) => d !== drop);
  }
  // Two decoys left must still be one rising and one falling.
  if (decoys.length === 2 && rising(decoys[0]) === rising(decoys[1])) decoys = decoys.slice(0, 1);
  return { truth, decoys, promoted: [best] };
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

  // --- Slow days: the true ones, the seeded decoys (R20) and the first red day.
  const picked = pickSlowDays(run, headlines);
  const slow = new Set<number>([...picked.truth, ...picked.decoys, ...picked.promoted]);
  return appendForward(layoutFall(run, slow, fe), run, fe);
}

/** The fall's steps for a set of slow days (days 0 .. fe - 1). */
function layoutFall(run: RunData, slow: Set<number>, fe: number): Step[] {
  const closes = run.closes;
  const move = (d: number) => (d >= 1 ? Math.abs(closes[d] / closes[d - 1] - 1) : 0);

  // --- A very short fall (R23): one step a day at fixed holds (a quiet day 1 is short: a prompt start).
  if (fe < SHORT_FALL_DAYS) {
    // R35: the quiet days after a quick day 1, and after each slow day, ramp gently to SHORT_QUIET_MS.
    const flags = Array.from({ length: fe }, (_, d) => slow.has(d));
    const holds = smooth(flags.map(() => SHORT_QUIET_MS), flags, SHORT_SLOW_MS);
    const cash = smooth(
      flags.map((_, d) => SHORT_QUIET_MS * (d === 0 ? 1 : CASH_FACTOR)), flags, SHORT_SLOW_MS,
    );
    return flags.map((isSlow, d) => {
      const step: Step = { dayIndex: d, holdMs: holds[d], phase: 'fall', slow: isSlow };
      if (cash[d] !== holds[d]) step.cashMs = cash[d];
      return step;
    });
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

  // --- Steps: every fall day is its own step (R35: one step, one trading day). Only a long fall
  // (over LONG_FALL_DAYS) that cannot fit its budget otherwise groups quiet days into steps of at
  // least MIN_STEP_MS; a group never crosses a slow day and day 0 stays alone.
  const group = fe > LONG_FALL_DAYS;
  const layout = (scale: number): Group[] => {
    const groups: Group[] = [];
    let acc = 0;
    const close = (d: number) => {
      const prev = groups[groups.length - 1];
      if (group && acc < MIN_STEP_MS && prev && !prev.slow && prev.dayIndex !== 0 && prev.ms + acc <= MAX_QUIET_MS) {
        prev.dayIndex = d;
        prev.ms += acc;
      } else groups.push({ dayIndex: d, ms: acc, slow: false });
      acc = 0;
    };
    for (let d = 0; d < fe; d++) {
      if (slow.has(d)) {
        groups.push({ dayIndex: d, ms: SLOW_MS, slow: true });
        continue;
      }
      acc += (ms.get(d) ?? 0) * scale;
      const nextBreaks = d + 1 >= fe || slow.has(d + 1);
      if (!group || d === 0 || acc >= MIN_STEP_MS || nextBreaks) close(d);
    }
    return groups;
  };
  const ideal = (g: Group, factor: number) =>
    g.slow ? SLOW_MS : Math.min(MAX_QUIET_MS, Math.max(MIN_STEP_MS, g.ms)) * factor;
  // The first step is always in the market (nobody has sold yet), so it keeps its hold in both.
  const holdsFor = (groups: Group[], factor: number) =>
    smooth(groups.map((g, i) => ideal(g, i === 0 ? 1 : factor)), groups.map((g) => g.slow));
  const total = (scale: number) => holdsFor(layout(scale), 1).reduce((a, x) => a + x, 0);

  // --- Smoothing (R35) adds time after and before slow days; shrink the quiet days until the fall
  // fits its budget again. A fall the caps cannot fill simply finishes sooner.
  let scale = 1;
  if (total(1) > fallBudget) {
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (total(mid) > fallBudget) hi = mid;
      else lo = mid;
    }
    scale = lo;
  }
  const groups = layout(scale);
  const holds = holdsFor(groups, 1);
  const cash = holdsFor(groups, CASH_FACTOR);
  return groups.map((g, i) => {
    const step: Step = { dayIndex: g.dayIndex, holdMs: holds[i], phase: 'fall', slow: g.slow };
    if (cash[i] !== holds[i]) step.cashMs = cash[i];
    return step;
  });
}

/**
 * R35, R54: steps change pace gradually. A pass from the first step keeps each quiet step between RAMP_DOWN
 * and RAMP_UP times the step before (so the steps after a slow day slow down step by step); a pass back from
 * the last makes every step at least 1 / MAX_STEP_RATIO of the step after it (so the steps before a slow day
 * climb into it). A quiet first step holds at most FIRST_STEP_MAX_MS unless the climb needs more. Every hold
 * is a whole number of frames, at least MIN_STEP_FRAMES.
 */
function smooth(ideal: number[], slow: boolean[], slowMs = SLOW_MS): number[] {
  const least = MIN_STEP_FRAMES * FRAME_MS;
  const out: number[] = [];
  for (let j = 0; j < ideal.length; j++) {
    if (slow[j]) {
      out.push(slowMs);
      continue;
    }
    let x = Math.max(least, frames(ideal[j]));
    if (j === 0) x = Math.max(least, Math.min(x, frames(FIRST_STEP_MAX_MS, 'floor')));
    else {
      const prev = out[j - 1];
      x = Math.min(Math.max(x, frames(RAMP_DOWN * prev, 'ceil')), Math.max(least, frames(RAMP_UP * prev, 'floor')));
    }
    out.push(x);
  }
  for (let j = out.length - 2; j >= 0; j--) {
    if (!slow[j]) out[j] = Math.max(out[j], frames(out[j + 1] / MAX_STEP_RATIO, 'ceil'));
  }
  return out;
}

/**
 * Fast-forward: sample the days after the fall evenly, ending on the last day, sharing forwardBudgetFor(run)
 * (to the frame). R35, R54: the first forward steps slow down gently from the last fall step (each at least
 * RAMP_DOWN times the one before), the last ones brake into the END_HOLD_MS end hold (the last at least
 * END_HOLD_MS / MAX_STEP_RATIO, each before it at least 1 / RAMP_UP of the next), and the rest share what is
 * left; fewer steps are used when the ramps need it. Whole frames.
 */
function appendForward(steps: Step[], run: RunData, fe: number): Step[] {
  const days = run.closes.length - fe;
  if (days <= 0) return steps;
  const budget = Math.round(forwardBudgetFor(run) / FRAME_MS);
  const last = steps.length ? steps[steps.length - 1].holdMs / FRAME_MS : MIN_STEP_FRAMES;
  /** k steps in frames around a flat base of `base` frames. */
  const shape = (k: number, base: number) => {
    const out: number[] = [];
    let ramp = last;
    for (let j = 0; j < k; j++) {
      ramp = Math.ceil(ramp * RAMP_DOWN - 1e-9);
      out.push(Math.max(base, ramp));
    }
    let brake = Math.ceil(END_HOLD_MS / MAX_STEP_RATIO / FRAME_MS - 1e-9);
    for (let j = k - 1; j >= 0; j--) {
      out[j] = Math.max(out[j], brake);
      brake = Math.ceil(out[j] / RAMP_UP - 1e-9);
    }
    return out;
  };
  const sumOf = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
  let k = Math.min(days, Math.floor(budget / MIN_STEP_FRAMES));
  while (k > 1 && sumOf(shape(k, MIN_STEP_FRAMES)) > budget) k--;
  // The largest flat base that fits; the frames left over go one at a time to the flat steps, from the middle out.
  let base = MIN_STEP_FRAMES;
  while (sumOf(shape(k, base + 1)) <= budget) base++;
  const n = shape(k, base);
  const flat = n.map((_, j) => j).filter((j) => n[j] === base);
  flat.sort((a, b) => Math.abs(a - (k - 1) / 2) - Math.abs(b - (k - 1) / 2) || a - b);
  let left = budget - sumOf(n);
  for (let r = 0; left > 0 && flat.length; r = (r + 1) % flat.length, left--) n[flat[r]]++;
  for (let j = 1; j <= k; j++) {
    steps.push({
      dayIndex: fe - 1 + Math.ceil((j * days) / k),
      holdMs: n[j - 1] * FRAME_MS,
      phase: 'forward',
      slow: false,
    });
  }
  return steps;
}

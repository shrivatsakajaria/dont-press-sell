import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Headline, RunData } from '../../src/engine/types';
import {
  FALL_BUDGET_MS,
  FORWARD_BUDGET_MS,
  LONG_FALL_BUDGET_MS,
  MAX_QUIET_MS,
  SLOW_MS,
  DECOYS,
  MAX_SLOW,
  MAX_TRUE_SLOW,
  LONG_FALL_DAYS,
  SHORT_FALL_DAYS,
  SHORT_FORWARD_MS_PER_DAY,
  SHORT_FORWARD_MIN_MS,
  SHORT_QUIET_MS,
  SHORT_SLOW_MS,
  FIRST_SLOW_BY_MS,
  FIRST_STEP_MAX_MS,
  fallBudgetFor,
  forwardBudgetFor,
  slowCountsFor,
  pickSlowDays,
  buildSchedule,
  stepHold,
  CASH_FACTOR,
  RAMP_DOWN,
  MAX_STEP_RATIO,
  FRAME_MS,
  MIN_STEP_FRAMES,
  END_HOLD_MS,
  type Step,
} from '../../src/game/schedule';
import { parseHeadlineRows, toHeadlines } from '../../scripts/lib/headlines';

const DIR = join(__dirname, '../../data/runs');
const runs: RunData[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.prices.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as RunData);

const sum = (steps: Step[]) => steps.reduce((a, s) => a + s.holdMs, 0);
// Run classes come from rules, never from ids (R22).
/** Long falls take the long-fall budget (R17). */
const isLong = (run: RunData) => run.fallEndIndex > LONG_FALL_DAYS;
/** Very short falls (R22): fewer slow days, a shorter fast-forward, no time band. */
const isShortFall = (run: RunData) => run.fallEndIndex < SHORT_FALL_DAYS;
/** Falls the 700 ms cap stops from filling their budget (R16): they finish sooner. */
function isCapped(run: RunData): boolean {
  const { truth, decoys } = pickSlowDays(run, []);
  const slow = truth.length + decoys.length;
  return slow * SLOW_MS + (run.fallEndIndex - slow) * MAX_QUIET_MS < fallBudgetFor(run);
}

/** The ten largest absolute daily moves among the fall days (days 1 .. fallEndIndex - 1). */
function topMoves(run: RunData, count: number): number[] {
  const moves: { d: number; m: number }[] = [];
  for (let d = 1; d < run.fallEndIndex; d++) {
    moves.push({ d, m: Math.abs(run.closes[d] / run.closes[d - 1] - 1) });
  }
  return moves
    .sort((a, b) => b.m - a.m)
    .slice(0, count)
    .map((x) => x.d)
    .sort((a, b) => a - b);
}

const absMove = (run: RunData, d: number) => Math.abs(run.closes[d] / run.closes[d - 1] - 1);

/** R20 decoy rules, checked from the outside. */
function checkDecoys(run: RunData, slow: number[], decoys: number[]) {
  const moves: number[] = [];
  for (let d = 1; d < run.fallEndIndex; d++) moves.push(absMove(run, d));
  moves.sort((a, b) => a - b);
  const p50 = moves[Math.floor(0.5 * (moves.length - 1))];
  const p85 = moves[Math.floor(0.85 * (moves.length - 1))];
  const all = new Set(slow);
  for (const d of decoys) {
    expect(all.has(d)).toBe(true);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThan(run.fallEndIndex);
    expect(absMove(run, d)).toBeGreaterThanOrEqual(p50);
    expect(absMove(run, d)).toBeLessThanOrEqual(p85);
    expect(all.has(d - 1)).toBe(false); // never next to another slow day
    expect(all.has(d + 1)).toBe(false);
  }
  if (decoys.length >= 2) {
    const rising = decoys.filter((d) => run.closes[d] > run.closes[d - 1]);
    expect(rising.length).toBeGreaterThanOrEqual(1);
    expect(decoys.length - rising.length).toBeGreaterThanOrEqual(1);
  }
}

describe('buildSchedule on every real run (no headlines)', () => {
  it('has all twelve runs', () => {
    expect(runs.length).toBe(12);
  });

  it('keeps the budgets as named constants', () => {
    // R27: a game lasts about 120 s.
    expect(SLOW_MS).toBe(3000);
    expect(MAX_QUIET_MS).toBe(1500);
    expect(SHORT_QUIET_MS).toBe(3000);
    expect(SHORT_SLOW_MS).toBe(4000);
    expect(SHORT_FORWARD_MIN_MS).toBe(5000);
    expect(SHORT_FORWARD_MS_PER_DAY).toBe(400);
    expect(FALL_BUDGET_MS).toBe(108_000);
    expect(LONG_FALL_BUDGET_MS).toBe(130_000);
    expect(FORWARD_BUDGET_MS).toBe(10_000);
    expect(FIRST_SLOW_BY_MS).toBe(15_000);
  });

  it('scales slow-day counts to short falls and keeps 7 + 3 from 28 fall days on (R22)', () => {
    expect(slowCountsFor(28)).toEqual({ truth: MAX_TRUE_SLOW, decoys: DECOYS });
    expect(slowCountsFor(500)).toEqual({ truth: MAX_TRUE_SLOW, decoys: DECOYS });
    expect(slowCountsFor(7)).toEqual({ truth: 1, decoys: 0 });
    expect(slowCountsFor(8)).toEqual({ truth: 2, decoys: 1 });
    expect(slowCountsFor(1)).toEqual({ truth: 1, decoys: 0 });
  });

  it('the long-fall budget goes to c1929 and c2000, the only falls over LONG_FALL_DAYS (R17)', () => {
    const long = runs.filter(isLong).map((r) => r.id);
    expect(long).toEqual(['c1929', 'c2000']);
  });

  for (const run of runs) {
    describe(run.id, () => {
      const steps = buildSchedule(run, []);

      it('day indexes strictly increase, start on day 0 and end on the last day', () => {
        expect(steps[0].dayIndex).toBe(0);
        for (let i = 1; i < steps.length; i++) {
          expect(steps[i].dayIndex).toBeGreaterThan(steps[i - 1].dayIndex);
        }
        expect(steps[steps.length - 1].dayIndex).toBe(run.closes.length - 1);
      });

      it('never holds a step under 125 ms (at most eight changes a second)', () => {
        for (const s of steps) expect(s.holdMs).toBeGreaterThanOrEqual(125);
      });

      it('uses the long-fall budget for long falls only (R17)', () => {
        expect(fallBudgetFor(run)).toBe(isLong(run) ? LONG_FALL_BUDGET_MS : FALL_BUDGET_MS);
      });

      it('ordinary fall steps: at most 1,500 ms (3,000 ms in a short fall), or a ramp down from a slow day (R27, R35); a quiet day 1 is short', () => {
        steps.forEach((s, i) => {
          if (s.phase !== 'fall' || s.slow) return;
          if (i === 0) {
            const climb = Math.ceil(steps[1].holdMs / MAX_STEP_RATIO / FRAME_MS - 1e-9) * FRAME_MS;
            expect(s.holdMs).toBeLessThanOrEqual(Math.max(FIRST_STEP_MAX_MS, climb) + 1e-6);
          } else {
            const cap = isShortFall(run) ? SHORT_QUIET_MS : MAX_QUIET_MS;
            expect(s.holdMs).toBeLessThanOrEqual(Math.max(cap, Math.ceil(RAMP_DOWN * steps[i - 1].holdMs) + 1));
          }
        });
      });

      it('every slow step holds longer than every ordinary fall step', () => {
        const fall = steps.filter((s) => s.phase === 'fall');
        const slowMin = Math.min(...fall.filter((s) => s.slow).map((s) => s.holdMs));
        const quietMax = Math.max(...fall.filter((s) => !s.slow).map((s) => s.holdMs));
        expect(slowMin).toBeGreaterThan(quietMax);
      });

      it('marks the phase by the fall end', () => {
        for (const s of steps) {
          expect(s.phase).toBe(s.dayIndex < run.fallEndIndex ? 'fall' : 'forward');
        }
      });

      it('slow steps are 3,000 ms (4,000 ms in a short fall), in the fall: the largest moves plus seeded decoys (R20, R22, R23)', () => {
        const slow = steps.filter((s) => s.slow);
        for (const s of slow) {
          expect(s.holdMs).toBe(isShortFall(run) ? SHORT_SLOW_MS : SLOW_MS);
          expect(s.phase).toBe('fall');
        }
        const days = slow.map((s) => s.dayIndex);
        const want = slowCountsFor(run.fallEndIndex);
        expect(days.length).toBeLessThanOrEqual(MAX_SLOW);
        const truth = topMoves(run, want.truth);
        for (const d of truth) expect(days).toContain(d);
        const { truth: t, decoys, promoted } = pickSlowDays(run, []);
        expect(t).toEqual(truth);
        expect(decoys.length).toBeLessThanOrEqual(want.decoys);
        expect(promoted.length).toBeLessThanOrEqual(1);
        if (!isShortFall(run) && !promoted.length) {
          expect(days.length).toBe(MAX_SLOW);
          expect(decoys.length).toBe(DECOYS);
        } else if (!isShortFall(run)) {
          // A first red day promoted into the opening takes a decoy's place (and its neighbours').
          expect(days.length).toBeGreaterThanOrEqual(MAX_SLOW - 2);
          expect(decoys.length + promoted.length).toBeLessThanOrEqual(DECOYS);
        }
        expect([...t, ...decoys, ...promoted].sort((a, b) => a - b)).toEqual(days);
        checkDecoys(run, days, decoys);
      });

      it('decoys are the same every time for the same run (seeded by its id)', () => {
        expect(buildSchedule(run, [])).toEqual(steps);
        expect(pickSlowDays(run, []).decoys).toEqual(pickSlowDays(run, []).decoys);
      });

      it('the first slow step begins within 15,000 ms (R27, relaxed from 10 s)', () => {
        const first = steps.findIndex((s) => s.slow);
        expect(first).toBeGreaterThan(-1);
        expect(sum(steps.slice(0, first))).toBeLessThanOrEqual(15_000);
      });

      it('the forward phase totals 10,000 ms; after a short fall max(5,000, 400 ms a day) up to 10,000 (R27)', () => {
        const fwd = sum(steps.filter((s) => s.phase === 'forward'));
        const days = run.closes.length - run.fallEndIndex;
        // Whole frames: within one frame of the budget.
        expect(Math.abs(fwd - forwardBudgetFor(run))).toBeLessThanOrEqual(FRAME_MS);
        if (isShortFall(run)) {
          expect(forwardBudgetFor(run)).toBe(Math.min(FORWARD_BUDGET_MS, Math.max(SHORT_FORWARD_MIN_MS, days * SHORT_FORWARD_MS_PER_DAY)));
        } else {
          expect(forwardBudgetFor(run)).toBe(10_000);
        }
      });

      it('the whole run fits the time budget', () => {
        const total = sum(steps);
        // R27: ceiling 150 s (long falls run about 140 s).
        expect(total).toBeLessThanOrEqual(150_000);
        // A very short run simply finishes sooner (R22, R27): at least 25 s, less a short quiet day 1 and
        // the gentle ramp from it up to the 3 s days (R35: 800, 1,280, 2,048 ms in place of 3,000 each).
        if (isShortFall(run)) {
          expect(total).toBeGreaterThanOrEqual(25_000 - (SHORT_QUIET_MS - FIRST_STEP_MAX_MS) - (3 * SHORT_QUIET_MS - 800 - 1280 - 2048));
          return;
        }
        // A fall the 1,500 ms cap cannot fill finishes sooner too: at least 60 s.
        expect(total).toBeGreaterThanOrEqual(isCapped(run) ? 60_000 : 115_000);
        if (isLong(run)) {
          expect(total).toBeGreaterThanOrEqual(135_000);
          expect(total).toBeLessThanOrEqual(145_000);
        } else if (!isCapped(run)) {
          // R27 target band for normal runs.
          expect(total).toBeGreaterThanOrEqual(115_000);
          expect(total).toBeLessThanOrEqual(125_000);
        }
      });
    });
  }
});

describe('buildSchedule with headlines', () => {
  /** Synthetic run: a gentle zigzag fall with one huge move, then a recovery. */
  function synthetic(): RunData {
    const closes: number[] = [100];
    for (let i = 1; i < 120; i++) {
      const prev = closes[i - 1];
      const move = i === 30 ? -0.09 : i % 2 ? -0.004 - (i % 7) * 0.001 : 0.002 + (i % 5) * 0.001;
      closes.push(prev * (1 + move));
    }
    for (let i = 0; i < 80; i++) closes.push(closes[closes.length - 1] * 1.006);
    return {
      id: 'x',
      kind: 'crash',
      pickName: 'x',
      revealLine: 'x',
      dates: closes.map((_, i) => `d${i}`),
      closes,
      lowIndex: 119,
      fallEndIndex: 140,
    };
  }
  const h = (dayIndex: number, big: boolean): Headline => ({
    dayIndex,
    real: 'r',
    anon: 'a',
    big,
    sombre: false,
  });

  it('the decoy seed is the run id: another id can pick other decoys', () => {
    const differs = runs.some((r) => {
      const a = pickSlowDays(r, []).decoys;
      const b = pickSlowDays({ ...r, id: r.id + '-other' }, []).decoys;
      return a.join() !== b.join();
    });
    expect(differs).toBe(true);
  });

  it('turns big headline days in the fall into slow steps, up to ten slow steps in all', () => {
    const run = synthetic();
    const headlines = [h(5, true), h(12, true), h(10, false), h(160, true)];
    const steps = buildSchedule(run, headlines);
    const slow = steps.filter((s) => s.slow).map((s) => s.dayIndex);
    expect(slow).toContain(5);
    expect(slow).toContain(12);
    expect(slow).toContain(30); // the largest move
    expect(slow).not.toContain(10); // not a big headline, and a small move
    expect(slow).not.toContain(160); // no slow motion in the fast-forward
    expect(slow.length).toBe(10);
    const { truth, decoys } = pickSlowDays(run, headlines);
    expect(new Set(truth)).toEqual(new Set([5, 12, ...topMovesExcluding(run, [5, 12], 5)]));
    expect(decoys.length).toBe(3);
    checkDecoys(run, slow, decoys);
  });

  // Edge case beyond R20's wording: big headline days are never dropped, so more
  // than ten of them gives more than ten slow steps and no decoys.
  it('keeps every big headline day slow even when there are more than ten (and adds no decoys)', () => {
    const run = synthetic();
    const days = [3, 6, 9, 15, 18, 21, 24, 27, 33, 36, 39, 42];
    const steps = buildSchedule(run, days.map((d) => h(d, true)));
    const slow = steps.filter((s) => s.slow).map((s) => s.dayIndex);
    expect(slow).toEqual(days);
  });

  function topMovesExcluding(run: RunData, exclude: number[], count: number): number[] {
    const moves: { d: number; m: number }[] = [];
    for (let d = 1; d < run.fallEndIndex; d++) {
      if (exclude.includes(d)) continue;
      moves.push({ d, m: Math.abs(run.closes[d] / run.closes[d - 1] - 1) });
    }
    return moves
      .sort((a, b) => b.m - a.m)
      .slice(0, count)
      .map((x) => x.d);
  }
});

describe('buildSchedule with the real headline files (R22)', () => {
  for (const run of runs) {
    const file = join(DIR, `${run.id}.headlines.csv`);
    if (!existsSync(file)) continue;
    const headlines = toHeadlines(parseHeadlineRows(readFileSync(file, 'utf8')).rows, run);
    it(`${run.id}: big days in the fall are slow, at most ten slow steps, first slow within 15 s, cap kept`, () => {
      const steps = buildSchedule(run, headlines);
      const slow = steps.filter((s) => s.slow).map((s) => s.dayIndex);
      const bigDays = headlines.filter((h) => h.big && h.dayIndex < run.fallEndIndex).map((h) => h.dayIndex);
      const notSlow = bigDays.filter((d) => !slow.includes(d));
      // Every big day is slow, except that a first red day promoted into a full set of ten big days
      // takes the place of the latest of them (MAX_SLOW wins).
      if (pickSlowDays(run, headlines).promoted.length && bigDays.length >= MAX_SLOW) {
        expect(notSlow).toEqual([Math.max(...bigDays.filter((d) => d !== pickSlowDays(run, headlines).promoted[0]))]);
      } else expect(notSlow).toEqual([]);
      expect(slow.length).toBeLessThanOrEqual(MAX_SLOW);
      const first = steps.findIndex((s) => s.slow);
      expect(sum(steps.slice(0, first))).toBeLessThanOrEqual(FIRST_SLOW_BY_MS);
      const quietCap = run.fallEndIndex < SHORT_FALL_DAYS ? SHORT_QUIET_MS : MAX_QUIET_MS;
      steps.forEach((s, i) => {
        if (s.phase === 'fall' && !s.slow && i > 0) {
          expect(s.holdMs).toBeLessThanOrEqual(Math.max(quietCap, Math.ceil(RAMP_DOWN * steps[i - 1].holdMs) + 1));
        }
      });
      expect(sum(steps)).toBeLessThanOrEqual(150_000);
    });
  }
});

/** The close before day 1 (preCloses in the run file), for day 1's own move. */
const preClose = (run: RunData) => {
  const pre = (run as RunData & { preCloses?: number[] }).preCloses;
  return pre && pre.length ? pre[pre.length - 1] : undefined;
};
const dayMove = (run: RunData, d: number) => {
  if (d >= 1) return run.closes[d] / run.closes[d - 1] - 1;
  const p = preClose(run);
  return p === undefined ? 0 : run.closes[0] / p - 1;
};

describe('first red day and a prompt start, on every run with its real headlines', () => {
  for (const run of runs) {
    const file = join(DIR, `${run.id}.headlines.csv`);
    const headlines = existsSync(file) ? toHeadlines(parseHeadlineRows(readFileSync(file, 'utf8')).rows, run) : [];
    const steps = buildSchedule(run, headlines);
    const starts: number[] = [];
    steps.reduce((t, s) => (starts.push(t), t + s.holdMs), 0);

    it(`${run.id}: a quiet day 1 holds at most ${FIRST_STEP_MAX_MS} ms (or the least the R54 climb into a slow day 2 needs), so a new game visibly starts at once`, () => {
      const climb = steps.length > 1 ? Math.ceil(steps[1].holdMs / MAX_STEP_RATIO / FRAME_MS - 1e-9) * FRAME_MS : 0;
      if (!steps[0].slow) expect(steps[0].holdMs).toBeLessThanOrEqual(Math.max(FIRST_STEP_MAX_MS, climb) + 1e-6);
    });

    it(`${run.id}: a falling day of 1% or more in the first 15 s means a red (slow, falling) step in them`, () => {
      const inWindow = steps.map((_, i) => i).filter((i) => starts[i] < FIRST_SLOW_BY_MS);
      const lastDay = steps[inWindow[inWindow.length - 1]].dayIndex;
      const bigFall = Array.from({ length: lastDay + 1 }, (_, d) => d).some((d) => dayMove(run, d) <= -0.01);
      // A slow step's previous step is the day before it, so red = slow and below the day before.
      const red = inWindow.some((i) => steps[i].slow && dayMove(run, steps[i].dayIndex) < 0);
      if (bigFall) expect(red).toBe(true);
      const slow = steps.filter((s) => s.slow).map((s) => s.dayIndex);
      expect(slow.length).toBeLessThanOrEqual(MAX_SLOW);
      const { decoys } = pickSlowDays(run, headlines);
      checkDecoys(run, slow, decoys);
    });
  }
});

describe('smooth pacing (R35): one step a day, gradual changes, quicker quiet days in cash', () => {
  for (const run of runs) {
    const file = join(DIR, `${run.id}.headlines.csv`);
    const headlines = existsSync(file) ? toHeadlines(parseHeadlineRows(readFileSync(file, 'utf8')).rows, run) : [];
    const steps = buildSchedule(run, headlines);
    /** The holds a player sees who stays in the market, or who is in cash from step 1 on. */
    const inMarket = steps.map((s) => stepHold(s, true));
    const inCash = steps.map((s, i) => stepHold(s, i === 0));

    for (const [name, holds] of [['in the market', inMarket], ['in cash', inCash]] as const) {
      it(`${run.id} ${name}: no step under RAMP_DOWN x the step before (the slow-down out of a slow day is gradual)`, () => {
        for (let i = 1; i < steps.length; i++) {
          const r = `step ${i} (day ${steps[i].dayIndex}): ${holds[i - 1]} -> ${holds[i]}`;
          expect(holds[i], r).toBeGreaterThanOrEqual(RAMP_DOWN * holds[i - 1] - 1e-6);
        }
      });

      it(`${run.id} ${name}: the steps before a slow day climb into it (each at least 1 / ${MAX_STEP_RATIO} of the next)`, () => {
        for (let i = 1; i < steps.length; i++) {
          if (!steps[i].slow || steps[i - 1].slow) continue;
          expect(holds[i - 1], `before slow step ${i}`).toBeGreaterThanOrEqual(holds[i] / MAX_STEP_RATIO - 1e-6);
          if (i >= 2 && !steps[i - 2].slow) expect(holds[i - 2]).toBeGreaterThanOrEqual(holds[i - 1] / MAX_STEP_RATIO - 1e-6);
        }
      });
    }

    it(`${run.id}: R54, every step is at most ${MAX_STEP_RATIO}x longer or shorter than the one before, into and out of slow days, in or out of the market, across a trade and into the fast-forward and the end hold`, () => {
      expect(MAX_STEP_RATIO).toBe(2.2);
      for (let i = 1; i < steps.length; i++) {
        for (const a of [true, false]) {
          for (const b of [true, false]) {
            const x = stepHold(steps[i - 1], a);
            const y = stepHold(steps[i], b);
            const r = `step ${i} (day ${steps[i].dayIndex}): ${x.toFixed(1)} -> ${y.toFixed(1)}`;
            expect(Math.max(x / y, y / x), r).toBeLessThanOrEqual(MAX_STEP_RATIO + 1e-9);
          }
        }
      }
      // The run brakes into the 1.2 s end hold (R49) rather than hitting it from a 125 ms step.
      expect(steps[steps.length - 1].holdMs * MAX_STEP_RATIO).toBeGreaterThanOrEqual(END_HOLD_MS - 1e-6);
    });

    it(`${run.id}: every hold is a whole number of 60 Hz frames, at least ${MIN_STEP_FRAMES} of them (smooth #4)`, () => {
      for (const s of steps) {
        for (const ms of [s.holdMs, stepHold(s, false)]) {
          const frames = ms / FRAME_MS;
          expect(Math.abs(frames - Math.round(frames)), `${ms} ms`).toBeLessThan(1e-6);
          expect(Math.round(frames)).toBeGreaterThanOrEqual(MIN_STEP_FRAMES);
        }
      }
    });

    it(`${run.id}: quiet fall days in cash run about 20% quicker; slow days and the fast-forward do not change`, () => {
      expect(CASH_FACTOR).toBe(0.8);
      steps.forEach((s, i) => {
        const c = stepHold(s, false);
        expect(c).toBeLessThanOrEqual(s.holdMs);
        expect(c).toBeGreaterThanOrEqual(125);
        if (s.slow || s.phase === 'forward' || i === 0) expect(c).toBe(s.holdMs);
      });
      // In all, about 20% off the quiet days, less what the 125 ms floor and the gentle slow-down after
      // slow days hold up. Falls pinned near the floor (quiet steps averaging 250 ms or less) are exempt. R54: the climb into each slow day is the same in cash (it is set by the 3 s day), so allow 0.93.
      const quiet = steps.map((_, i) => i).filter((i) => i > 0 && !steps[i].slow && steps[i].phase === 'fall');
      const usual = quiet.reduce((a, i) => a + steps[i].holdMs, 0);
      const cash = quiet.reduce((a, i) => a + stepHold(steps[i], false), 0);
      if (quiet.length && usual / quiet.length > 250) {
        expect(cash / usual).toBeLessThan(0.93);
        expect(cash / usual).toBeGreaterThanOrEqual(CASH_FACTOR - 0.01);
      }
      // Never quicker than 80% of the usual hold, except where the gentle ramp (R35) carries it.
      quiet.forEach((i) => {
        const c = stepHold(steps[i], false);
        expect(c, `step ${i}`).toBeGreaterThanOrEqual(Math.min(CASH_FACTOR * steps[i].holdMs, RAMP_DOWN * inCash[i - 1]) - 1);
      });
    });

    it(`${run.id}: every fall day is its own step except where the long fall cannot fit (one step = one trading day)`, () => {
      const fall = steps.filter((s) => s.phase === 'fall');
      if (run.fallEndIndex <= LONG_FALL_DAYS) {
        // Falls up to 500 days: one step a day, every day.
        expect(fall.length).toBe(run.fallEndIndex);
      }
    });
  }
});

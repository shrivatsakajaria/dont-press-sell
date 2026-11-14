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
  fallBudgetFor,
  forwardBudgetFor,
  slowCountsFor,
  pickSlowDays,
  buildSchedule,
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
    expect(SLOW_MS).toBe(800);
    expect(MAX_QUIET_MS).toBe(700);
    expect(FALL_BUDGET_MS).toBeGreaterThan(0);
    expect(LONG_FALL_BUDGET_MS).toBe(50_000);
    expect(FORWARD_BUDGET_MS).toBeGreaterThanOrEqual(7000);
    expect(FORWARD_BUDGET_MS).toBeLessThanOrEqual(8000);
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

      it('an ordinary fall step never holds longer than 700 ms, so slow days feel slower (R16)', () => {
        for (const s of steps) if (s.phase === 'fall' && !s.slow) expect(s.holdMs).toBeLessThanOrEqual(MAX_QUIET_MS);
      });

      it('marks the phase by the fall end', () => {
        for (const s of steps) {
          expect(s.phase).toBe(s.dayIndex < run.fallEndIndex ? 'fall' : 'forward');
        }
      });

      it('slow steps are 800 ms, in the fall: the largest daily moves plus seeded decoys (R20, R22)', () => {
        const slow = steps.filter((s) => s.slow);
        for (const s of slow) {
          expect(s.holdMs).toBe(800);
          expect(s.phase).toBe('fall');
        }
        const days = slow.map((s) => s.dayIndex);
        const want = slowCountsFor(run.fallEndIndex);
        expect(days.length).toBeLessThanOrEqual(MAX_SLOW);
        const truth = topMoves(run, want.truth);
        for (const d of truth) expect(days).toContain(d);
        const { truth: t, decoys } = pickSlowDays(run, []);
        expect(t).toEqual(truth);
        expect(decoys.length).toBeLessThanOrEqual(want.decoys);
        if (!isShortFall(run)) {
          expect(days.length).toBe(MAX_SLOW);
          expect(decoys.length).toBe(DECOYS);
        }
        expect([...t, ...decoys].sort((a, b) => a - b)).toEqual(days);
        checkDecoys(run, days, decoys);
      });

      it('decoys are the same every time for the same run (seeded by its id)', () => {
        expect(buildSchedule(run, [])).toEqual(steps);
        expect(pickSlowDays(run, []).decoys).toEqual(pickSlowDays(run, []).decoys);
      });

      it('the first slow step begins within 10,000 ms', () => {
        const first = steps.findIndex((s) => s.slow);
        expect(first).toBeGreaterThan(-1);
        expect(sum(steps.slice(0, first))).toBeLessThanOrEqual(10_000);
      });

      it('the forward phase totals 7,000 to 8,000 ms; a short fall gets 250 ms a day up to that (R22)', () => {
        const fwd = sum(steps.filter((s) => s.phase === 'forward'));
        const days = run.closes.length - run.fallEndIndex;
        expect(fwd).toBe(forwardBudgetFor(run));
        if (isShortFall(run)) {
          expect(fwd).toBe(Math.min(FORWARD_BUDGET_MS, days * SHORT_FORWARD_MS_PER_DAY));
        } else {
          expect(fwd).toBeGreaterThanOrEqual(7000);
          expect(fwd).toBeLessThanOrEqual(8000);
        }
      });

      it('the whole run fits the time budget', () => {
        const total = sum(steps);
        expect(total).toBeLessThanOrEqual(60_000);
        if (isShortFall(run)) return; // a very short run simply finishes sooner (R22)
        expect(total).toBeGreaterThanOrEqual(isCapped(run) ? 25_000 : 40_000);
        // The brief's band, for every run that is neither a long fall (R17) nor shortened by the 700 ms cap (R16).
        if (!isLong(run) && !isCapped(run)) {
          expect(total).toBeGreaterThanOrEqual(43_000);
          expect(total).toBeLessThanOrEqual(48_000);
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
    it(`${run.id}: big days in the fall are slow, at most ten slow steps, first slow within 10 s, cap kept`, () => {
      const steps = buildSchedule(run, headlines);
      const slow = steps.filter((s) => s.slow).map((s) => s.dayIndex);
      for (const h of headlines) if (h.big && h.dayIndex < run.fallEndIndex) expect(slow).toContain(h.dayIndex);
      expect(slow.length).toBeLessThanOrEqual(MAX_SLOW);
      const first = steps.findIndex((s) => s.slow);
      expect(sum(steps.slice(0, first))).toBeLessThanOrEqual(10_000);
      for (const s of steps) if (s.phase === 'fall' && !s.slow) expect(s.holdMs).toBeLessThanOrEqual(MAX_QUIET_MS);
      expect(sum(steps)).toBeLessThanOrEqual(60_000);
    });
  }
});

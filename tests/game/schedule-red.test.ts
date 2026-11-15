import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Headline, RunData } from '../../src/engine/types';
import { buildSchedule, dayMove, FIRST_SLOW_BY_MS, type Step } from '../../src/game/schedule';
import { RED_FALL } from '../../src/ui/screen';

/**
 * R59: the first red moment (a slow step falling RED_FALL or more against the step before, which is what the
 * play screen paints red, R55) starts within 15 s of Start in every game, on the planned times. A run with no
 * fall day of 2% or more early enough for the schedule to reach is exempt (reported to the lead: s2014).
 */
const DIR = join(__dirname, '../../data/runs');
const runs: RunData[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.prices.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as RunData);
const headlinesOf = (run: RunData) =>
  JSON.parse(readFileSync(join(DIR, `${run.id}.headlines.json`), 'utf8')) as Headline[];

/** The screen's rule (src/ui/screen.ts screenModel): slow, and the close fell RED_FALL or more since the step before. */
function firstRed(run: RunData, steps: Step[]): { index: number; startMs: number } | null {
  let t = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const pre = run.preCloses;
    const before = i > 0 ? run.closes[steps[i - 1].dayIndex] : pre && pre.length ? pre[pre.length - 1] : NaN;
    const fall = before > 0 ? 1 - run.closes[s.dayIndex] / before : 0;
    if (s.slow && fall >= RED_FALL - 1e-9) return { index: s.dayIndex, startMs: t };
    t += s.holdMs;
  }
  return null;
}

/** Fall days the opening can reach at one quick step a day: the first 60 days. */
const REACH_DAYS = 60;

describe('R59: the first red moment lands within 15 s of Start, on every run with its real headlines', () => {
  it('has all twelve runs', () => expect(runs.length).toBe(12));
  for (const run of runs) {
    const steps = buildSchedule(run, headlinesOf(run));
    const reachable = Array.from({ length: Math.min(run.fallEndIndex, REACH_DAYS) }, (_, d) => d).some(
      (d) => dayMove(run, d) <= -RED_FALL + 1e-9,
    );
    it(`${run.id}: ${reachable ? 'a red step starts by 15,000 ms' : 'no 2% fall in reach (exempt, reported)'}`, () => {
      if (!reachable) {
        expect(run.id).toBe('s2014');
        return;
      }
      const red = firstRed(run, steps);
      expect(red).not.toBeNull();
      expect(red!.startMs).toBeLessThanOrEqual(FIRST_SLOW_BY_MS);
    });
  }
});

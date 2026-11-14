import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import type { RunData } from '../../src/engine/types';

// Spec section 13: three lazy strategies across the whole pool.
const DIR = join(__dirname, '../../data/runs');
const runs: RunData[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.prices.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as RunData);

describe('lazy strategies over all twelve real runs', () => {
  it('covers twelve runs', () => {
    expect(runs.length).toBe(12);
  });

  // KNOWN BUG, reported to the lead (not this lane's file): simulate() computes the
  // holder as start * last / first but the player as (start / first) * last, so a
  // player who never sells gets a lead of +/-1.8e-12 on c1987 and s2010, and
  // `lead > 0` (streak, record, verdict) counts doing nothing as a win on c1987.
  // When simulate is fixed this marker fails: change it to a plain `it`.
  it.fails('never selling scores exactly zero (=== 0) on every run', () => {
    for (const run of runs) expect(simulate(run.closes, []).lead).toBe(0);
  });

  for (const run of runs) {
    describe(run.id, () => {
      it('never selling scores zero', () => {
        expect(Math.abs(simulate(run.closes, []).lead)).toBeLessThan(1e-6);
      });
      it('selling on day 1 and never buying back loses', () => {
        expect(simulate(run.closes, [{ dayIndex: 0, side: 'sell' }]).lead).toBeLessThan(0);
      });
      it('selling on day 1 and buying back at the lowest close wins', () => {
        const r = simulate(run.closes, [
          { dayIndex: 0, side: 'sell' },
          { dayIndex: run.lowIndex, side: 'buy' },
        ]);
        expect(r.lead).toBeGreaterThan(0);
      });
    });
  }
});

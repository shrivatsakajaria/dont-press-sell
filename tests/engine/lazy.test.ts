import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leadAt, simulate } from '../../src/engine/simulate';
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

  // R18: the holder and the player are computed in the same order of operations,
  // so doing nothing is exactly zero (not +/-1.8e-12, which `lead > 0` counted as a win).
  it('never selling scores exactly zero (=== 0) on every run, and leadAt is 0 every day', () => {
    for (const run of runs) {
      expect(simulate(run.closes, []).lead).toBe(0);
      for (let d = 0; d < run.closes.length; d += 7) expect(leadAt(run.closes, [], d)).toBe(0);
      expect(leadAt(run.closes, [], run.closes.length - 1)).toBe(0);
    }
  });

  for (const run of runs) {
    describe(run.id, () => {
      it('never selling scores zero', () => {
        expect(simulate(run.closes, []).lead).toBe(0);
      });
      it('selling on day 1 and never buying back loses', () => {
        expect(simulate(run.closes, [{ dayIndex: 0, side: 'sell' }]).lead).toBeLessThan(0);
      });
      // R22 brought in runs whose day 1 is the lowest close (s2014, s2024). There a sale
      // and a buy-back on day 1 are at the same close, so the spec's "always wins" cannot
      // hold: the lead is exactly zero instead. Every other run must win.
      it('selling on day 1 and buying back at the lowest close wins (scores zero when day 1 is the low)', () => {
        const r = simulate(run.closes, [
          { dayIndex: 0, side: 'sell' },
          { dayIndex: run.lowIndex, side: 'buy' },
        ]);
        if (run.lowIndex === 0) expect(r.lead).toBe(0);
        else expect(r.lead).toBeGreaterThan(0);
      });
    });
  }
});

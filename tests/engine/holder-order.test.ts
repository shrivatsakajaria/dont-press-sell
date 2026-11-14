import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulateBorrowed } from '../../src/engine/borrowed';
import { perfectTiming } from '../../src/engine/perfect';
import { simulate } from '../../src/engine/simulate';
import type { RunData } from '../../src/engine/types';

// R18: the holder is (start / first) * close everywhere, in the same order of
// operations as the player's balances, so equal amounts compare exactly equal.
const DIR = join(__dirname, '../../data/runs');
const runs: RunData[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.prices.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as RunData);

describe('the holder in one order of operations', () => {
  for (const run of runs) {
    const first = run.closes[0];
    const last = run.closes[run.closes.length - 1];
    // A series with no fall at all: perfect timing cannot beat the holder.
    const noFall = [first, last];

    it(`${run.id}: perfect timing equals the holder exactly on a no-fall series`, () => {
      expect(perfectTiming(noFall).final).toBe((10000 / first) * last);
      const r = simulate(noFall, []);
      expect(r.perfectFinal).toBe(r.holderFinal);
      expect(r.lead).toBe(0);
      expect(r.share).toBe(0);
    });

    it(`${run.id}: borrowed money measures against the same holder`, () => {
      expect(simulateBorrowed(run.closes, []).holderFinal).toBe(simulate(run.closes, []).holderFinal);
      const b = simulateBorrowed(noFall, []);
      expect(b.perfectFinal).toBe(b.holderFinal);
      expect(b.holderFinal).toBe((10000 / first) * last);
    });
  }
});

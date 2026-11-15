import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isPlainLine, lineCandidates, marketState, withPlayer } from '../../src/content/commentary';
import { dayHeadlines } from '../../src/content/dayheadlines';
import { checkGenerated, checkLine, facts, FILLER, type RunFile } from '../game/wordcheck';

// Whole-run scan: every day of every real run, every position a player can be in. Every line that
// could be picked for that day (not just one random pick) and every generated headline is checked
// against an independent computation from the prices (tests/game/wordcheck.ts).

const RUN_DIR = join(__dirname, '..', '..', 'data', 'runs');

describe('whole-run scan over every real run file', () => {
  const files = readdirSync(RUN_DIR).filter((f) => f.endsWith('.prices.json'));

  it('finds run files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    it(`every line and generated headline is true on every day of ${f}`, { timeout: 120_000 }, () => {
      const run = JSON.parse(readFileSync(join(RUN_DIR, f), 'utf8')) as RunFile;
      const { high, preCloses: pre } = run;
      expect(pre.length).toBe(30);
      expect(high).toBeGreaterThan(0);
      // Every day for runs under 600 days; every 5th day plus big-move days and the last day for longer ones.
      const days: number[] = [];
      for (let d = 0; d < run.closes.length; d++) {
        const prev = d === 0 ? pre[29] : run.closes[d - 1];
        const big = Math.abs(run.closes[d] / prev - 1) >= 0.03;
        if (run.closes.length < 600 || d % 5 === 0 || big || d === run.closes.length - 1) days.push(d);
      }
      let total = 0;
      const seen = new Set<string>();
      for (const d of days) {
        const m = marketState(run.closes, pre, high, d);
        const fx = facts(run, d);
        for (const h of dayHeadlines(m)) checkGenerated(h.text, fx);
        for (const held of [true, false]) {
          for (const neverSold of [true, false]) {
            if (!held && neverSold) continue;
            const balance = neverSold ? (10000 * run.closes[d]) / run.closes[0] : 9100;
            const s = withPlayer(m, { held, neverSold, balance, start: 10000 });
            for (const c of lineCandidates([s], { exactMoney: true })) {
              checkLine(c.text, fx, fx, { bal: balance, start: 10000, held: held && d > 0, neverSold });
              expect(FILLER).not.toContain(c.text);
              expect(isPlainLine(c.text), c.text).toBe(c.plain);
              expect(c.text).not.toMatch(/!|\b(1[5-9]|20)\d\d\b/);
              seen.add(c.text);
              total++;
            }
          }
        }
      }
      expect(total).toBeGreaterThan(days.length);
      expect(seen.size).toBeGreaterThan(10);
    });
  }
});

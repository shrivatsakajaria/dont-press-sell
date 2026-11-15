// R36 and R37, swept over every run and several ways to play: the headline is never on screen more
// than 8 s, generated headlines are true and never repeat, and the line under it changes only on slow
// days, trades or after 4 s, never repeats, stays true on every day it is visible and never contradicts
// the headline above it. The facts are checked here from the prices, independently of the narrator.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BEFORE_NEWS } from '../../src/content/copy';
import { isPlainLine } from '../../src/content/commentary';
import { simulate } from '../../src/engine/simulate';
import type { Headline, RunData, Trade } from '../../src/engine/types';
import { createNarrator, TRADE_HOLD_MS } from '../../src/game/narrator';
import { mulberry32 } from '../../src/game/rng';
import { buildSchedule, stepHold, type Step } from '../../src/game/schedule';
import { parseHeadlineRows, toHeadlines } from '../../scripts/lib/headlines';

import { checkGenerated, checkLine, facts, FILLER, headlineDir, lineDir, type Facts, type RunFile } from './wordcheck';

const DIR = join(__dirname, '../../data/runs');
const runs: RunFile[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.prices.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as RunFile);

function headlinesFor(run: RunData): Headline[] {
  const file = join(DIR, `${run.id}.headlines.csv`);
  return existsSync(file) ? toHeadlines(parseHeadlineRows(readFileSync(file, 'utf8')).rows, run) : [];
}

// ---------- The sweep ----------
type Pattern = { name: string; at: (steps: Step[]) => number[] };
const slowIdx = (steps: Step[]) => steps.map((s, i) => (s.slow ? i : -1)).filter((i) => i >= 0);
const PATTERNS: Pattern[] = [
  { name: 'never sells', at: () => [] },
  { name: 'sells on day 1', at: () => [1] },
  { name: 'sells on the first slow day, buys on the third', at: (s) => slowIdx(s).filter((_, k) => k === 0 || k === 2) },
  { name: 'sells and never buys', at: (s) => [Math.min(5, s.length - 1)] },
  { name: 'several round trips', at: (s) => s.map((_, i) => i).filter((i) => i > 0 && i % 23 === 0) },
];

interface Shown {
  step: number;
  day: number;
  start: number;
  ms: number;
  headline: string;
  commentary: string;
  sombre: boolean;
  tradedBefore: boolean; // a trade happened on the step before this one
  held: boolean;
  bal: number;
  neverSold: boolean;
}

function play(run: RunFile, headlines: Headline[], real: boolean, trades0: number[]): { steps: Step[]; shown: Shown[] } {
  const steps = buildSchedule(run, headlines);
  const n = createNarrator(run, headlines, { real, rng: mulberry32(7), start: 10_000, steps });
  const trades: Trade[] = [];
  const at = new Set(trades0);
  const shown: Shown[] = [];
  let t = 0;
  let tradedBefore = false;
  for (let i = 0; i < steps.length; i++) {
    const d = steps[i].dayIndex;
    const invested = !trades.length || trades[trades.length - 1].side === 'buy';
    const bal = simulate(run.closes, trades, 10_000).balances[d];
    const w = n.step(d, i ? steps[i - 1].dayIndex : null, bal, trades);
    const held = !trades.filter((x) => x.dayIndex < d).length || trades.filter((x) => x.dayIndex < d).slice(-1)[0].side === 'buy';
    let ms = stepHold(steps[i], invested);
    shown.push({
      step: i, day: d, start: t, ms, headline: w.headline, commentary: w.commentary, sombre: w.sombre, tradedBefore,
      held: held && d > 0, bal, neverSold: !trades.some((x) => x.side === 'sell'),
    });
    tradedBefore = false;
    if (at.has(i)) {
      trades.push({ dayIndex: d, side: invested ? 'sell' : 'buy' });
      ms += TRADE_HOLD_MS;
      shown[shown.length - 1].ms = ms;
      tradedBefore = true;
    }
    t += ms;
  }
  return { steps, shown };
}

/** Runs of consecutive steps showing the same text. */
function groups(shown: Shown[], key: 'headline' | 'commentary') {
  const out: { text: string; from: number; to: number; ms: number }[] = [];
  for (const s of shown) {
    const g = out[out.length - 1];
    if (g && g.text === s[key] && g.to === s.step - 1) {
      g.to = s.step;
      g.ms += s.ms;
    } else out.push({ text: s[key], from: s.step, to: s.step, ms: s.ms });
  }
  return out;
}

describe('R36 and R37 sweep: every run, both name modes, five ways to play', () => {
  for (const run of runs) {
    const headlines = headlinesFor(run);
    const realTexts = new Set([BEFORE_NEWS, ...headlines.map((h) => h.real), ...headlines.map((h) => h.anon)]);
    const factsOf = new Map<number, Facts>();
    const F = (d: number) => {
      let f = factsOf.get(d);
      if (!f) factsOf.set(d, (f = facts(run, d)));
      return f;
    };
    for (const pattern of PATTERNS) {
      for (const real of [false, true]) {
        it(`${run.id}, ${pattern.name}, ${real ? 'real' : 'anonymous'} headlines`, { timeout: 60_000 }, () => {
          const steps0 = buildSchedule(run, headlines);
          const { steps, shown } = play(run, headlines, real, pattern.at(steps0));

          // R36: no headline text on screen more than 8 s.
          const hg = groups(shown, 'headline');
          for (const g of hg) expect(g.ms, `"${g.text}" from step ${g.from}`).toBeLessThanOrEqual(8_000);
          // Generated headlines: true on every day shown, never repeated.
          const seen = new Set<string>();
          for (const g of hg) {
            if (realTexts.has(g.text)) continue;
            expect(seen.has(g.text), `repeated headline "${g.text}"`).toBe(false);
            seen.add(g.text);
            for (let i = g.from; i <= g.to; i++) checkGenerated(g.text, F(shown[i].day));
          }

          // R37: the line under the headline.
          const cg = groups(shown, 'commentary');
          const lines = new Set<string>();
          let bear = 0;
          cg.forEach((g, k) => {
            const next = cg[k + 1];
            if (g.text) {
              expect(lines.has(g.text), `repeated line "${g.text}"`).toBe(false);
              lines.add(g.text);
            }
            expect(FILLER).not.toContain(g.text);
            if (/bear market/.test(g.text)) bear++;
            // Holds at least 4 s unless the next line comes on a slow day, after a trade, or the game ends.
            if (next) {
              const why = steps[next.from].slow || shown[next.from].tradedBefore;
              if (!why) expect(g.ms, `"${g.text}" from step ${g.from}`).toBeGreaterThanOrEqual(4_000);
            }
            // A new line only on a slow day, after a trade, or after 4 s.
            if (k > 0) {
              const prev = cg[k - 1];
              expect(steps[g.from].slow || shown[g.from].tradedBefore || prev.ms >= 4_000, `line change at step ${g.from}`).toBe(true);
            }
            if (!g.text) return;
            const first = F(shown[g.from].day);
            for (let i = g.from; i <= g.to; i++) {
              const s = shown[i];
              checkLine(g.text, F(s.day), first, { bal: s.bal, start: 10_000, held: s.held, neverSold: s.neverSold });
              // Never against the headline above it.
              const hd = headlineDir(s.headline);
              const ld = lineDir(g.text);
              if (hd && ld) expect(ld, `"${g.text}" under "${s.headline}" (step ${i})`).toBe(hd);
              // Sombre days and the step after: plain lines only.
              if (s.sombre) expect(isPlainLine(g.text), `"${g.text}" on a sombre step ${i}`).toBe(true);
            }
          });
          expect(bear).toBeLessThanOrEqual(1);
          // Blank lines are a last resort.
          const blank = cg.filter((g) => !g.text).reduce((a, g) => a + g.ms, 0);
          const total = shown.reduce((a, s) => a + s.ms, 0);
          expect(blank / total, 'share of time with no line').toBeLessThan(0.15);
        });
      }
    }
  }
});

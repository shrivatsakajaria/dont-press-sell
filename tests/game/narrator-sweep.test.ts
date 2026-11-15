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
type Pattern = { name: string; at: (steps: Step[]) => number[]; soldLastTime?: (steps: Step[]) => number };
const slowIdx = (steps: Step[]) => steps.map((s, i) => (s.slow ? i : -1)).filter((i) => i >= 0);
const PATTERNS: Pattern[] = [
  { name: 'never sells', at: () => [] },
  { name: 'sells on day 1', at: () => [1] },
  { name: 'sells on the first slow day, buys on the third', at: (s) => slowIdx(s).filter((_, k) => k === 0 || k === 2) },
  { name: 'sells and never buys', at: (s) => [Math.min(5, s.length - 1)] },
  { name: 'several round trips', at: (s) => s.map((_, i) => i).filter((i) => i > 0 && i % 23 === 0) },
  { name: 'sells just before each slow day', at: (s) => slowIdx(s).map((i) => i - 1).filter((i) => i > 0) },
  { name: 'a rematch that sold on day 20 last time', at: (s) => [Math.min(40, s.length - 1)], soldLastTime: (s) => s[Math.min(20, s.length - 1)].dayIndex },
];

/** One stretch of screen time: a step until its press (or its end), or the time from a press to the step's end. */
interface Shown {
  step: number;
  day: number;
  start: number;
  ms: number;
  headline: string;
  commentary: string;
  sombre: boolean;
  /** This stretch begins at a press (narrator.trade). */
  press: boolean;
  held: boolean;
  inNow: boolean;
  bal: number;
  neverSold: boolean;
  buyVsSale: 'lower' | 'higher' | 'same' | null;
}

/**
 * Plays the run through the narrator as the play screen does. A press comes at the very end of its step
 * (the shortest real time from the press: only the 500 ms press hold before the next day), through trade().
 */
function play(run: RunFile, headlines: Headline[], real: boolean, trades0: number[], soldLastTime: number | null) {
  const steps = buildSchedule(run, headlines);
  const n = createNarrator(run, headlines, { real, rng: mulberry32(7), start: 10_000, steps, firstSale: true, soldLastTime });
  const trades: Trade[] = [];
  const at = new Set(trades0);
  const shown: Shown[] = [];
  let t = 0;
  let buyVsSale: Shown['buyVsSale'] = null;
  let saleCash = 0;
  for (let i = 0; i < steps.length; i++) {
    const d = steps[i].dayIndex;
    const invested = !trades.length || trades[trades.length - 1].side === 'buy';
    const bal = simulate(run.closes, trades, 10_000).balances[d];
    const w = n.step(d, i ? steps[i - 1].dayIndex : null, bal, trades);
    const prior = trades.filter((x) => x.dayIndex < d);
    const held = (!prior.length || prior[prior.length - 1].side === 'buy') && d > 0;
    const ms = stepHold(steps[i], invested);
    const base = { step: i, day: d, held, bal, sombre: w.sombre, buyVsSale };
    shown.push({ ...base, start: t, ms, headline: w.headline, commentary: w.commentary, press: false, inNow: invested, neverSold: !trades.some((x) => x.side === 'sell') });
    t += ms;
    if (at.has(i)) {
      trades.push({ dayIndex: d, side: invested ? 'sell' : 'buy' });
      if (invested) saleCash = bal;
      else {
        const sale = trades[trades.length - 2];
        const saving = Math.round(saleCash * (1 - run.closes[d] / run.closes[sale.dayIndex]));
        buyVsSale = saving > 0 ? 'lower' : saving < 0 ? 'higher' : 'same';
      }
      const after = simulate(run.closes, trades, 10_000).balances[d];
      const p = n.trade(d, trades, after);
      shown.push({
        ...base, buyVsSale, start: t, ms: TRADE_HOLD_MS, headline: p.headline, commentary: p.commentary, press: true, inNow: !invested,
        bal: after, neverSold: !trades.some((x) => x.side === 'sell'),
      });
      t += TRADE_HOLD_MS;
    }
  }
  return { steps, shown };
}

/** Runs of consecutive steps showing the same text. */
function groups(shown: Shown[], key: 'headline' | 'commentary') {
  // from / to are indexes into `shown`.
  const out: { text: string; from: number; to: number; ms: number }[] = [];
  shown.forEach((s, k) => {
    const g = out[out.length - 1];
    if (g && g.text === s[key]) {
      g.to = k;
      g.ms += s.ms;
    } else out.push({ text: s[key], from: k, to: k, ms: s.ms });
  });
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
          const sold = pattern.soldLastTime ? pattern.soldLastTime(steps0) : null;
          const { steps, shown } = play(run, headlines, real, pattern.at(steps0), sold);
          const slowAt = (k: number) => !shown[k].press && steps[shown[k].step].slow;

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
            // R37, R52: a line holds at least 4 s, unless the next comes at a press, or on a slow day when the
            // line was not itself set at a press, or the game ends. A blank may be filled at once (R51).
            if (next && g.text) {
              const why = shown[next.from].press || (slowAt(next.from) && !shown[g.from].press);
              if (!why) expect(g.ms, `"${g.text}" from step ${shown[g.from].step}`).toBeGreaterThanOrEqual(4_000);
            }
            // A new line only at a press, on a slow day, after 4 s, or in place of a blank.
            if (k > 0) {
              const prev = cg[k - 1];
              const ok = shown[g.from].press || slowAt(g.from) || prev.ms >= 4_000 || !prev.text;
              expect(ok, `line change at step ${shown[g.from].step}`).toBe(true);
            }
            // R52: a press changes the line at once.
            if (shown[g.from].press && k > 0) expect(g.text).not.toBe(cg[k - 1].text);
            // R51: never blank for more than one step.
            if (!g.text) expect(new Set(shown.slice(g.from, g.to + 1).map((x) => x.step)).size, `blank from step ${shown[g.from].step}`).toBeLessThanOrEqual(1);
            if (!g.text) return;
            const first = F(shown[g.from].day);
            for (let i = g.from; i <= g.to; i++) {
              const s = shown[i];
              checkLine(g.text, F(s.day), first, {
                bal: s.bal, start: 10_000, held: s.held, neverSold: s.neverSold, inNow: s.inNow, buyVsSale: s.buyVsSale, soldLastTime: sold,
              });
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
          expect(blank / total, 'share of time with no line').toBeLessThan(0.01);
          // Every press shows its trade line (R52); a rematch names the day sold last time, once (R51).
          for (const s of shown) if (s.press) expect(s.commentary, `press at step ${s.step}`).not.toBe('');
          if (sold !== null && run.fallEndIndex > sold) expect(cg.filter((g) => /^Last time, you sold/.test(g.text)).length).toBe(1);
        });
      }
    }
  }
});

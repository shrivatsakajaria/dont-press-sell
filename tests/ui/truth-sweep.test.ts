// R49 truth sweep (round 2, lane C): every run x a set of trade patterns, played step by step through
// the play screen's model; every string the play screen shows is checked against the simulated numbers.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FOOTER_PLAY, IN_CASH, LEVEL, STATUS_CASH, STATUS_FORWARD, buyBackLabel, downLabel, sellLabel, sellingAtTopLine, upLabel, youHadLine,
} from '../../src/content/copy';
import { RUN_IDS } from '../../src/content/runs';
import { nearMisses } from '../../src/engine/nearmiss';
import { leadAt, simulate } from '../../src/engine/simulate';
import type { Headline, RunData, Trade } from '../../src/engine/types';
import { createNarrator } from '../../src/game/narrator';
import { mulberry32 } from '../../src/game/rng';
import { buildSchedule, type Step } from '../../src/game/schedule';
import type { SessionView } from '../../src/game/session';
import { screenModel, type DayPoint } from '../../src/ui/screen';

const ROOT = resolve(__dirname, '../..');
const START = 10000;

function load(id: string): { run: RunData & { high?: number }; headlines: Headline[] } {
  const run = JSON.parse(readFileSync(resolve(ROOT, `data/runs/${id}.prices.json`), 'utf8'));
  const headlines = JSON.parse(readFileSync(resolve(ROOT, `data/runs/${id}.headlines.json`), 'utf8'));
  return { run, headlines };
}

/** Steps at which the player presses (each press toggles sell/buy). */
type Pattern = (steps: Step[]) => number[];
const slowIdx = (steps: Step[]) => steps.map((s, i) => (s.slow && s.phase === 'fall' ? i : -1)).filter((i) => i >= 0);
const PATTERNS: Record<string, Pattern> = {
  'never sell': () => [],
  'sell on day 1': () => [0],
  'sell on step 2, buy two steps later': () => [2, 4],
  'sell first slow day, buy third slow day': (st) => {
    const s = slowIdx(st);
    return s.length >= 3 ? [s[0], s[2]] : [];
  },
  'sell and never buy': (st) => [Math.floor(st.length / 4)],
  'several round trips': (st) => Array.from({ length: 8 }, (_, k) => Math.min(st.length - 1, 3 + k * Math.max(1, Math.floor(st.length / 12)))),
  'sell late in the fall, buy in the fast-forward': (st) => {
    const f = st.findIndex((s) => s.phase === 'forward');
    return f > 2 ? [f - 2, Math.min(st.length - 1, f + 3)] : [];
  },
};

const dollarsOf = (text: string) => [...text.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));

interface Frame {
  step: number;
  view: SessionView;
  trades: Trade[];
  model: ReturnType<typeof screenModel>;
  commentary: string;
}

/** Plays one run the way the session and the screen do, returning every frame the screen would draw. */
function play(run: RunData & { high?: number }, headlines: Headline[], steps: Step[], presses: number[]): { frames: Frame[]; trades: Trade[] } {
  const closes = run.closes;
  const trades: Trade[] = [];
  const history = new Map<number, DayPoint>();
  const frames: Frame[] = [];
  const narrator = createNarrator(run, headlines, { real: false, rng: mulberry32(7), start: START });
  let peak = -Infinity;
  let invested = true;
  const press = new Set(presses);
  for (let i = 0; i < steps.length; i++) {
    const d = steps[i].dayIndex;
    const draw = (commentary: string) => {
      const balance = simulate(closes, trades, START).balances[d];
      peak = Math.max(peak, balance);
      const view: SessionView = {
        stepIndex: i, dayIndex: d, balance, invested, marketBalance: (START / closes[0]) * closes[d], peakBalance: peak,
        leadNow: leadAt(closes, trades, d, START), phase: steps[i].phase, slow: steps[i].slow, stepMs: steps[i].holdMs,
      };
      history.set(d, { balance, invested });
      const model = screenModel({
        run, steps, start: START, view, runLabel: 'Mystery crash', history, trades: trades.slice(), firstSaleStep: null,
        paused: false, pot: START, headline: 'h', commentary,
      });
      frames.push({ step: i, view, trades: trades.slice(), model, commentary });
    };
    const before = simulate(closes, trades, START).balances[d];
    const words = narrator.step(d, i > 0 ? steps[i - 1].dayIndex : null, before, trades);
    draw(words.commentary);
    if (press.has(i)) {
      trades.push({ dayIndex: d, side: invested ? 'sell' : 'buy' });
      invested = !invested;
      draw(words.commentary);
    }
  }
  return { frames, trades };
}

function checkFrame(f: Frame, run: RunData, prev: Frame | undefined, prevStepFrame: Frame | undefined) {
  const { model: m, view: v } = f;
  const closes = run.closes;
  const where = `step ${f.step} (day ${v.dayIndex + 1})`;
  // The big number is the balance.
  expect(Math.round(m.balance), where).toBe(Math.round(v.balance));
  // R39: no "Price: your nerve", no "Time slowed".
  expect(m.status, where).not.toMatch(/Price: your nerve|Time slowed/);
  if (v.phase === 'forward') expect(m.status, where).toBe(STATUS_FORWARD);
  else expect(m.status, where).toBe(v.invested ? '' : STATUS_CASH);
  // R40: no pot.
  expect(m.pot, where).toBe('');

  if (v.invested) {
    expect(m.buttonLabel, where).toBe(sellLabel(v.balance));
    const delta = Math.round(v.balance - START);
    expect(m.deltaLabel, where).toBe(delta > 0 ? upLabel(delta) : delta < 0 ? downLabel(delta) : LEVEL);
    expect(m.cheaper, where).toBe(false);
  } else {
    // R38: exactly the formula against the latest sale's close, and one number only.
    const sale = [...f.trades].reverse().find((t) => t.side === 'sell')!;
    const n = Math.round(v.balance * (1 - closes[v.dayIndex] / closes[sale.dayIndex]));
    expect(m.buttonLabel, where).toBe(buyBackLabel(n));
    expect(m.buttonLabel, where).not.toMatch(/\$0\b/);
    if (n > 0) expect(m.buttonLabel, where).toMatch(/cheaper$/);
    if (n < 0) expect(m.buttonLabel, where).toMatch(/dearer$/);
    expect(m.cheaper, where).toBe(n > 0);
    expect(m.deltaLabel, where).toBe(IN_CASH);
    expect(m.regret, where).toBeNull();
    expect(m.underButton, where).toBe(FOOTER_PLAY);
    // In cash the balance does not move.
    if (prev && !prev.view.invested) expect(Math.round(v.balance), where).toBe(Math.round(prev.view.balance));
  }

  // The line under the button.
  if (m.underButton.startsWith('You had')) {
    expect(v.invested, where).toBe(true);
    expect(prevStepFrame, where).toBeDefined();
    expect(m.underButton, where).toBe(youHadLine(prevStepFrame!.view.balance));
  } else if (m.underButton.startsWith('Selling at the top')) {
    expect(v.invested, where).toBe(true);
    expect(m.underButton, where).toBe(sellingAtTopLine(v.peakBalance - v.balance));
    expect(v.peakBalance - v.balance, where).toBeGreaterThanOrEqual(500);
  } else expect(m.underButton, where).toBe(FOOTER_PLAY);

  // "Down N% on your money" / "Up N%" must be true of the money on screen (cash included).
  const pctLine = /^(Down|Up) (\d+)% on your money/.exec(f.commentary);
  if (pctLine && m.standfirst === f.commentary) {
    const pct = Math.round((Math.abs(v.balance - START) / START) * 100);
    expect(pctLine[1] === 'Down' ? v.balance < START : v.balance > START, `${where}: ${f.commentary}`).toBe(true);
    expect(Math.abs(Number(pctLine[2]) - pct), `${where}: ${f.commentary}`).toBeLessThanOrEqual(1);
  }
  // Any dollar figure in the commentary on screen is a figure on screen or the start.
  if (m.standfirst === f.commentary) {
    for (const n of dollarsOf(f.commentary)) {
      const known = [START, Math.round(v.balance), Math.abs(Math.round(v.balance - START))];
      expect(known.some((k) => Math.abs(k - n) <= 1), `${where}: ${f.commentary}`).toBe(true);
    }
  }
}

describe('R49 truth sweep: every play-screen string against the simulated numbers', () => {
  for (const id of RUN_IDS) {
    const { run, headlines } = load(id);
    const steps = buildSchedule(run, headlines);
    it(`${id}: the last step shows the last day`, () => {
      expect(steps[steps.length - 1].dayIndex).toBe(run.closes.length - 1);
    });
    for (const [name, pattern] of Object.entries(PATTERNS)) {
      it(`${id}, ${name}`, () => {
        const presses = pattern(steps);
        const { frames, trades } = play(run, headlines, steps, presses);
        frames.forEach((f, k) => {
          const prevStep = [...frames.slice(0, k)].reverse().find((g) => g.step === f.step - 1);
          checkFrame(f, run, frames[k - 1], prevStep);
        });
        // The last live balance is the result's final, as both print it.
        const result = simulate(run.closes, trades, START);
        const last = frames[frames.length - 1];
        expect(Math.round(last.view.balance)).toBe(Math.round(result.final));
        if (last.view.invested) expect(last.model.buttonLabel).toBe(sellLabel(result.final));
        // "Held through day N" only when invested from the close before day N to its close.
        const balances = result.balances;
        const investedAt = (day: number) => {
          let inv = true;
          for (const t of result.trades) if (t.dayIndex <= day) inv = t.side === 'buy';
          return inv;
        };
        for (const line of nearMisses(result, run)) {
          const held = /^Held through day (\d+), the worst day of the run$/.exec(line);
          if (held) {
            const i = Number(held[1]) - 1;
            expect(investedAt(i - 1) && investedAt(i), line).toBe(true);
            // ... and it really is the worst close-to-close day.
            for (let j = 1; j < run.closes.length; j++) {
              expect(run.closes[j] / run.closes[j - 1]).toBeGreaterThanOrEqual(run.closes[i] / run.closes[i - 1]);
            }
          }
          const best = /^In cash on day (\d+), the best day of the run$/.exec(line);
          if (best) {
            const i = Number(best[1]) - 1;
            expect(!investedAt(i - 1) && !investedAt(i), line).toBe(true);
          }
          // The old unnamed wording is gone.
          expect(line).not.toMatch(/^(Held through|In cash for) the/);
        }
        expect(balances.length).toBe(run.closes.length);
      });
    }
  }
});

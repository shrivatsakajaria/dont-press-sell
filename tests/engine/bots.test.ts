import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import type { RunData, Trade } from '../../src/engine/types';
import { mulberry32 } from '../../src/game/rng';
import { buildSchedule, type Step } from '../../src/game/schedule';

/**
 * Strategy bots (plan Task 3 step 5). Each bot plays every real run through the
 * real schedule (no headlines yet): it can only trade on a step, at the close of
 * the day on screen. A win is a lead above zero. No learnable strategy may win
 * more than 8 of 12.
 */
const DIR = join(__dirname, '../../data/runs');
const runs: RunData[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.prices.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as RunData);
const schedules = new Map(runs.map((r) => [r.id, buildSchedule(r, [])]));

type Bot = (run: RunData, steps: Step[]) => Trade[];

const neverSell: Bot = () => [];

const sellFirstSlow: Bot = (_run, steps) => {
  const s = steps.find((x) => x.slow);
  return s ? [{ dayIndex: s.dayIndex, side: 'sell' }] : [];
};

const sellFirstSlowBuyNextSlowRise: Bot = (run, steps) => {
  const i = steps.findIndex((x) => x.slow);
  if (i < 0) return [];
  const trades: Trade[] = [{ dayIndex: steps[i].dayIndex, side: 'sell' }];
  const buy = steps.slice(i + 1).find((x) => x.slow && run.closes[x.dayIndex] > run.closes[x.dayIndex - 1]);
  if (buy) trades.push({ dayIndex: buy.dayIndex, side: 'buy' });
  return trades;
};

const sellDown15BuyDown30: Bot = (run, steps) => {
  const c = run.closes;
  const sell = steps.find((x) => c[x.dayIndex] <= 0.85 * c[0]);
  if (!sell) return [];
  const trades: Trade[] = [{ dayIndex: sell.dayIndex, side: 'sell' }];
  const buy = steps.find((x) => x.dayIndex > sell.dayIndex && c[x.dayIndex] <= 0.7 * c[sell.dayIndex]);
  if (buy) trades.push({ dayIndex: buy.dayIndex, side: 'buy' });
  return trades;
};

/** Presses on each step with a small chance (about four presses a game). */
function randomBot(seed: number): Bot {
  const rnd = mulberry32(seed);
  return (_run, steps) => {
    const p = 4 / steps.length;
    const trades: Trade[] = [];
    let invested = true;
    for (const s of steps) {
      if (rnd() < p) {
        trades.push({ dayIndex: s.dayIndex, side: invested ? 'sell' : 'buy' });
        invested = !invested;
      }
    }
    return trades;
  };
}

function play(bot: Bot) {
  const leads: Record<string, number> = {};
  let wins = 0;
  for (const run of runs) {
    const lead = simulate(run.closes, bot(run, schedules.get(run.id)!)).lead;
    leads[run.id] = Math.round(lead);
    if (lead > WIN_EPS) wins++;
  }
  return { wins, leads };
}

const strategies: [string, Bot][] = [
  ['never sell', neverSell],
  ['sell at first slow step, never return', sellFirstSlow],
  ['sell at first slow step, buy at next slow rising day', sellFirstSlowBuyNextSlowRise],
  ['sell 15% down, buy 30% below the sale', sellDown15BuyDown30],
];

/** A win is a lead above zero; the tolerance absorbs simulate's float noise (see lazy.test.ts). */
const WIN_EPS = 1e-6;

describe('strategy bots over all twelve runs through the real schedule', () => {
  const results = new Map(strategies.map(([name, bot]) => [name, play(bot)]));

  it('prints the table (and plays 1,000 seeded random games)', () => {
    expect(runs.length).toBe(12);
    const table: Record<string, Record<string, number | string>> = {};
    for (const [name, r] of results) table[name] = { wins: `${r.wins}/12`, ...r.leads };
    const GAMES = 1000;
    const winCounts: number[] = [];
    for (let g = 0; g < GAMES; g++) winCounts.push(play(randomBot(1000 + g)).wins);
    const mean = winCounts.reduce((a, b) => a + b, 0) / GAMES;
    const max = Math.max(...winCounts);
    const over8 = winCounts.filter((w) => w > 8).length;
    table[`random presses (${GAMES} seeded games)`] = {
      wins: `mean ${mean.toFixed(2)}/12, max ${max}/12, ${over8} games > 8`,
    };
    console.table(table);
  });

  it('never selling never wins', () => {
    expect(results.get('never sell')!.wins).toBe(0);
  });

  it('selling and never returning always loses', () => {
    expect(results.get('sell at first slow step, never return')!.wins).toBe(0);
  });

  it('sell 15% down, buy 30% below the sale wins at most 8 of 12', () => {
    expect(results.get('sell 15% down, buy 30% below the sale')!.wins).toBeLessThanOrEqual(8);
  });

  // ESCALATED to SK via the lead (lane I report): with no headlines this strategy
  // wins 9 of 12. The game is not tuned to hide it. When the decision lands (or
  // headlines change the slow days) and it wins 8 or fewer, this marker fails:
  // change it to a plain `it`.
  it.fails('sell at first slow step, buy at next slow rising day wins at most 8 of 12', () => {
    expect(results.get('sell at first slow step, buy at next slow rising day')!.wins).toBeLessThanOrEqual(8);
  });
});

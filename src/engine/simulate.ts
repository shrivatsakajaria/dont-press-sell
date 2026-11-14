import type { RunResult, Trade } from './types';
import { perfectTiming } from './perfect';

/** Trades in day order (stable), inside the run only. */
export function orderedTrades(trades: Trade[], length: number): Trade[] {
  return trades
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => Number.isInteger(t.dayIndex) && t.dayIndex >= 0 && t.dayIndex < length)
    .sort((a, b) => a.t.dayIndex - b.t.dayIndex || a.i - b.i)
    .map(({ t }) => t);
}

export function simulate(closes: number[], trades: Trade[], start = 10000): RunResult {
  const n = closes.length;
  const holderFinal = n ? (start * closes[n - 1]) / closes[0] : start;
  const perfectFinal = perfectTiming(closes, start).final;
  const ordered = orderedTrades(trades, n);
  const applied: Trade[] = [];
  const balances: number[] = [];
  let invested = true;
  let shares = n ? start / closes[0] : 0;
  let cash = 0;
  let daysInCash = 0;
  let k = 0;
  for (let d = 0; d < n; d++) {
    while (k < ordered.length && ordered[k].dayIndex === d) {
      const t = ordered[k++];
      if (t.side === 'sell' && invested) {
        cash = shares * closes[d];
        shares = 0;
        invested = false;
        applied.push(t);
      } else if (t.side === 'buy' && !invested) {
        shares = cash / closes[d];
        cash = 0;
        invested = true;
        applied.push(t);
      }
    }
    if (!invested) daysInCash++;
    balances.push(invested ? shares * closes[d] : cash);
  }
  const final = n ? balances[n - 1] : start;
  const gap = perfectFinal - holderFinal;
  return {
    final,
    holderFinal,
    perfectFinal,
    lead: final - holderFinal,
    share: gap === 0 ? 0 : (final - holderFinal) / gap,
    balances,
    daysInCash,
    trades: applied,
  };
}

/** The player's balance minus the holder's at the close of dayIndex. */
export function leadAt(closes: number[], trades: Trade[], dayIndex: number, start = 10000): number {
  const upTo = trades.filter((t) => t.dayIndex <= dayIndex);
  const { balances } = simulate(closes, upTo, start);
  return balances[dayIndex] - (start * closes[dayIndex]) / closes[0];
}

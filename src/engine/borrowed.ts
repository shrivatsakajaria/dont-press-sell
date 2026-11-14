import type { BorrowedResult, Trade } from './types';
import { perfectTiming } from './perfect';
import { orderedTrades } from './simulate';

/**
 * Borrowed-money rules (spec 6.13). The loan is twice the balance at each
 * entry; while invested, balance = 3 x entry balance x (close / entry close)
 * - loan. A balance at or below zero is a wipe-out that day: the run ends,
 * later balances stay 0 and final is 0. perfectFinal and share are measured
 * against the unborrowed holder and unborrowed perfect timing, as in simulate.
 */
export function simulateBorrowed(closes: number[], trades: Trade[], start = 10000): BorrowedResult {
  const n = closes.length;
  const holderFinal = n ? (start * closes[n - 1]) / closes[0] : start;
  const perfectFinal = perfectTiming(closes, start).final;
  const ordered = orderedTrades(trades, n);
  const applied: Trade[] = [];
  const balances: number[] = [];
  let invested = true;
  let entryBalance = start;
  let entryClose = n ? closes[0] : 1;
  let cash = 0;
  let daysInCash = 0;
  let wipedAt: number | null = null;
  let k = 0;
  const investedBalance = (d: number) =>
    3 * entryBalance * (closes[d] / entryClose) - 2 * entryBalance;
  for (let d = 0; d < n; d++) {
    if (wipedAt !== null) {
      balances.push(0);
      continue;
    }
    if (invested && investedBalance(d) <= 0) {
      wipedAt = d;
      balances.push(0);
      continue;
    }
    while (k < ordered.length && ordered[k].dayIndex === d) {
      const t = ordered[k++];
      if (t.side === 'sell' && invested) {
        cash = investedBalance(d);
        invested = false;
        applied.push(t);
      } else if (t.side === 'buy' && !invested) {
        entryBalance = cash;
        entryClose = closes[d];
        cash = 0;
        invested = true;
        applied.push(t);
      }
    }
    if (!invested) daysInCash++;
    balances.push(invested ? investedBalance(d) : cash);
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
    wipedAt,
  };
}

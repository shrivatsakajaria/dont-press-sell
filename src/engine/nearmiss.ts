import { dollars, outOfMarketLine } from '../content/copy';
import type { BorrowedResult, RunData, RunResult } from './types';

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/** Whether the player holds shares at the close of `day`, after any trade made on that close. */
function investedAt(result: RunResult, day: number): boolean {
  let invested = true;
  for (const t of result.trades) {
    if (t.dayIndex > day) break;
    invested = t.side === 'buy';
  }
  return invested;
}

const DAY_MS = 24 * 3600 * 1000;

/** Calendar days spent in cash: from each sale's close to the next buy-back's close, or to the run's last close. */
function calendarDaysOut(result: RunResult, run: RunData): number {
  const at = (i: number) => Date.parse(run.dates[Math.min(i, run.dates.length - 1)]);
  let total = 0;
  let soldAt: number | null = null;
  for (const t of result.trades) {
    if (t.side === 'sell' && soldAt === null) soldAt = t.dayIndex;
    else if (t.side === 'buy' && soldAt !== null) {
      total += at(t.dayIndex) - at(soldAt);
      soldAt = null;
    }
  }
  if (soldAt !== null) total += at(run.dates.length - 1) - at(soldAt);
  return Number.isFinite(total) ? Math.round(total / DAY_MS) : 0;
}

/** Near-miss lines for the end screen (spec 8.2), each shown only when true, in spec order. */
export function nearMisses(result: RunResult, run: RunData): string[] {
  // R10: a wiped-out run ended early; the scans below would use days that never happened.
  if ('wipedAt' in result && (result as BorrowedResult).wipedAt !== null && (result as BorrowedResult).wipedAt !== undefined) {
    return [];
  }
  const out: string[] = [];
  const { trades } = result;

  // Sold within 10 trading days before the low: take the sale closest to it.
  let soldBefore = 0;
  for (const t of trades) {
    const d = run.lowIndex - t.dayIndex;
    if (t.side === 'sell' && d >= 1 && d <= 10 && (soldBefore === 0 || d < soldBefore)) soldBefore = d;
  }
  if (soldBefore > 0) out.push(`Sold ${days(soldBefore)} before the bottom`);

  // Bought 1 to 10 trading days after the low (lead ruling R8).
  let boughtAfter = 0;
  for (const t of trades) {
    const d = t.dayIndex - run.lowIndex;
    if (t.side === 'buy' && d >= 1 && d <= 10 && (boughtAfter === 0 || d < boughtAfter)) boughtAfter = d;
  }
  if (boughtAfter > 0) out.push(`Bought back ${days(boughtAfter)} after the bottom`);

  // Largest daily rise and fall.
  let bestDay = -1;
  let worstDay = -1;
  let bestRatio = 1;
  let worstRatio = 1;
  for (let i = 1; i < run.closes.length; i++) {
    const ratio = run.closes[i] / run.closes[i - 1];
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestDay = i;
    }
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worstDay = i;
    }
  }
  if (bestDay > 0 && !investedAt(result, bestDay - 1) && !investedAt(result, bestDay)) {
    out.push(`In cash on day ${bestDay + 1}, the best day of the run`);
  }
  if (worstDay > 0 && investedAt(result, worstDay - 1) && investedAt(result, worstDay)) {
    // R49: named by its play-screen number, so the player can check it against what they saw (a headline
    // calling an earlier day "the worst in a generation" is not the run's worst close-to-close day).
    out.push(`Held through day ${worstDay + 1}, the worst day of the run`);
  }

  // Calendar time out of the market, from the dates: each sale to its buy-back, or to the last day (R28).
  const away = calendarDaysOut(result, run);
  if (result.daysInCash >= 1 && away >= 1) out.push(outOfMarketLine(away));

  const sells = trades.filter((t) => t.side === 'sell').length;
  const buys = trades.filter((t) => t.side === 'buy').length;
  if (sells === 1 && buys === 1 && trades.length === 2 && result.final < result.perfectFinal) {
    out.push(`One trade from perfect: perfect timing made ${dollars(result.perfectFinal)}`);
  }

  return out;
}

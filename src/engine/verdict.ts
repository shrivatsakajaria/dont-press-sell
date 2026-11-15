import type { BorrowedResult, RunData, RunResult, VerdictId } from './types';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** Spelled as a word up to twelve, digits above. */
function numberWord(n: number): string {
  return n >= 0 && n <= 12 ? WORDS[n] : String(n);
}

function isWiped(result: RunResult): boolean {
  return 'wipedAt' in result && (result as BorrowedResult).wipedAt !== null && (result as BorrowedResult).wipedAt !== undefined;
}

/** A borrowed-money result that was not wiped out. */
function isBorrowed(result: RunResult): boolean {
  return 'wipedAt' in result && (result as BorrowedResult).wipedAt === null;
}

/** The sale closest to the low, if one falls within 10 trading days of it (either side). */
function saleNearLow(result: RunResult, run: RunData): { dayIndex: number; distance: number } | null {
  let best: { dayIndex: number; distance: number } | null = null;
  for (const t of result.trades) {
    if (t.side !== 'sell') continue;
    const distance = Math.abs(t.dayIndex - run.lowIndex);
    if (distance <= 10 && (best === null || distance < best.distance)) best = { dayIndex: t.dayIndex, distance };
  }
  return best;
}

/** A sale within 10 days of the low that was followed by a buy at a higher close. */
function paperSale(result: RunResult, run: RunData): { dayIndex: number; distance: number } | null {
  let best: { dayIndex: number; distance: number } | null = null;
  result.trades.forEach((t, i) => {
    if (t.side !== 'sell') return;
    const distance = Math.abs(t.dayIndex - run.lowIndex);
    if (distance > 10) return;
    const later = result.trades.slice(i + 1).find((u) => u.side === 'buy');
    if (!later || !(run.closes[later.dayIndex] > run.closes[t.dayIndex])) return;
    if (best === null || distance < best.distance) best = { dayIndex: t.dayIndex, distance };
  });
  return best;
}

/** R34: the first sale came in the first third of the fall (to the low) and a later buy was at a higher close. */
function soldEarlyBoughtHigher(result: RunResult, run: RunData): boolean {
  const i = result.trades.findIndex((t) => t.side === 'sell');
  if (i < 0) return false;
  const sale = result.trades[i];
  if (!(sale.dayIndex < run.lowIndex / 3)) return false;
  return result.trades.slice(i + 1).some((u) => u.side === 'buy' && run.closes[u.dayIndex] > run.closes[sale.dayIndex]);
}

/** The first sale came more than 10 trading days before the low: the market went on falling for a long while. */
function soldLongBeforeLow(result: RunResult, run: RunData): boolean {
  const sale = result.trades.find((t) => t.side === 'sell');
  return !!sale && run.lowIndex - sale.dayIndex > 10;
}

export function verdictFor(result: RunResult, run: RunData): VerdictId {
  if (isWiped(result)) return 'marginCalled';
  // R9: a borrowed run that never traded always ends ahead of the holder; it is still diamond hands.
  if (isBorrowed(result) && result.trades.length === 0) return 'diamond';
  if (result.trades.length > 0 && result.share >= 0.5) return 'bigShort';
  if (result.trades.length > 0 && result.lead > 0) return 'nerves';
  if (result.trades.length === 0) return 'diamond';
  const sold = result.trades.some((t) => t.side === 'sell');
  if (sold && run.kind === 'scare' && result.lead <= 0) return 'shakenOut';
  if (paperSale(result, run)) return 'paper';
  if (result.trades[result.trades.length - 1].side === 'sell') return 'cashGang';
  if (result.trades.length >= 5) return 'overtrader';
  return 'bagholder';
}

function paperHeadline(result: RunResult, run: RunData): string {
  const s = paperSale(result, run) ?? saleNearLow(result, run);
  if (!s) return 'Local investor sells near the bottom';
  const diff = run.lowIndex - s.dayIndex;
  if (diff === 0) return 'Local investor sells on the day of the bottom';
  const n = Math.abs(diff);
  const amount = n === 1 ? 'a day' : `${numberWord(n)} days`;
  return `Local investor sells ${amount} ${diff > 0 ? 'before' : 'after'} the bottom`;
}

export function verdictCopy(
  id: VerdictId,
  result: RunResult,
  run: RunData,
): { title: string; line: string; headline: string } {
  switch (id) {
    case 'marginCalled':
      return {
        title: 'Margin called',
        line: 'Borrowed three times over and lost the lot',
        headline: 'Local investor gets margin called',
      };
    case 'bigShort':
      return {
        title: 'Big Short energy',
        line: 'Out before the fall and back in near the low',
        headline: `Local investor dodges the worst of the ${run.kind === 'scare' ? 'scare' : 'crash'}`,
      };
    case 'nerves':
      return {
        title: 'Nerves of steel',
        line: 'Traded, and still came out in front',
        headline: 'Local investor beats the market, tells everyone',
      };
    case 'diamond':
      if (isBorrowed(result) && result.lead > 0) {
        return {
          title: 'Diamond hands',
          line: 'Borrowed three times over and held on',
          headline: 'Local investor borrows big, holds on, gets away with it',
        };
      }
      return {
        title: 'Diamond hands',
        line: 'Did nothing at all',
        headline: 'Local investor does absolutely nothing, finishes level',
      };
    case 'shakenOut':
      return {
        title: 'Shaken out',
        line: soldLongBeforeLow(result, run) ? 'Sold early in a scare the market got over' : 'Sold a dip that bounced straight back',
        headline: 'Local investor flees a crash that never came',
      };
    case 'paper':
      return {
        title: 'Paper hands',
        line: 'Sold near the low, then bought back higher',
        headline: paperHeadline(result, run),
      };
    case 'cashGang':
      return {
        title: 'Cash gang',
        line: 'Sold, and watched the whole recovery from the sidelines',
        headline: 'Local investor still waiting for the right moment',
      };
    case 'overtrader':
      return {
        title: 'Overtrader',
        line: 'In and out, and behind for it',
        headline: `Local investor trades ${numberWord(result.trades.length)} times, loses to a houseplant`,
      };
    case 'bagholder':
      return {
        title: 'Bagholder',
        line: soldEarlyBoughtHigher(result, run) ? 'Sold early, then bought back higher' : 'Held most of the way down, then blinked',
        headline: 'Local investor blinks at the wrong moment',
      };
  }
}

// Finds the window of one run in a daily close series (spec 7.3).
import type { RunKind } from '../../src/engine/types';

export interface Episode {
  /** Day 1: the first close at least 7% below the high. */
  startIndex: number;
  /** The lowest close between day 1 and full recovery (first one if repeated). */
  lowIndex: number;
  /**
   * End of the readable-speed fall. Crash: first close at least 20% above the low.
   * Scare: first close at or above low + (high - low) * 2 / 3.
   */
  fallEndIndex: number;
  /** Full recovery: the first close after day 1 above the high. */
  endIndex: number;
}

// Absorbs binary floating-point error in comparisons such as 100 * 0.93 vs 93.
const EPS = 1e-9;

/**
 * All indices are into the full `dates`/`closes` arrays.
 * Throws if the high date is missing, the market never falls 7%, or never regains the high.
 */
export function findEpisode(
  dates: string[],
  closes: number[],
  highDate: string,
  kind: RunKind = 'crash',
): Episode {
  if (dates.length !== closes.length) throw new Error('dates and closes differ in length');
  const highIndex = dates.indexOf(highDate);
  if (highIndex < 0) throw new Error(`high date ${highDate} not found`);
  const high = closes[highIndex];

  let startIndex = -1;
  for (let i = highIndex + 1; i < closes.length; i++) {
    if (closes[i] <= high * 0.93 + EPS) {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) throw new Error(`no close 7% below the high of ${highDate}`);

  let endIndex = -1;
  for (let i = startIndex + 1; i < closes.length; i++) {
    if (closes[i] > high + EPS) {
      endIndex = i;
      break;
    }
  }
  if (endIndex < 0) throw new Error(`market does not regain the high of ${highDate}`);

  let lowIndex = startIndex;
  for (let i = startIndex + 1; i < endIndex; i++) {
    if (closes[i] < closes[lowIndex]) lowIndex = i;
  }
  const low = closes[lowIndex];

  const target = kind === 'crash' ? low * 1.2 : low + ((high - low) * 2) / 3;
  let fallEndIndex = -1;
  for (let i = lowIndex + 1; i <= endIndex; i++) {
    if (closes[i] >= target - EPS) {
      fallEndIndex = i;
      break;
    }
  }
  // Unreachable for a crash target above the high only if the low is above high / 1.2,
  // i.e. a fall of under 16.7%; then the fall ends at full recovery.
  if (fallEndIndex < 0) fallEndIndex = endIndex;

  return { startIndex, lowIndex, fallEndIndex, endIndex };
}

const DAY_MS = 86_400_000;
const AVERAGE_MONTH_DAYS = 365.25 / 12; // 30.4375

/** Calendar time between two ISO dates in whole months, rounded to the nearest month. */
export function monthsBetween(from: string, to: string): number {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  return Math.round(days / AVERAGE_MONTH_DAYS);
}

const NUMBER_WORDS = [
  '', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
];

/** "a month", "two months" ... "twelve months". */
export function monthsInWords(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new Error(`no words for ${n} months`);
  return n === 1 ? 'a month' : `${NUMBER_WORDS[n]} months`;
}

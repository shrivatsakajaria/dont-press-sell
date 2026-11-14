// What "Challenge a friend" sends: the card model and the challenge link (spec 6.7, 10).
import type { RunResult } from '../engine/types';
import type { ResultCardModel } from './card';
import { encodeChallenge } from './link';

const START = 10000;

/**
 * The link a friend opens: `base` is the address the page is served from (never hard-coded).
 * A run started from a carried amount (double or nothing) is scaled back to $10,000, since
 * the friend starts from $10,000.
 */
export function challengeLink(base: string, runId: string, r: RunResult, start: number): string {
  const final = Math.max(1, Math.round((r.final * START) / (start || START)));
  return `${base}#c=${encodeChallenge({ runId, final, trades: r.trades })}`;
}

export function resultCard(i: {
  result: RunResult;
  verdict: { title: string; line: string; headline: string };
  closes: number[];
  /** The page's own address, for the foot of the card. */
  url: string;
  /** Practice runs (rematch, picked) name the crash; blind runs pass null. */
  practiceName: string | null;
  dailyNumber?: number;
  streak?: number;
}): ResultCardModel {
  const r = i.result;
  return {
    headline: i.verdict.headline,
    verdictTitle: i.verdict.title,
    verdictLine: i.verdict.line,
    you: r.final,
    holder: r.holderFinal,
    perfect: r.perfectFinal,
    lead: r.lead,
    series: i.closes,
    trades: r.trades,
    url: i.url,
    dailyNumber: i.dailyNumber,
    streak: i.streak,
    // The game does not count goes, so a practice card always says "second go".
    practice: i.practiceName ? { crashName: i.practiceName, attempt: 2 } : undefined,
  };
}

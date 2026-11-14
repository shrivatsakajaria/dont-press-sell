import { describe, expect, test } from 'vitest';
import type { RunResult } from '../../src/engine/types';
import { decodeChallenge } from '../../src/share/link';
import { challengeLink, resultCard } from '../../src/share/result';

const r: RunResult = {
  final: 15400, holderFinal: 13760, perfectFinal: 23000, lead: 1640, share: 0.2,
  balances: [10000, 9000, 15400], daysInCash: 3, trades: [{ dayIndex: 0, side: 'sell' }, { dayIndex: 1, side: 'buy' }],
};

describe('challengeLink', () => {
  test('uses the address the page is served from and carries the run, final and trades', () => {
    const url = challengeLink('https://example.pages.dev/', 'c2007', r, 10000);
    expect(url.startsWith('https://example.pages.dev/#c=')).toBe(true);
    expect(decodeChallenge(url.split('#c=')[1])).toEqual({ runId: 'c2007', final: 15400, trades: r.trades });
  });
  test('a carried start (double or nothing) is scaled back to $10,000 so the friend plays a fair run', () => {
    const url = challengeLink('https://x.dev/', 'c2007', r, 20000);
    expect(decodeChallenge(url.split('#c=')[1])!.final).toBe(7700);
  });
});

describe('resultCard', () => {
  const verdict = { title: 'Nerves of steel', line: 'Traded, and still came out in front', headline: 'Local investor beats the market, tells everyone' };
  test('a blind card hides the crash; a practice card names it', () => {
    const blind = resultCard({ result: r, verdict, closes: [1, 2, 3], url: 'x.dev', practiceName: null });
    expect(blind.practice).toBeUndefined();
    expect(blind.you).toBe(15400);
    const practice = resultCard({ result: r, verdict, closes: [1, 2, 3], url: 'x.dev', practiceName: '2008' });
    expect(practice.practice).toEqual({ crashName: '2008', attempt: 2 });
  });
  test('carries the daily number and a streak', () => {
    const m = resultCard({ result: r, verdict, closes: [1], url: 'x', practiceName: null, dailyNumber: 12, streak: 3 });
    expect(m.dailyNumber).toBe(12);
    expect(m.streak).toBe(3);
  });
});

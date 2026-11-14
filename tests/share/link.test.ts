import { describe, expect, test } from 'vitest';
import { decodeChallenge, encodeChallenge } from '../../src/share/link';
import { RUN_IDS } from '../../src/content/runs';
import type { Trade } from '../../src/engine/types';

const mk = (days: number[]): Trade[] => days.map((d, i) => ({ dayIndex: d, side: i % 2 === 0 ? 'sell' : 'buy' }));
const sample = { runId: RUN_IDS[3], final: 7150, trades: mk([4, 19, 33, 80, 120, 300]) };

function b64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('challenge link', () => {
  test('round trip returns the same object', () => {
    expect(decodeChallenge(encodeChallenge(sample))).toEqual(sample);
  });
  test('round trip for every run, no trades, odd trades, large days', () => {
    for (const runId of RUN_IDS) {
      for (const trades of [[], mk([1]), mk([1, 2, 3]), mk([5000, 9000])]) {
        const c = { runId, final: 12345, trades };
        expect(decodeChallenge(encodeChallenge(c))).toEqual(c);
      }
    }
  });
  test('six trades encode to 60 characters or fewer, base64url only', () => {
    const s = encodeChallenge(sample);
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  test('bad input returns null', () => {
    const good = encodeChallenge(sample);
    expect(decodeChallenge('')).toBeNull();
    expect(decodeChallenge('garbage')).toBeNull();
    expect(decodeChallenge(good.slice(0, good.length - 4))).toBeNull();
    expect(decodeChallenge(good + 'AAAA')).toBeNull();
    expect(decodeChallenge(good + '=')).toBeNull();
    expect(decodeChallenge('!!' + good)).toBeNull();
  });
  test('unknown run returns null', () => {
    expect(() => encodeChallenge({ ...sample, runId: 'nope' })).toThrow();
    expect(decodeChallenge(b64([1, 200, 0, 0, 0x1b, 0xee, 0]))).toBeNull();
  });
  test('out-of-range days, non-increasing days and bad balances return null', () => {
    // version 1, run 0, final 7150 (0x1bee), two trades with day 60000
    expect(decodeChallenge(b64([1, 0, 0, 0, 0x1b, 0xee, 2, 0, 5, 0xea, 0x60]))).toBeNull();
    // non-increasing: 9 then 9
    expect(decodeChallenge(b64([1, 0, 0, 0, 0x1b, 0xee, 2, 0, 9, 0, 9]))).toBeNull();
    // wrong version
    expect(decodeChallenge(b64([2, 0, 0, 0, 0x1b, 0xee, 0]))).toBeNull();
    // final of zero and of 0xffffffff
    expect(decodeChallenge(b64([1, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(decodeChallenge(b64([1, 0, 255, 255, 255, 255, 0]))).toBeNull();
    // control: a valid no-trade code
    expect(decodeChallenge(b64([1, 0, 0, 0, 0x1b, 0xee, 0]))).not.toBeNull();
  });
  test('a sale on the first day (index 0) is a legal trade and round-trips', () => {
    const c = { runId: RUN_IDS[0], final: 7150, trades: mk([0, 4]) };
    expect(decodeChallenge(encodeChallenge(c))).toEqual(c);
    expect(decodeChallenge(b64([1, 0, 0, 0, 0x1b, 0xee, 1, 0, 0]))).toEqual({ runId: RUN_IDS[0], final: 7150, trades: [{ dayIndex: 0, side: 'sell' }] });
  });
  test('encode rejects trades that break the pattern', () => {
    expect(() => encodeChallenge({ ...sample, trades: [{ dayIndex: 3, side: 'buy' }] })).toThrow();
    expect(() => encodeChallenge({ ...sample, trades: mk([9, 3]) })).toThrow();
  });
});

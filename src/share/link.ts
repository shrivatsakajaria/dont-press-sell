// Challenge link codec (spec 6.7). Everything is inside the link; no server.
//
// Byte layout, then base64url without padding:
//   [0]    version (1)
//   [1]    run index in RUN_IDS
//   [2..5] final balance, whole dollars, uint32 big-endian
//   [6]    trade count
//   [7..]  trade days, uint16 big-endian each
// Trades must alternate sell, buy, sell ... starting with a sell and the days
// must be strictly increasing, so only the days are stored.
import { RUN_IDS } from '../content/runs';
import type { Trade } from '../engine/types';

export interface Challenge {
  runId: string;
  final: number;
  trades: Trade[];
}

const VERSION = 1;
const MIN_FINAL = 1;
const MAX_FINAL = 1_000_000_000; // a sane ceiling: far above any double-or-nothing ladder
const MAX_DAY = 9999; // longest run is well under this many trading days
const MAX_TRADES = 200;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

function fromBase64Url(s: string): number[] | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const chunk = s.slice(i, i + 4);
    let n = 0;
    for (let j = 0; j < 4; j++) n = (n << 6) | (j < chunk.length ? ALPHABET.indexOf(chunk[j]) : 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  // Reject non-canonical codes (stray bits in the last character).
  return toBase64Url(bytes) === s ? bytes : null;
}

export function encodeChallenge(c: Challenge): string {
  const runIndex = RUN_IDS.indexOf(c.runId);
  if (runIndex < 0) throw new Error(`unknown run: ${c.runId}`);
  const final = Math.round(c.final);
  if (!(final >= MIN_FINAL && final <= MAX_FINAL)) throw new Error('final balance out of range');
  if (c.trades.length > MAX_TRADES) throw new Error('too many trades');
  let prev = -1; // a sale on the first day (index 0) is legal
  c.trades.forEach((t, i) => {
    const side = i % 2 === 0 ? 'sell' : 'buy';
    if (t.side !== side) throw new Error('trades must alternate, starting with a sell');
    if (!Number.isInteger(t.dayIndex) || t.dayIndex <= prev || t.dayIndex > MAX_DAY) {
      throw new Error('trade days must be increasing and in range');
    }
    prev = t.dayIndex;
  });
  const bytes = [
    VERSION,
    runIndex,
    (final >>> 24) & 255,
    (final >>> 16) & 255,
    (final >>> 8) & 255,
    final & 255,
    c.trades.length,
  ];
  for (const t of c.trades) bytes.push((t.dayIndex >> 8) & 255, t.dayIndex & 255);
  return toBase64Url(bytes);
}

export function decodeChallenge(s: string): Challenge | null {
  try {
    if (typeof s !== 'string' || s.length === 0) return null;
    const b = fromBase64Url(s);
    if (!b || b.length < 7 || b[0] !== VERSION) return null;
    const runId = RUN_IDS[b[1]];
    if (runId === undefined) return null;
    const final = ((b[2] << 24) | (b[3] << 16) | (b[4] << 8) | b[5]) >>> 0;
    if (final < MIN_FINAL || final > MAX_FINAL) return null;
    const count = b[6];
    if (count > MAX_TRADES || b.length !== 7 + count * 2) return null;
    const trades: Trade[] = [];
    let prev = -1;
    for (let i = 0; i < count; i++) {
      const day = (b[7 + i * 2] << 8) | b[8 + i * 2];
      if (day <= prev || day > MAX_DAY) return null;
      prev = day;
      trades.push({ dayIndex: day, side: i % 2 === 0 ? 'sell' : 'buy' });
    }
    return { runId, final, trades };
  } catch {
    return null;
  }
}

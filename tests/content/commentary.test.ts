import { describe, it, expect } from 'vitest';
import { commentaryFor, NEUTRAL_LINES } from '../../src/content/commentary';

type Ctx = Parameters<typeof commentaryFor>[0];

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function lines(c: Omit<Ctx, 'rng'>, n = 300): Set<string> {
  const out = new Set<string>();
  for (let k = 1; k <= n; k++) out.add(commentaryFor({ ...c, rng: lcg(k * 7919) }));
  return out;
}

const YEAR = /\b(1[5-9]|20)\d\d\b/;
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

function randomCtx(rand: () => number, previous?: string): Ctx {
  const n = 2 + Math.floor(rand() * 40);
  const closes = [100];
  for (let i = 1; i < n; i++) closes.push(closes[i - 1] * (1 + (rand() - 0.5) * 0.14));
  return {
    closes,
    dayIndex: Math.floor(rand() * n),
    invested: rand() < 0.5,
    balance: 5000 + rand() * 12000,
    start: 10000,
    sombre: rand() < 0.2,
    rng: rand,
    previous,
  };
}

describe('commentaryFor', () => {
  it('names a streak of seven falling days', () => {
    const closes = [100, 99, 98, 97, 96, 95, 94, 93];
    const seen = lines({ closes, dayIndex: 7, invested: true, balance: 9300, start: 10000, sombre: false });
    expect([...seen].some((l) => l.includes('seven days in a row'))).toBe(true);
    for (const l of seen) if (/days in a row/.test(l)) expect(l).toContain('seven days in a row');
  });

  it('can say down 40% from the peak when 40% or more has gone', () => {
    const closes = [100, 90, 80, 70, 60];
    const seen = lines({ closes, dayIndex: 4, invested: true, balance: 6000, start: 10000, sombre: false });
    expect(seen.has('Down 40% from the peak. Still holding?')).toBe(true);
  });

  it('never claims 40% from the peak when the fall is smaller', () => {
    const closes = [100, 90, 80, 70, 61];
    const seen = lines({ closes, dayIndex: 4, invested: true, balance: 6100, start: 10000, sombre: false });
    for (const l of seen) expect(l).not.toContain('Down 40%');
  });

  it('mentions the sidelines on the best day so far when not invested', () => {
    const closes = [100, 98, 97, 95, 94, 101];
    for (let k = 1; k <= 50; k++) {
      const l = commentaryFor({
        closes, dayIndex: 5, invested: false, balance: 9700, start: 10000, sombre: false, rng: lcg(k),
      });
      expect(l.toLowerCase()).toContain('sideline');
    }
  });

  it('does not claim a best day when the day is not the best so far', () => {
    const closes = [100, 90, 100, 101];
    const seen = lines({ closes, dayIndex: 3, invested: false, balance: 9000, start: 10000, sombre: false });
    for (const l of seen) expect(l).not.toContain('best day');
  });

  it('ignores future days', () => {
    const base = { dayIndex: 2, invested: true, balance: 9800, start: 10000, sombre: false };
    const a = lines({ ...base, closes: [100, 99, 98] });
    const b = lines({ ...base, closes: [100, 99, 98, 50, 40, 30, 20] });
    expect([...b].sort()).toEqual([...a].sort());
  });

  it('has no digit-year, emoji or exclamation mark in any line', () => {
    const rand = lcg(42);
    for (let k = 0; k < 3000; k++) {
      const l = commentaryFor(randomCtx(rand));
      expect(l).not.toMatch(YEAR);
      expect(l).not.toMatch(EMOJI);
      expect(l).not.toContain('!');
      expect(l.length).toBeGreaterThan(0);
    }
    for (const l of NEUTRAL_LINES) {
      expect(l).not.toMatch(YEAR);
      expect(l).not.toContain('!');
    }
  });

  it('never repeats a line on consecutive days over 500 contexts', () => {
    const rand = lcg(2024);
    let previous: string | undefined;
    for (let k = 0; k < 500; k++) {
      const l = commentaryFor(randomCtx(rand, previous));
      if (previous !== undefined) expect(l).not.toBe(previous);
      previous = l;
    }
  });

  it('takes every sombre line from the neutral set', () => {
    expect(NEUTRAL_LINES.length).toBeGreaterThanOrEqual(8);
    const rand = lcg(7);
    for (let k = 0; k < 500; k++) {
      const c = { ...randomCtx(rand), sombre: true };
      expect(NEUTRAL_LINES).toContain(commentaryFor(c));
    }
  });

  it('keeps neutral lines true: no fall wording on a rising day', () => {
    const seen = lines({ closes: [100, 99, 101], dayIndex: 2, invested: true, balance: 10000, start: 10000, sombre: true });
    for (const l of seen) expect(l).not.toMatch(/fall|lower|loss/i);
  });

  it('is deterministic for the same rng seed', () => {
    const base = { closes: [100, 99, 98, 97], dayIndex: 3, invested: true, balance: 9700, start: 10000, sombre: false };
    expect(commentaryFor({ ...base, rng: lcg(5) })).toBe(commentaryFor({ ...base, rng: lcg(5) }));
  });
});

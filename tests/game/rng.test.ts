import { describe, expect, it } from 'vitest';
import { hashString, mulberry32 } from '../../src/game/rng';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });
  it('differs between seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
  it('stays in [0, 1)', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 5000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('matches the reference sequence for seed 1', () => {
    const r = mulberry32(1);
    expect(r()).toBeCloseTo(0.6270739405881613, 12);
  });
});

describe('hashString', () => {
  it('is stable and returns an unsigned 32-bit integer', () => {
    expect(hashString('c2007')).toBe(hashString('c2007'));
    const h = hashString('hello');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
  it('matches FNV-1a reference values', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
  });
  it('differs for different strings', () => {
    expect(hashString('c2007')).not.toBe(hashString('c2008'));
  });
});

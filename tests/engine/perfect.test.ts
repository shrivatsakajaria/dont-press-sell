import { describe, expect, it } from 'vitest';
import { perfectTiming } from '../../src/engine/perfect';

describe('perfectTiming', () => {
  const closes = [100, 90, 80, 100, 107.5];
  it('finds the best single sale and buy-back', () => {
    expect(perfectTiming(closes)).toEqual({ final: 13437.5, sellIndex: 0, buyIndex: 2 });
  });
  it('equals the holder when prices only rise', () => {
    expect(perfectTiming([100, 101, 105])).toEqual({ final: 10500, sellIndex: 0, buyIndex: 0 });
  });
  it('uses a later peak when it gives the bigger fall', () => {
    const r = perfectTiming([100, 120, 90, 110]);
    expect(r.sellIndex).toBe(1);
    expect(r.buyIndex).toBe(2);
    expect(r.final).toBeCloseTo((10000 * 1.1 * 120) / 90);
  });
  it('honours a custom start', () => {
    expect(perfectTiming(closes, 5000).final).toBeCloseTo(6718.75);
  });
});

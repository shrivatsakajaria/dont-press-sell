import { describe, expect, it } from 'vitest';
import { leadAt, simulate } from '../../src/engine/simulate';

const closes = [100, 90, 80, 100, 107.5];

describe('simulate', () => {
  it('holding throughout scores zero', () => {
    expect(simulate(closes, []).final).toBeCloseTo(10750);
    expect(simulate(closes, []).lead).toBe(0);
  });
  it('selling and never buying back freezes cash', () => {
    const r = simulate(closes, [{ dayIndex: 1, side: 'sell' }]);
    expect(r.final).toBeCloseTo(9000);
    expect(r.daysInCash).toBe(4);
    expect(r.balances).toHaveLength(5);
    expect(r.balances[4]).toBeCloseTo(9000);
  });
  it('sell then buy back', () => {
    const r = simulate(closes, [
      { dayIndex: 1, side: 'sell' },
      { dayIndex: 2, side: 'buy' },
    ]);
    expect(r.final).toBeCloseTo(12093.75);
    expect(r.share).toBeCloseTo(0.5);
    expect(r.daysInCash).toBe(1);
    expect(r.perfectFinal).toBeCloseTo(13437.5);
    expect(r.holderFinal).toBeCloseTo(10750);
  });
  it('share is 0 when perfect equals holder', () => {
    expect(simulate([100, 101, 105], []).share).toBe(0);
  });
  it('ignores a second sell and a buy while invested', () => {
    const r = simulate(closes, [
      { dayIndex: 0, side: 'buy' },
      { dayIndex: 1, side: 'sell' },
      { dayIndex: 2, side: 'sell' },
    ]);
    expect(r.final).toBeCloseTo(9000);
    expect(r.trades).toEqual([{ dayIndex: 1, side: 'sell' }]);
  });
  it('applies trades in day order', () => {
    const r = simulate(closes, [
      { dayIndex: 2, side: 'buy' },
      { dayIndex: 1, side: 'sell' },
    ]);
    expect(r.final).toBeCloseTo(12093.75);
  });
  it('honours a custom start', () => {
    expect(simulate(closes, [], 500).final).toBeCloseTo(537.5);
  });
});

describe('lead adds up with the shown figures', () => {
  // Table shows $10,800 and $8,783: the lead must read $2,017, not $2,018 (raw 2017.5).
  const c = [100, 108, 87.825];
  it('is the rounded final minus the rounded holder', () => {
    const r = simulate(c, [{ dayIndex: 1, side: 'sell' }]);
    expect(r.final).toBeCloseTo(10800);
    expect(r.holderFinal).toBeCloseTo(8782.5);
    expect(r.lead).toBe(Math.round(r.final) - Math.round(r.holderFinal));
    expect(r.lead).toBe(2017);
  });
  it('the live counter follows the same rule', () => {
    expect(leadAt(c, [{ dayIndex: 1, side: 'sell' }], 2)).toBe(2017);
  });
});

describe('leadAt', () => {
  it('is the live counter', () => {
    expect(leadAt(closes, [{ dayIndex: 1, side: 'sell' }], 2)).toBeCloseTo(1000);
    expect(leadAt(closes, [{ dayIndex: 1, side: 'sell' }], 3)).toBeCloseTo(-1000);
    expect(leadAt(closes, [], 3)).toBeCloseTo(0);
  });
});

import { describe, expect, it } from 'vitest';
import { simulateBorrowed } from '../../src/engine/borrowed';

const closes = [100, 90, 80, 100, 107.5];

describe('simulateBorrowed', () => {
  it('holding throughout triples the moves', () => {
    const r = simulateBorrowed(closes, []);
    expect(r.balances[1]).toBeCloseTo(7000);
    expect(r.balances[2]).toBeCloseTo(4000);
    expect(r.final).toBeCloseTo(12250);
    expect(r.wipedAt).toBeNull();
    expect(r.holderFinal).toBeCloseTo(10750);
    expect(r.lead).toBeCloseTo(1500);
  });
  it('wipes out when the balance reaches zero', () => {
    const r = simulateBorrowed([100, 90, 66, 100], []);
    expect(r.wipedAt).toBe(2);
    expect(r.final).toBe(0);
    expect(r.balances[2]).toBe(0);
    expect(r.balances[3]).toBe(0);
  });
  it('a fall of exactly a third is a wipe-out', () => {
    expect(simulateBorrowed([300, 200], []).wipedAt).toBe(1);
  });
  it('selling repays the loan and freezes the balance', () => {
    const r = simulateBorrowed(closes, [{ dayIndex: 1, side: 'sell' }]);
    expect(r.final).toBeCloseTo(7000);
    expect(r.daysInCash).toBe(4);
  });
  it('buying back borrows again at the new balance', () => {
    const r = simulateBorrowed(
      [100, 90, 80, 100],
      [
        { dayIndex: 1, side: 'sell' },
        { dayIndex: 2, side: 'buy' },
      ],
    );
    expect(r.final).toBeCloseTo(12250);
  });
  it('ignores trades after a wipe-out', () => {
    const r = simulateBorrowed([100, 60, 100], [{ dayIndex: 2, side: 'sell' }]);
    expect(r.wipedAt).toBe(1);
    expect(r.final).toBe(0);
    expect(r.trades).toEqual([]);
  });
  it('measures perfect and share against the unborrowed rules', () => {
    const r = simulateBorrowed(closes, []);
    expect(r.perfectFinal).toBeCloseTo(13437.5);
    expect(r.share).toBeCloseTo((12250 - 10750) / (13437.5 - 10750));
  });
});

describe('simulateBorrowed lead', () => {
  it('is the rounded final minus the rounded holder, like simulate', () => {
    const r = simulateBorrowed([100, 108, 87.825], [{ dayIndex: 1, side: 'sell' }]);
    expect(r.lead).toBe(Math.round(r.final) - Math.round(r.holderFinal));
    expect(Number.isInteger(r.lead)).toBe(true);
  });
});

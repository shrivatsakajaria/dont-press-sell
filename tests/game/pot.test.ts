import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { applyToPot, getPot, resetPot } from '../../src/game/pot';
import { resetCells } from '../../src/store/store';

const g = globalThis as unknown as { localStorage?: unknown };
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
beforeEach(() => {
  g.localStorage = memoryStorage();
  resetCells();
  resetPot();
});
afterEach(() => {
  delete g.localStorage;
  resetCells();
});

describe('pot', () => {
  test('a new player has 10000', () => {
    expect(getPot()).toEqual({ pot: 10000, tonight: 0, busts: 0 });
  });
  test('a mystery win adds the lead and counts tonight', () => {
    expect(applyToPot('mystery', 1640)).toEqual({ pot: 11640, tonight: 1640, bust: false });
    expect(getPot()).toEqual({ pot: 11640, tonight: 1640, busts: 0 });
  });
  test('daily and challenge are blind and count; rematch and picked do not', () => {
    applyToPot('daily', 100);
    applyToPot('challenge', -40);
    expect(getPot().pot).toBe(10060);
    expect(applyToPot('rematch', 5000)).toEqual({ pot: 10060, tonight: 60, bust: false });
    expect(applyToPot('picked', -5000)).toEqual({ pot: 10060, tonight: 60, bust: false });
    expect(getPot().busts).toBe(0);
  });
  test('losses take it down and tonight goes negative', () => {
    expect(applyToPot('mystery', -2300)).toEqual({ pot: 7700, tonight: -2300, bust: false });
  });
  test('zero or below is a bust: counted and reset to 10000', () => {
    expect(applyToPot('mystery', -10000)).toEqual({ pot: 10000, tonight: -10000, bust: true });
    expect(getPot()).toEqual({ pot: 10000, tonight: -10000, busts: 1 });
    expect(applyToPot('mystery', -30000).bust).toBe(true);
    expect(getPot().busts).toBe(2);
  });
  test('persists across a reload but tonight starts again', () => {
    applyToPot('mystery', 500);
    resetCells();
    resetPot();
    expect(getPot()).toEqual({ pot: 10500, tonight: 0, busts: 0 });
  });
  test('storage blocked: the pot still accumulates for the visit', () => {
    delete g.localStorage;
    resetCells();
    resetPot();
    applyToPot('mystery', 300);
    applyToPot('mystery', 200);
    expect(getPot()).toEqual({ pot: 10500, tonight: 500, busts: 0 });
  });
  test('a repeated daily (blind: false from recordRun) does not move the pot', () => {
    applyToPot('daily', 400);
    const again = applyToPot('daily', 400, false);
    expect(again).toEqual({ pot: 10400, tonight: 400, bust: false });
  });
});

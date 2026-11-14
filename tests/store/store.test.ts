import { afterEach, describe, expect, test } from 'vitest';
import { load, save } from '../../src/store/store';

const g = globalThis as unknown as { localStorage?: unknown };
afterEach(() => {
  delete g.localStorage;
});

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('store', () => {
  test('throwing localStorage: load gives the fallback, save returns false', () => {
    const boom = () => {
      throw new Error('blocked');
    };
    g.localStorage = { getItem: boom, setItem: boom, removeItem: boom };
    expect(load('x', 5)).toBe(5);
    expect(save('x', 6)).toBe(false);
  });
  test('localStorage getter that throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('denied');
      },
    });
    expect(load('x', 'f')).toBe('f');
    expect(save('x', 1)).toBe(false);
  });
  test('missing localStorage', () => {
    expect(load('x', [1])).toEqual([1]);
    expect(save('x', 1)).toBe(false);
  });
  test('round trip with the dps: prefix, and corrupt JSON falls back', () => {
    const s = memoryStorage();
    g.localStorage = s;
    expect(save('pot', { a: 1 })).toBe(true);
    expect([...s.m.keys()]).toEqual(['dps:pot']);
    expect(load('pot', null)).toEqual({ a: 1 });
    s.m.set('dps:bad', '{oops');
    expect(load('bad', 7)).toBe(7);
    expect(load('absent', 'd')).toBe('d');
  });
});

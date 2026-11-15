import { afterEach, beforeEach, expect, test } from 'vitest';
import { saveResume, takeResume } from '../../src/game/resume';

const g = globalThis as unknown as { sessionStorage?: unknown };
beforeEach(() => {
  const m = new Map<string, string>();
  g.sessionStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
});
afterEach(() => {
  delete g.sessionStorage;
});

test('the game survives a reload once: stored before, taken (and cleared) on boot', () => {
  saveResume({ mode: 'mystery', runId: 'c2007', start: 15400, double: true, gate: false });
  expect(takeResume()).toEqual({ mode: 'mystery', runId: 'c2007', start: 15400, double: true, gate: false });
  expect(takeResume()).toBeNull();
  saveResume({ mode: 'challenge', runId: 's2018', start: 10000, code: 'AQkAACxNAgAKAB4' });
  expect(takeResume()?.code).toBe('AQkAACxNAgAKAB4');
  saveResume({ mode: 'daily', runId: 'c1987', start: 10000, date: '2026-11-15', dailyNumber: 3 });
  expect(takeResume()).toMatchObject({ mode: 'daily', date: '2026-11-15', dailyNumber: 3 });
});

test('anything malformed is ignored, and missing session storage never throws', () => {
  const s = g.sessionStorage as { setItem(k: string, v: string): void };
  for (const bad of ['x', 'null', '{"mode":"mystery","runId":"nope","start":10000}', '{"mode":"hack","runId":"c2007","start":10000}',
    '{"mode":"mystery","runId":"c2007","start":-5}', '{"mode":"challenge","runId":"c2007","start":10000}']) {
    s.setItem('dps:resume', bad);
    expect(takeResume()).toBeNull();
  }
  delete g.sessionStorage;
  expect(() => saveResume({ mode: 'mystery', runId: 'c2007', start: 10000 })).not.toThrow();
  expect(takeResume()).toBeNull();
});

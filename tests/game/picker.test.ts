import { describe, expect, test } from 'vitest';
import { DAILY_ENABLED, FIRST_GAME_RUNS, LAUNCH_DATE, dailyPick, pickMystery } from '../../src/game/picker';
import { RUNS, RUN_IDS } from '../../src/content/runs';

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const kindOf = (id: string) => RUNS.find((r) => r.id === id)!.kind;

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('pickMystery', () => {
  test('scares are 48% to 52% of 10,000 picks and no run comes three times running', () => {
    const rng = seeded(12345);
    const recent: string[] = [];
    let scares = 0;
    for (let i = 0; i < 10000; i++) {
      const id = pickMystery(rng, recent);
      expect(RUN_IDS).toContain(id);
      if (kindOf(id) === 'scare') scares++;
      if (recent.length >= 2) expect(recent[0] === id && recent[1] === id).toBe(false);
      recent.unshift(id);
      recent.length = Math.min(recent.length, 5);
    }
    expect(scares / 10000).toBeGreaterThanOrEqual(0.48);
    expect(scares / 10000).toBeLessThanOrEqual(0.52);
  });
  test('avoids the third repeat even when the rng insists', () => {
    const id = pickMystery(() => 0, ['c1929', 'c1929']);
    expect(id).not.toBe('c1929');
    const id2 = pickMystery(() => 0.99999, ['s2025', 's2025']);
    expect(id2).not.toBe('s2025');
  });
});

describe('the first game a player ever plays (R46)', () => {
  test('is a real crash: 1987, 2008, 2020 or 2022', () => {
    expect([...FIRST_GAME_RUNS].sort()).toEqual(['c1987', 'c2007', 'c2020', 'c2022']);
  });
  test('is chosen at random from those four, each about a quarter of the time', () => {
    const rng = seeded(777);
    const counts = new Map<string, number>();
    for (let i = 0; i < 8000; i++) {
      const id = pickMystery(rng, [], { firstEver: true });
      expect(FIRST_GAME_RUNS).toContain(id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.size).toBe(4);
    for (const n of counts.values()) expect(n / 8000).toBeGreaterThan(0.22);
  });
  test('every rng value maps inside the four', () => {
    expect(FIRST_GAME_RUNS).toContain(pickMystery(() => 0, [], { firstEver: true }));
    expect(FIRST_GAME_RUNS).toContain(pickMystery(() => 0.999999, [], { firstEver: true }));
  });
  test('later games use the whole pool again', () => {
    const rng = seeded(4);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(pickMystery(rng, [], { firstEver: false }));
    expect(seen.size).toBe(RUN_IDS.length);
  });
});

describe('the daily crash (R47)', () => {
  test('is switched off for phase 1; the code stays', () => {
    expect(DAILY_ENABLED).toBe(false);
    expect(typeof dailyPick).toBe('function');
  });
});

describe('dailyPick', () => {
  test('launch date is number 1 and is a named constant', () => {
    expect(LAUNCH_DATE).toBe('2026-11-21');
    expect(dailyPick(LAUNCH_DATE).number).toBe(1);
    expect(dailyPick('2026-11-22').number).toBe(2);
  });
  test('same date, same run', () => {
    expect(dailyPick('2027-03-04')).toEqual(dailyPick('2027-03-04'));
  });
  test('any twelve consecutive days cover all twelve runs, half of them scares', () => {
    for (let start = -30; start < 400; start++) {
      const ids = Array.from({ length: 12 }, (_, i) => dailyPick(addDays(LAUNCH_DATE, start + i)).runId);
      expect(new Set(ids).size).toBe(12);
      expect(ids.filter((id) => kindOf(id) === 'scare').length).toBe(6);
    }
  });
  test('dates before launch do not throw', () => {
    const p = dailyPick('2026-01-01');
    expect(p.number).toBeLessThanOrEqual(0);
    expect(RUN_IDS).toContain(p.runId);
  });
});

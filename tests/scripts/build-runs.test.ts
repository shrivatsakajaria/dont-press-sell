import { describe, expect, test } from 'vitest';
import { buildRun, RUN_TABLE } from '../../scripts/build-runs';

// Weekday-ish synthetic dates spaced a week apart so month arithmetic is meaningful.
function weeks(n: number, from = '2001-01-01'): string[] {
  const t0 = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * 7 * 86_400_000).toISOString().slice(0, 10));
}

describe('buildRun', () => {
  test('crash: slices day 1 to recovery, indices relative to day 1', () => {
    const closes = [90, 100, 96, 92.9, 80, 60, 72, 90, 100.5, 110];
    const dates = weeks(closes.length);
    const { run, info } = buildRun(dates, closes, {
      id: 'cTest',
      kind: 'crash',
      pickName: 'Test crash',
      highDate: dates[1],
      reveal: 'That was a test.',
    });
    expect(run).toEqual({
      id: 'cTest',
      kind: 'crash',
      pickName: 'Test crash',
      revealLine: 'That was a test.',
      dates: dates.slice(3, 9),
      closes: [92.9, 80, 60, 72, 90, 100.5],
      lowIndex: 2,
      fallEndIndex: 3,
      high: 100,
      preCloses: [90, 100, 96], // all the days before day 1 here; 30 when there are 30
    });
    expect(Object.keys(run)).toEqual([
      'id', 'kind', 'pickName', 'revealLine', 'dates', 'closes', 'lowIndex', 'fallEndIndex',
      'high', 'preCloses',
    ]);
    expect(info.fallPct).toBeCloseTo(-40, 10);
    expect(info.highDate).toBe(dates[1]);
    expect(info.endDate).toBe(dates[8]);
  });

  test('scare: reveal line gains "It was back in N months" counted from the lowest close', () => {
    // low on week 3, recovery on week 20: 119 days, 3.9 months -> four months
    const closes = [100, 92, 90, 85, ...Array(16).fill(95), 100.5];
    const dates = weeks(closes.length);
    const { run } = buildRun(dates, closes, {
      id: 'sTest',
      kind: 'scare',
      pickName: 'Test wobble',
      highDate: dates[0],
      reveal: 'That was the test wobble.',
    });
    expect(run.revealLine).toBe('That was the test wobble. It was back in four months.');
    expect(run.lowIndex).toBe(2);
  });

  test('refuses a high that is not a record close', () => {
    const closes = [101, 100, 90, 60, 102];
    const dates = weeks(closes.length);
    expect(() =>
      buildRun(dates, closes, { id: 'x', kind: 'crash', pickName: 'x', highDate: dates[1], reveal: 'x' }),
    ).toThrow(/record/);
  });

  test('scare: high need not be a record, only the highest close of the year before it (ruling R12)', () => {
    // An old record of 120 more than a year (60 weeks) earlier, then a local peak of 100.
    const closes = [120, ...Array(60).fill(90), 100, 92, 85, ...Array(8).fill(95), 100.5];
    const dates = weeks(closes.length);
    const entry = { id: 's', kind: 'scare' as const, pickName: 's', highDate: dates[61], reveal: 'x.' };
    const { run } = buildRun(dates, closes, entry);
    expect(run.closes).toEqual([92, 85, ...Array(8).fill(95), 100.5]);
    expect(run.revealLine).toBe('x. It was back in two months.');
    // The same series refused as a crash: its high is not a record.
    expect(() => buildRun(dates, closes, { ...entry, kind: 'crash' })).toThrow(/record/);
  });

  test('scare: refuses a high beaten within the year before it', () => {
    const closes = [80, ...Array(40).fill(90), 101, 90, 100, 92, 85, 95, 101.5];
    const dates = weeks(closes.length);
    expect(() =>
      buildRun(dates, closes, { id: 's', kind: 'scare', pickName: 's', highDate: dates[43], reveal: 'x.' }),
    ).toThrow(/year before/);
  });

  test('refuses a high beaten between the high and day 1', () => {
    const closes = [90, 100, 101, 92, 85, 95, 102];
    const dates = weeks(closes.length);
    expect(() =>
      buildRun(dates, closes, { id: 's', kind: 'scare', pickName: 's', highDate: dates[1], reveal: 'x.' }),
    ).toThrow(/between the high and day 1/);
  });

  test('refuses a scare that falls 20% or more, and a crash that falls less', () => {
    const deep = [100, 90, 80, 101];
    const shallow = [100, 90, 85, 101];
    const d = weeks(4);
    expect(() =>
      buildRun(d, deep, { id: 'x', kind: 'scare', pickName: 'x', highDate: d[0], reveal: 'x' }),
    ).toThrow(/scare/);
    expect(() =>
      buildRun(d, shallow, { id: 'x', kind: 'crash', pickName: 'x', highDate: d[0], reveal: 'x' }),
    ).toThrow(/crash/);
  });

  test('refuses a scare that takes over a year from day 1 to recover', () => {
    const closes = [100, 92, 85, ...Array(60).fill(95), 101];
    const dates = weeks(closes.length);
    expect(() =>
      buildRun(dates, closes, { id: 'x', kind: 'scare', pickName: 'x', highDate: dates[0], reveal: 'x' }),
    ).toThrow(/year/);
  });
});

describe('RUN_TABLE', () => {
  test('six crashes and six scares with unique ids', () => {
    expect(RUN_TABLE).toHaveLength(12);
    expect(RUN_TABLE.filter((r) => r.kind === 'crash')).toHaveLength(6);
    expect(new Set(RUN_TABLE.map((r) => r.id)).size).toBe(12);
    expect(RUN_TABLE.slice(0, 6).map((r) => r.id)).toEqual([
      'c1929', 'c1987', 'c2000', 'c2007', 'c2020', 'c2022',
    ]);
  });
  test('never names the index', () => {
    expect(JSON.stringify(RUN_TABLE)).not.toMatch(/S&P/i);
  });
});

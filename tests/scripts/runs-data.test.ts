import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildAll, ROOT } from '../../scripts/build-runs';
import { loadRun, RUNS, RUN_IDS } from '../../src/content/runs';
import type { RunData } from '../../src/engine/types';

const built = buildAll();

describe('committed run data matches a fresh build from the raw file', () => {
  test.each(built.map((b) => [b.run.id, b.run] as const))('%s', (id, fresh) => {
    const onDisk = JSON.parse(
      readFileSync(resolve(ROOT, `data/runs/${id}.prices.json`), 'utf8'),
    ) as RunData;
    expect(onDisk).toEqual(fresh);
  });

  test('loadRun returns the price file for every run, and refuses unknown ids', async () => {
    for (const { run } of built) expect(await loadRun(run.id)).toEqual(run);
    await expect(loadRun('nope')).rejects.toThrow(/unknown run/);
  });

  test('manifest lists the same twelve runs in table order', () => {
    expect(RUN_IDS).toEqual(built.map((b) => b.run.id));
    expect(RUNS).toEqual(
      built.map(({ run: { id, kind, pickName, revealLine } }) => ({ id, kind, pickName, revealLine })),
    );
  });
});

describe('each run keeps the window rules', () => {
  test.each(built.map((b) => [b.run.id, b] as const))('%s', (_id, { run, info }) => {
    const { dates, closes, lowIndex, fallEndIndex } = run;
    expect(dates.length).toBe(closes.length);
    for (let i = 1; i < dates.length; i++) expect(dates[i] > dates[i - 1]).toBe(true);
    // Day 1 is at least 7% below the high; no earlier day after the high was.
    expect(closes[0]).toBeLessThanOrEqual(info.high * 0.93);
    // Last day is the first close above the high.
    expect(closes[closes.length - 1]).toBeGreaterThan(info.high);
    for (let i = 0; i < closes.length - 1; i++) expect(closes[i]).toBeLessThanOrEqual(info.high);
    expect(Math.min(...closes)).toBe(closes[lowIndex]);
    expect(lowIndex).toBeLessThan(fallEndIndex);
    expect(fallEndIndex).toBeLessThan(closes.length);
  });
});

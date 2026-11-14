// PLACEHOLDER manifest written in Task 1 so every lane agrees on run ids.
// scripts/build-runs.ts (Task 2) regenerates this file with the same exports.
import type { RunData, RunMeta } from '../engine/types';

export const RUNS: RunMeta[] = [
  { id: 'c1929', kind: 'crash', pickName: '1929', revealLine: 'That was 1929.' },
  { id: 'c1987', kind: 'crash', pickName: '1987', revealLine: 'That was 1987.' },
  { id: 'c2000', kind: 'crash', pickName: '2000', revealLine: 'That was 2000.' },
  { id: 'c2007', kind: 'crash', pickName: '2008', revealLine: 'That was 2008.' },
  { id: 'c2020', kind: 'crash', pickName: '2020', revealLine: 'That was 2020.' },
  { id: 'c2022', kind: 'crash', pickName: '2022', revealLine: 'That was 2022.' },
  { id: 's1998', kind: 'scare', pickName: '1998', revealLine: 'That was 1998.' },
  { id: 's2010', kind: 'scare', pickName: '2010', revealLine: 'That was 2010.' },
  { id: 's2011', kind: 'scare', pickName: '2011', revealLine: 'That was 2011.' },
  { id: 's2015', kind: 'scare', pickName: '2015', revealLine: 'That was 2015.' },
  { id: 's2018', kind: 'scare', pickName: '2018', revealLine: 'That was 2018.' },
  { id: 's2025', kind: 'scare', pickName: '2025', revealLine: 'That was 2025.' },
];

export const RUN_IDS: string[] = RUNS.map((r) => r.id);

export function runMeta(id: string): RunMeta | undefined {
  return RUNS.find((r) => r.id === id);
}

/** Loads a run's prices. Task 2 replaces this with lazy imports of data/runs/<id>.prices.json. */
export async function loadRun(id: string): Promise<RunData> {
  throw new Error(`run data not built yet: ${id}`);
}

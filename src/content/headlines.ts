// Each run's headlines, loaded lazily (one small chunk per run, like the prices).
// The JSON files are generated from the CSVs by scripts/build-headlines.ts.
import type { Headline } from '../engine/types';

const loaders = import.meta.glob<Headline[]>('../../data/runs/*.headlines.json', { import: 'default' });

/** Loads a run's headlines; an unknown run, or a failed load, gives an empty list (prices alone still play). */
export async function loadHeadlines(id: string): Promise<Headline[]> {
  const load = loaders[`../../data/runs/${id}.headlines.json`];
  if (!load) return [];
  try {
    return await load();
  } catch {
    return [];
  }
}

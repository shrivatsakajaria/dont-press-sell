import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { headlinesFor } from '../../scripts/build-headlines';
import { RUN_IDS } from '../../src/content/runs';
import { loadHeadlines } from '../../src/content/headlines';

const ROOT = resolve(__dirname, '../..');

describe('shipped headline files match the CSV source', () => {
  test.each(RUN_IDS.map((id) => [id]))('%s', (id) => {
    const onDisk = JSON.parse(readFileSync(resolve(ROOT, `data/runs/${id}.headlines.json`), 'utf8'));
    expect(onDisk).toEqual(headlinesFor(id));
  });

  test('only the five Headline fields ship (no sources or notes)', () => {
    for (const id of RUN_IDS) {
      for (const h of headlinesFor(id)) expect(Object.keys(h).sort()).toEqual(['anon', 'big', 'dayIndex', 'real', 'sombre']);
    }
  });

  test('loadHeadlines returns the file, and an empty list for an unknown run', async () => {
    expect(await loadHeadlines('c2007')).toEqual(headlinesFor('c2007'));
    expect(await loadHeadlines('nope')).toEqual([]);
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountPickCrash, mountCollection, recordSentence, VERDICT_TITLES } from '../../src/ui/menus';
import { RUNS } from '../../src/content/runs';
import { verdictCopy } from '../../src/engine/verdict';
import type { RunData, RunResult, VerdictId } from '../../src/engine/types';
import type { CollectionProps } from '../../src/ui/menus';

const rec = { games: 9, wins: 3, soldTooEarly: 4 };
function collection(over: Partial<CollectionProps> = {}) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const props = {
    record: rec,
    pot: 12300,
    busts: 0,
    bestStreak: 0,
    played: [] as string[],
    storageOk: true,
    titles: [] as VerdictId[],
    runs: RUNS,
    unlocked: false,
    onBack: () => {},
    ...over,
  };
  mountCollection(root, props);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('recordSentence', () => {
  it('uses plain wording and correct singulars', () => {
    expect(recordSentence(rec)).toBe('9 games, 3 wins, sold too early 4 times');
    expect(recordSentence({ games: 1, wins: 1, soldTooEarly: 1 })).toBe('1 game, 1 win, sold too early once');
    expect(recordSentence({ games: 0, wins: 0, soldTooEarly: 0 })).toBe('No games yet');
  });
});

describe('pick a crash', () => {
  it('lists all twelve runs as buttons and labels the kind', () => {
    const root = document.createElement('div');
    const onPick = vi.fn();
    mountPickCrash(root, { runs: RUNS, onPick, onBack: () => {} });
    const rows = root.querySelectorAll('button[data-run]');
    expect(rows.length).toBe(12);
    RUNS.forEach((r, i) => {
      const t = rows[i].textContent!;
      expect(t).toContain(r.pickName);
      expect(t).toContain(r.kind === 'scare' ? 'False alarm' : 'Crash');
    });
    expect(root.textContent).toContain('Practice');
    expect(root.textContent).toContain('do not count towards your pot or your collection');
    (rows[6] as HTMLElement).click();
    expect(onPick).toHaveBeenCalledWith(RUNS[6].id);
  });
  it('back button calls onBack', () => {
    const root = document.createElement('div');
    const onBack = vi.fn();
    mountPickCrash(root, { runs: RUNS, onPick: () => {}, onBack });
    (root.querySelector('[data-back]') as HTMLElement).click();
    expect(onBack).toHaveBeenCalled();
  });
});

describe('VERDICT_TITLES', () => {
  const run = { id: 'x', kind: 'crash', pickName: '', revealLine: '', dates: [], closes: [1, 2, 3], lowIndex: 1, fallEndIndex: 2 } as RunData;
  const result: RunResult = { final: 1, holderFinal: 1, perfectFinal: 1, lead: 0, share: 0, balances: [], daysInCash: 0, trades: [] };
  it('matches verdictCopy for every id', () => {
    for (const id of Object.keys(VERDICT_TITLES) as VerdictId[]) {
      const c = verdictCopy(id, result, run);
      expect(VERDICT_TITLES[id].title).toBe(c.title);
      expect(VERDICT_TITLES[id].line).toBe(c.line);
    }
  });
});

describe('collection', () => {
  it('counts played out of twelve', () => {
    expect(collection({ played: ['c1929', 's1998'] }).textContent).toContain('2 of 12 played');
    expect(collection({ played: [] }).textContent).toContain('0 of 12 played');
  });
  it('shows the kind only for played runs and a visible not-played line for the rest', () => {
    const root = collection({ played: ['c1929'] });
    const played = root.querySelector('[data-run="c1929"]')!.textContent!;
    expect(played).toContain('Crash');
    expect(played).not.toContain('Not played yet');
    const unplayed = root.querySelector('[data-run="c1987"]')!.textContent!;
    expect(unplayed).toContain('Not played yet');
    expect(unplayed).not.toContain('Crash');
  });
  it('count agrees with the list: the played count never counts hidden rows', () => {
    const root = collection({ played: ['c1929', 's2011', 'ghost'] });
    expect(root.textContent).toContain('2 of 12 played');
    expect(root.querySelectorAll('[data-run]').length).toBe(7);
  });
  it('hides false alarms until met, but lists crashes', () => {
    const t = collection({ played: ['c1929'] }).textContent!;
    expect(t).toContain(RUNS[0].pickName);
    for (const r of RUNS.filter((r) => r.kind === 'scare')) expect(t).not.toContain(r.pickName);
    const t2 = collection({ played: ['s1998'] }).textContent!;
    expect(t2).toContain(RUNS.find((r) => r.id === 's1998')!.pickName);
    expect(t2).not.toContain(RUNS.find((r) => r.id === 's2011')!.pickName);
  });
  it('shows earned titles and a dash for the rest', () => {
    const root = collection({ titles: ['paper', 'diamond'] });
    expect(root.querySelectorAll('[data-title]').length).toBe(9);
    expect(root.textContent).toContain('Paper hands');
    expect(root.textContent).toContain('Diamond hands');
    expect(root.textContent).not.toContain('Bagholder');
    expect(root.textContent).toContain('2 of 9 titles earned');
    expect(root.textContent).toContain('Not earned yet');
    expect(root.querySelectorAll('[data-title="empty"]').length).toBe(7);
    expect(Object.keys(VERDICT_TITLES).length).toBe(9);
  });
  it('folio says where it is kept', () => {
    expect(collection({ storageOk: true }).querySelector('.dps-folio')!.textContent).toContain('Kept on this phone');
    expect(collection({ storageOk: false }).querySelector('.dps-folio')!.textContent).toContain('For this visit');
  });
  it('shows the record line, pot, busts and best streak title', () => {
    const t = collection({ busts: 2, bestStreak: 3 }).textContent!;
    expect(t).toContain('9 games, 3 wins, sold too early 4 times');
    expect(t).toContain('Your pot: $12,300');
    expect(t).toContain('Gone bust 2 times');
    expect(t).toContain('3 wins in a row');
    expect(t).toContain('Shark');
    expect(collection({ busts: 1 }).textContent).toContain('Gone bust once');
    expect(collection({ busts: 0 }).textContent).not.toContain('bust');
    expect(collection({ bestStreak: 0 }).textContent).toContain('No streak yet');
    expect(collection({ bestStreak: 1 }).textContent).toContain('1 win in a row');
  });
  it('hides the borrowed switch when locked, shows and toggles when unlocked', () => {
    expect(collection().textContent).not.toContain('Play with borrowed money');
    const onToggle = vi.fn();
    const root = collection({ unlocked: true, borrowed: false, onToggleBorrowed: onToggle });
    const sw = root.querySelector('[role="switch"]') as HTMLElement;
    expect(sw.textContent).toContain('Play with borrowed money');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });
});

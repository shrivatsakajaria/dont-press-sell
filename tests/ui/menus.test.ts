// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountPickCrash, mountCollection, recordSentence, VERDICT_TITLES } from '../../src/ui/menus';
import { RUNS } from '../../src/content/runs';

const rec = { games: 9, wins: 3, soldTooEarly: 4 };
function collection(over: Record<string, unknown> = {}) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const props = {
    record: rec,
    pot: 12300,
    busts: 0,
    bestStreak: 0,
    played: [] as string[],
    titles: [] as never[],
    runs: RUNS,
    unlocked: false,
    onBack: () => {},
    ...over,
  };
  mountCollection(root, props as never);
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
    expect(rows[0].textContent).toContain(RUNS[0].pickName);
    expect(root.textContent).toContain('False alarm');
    expect(root.textContent).toContain('Crash');
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

describe('collection', () => {
  it('counts played out of twelve', () => {
    expect(collection({ played: ['c1929', 's1998'] }).textContent).toContain('2 of 12 played');
    expect(collection({ played: [] }).textContent).toContain('0 of 12 played');
  });
  it('hides false alarms until met, but lists crashes', () => {
    const t = collection({ played: ['c1929'] }).textContent!;
    expect(t).toContain(RUNS[0].pickName);
    for (const r of RUNS.filter((r) => r.kind === 'scare')) expect(t).not.toContain(r.pickName);
    const t2 = collection({ played: ['s1998'] }).textContent!;
    expect(t2).toContain(RUNS.find((r) => r.id === 's1998')!.pickName);
    expect(t2).not.toContain(RUNS.find((r) => r.id === 's2010')!.pickName);
  });
  it('shows earned titles and a dash for the rest', () => {
    const root = collection({ titles: ['paper', 'diamond'] });
    expect(root.querySelectorAll('[data-title]').length).toBe(9);
    expect(root.textContent).toContain('Paper hands');
    expect(root.textContent).toContain('Diamond hands');
    expect(root.textContent).not.toContain('Bagholder');
    expect(root.querySelectorAll('[data-title="empty"]').length).toBe(7);
    expect(Object.keys(VERDICT_TITLES).length).toBe(9);
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

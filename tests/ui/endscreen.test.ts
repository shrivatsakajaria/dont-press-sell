// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { announce } from '../../src/ui/a11y';
import { keep } from '../../src/ui/endchart';
import { holderNoteDue, mountEndScreen, type EndModel } from '../../src/ui/endscreen';
import { c2007Sample, losingSample, winningSample } from '../fixtures/sample-result';

vi.mock('../../src/ui/a11y', () => ({ announce: vi.fn(), initAnnouncer: vi.fn() }));
const announced = () => vi.mocked(announce).mock.calls.map((c) => c[0]);

describe('chart thinning', () => {
  test('keeps the ends, the high, the low and both edges of a flat stretch', () => {
    const vals = Array.from({ length: 1000 }, (_, i) => 100 + Math.sin(i / 7) * 10 + i / 50);
    for (let i = 400; i <= 600; i++) vals[i] = 50; // in cash
    vals[777] = 500;
    const k = keep(vals);
    expect(k.length).toBeLessThan(260);
    for (const i of [0, 999, 400, 600, 777]) expect(k).toContain(i);
    expect(keep([1, 2, 3])).toEqual([0, 1, 2]);
  });
});

let root: HTMLElement;
let handle: { destroy(): void } | null = null;

function mount(model: EndModel) {
  handle = mountEndScreen(root, model);
  return handle;
}

/** All text a person or a screen reader could get from the page. */
function allText(): string {
  const labels = Array.from(root.querySelectorAll('[aria-label]')).map((e) => e.getAttribute('aria-label'));
  return [root.textContent ?? '', ...labels].join(' ');
}

const revealButton = () =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Tap to see what that was');

beforeEach(() => {
  vi.mocked(announce).mockClear();
  vi.useFakeTimers();
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  handle?.destroy();
  handle = null;
  vi.useRealTimers();
});

describe('the reveal', () => {
  test('the crash name is hidden behind "Tap to see what that was" until a tap', () => {
    mount(c2007Sample());
    expect(revealButton()).toBeTruthy();
    expect(root.textContent).not.toContain('That was 2008');
    revealButton()!.click();
    expect(revealButton()).toBeUndefined();
    expect(root.textContent).toContain('That was 2008');
  });

  test('the crash name shows by itself after 4 seconds', () => {
    mount(c2007Sample());
    vi.advanceTimersByTime(3999);
    expect(root.textContent).not.toContain('That was 2008');
    vi.advanceTimersByTime(1);
    expect(root.textContent).toContain('That was 2008');
  });

  test('a run that is not blind shows the name at once', () => {
    const m = c2007Sample();
    m.flags = { showCountdown: false, blind: false };
    mount(m);
    expect(revealButton()).toBeUndefined();
    expect(root.textContent).toContain('That was 2008');
  });

  test('the lead counts from $0 to the final figure over about 1.5 s after the reveal', () => {
    const m = c2007Sample();
    mount(m);
    const el = root.querySelector('[data-lead]') as HTMLElement;
    const lead = () => el.textContent;
    const score = el.closest('.es-score') as HTMLElement;
    expect(score.hidden).toBe(true);
    expect(lead()).not.toContain('$0');
    revealButton()!.click();
    expect(score.hidden).toBe(false);
    vi.advanceTimersByTime(700);
    const mid = lead();
    expect(mid).not.toBe('$0 ahead of someone who did nothing');
    vi.advanceTimersByTime(900);
    expect(lead()).toBe('$3,719 ahead of someone who did nothing');
  });

  test('a level finish reads "Level with someone who did nothing" (R32)', () => {
    const m = c2007Sample();
    m.result = { ...m.result, trades: [], lead: 0, final: m.result.holderFinal };
    mount(m);
    vi.advanceTimersByTime(4000 + 1600);
    expect(root.querySelector('[data-lead]')!.textContent).toBe('Level with someone who did nothing');
    expect(root.textContent).not.toContain('$0 ahead');
  });

  test('a loss counts down and reads "behind"', () => {
    mount(losingSample());
    vi.advanceTimersByTime(4000 + 1600);
    expect(root.querySelector('[data-lead]')!.textContent).toBe('$2,095 behind someone who did nothing');
  });

  test('with reduced motion the score appears at once on the reveal', () => {
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('reduce'), media: q }) as unknown as MediaQueryList,
    );
    mount(c2007Sample());
    revealButton()!.click();
    expect(root.querySelector('[data-lead]')!.textContent).toBe('$3,719 ahead of someone who did nothing');
    mm.mockRestore();
  });
});

describe('the countdown', () => {
  test('starts after the reveal, counts down and calls onNewMystery at 0', () => {
    const m = c2007Sample();
    const onNewMystery = vi.fn();
    m.actions.onNewMystery = onNewMystery;
    mount(m);
    expect(root.textContent).not.toContain('Next mystery crash in');
    revealButton()!.click();
    // Only once the count-up has finished.
    vi.advanceTimersByTime(1400);
    expect(root.textContent).not.toContain('Next mystery crash in');
    vi.advanceTimersByTime(100);
    expect(root.textContent).toContain('Next mystery crash in 10. Tap to stop.');
    // In flow, straight after the score lines.
    const line = Array.from(root.querySelectorAll('button')).find((b) => b.textContent!.startsWith('Next mystery'))!;
    expect(line.previousElementSibling!.textContent).toBe('Perfect timing made $24,188. You made $14,513.');
    vi.advanceTimersByTime(1000);
    expect(root.textContent).toContain('Next mystery crash in 9. Tap to stop.');
    vi.advanceTimersByTime(9000);
    expect(onNewMystery).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(onNewMystery).toHaveBeenCalledTimes(1);
    expect(announced().filter((a) => a.includes('Next mystery crash in'))).toEqual(['Next mystery crash in 10. Tap to stop.']);
  });

  test('with reduced motion it starts at once and is announced with the reveal, once', () => {
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('reduce'), media: q }) as unknown as MediaQueryList,
    );
    mount(c2007Sample());
    expect(revealButton()).toBeTruthy(); // R25: the cover stays
    revealButton()!.click();
    expect(root.textContent).toContain('Next mystery crash in 10. Tap to stop.');
    vi.advanceTimersByTime(3000);
    const a = announced();
    expect(a).toHaveLength(1);
    expect(a[0]).toContain('That was 2008.');
    expect(a[0]).toContain('Next mystery crash in 10. Tap to stop.');
    mm.mockRestore();
  });

  test('any touch on the page stops it', () => {
    const m = c2007Sample();
    const onNewMystery = vi.fn();
    m.actions.onNewMystery = onNewMystery;
    mount(m);
    revealButton()!.click();
    vi.advanceTimersByTime(1500 + 2000);
    expect(root.textContent).toContain('Next mystery crash in 8');
    root.querySelector('h1')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(root.textContent).not.toContain('Next mystery crash in');
    vi.advanceTimersByTime(20000);
    expect(onNewMystery).not.toHaveBeenCalled();
  });

  test('stopping it keeps its space, so the buttons under it do not jump under the finger', () => {
    mount(c2007Sample());
    revealButton()!.click();
    vi.advanceTimersByTime(1500 + 2000);
    const line = root.querySelector('.es-count') as HTMLElement;
    const next = line.nextElementSibling;
    root.querySelector('h1')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(root.querySelector('.es-count')).toBeNull();
    const gap = root.querySelector('.es-count-gap') as HTMLElement;
    expect(gap).not.toBeNull();
    expect(gap.nextElementSibling).toBe(next);
    expect(gap.getAttribute('aria-hidden')).toBe('true');
    expect(gap.textContent).toBe('');
  });

  test('never runs without showCountdown', () => {
    const m = losingSample();
    const onNewMystery = vi.fn();
    m.actions.onNewMystery = onNewMystery;
    mount(m);
    vi.advanceTimersByTime(30000);
    expect(root.textContent).not.toContain('Next mystery crash in');
    expect(onNewMystery).not.toHaveBeenCalled();
  });

  test('destroy stops every timer and empties the root', () => {
    const m = c2007Sample();
    const onNewMystery = vi.fn();
    m.actions.onNewMystery = onNewMystery;
    const h = mount(m);
    h.destroy();
    handle = null;
    vi.advanceTimersByTime(30000);
    expect(onNewMystery).not.toHaveBeenCalled();
    expect(root.childElementCount).toBe(0);
    expect(document.getElementById('es-style')).toBeNull();
  });
});

describe('the front page', () => {
  test.each([
    ['c2007', c2007Sample],
    ['winning', winningSample],
    ['losing', losingSample],
  ])('%s: verdict headline, title and line are printed', (_n, make) => {
    const m = make();
    mount(m);
    expect(root.querySelector('h1')!.textContent).toBe(m.verdict.headline);
    expect(root.textContent).toContain(`${m.verdict.title}.`);
    expect(root.textContent).toContain(m.verdict.line);
  });

  test.each([
    ['c2007', c2007Sample],
    ['winning', winningSample],
    ['losing', losingSample],
  ])('%s: never says "the holder" and shows no percentage', (_n, make) => {
    mount(make());
    vi.advanceTimersByTime(4000 + 2000);
    const text = allText().toLowerCase();
    expect(text).not.toContain('the holder');
    expect(text).not.toContain('%');
    expect(text).not.toMatch(/s&p/);
  });

  test('table, perfect line, near misses, trade news, pot line and footer', () => {
    const m = c2007Sample();
    mount(m);
    revealButton()!.click();
    const t = root.textContent!;
    expect(t).toContain('You$14,513');
    expect(t).toContain('Someone who did nothing$10,794');
    expect(t).toContain('Perfect timing$24,188');
    expect(t).toContain('Perfect timing made $24,188. You made $14,513.');
    for (const line of m.nearMisses) expect(t).toContain(line);
    expect(t).toContain('Sold: House rejects the $700 billion bank rescue plan');
    expect(t).toContain("Bought: Treasury details a plan to buy banks' bad assets");
    expect(t).toContain('Your pot: $13,719. Up $3,719 tonight.');
    expect(t).toContain('US stock market · A Still Signal build');
    expect(t).toContain('Late edition');
    expect(t).toContain('Mystery crash');
  });

  test('before the reveal the score block is out of the page: no "Perfect timing made" line and no blank gap', () => {
    mount(c2007Sample());
    const score = root.querySelector('.es-score') as HTMLElement;
    expect(score.hidden).toBe(true);
    expect(score.querySelector('.es-perfect')!.textContent).toBe('Perfect timing made $24,188. You made $14,513.');
    expect(root.querySelector('.es-newsbox')!.getAttribute('style') ?? '').not.toContain('--news-h');
    vi.advanceTimersByTime(4000);
    expect(score.hidden).toBe(false);
  });

  test('the result chart draws the market as a dashed line while the player was out', () => {
    mount(c2007Sample());
    const svg = root.querySelector('svg[role="img"]')!;
    expect(svg.querySelector('[data-line="market"]')).not.toBeNull();
    expect(svg.getAttribute('aria-label')).toContain('the market while you were out');
    mount(losingSample());
    // losingSample sold near the low and bought back higher: the dashed line shows the bounce it missed.
    expect(root.querySelector('svg [data-line="market"]')).not.toBeNull();
  });

  test('before the reveal the table figures and the "Keep your $N win" line keep their space but are hidden', () => {
    const m = winningSample();
    m.actions = { ...m.actions, onDouble: () => {}, onBank: () => {} };
    mount(m);
    const money = Array.from(root.querySelectorAll('.es-row span:last-child')) as HTMLElement[];
    expect(money.length).toBe(3);
    const stake = root.querySelector('.es-stake')!.closest('.es-double') as HTMLElement; // held with its block
    for (const e of [...money, stake]) expect(e.style.visibility).toBe('hidden');
    expect(money[0].textContent).toMatch(/^\$[\d,]+$/); // the text is there, so nothing moves at the reveal
    revealButton()!.click();
    for (const e of [...money, stake]) expect(e.style.visibility).toBe('');
  });

  test('before the reveal the double block (with "Bank $N"), the pot line and money near misses keep their space, hidden', () => {
    const m = winningSample();
    m.nearMisses = [...m.nearMisses, 'One trade from perfect: perfect timing made $15,160'];
    m.actions = { ...m.actions, onDouble: () => {}, onBank: () => {} };
    mount(m);
    const block = root.querySelector('.es-double') as HTMLElement;
    const pot = root.querySelector('.es-pot') as HTMLElement;
    const money = Array.from(root.querySelectorAll('.es-misses li')).filter((li) => li.textContent!.includes('$')) as HTMLElement[];
    expect(money.length).toBeGreaterThan(0);
    expect(block.querySelector('.es-out')!.textContent).toMatch(/^Bank \$/);
    const held = [block, pot, ...money];
    for (const e of held) expect(e.style.visibility).toBe('hidden');
    // Plain near misses (no figure) show at once.
    const plain = Array.from(root.querySelectorAll('.es-misses li')).filter((li) => !li.textContent!.includes('$')) as HTMLElement[];
    for (const e of plain) expect(e.style.visibility).toBe('');
    revealButton()!.click();
    for (const e of held) expect(e.style.visibility).toBe('');
  });

  test('the count-up never shows "$0" for a frame', () => {
    for (const lead of [3719, 3, -2]) {
      const m = c2007Sample();
      m.result = { ...m.result, lead, final: m.result.holderFinal + lead };
      handle?.destroy();
      mount(m);
      const el = root.querySelector('[data-lead]') as HTMLElement;
      const seen = new Set<string>();
      const watch = new MutationObserver(() => seen.add(el.textContent ?? ''));
      watch.observe(el, { childList: true, characterData: true, subtree: true });
      revealButton()!.click();
      seen.add(el.textContent ?? '');
      for (let t = 0; t < 1700; t += 10) {
        vi.advanceTimersByTime(10);
        seen.add(el.textContent ?? '');
      }
      watch.disconnect();
      expect([...seen].filter((x) => /^\$0 /.test(x)), `lead ${lead}`).toEqual([]);
    }
  });

  test('for 350 ms after the score appears, a tap on a moved button does nothing', () => {
    const m = losingSample();
    const onRematch = vi.fn();
    m.actions = { ...m.actions, onRematch };
    mount(m);
    revealButton()!.click();
    const rematch = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Rematch this crash')!;
    vi.advanceTimersByTime(340);
    rematch.click();
    expect(onRematch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    rematch.click();
    expect(onRematch).toHaveBeenCalledTimes(1);
  });

  test('trade headlines appear only after the reveal', () => {
    mount(c2007Sample());
    expect(root.textContent).not.toContain('House rejects');
    expect(root.textContent).not.toContain('Treasury details');
    revealButton()!.click();
    expect(root.textContent).toContain('Sold: House rejects the $700 billion bank rescue plan');
  });

  test('R24: with the double block, Double or nothing is the only filled button', () => {
    const m = winningSample();
    m.actions = { ...m.actions, onRematch: () => {}, onChallenge: () => {}, onDouble: () => {}, onBank: () => {} };
    mount(m);
    const byText = (s: string) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent === s)!;
    expect(byText('Double or nothing').className).toBe('es-dbl');
    expect(byText('Rematch this crash').className).toBe('es-out');
    expect(byText('Challenge a friend').className).toBe('es-out');
  });

  test('R24: without it, Rematch is the filled main action', () => {
    const m = losingSample();
    m.actions = { ...m.actions, onRematch: () => {}, onChallenge: () => {} };
    mount(m);
    const byText = (s: string) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent === s)!;
    expect(byText('Rematch this crash').className).toBe('es-main');
  });

  test('the c2007 sample is a winning mystery run with a double block', () => {
    mount(c2007Sample());
    expect(root.querySelector('h2')!.textContent).toBe('Double or nothing');
  });

  test('chart marks sold and bought and has a text label', () => {
    mount(c2007Sample());
    const svg = root.querySelector('svg[role="img"]')!;
    expect(svg.getAttribute('aria-label')).toBeTruthy();
    expect(svg.textContent).toContain('Sold');
    expect(svg.textContent).toContain('Bought');
  });

  test('main actions call their callbacks', () => {
    const m = c2007Sample();
    const onRematch = vi.fn();
    const onChallenge = vi.fn();
    const onNewMystery = vi.fn();
    m.actions = { ...m.actions, onRematch, onChallenge, onNewMystery };
    mount(m);
    const byText = (s: string) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent === s)!;
    byText('Rematch this crash').click();
    byText('Challenge a friend').click();
    byText('Play a new mystery crash').click();
    expect(onRematch).toHaveBeenCalledTimes(1);
    expect(onChallenge).toHaveBeenCalledTimes(1);
    expect(onNewMystery).toHaveBeenCalledTimes(1);
  });

  test('double or nothing block with stake line and ladder', () => {
    const m = winningSample();
    const onDouble = vi.fn();
    const onBank = vi.fn();
    m.actions = { ...m.actions, onDouble, onBank };
    mount(m);
    const t = root.textContent!;
    expect(root.querySelector('h2')!.textContent).toBe('Double or nothing');
    expect(t).toContain(
      'Keep your $5,091 win, or take all $14,427 into another mystery game. Finish behind and the run is over.',
    );
    expect(t).toContain('Wins in a row');
    // Compact ladder: one line, titles printed only for the rung just reached and the next one;
    // every rung keeps its full name for screen readers.
    const shown = Array.from(root.querySelectorAll('.es-rung b')).map((b) => b.textContent);
    expect(shown).toEqual(['Hot hand', 'Shark']);
    expect(t).not.toContain("Beginner's luck");
    expect(t).not.toContain('Untouchable');
    const labels = Array.from(root.querySelectorAll('[data-rung]')).map((r) => r.getAttribute('aria-label'));
    expect(labels).toEqual([
      "1 win: Beginner's luck, reached",
      '2 wins: Hot hand, reached',
      '3 wins: Shark, next',
      '5 wins: Whale',
      '8 wins: Untouchable',
    ]);
    const rungs = root.querySelectorAll('[data-rung]');
    expect(Array.from(rungs).map((r) => r.getAttribute('data-rung'))).toEqual([
      'reached',
      'reached',
      'next',
      'ahead',
      'ahead',
    ]);
    const byText = (s: string) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent === s)!;
    byText('Double or nothing').click();
    byText('Bank $5,091').click();
    expect(onDouble).toHaveBeenCalledTimes(1);
    expect(onBank).toHaveBeenCalledTimes(1);
  });

  test('no double block when the model has none', () => {
    mount(losingSample());
    expect(root.querySelector('h2')).toBeNull();
  });

  test('challenger: dashed line, row and who won', () => {
    mount(losingSample());
    const t = root.textContent!;
    expect(t).toContain('Your challenger$14,513');
    expect(t).toContain('Your challenger beat you by $5,814');
    expect(root.querySelector('svg [data-line="other"]')).not.toBeNull();
  });

  test('rematch: score to beat row', () => {
    const m = losingSample();
    m.other = { kind: 'previous', balances: m.other!.balances, final: 7150 };
    mount(m);
    expect(root.textContent).toContain('Score to beat$7,150');
  });

  test('foot links and sound switch', () => {
    const m = c2007Sample();
    let on = true;
    const onToggleSound = vi.fn(() => (on = !on));
    const onDaily = vi.fn();
    m.sound = { on: true };
    m.actions = { ...m.actions, onToggleSound, onDaily, onPick: () => {}, onCollection: () => {} };
    mount(m);
    const byText = (s: string) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent === s);
    byText('Daily crash')!.click();
    expect(onDaily).toHaveBeenCalled();
    expect(byText('Pick a crash')).toBeTruthy();
    expect(byText('Your collection')).toBeTruthy();
    const sound = byText('Sound on')!;
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    sound.click();
    expect(sound.textContent).toBe('Sound off');
    expect(sound.getAttribute('aria-pressed')).toBe('false');
  });

  test('extra lines such as "4 days in a row" print under the score', () => {
    const m = losingSample();
    m.extraLines = ['4 days in a row'];
    mount(m);
    expect(Array.from(root.querySelectorAll('.es-vs')).map((e) => e.textContent)).toContain('4 days in a row');
  });

  test('the borrowed money switch shows its state and calls back', () => {
    const m = c2007Sample();
    let on = false;
    m.borrowed = { on: false };
    m.actions = { ...m.actions, onToggleBorrowed: vi.fn(() => (on = !on)) };
    mount(m);
    const b = Array.from(root.querySelectorAll('button')).find((x) => x.textContent === 'Play with borrowed money')!;
    expect(b.getAttribute('aria-pressed')).toBe('false');
    b.click();
    expect(b.textContent).toBe('Borrowed money on');
    expect(b.getAttribute('aria-pressed')).toBe('true');
  });

  test('daily: "Copy result" calls back and says when it is copied', async () => {
    const m = losingSample();
    m.actions = { ...m.actions, onCopyResult: vi.fn(async () => true) };
    mount(m);
    const b = Array.from(root.querySelectorAll('button')).find((x) => x.textContent === 'Copy result')!;
    b.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(m.actions.onCopyResult).toHaveBeenCalled();
    expect(b.textContent).toBe('Copied');
  });

  test('the front page is the main landmark', () => {
    mount(losingSample());
    expect(root.querySelector('main.es')).not.toBeNull();
  });
});


describe('plain words (R28)', () => {
  const NOTE = 'Someone who did nothing kept all their money in the market the whole time.';

  test('the holder note prints under the table when asked, and not otherwise', () => {
    mount({ ...c2007Sample(), holderNote: true });
    const note = Array.from(root.querySelectorAll('p')).find((p) => p.textContent === NOTE);
    expect(note).toBeTruthy();
    expect(note!.previousElementSibling?.classList.contains('es-table')).toBe(true);
    handle!.destroy();
    mount(c2007Sample());
    expect(root.textContent).not.toContain(NOTE);
  });

  test('the holder note is due the first time only, and every time when storage fails', () => {
    localStorage.clear();
    expect(holderNoteDue()).toBe(true);
    expect(holderNoteDue()).toBe(false);
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    try {
      expect(holderNoteDue()).toBe(true);
      expect(holderNoteDue()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('result page order (R28)', () => {
  test('score first, then the buttons, then the table, its note and the near misses; the countdown under the score', () => {
    const m = { ...c2007Sample(), holderNote: true, flags: { showCountdown: true, blind: false } };
    mount(m);
    vi.advanceTimersByTime(2000);
    // The score block's own lines count in place (it is one box so it can wait for the reveal).
    const order = Array.from(root.querySelector('main.es')!.children)
      .flatMap((e) => (e.classList.contains('es-score') ? Array.from(e.children) : [e]))
      .map((e) => e.className.split(' ')[0]);
    const at = (c: string) => order.indexOf(c);
    expect(at('es-lead')).toBeGreaterThan(at('es-h1'));
    expect(at('es-count')).toBe(at('es-perfect') + 1);
    // The main actions: the double block when offered, else the button pair.
    const actions = at('es-double') >= 0 ? at('es-double') : at('es-pair');
    expect(actions).toBeGreaterThan(at('es-count'));
    expect(at('es-table')).toBeGreaterThan(at('es-link'));
    expect(at('es-note')).toBe(at('es-table') + 1);
    expect(at('es-misses')).toBeGreaterThan(at('es-note'));
    expect(at('es-pot')).toBeGreaterThan(at('es-misses'));
  });
});

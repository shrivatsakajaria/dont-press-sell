// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { announce } from '../../src/ui/a11y';
import { keep } from '../../src/ui/endchart';
import { COUNT_MS, REVEAL_BEAT_MS, holderNoteDue, mountEndScreen, type EndModel } from '../../src/ui/endscreen';
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
    m.flags = { blind: false };
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
    // A beat: the name prints first, the score a moment later.
    expect(score.hidden).toBe(true);
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
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
    vi.advanceTimersByTime(4000 + REVEAL_BEAT_MS + 1600);
    expect(root.querySelector('[data-lead]')!.textContent).toBe('Level with someone who did nothing');
    expect(root.textContent).not.toContain('$0 ahead');
  });

  test('a loss counts down and reads "behind"', () => {
    mount(losingSample());
    vi.advanceTimersByTime(4000 + REVEAL_BEAT_MS + 1600);
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

describe('no countdown (R44)', () => {
  test('nothing starts the next game by itself, after a win or a loss', () => {
    for (const make of [c2007Sample, losingSample]) {
      const m = make();
      const onNewMystery = vi.fn();
      m.actions.onNewMystery = onNewMystery;
      handle?.destroy();
      mount(m);
      revealButton()?.click();
      vi.advanceTimersByTime(60000);
      expect(root.textContent).not.toContain('Next mystery crash');
      expect(onNewMystery).not.toHaveBeenCalled();
    }
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

  test('table, perfect line, near misses, trade news and footer; the pot stays hidden (R40)', () => {
    const m = c2007Sample();
    mount(m);
    revealButton()!.click();
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
    const t = root.textContent!;
    expect(t).toContain('You$14,513');
    expect(t).toContain('Someone who did nothing$10,794');
    expect(t).toContain('Perfect timing$24,188');
    expect(t).toContain('Perfect timing made $24,188. You finished with $14,513.');
    for (const line of m.nearMisses) expect(t).toContain(line);
    expect(t).toContain('Sold: House rejects the $700 billion bank rescue plan');
    expect(t).toContain("Bought: Treasury details a plan to buy banks' bad assets");
    expect(t).not.toContain('Your pot');
    expect(root.querySelector('.es-pot')).toBeNull();
    expect(t).toContain('US stock market · A Still Signal build');
    expect(t).toContain('Late edition');
    expect(t).toContain('Mystery crash');
  });

  test('before the reveal the score block is out of the page: no "Perfect timing made" line and no blank gap', () => {
    mount(c2007Sample());
    const score = root.querySelector('.es-score') as HTMLElement;
    expect(score.hidden).toBe(true);
    expect(score.querySelector('.es-perfect')!.textContent).toBe('Perfect timing made $24,188. You finished with $14,513.');
    expect(root.querySelector('.es-newsbox')!.getAttribute('style') ?? '').not.toContain('--news-h');
    vi.advanceTimersByTime(4000 + REVEAL_BEAT_MS);
    expect(score.hidden).toBe(false);
  });

  test('R42: the result chart draws the market price, with a dotted "sold at" level while the player was out', () => {
    mount(c2007Sample());
    const svg = root.querySelector('svg[role="img"]')!;
    expect(svg.querySelector('[data-line="price"]')).not.toBeNull();
    expect(svg.querySelector('[data-line="level"]')).not.toBeNull();
    expect(svg.querySelector('[data-line="you"], [data-line="market"]')).toBeNull();
    expect(svg.getAttribute('aria-label')).toContain('dots on the price line mark each sale and buy');
    mount(losingSample());
    // losingSample sold near the low and bought back higher: the level shows the buy-back was more expensive.
    expect(root.querySelector('svg [data-line="level"]')).not.toBeNull();
  });

  test('before the reveal the table figures and the "Keep your $N win" line keep their space but are hidden', () => {
    const m = winningSample();
    m.actions = { ...m.actions, onDouble: () => {}, onBank: () => {} };
    mount(m);
    const money = Array.from(root.querySelectorAll('.es-row span:last-child')) as HTMLElement[];
    expect(money.length).toBe(3);
    for (const e of money) expect(e.style.visibility).toBe('hidden');
    expect(root.querySelector('.es-stake')).toBeNull(); // the double block comes at the reveal
    expect(money[0].textContent).toMatch(/^\$[\d,]+$/); // the text is there, so nothing moves at the reveal
    revealButton()!.click();
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
    for (const e of money) expect(e.style.visibility).toBe('');
    expect(root.querySelector('.es-stake')).not.toBeNull();
  });

  test('before the reveal the double block (with "Keep my win") is out and money near misses keep their space, hidden', () => {
    const m = winningSample();
    m.nearMisses = [...m.nearMisses, 'One trade from perfect: perfect timing made $15,160'];
    m.actions = { ...m.actions, onDouble: () => {}, onBank: () => {}, onRematch: () => {} };
    mount(m);
    // Rematch looks as it does on a loss until the reveal (R24 outlines it only beside the red double button).
    const rematch = () => Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Rematch this crash')!;
    expect(rematch().className).toBe('es-main');
    // No double block, and no space for one, before the reveal: a gap only wins have would be a tell.
    expect(root.querySelector('.es-double')).toBeNull();
    expect(root.textContent).not.toMatch(/Keep my win|Keep your/);
    expect(root.querySelector('.es-pot')).toBeNull();
    const money = Array.from(root.querySelectorAll('.es-misses li')).filter((li) => li.textContent!.includes('$')) as HTMLElement[];
    expect(money.length).toBeGreaterThan(0);
    const held = [...money];
    for (const e of held) expect(e.style.visibility).toBe('hidden');
    // Plain near misses (no figure) show at once.
    const plain = Array.from(root.querySelectorAll('.es-misses li')).filter((li) => !li.textContent!.includes('$')) as HTMLElement[];
    for (const e of plain) expect(e.style.visibility).toBe('');
    revealButton()!.click();
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
    for (const e of held) expect(e.style.visibility).toBe('');
    // Inserted at the reveal, in its place: after the score, before the other buttons.
    const block = root.querySelector('.es-double') as HTMLElement;
    expect(block.querySelector('.es-out')!.textContent).toBe('Keep my win');
    expect(block.nextElementSibling!.className).toMatch(/^es-(grow|pair|link)$/);
    expect(rematch().className).toBe('es-out');
    expect(block.previousElementSibling!.className).toBe('es-score');
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
      for (let t = 0; t < 1700 + REVEAL_BEAT_MS; t += 10) {
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
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
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
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
    expect(root.textContent).toContain('Sold: House rejects the $700 billion bank rescue plan');
  });

  test('R24: with the double block, Double or nothing is the only filled button', () => {
    const m = winningSample();
    m.actions = { ...m.actions, onRematch: () => {}, onChallenge: () => {}, onDouble: () => {}, onBank: () => {} };
    mount(m);
    revealButton()?.click(); // a blind page puts the double block in at the reveal
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
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
    revealButton()?.click(); // a blind page puts the double block in at the reveal
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
    expect(root.querySelector('.es-double h2')!.textContent).toBe('Wins in a row: 1');
    expect(root.querySelector('.es-double .es-dbl')!.textContent).toBe('Double or nothing');
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

  test('after a win: "Wins in a row: N" large with its title, the stake line and double or nothing (R44)', () => {
    const m = winningSample();
    const onDouble = vi.fn();
    const onBank = vi.fn();
    m.actions = { ...m.actions, onDouble, onBank };
    mount(m);
    revealButton()?.click(); // a blind page puts the double block in at the reveal
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
    const t = root.textContent!;
    const block = root.querySelector('.es-double')!;
    expect(block.querySelector('h2')!.textContent).toBe('Wins in a row: 2');
    expect(block.querySelector('.es-title')!.textContent).toBe('Hot hand');
    expect(block.querySelector('.es-title')!.parentElement!.className).toBe('es-wins');
    expect(t).toContain(
      'Keep your $5,091 win, or take all $14,427 into another mystery game. Finish behind and the run is over.',
    );
    // The ladder is gone: one large line says it.
    expect(root.querySelectorAll('[data-rung]')).toHaveLength(0);
    expect(t).not.toContain('Best winning streak');
    const byText = (s: string) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent === s)!;
    vi.advanceTimersByTime(400); // past the tap guard after the reveal
    byText('Double or nothing').click();
    byText('Keep my win').click();
    expect(onDouble).toHaveBeenCalledTimes(1);
    expect(onBank).toHaveBeenCalledTimes(1);
  });

  test('with double or nothing on offer, "Play a new mystery crash" gives way to it (it stays until the reveal)', () => {
    const m = winningSample();
    m.actions = { ...m.actions, onDouble: () => {}, onBank: () => {} };
    mount(m);
    const link = () => Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Play a new mystery crash');
    expect(link()).toBeTruthy(); // no tell before the reveal
    revealButton()!.click();
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
    expect(link()).toBeUndefined();
    handle!.destroy();
    mount({ ...losingSample() });
    revealButton()!.click();
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
    expect(link()).toBeTruthy();
  });

  test('a banked win still says "Wins in a row", with no double buttons', () => {
    const m = winningSample();
    m.double = undefined;
    m.wins = 2;
    m.flags = { blind: false };
    mount(m);
    expect(root.querySelector('.es-double h2')!.textContent).toBe('Wins in a row: 2');
    expect(root.querySelector('.es-dbl')).toBeNull();
    expect(root.textContent).not.toContain('Keep your');
  });

  test('after a loss: no double or nothing; "Best winning streak: N", hidden when 0 (R44)', () => {
    const m = losingSample();
    m.bestStreak = 3;
    mount(m);
    revealButton()!.click();
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
    expect(root.querySelector('.es-double')).toBeNull();
    expect(root.textContent).not.toContain('Double or nothing');
    expect(root.querySelector('.es-best')!.textContent).toBe('Best winning streak: 3');
    handle!.destroy();
    mount({ ...losingSample(), bestStreak: 0 });
    revealButton()!.click();
    vi.advanceTimersByTime(REVEAL_BEAT_MS);
    expect(root.textContent).not.toContain('Best winning streak');
  });

  test('the pot code stays: a model that asks for it still prints it', () => {
    mount({ ...c2007Sample(), showPot: true, flags: { blind: false } });
    expect(root.textContent).toContain('Your pot: $13,719. Up $3,719 tonight.');
  });

  test('no double block when the model has none', () => {
    mount(losingSample());
    expect(root.querySelector('h2')).toBeNull();
  });

  test('challenger: a row and who won (no chart line, R42)', () => {
    mount(losingSample());
    const t = root.textContent!;
    expect(t).toContain('Your challenger$14,513');
    expect(t).toContain('Your challenger beat you by $5,814');
    // R42: money only as numbers, so the challenger is a row, not a line on the chart.
    expect(root.querySelector('svg [data-line="other"]')).toBeNull();
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

  test('vibration and borrowed money are not on the result page (they live in the collection)', () => {
    mount(c2007Sample());
    expect(root.textContent).not.toMatch(/Vibration|borrowed money/i);
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

describe('result page order (R28, R44)', () => {
  test('score first, then the buttons, then the table, its note and the near misses', () => {
    const m = { ...c2007Sample(), holderNote: true, flags: { blind: false } };
    m.actions = { ...m.actions, onRematch: () => {}, onChallenge: () => {} };
    mount(m);
    vi.advanceTimersByTime(2000);
    // The reveal and score boxes' own lines count in place.
    const order = Array.from(root.querySelector('main.es')!.children)
      .flatMap((e) => (e.classList.contains('es-score') || e.classList.contains('es-moment') ? Array.from(e.children) : [e]))
      .map((e) => e.className.split(' ')[0]);
    const at = (c: string) => order.indexOf(c);
    expect(at('es-name')).toBeGreaterThan(at('es-h1'));
    expect(at('es-newsbox')).toBe(at('es-name') + 1);
    expect(at('es-lead')).toBe(at('es-newsbox') + 1);
    expect(at('es-perfect')).toBe(at('es-lead') + 1);
    // The main actions: the double block when offered, then the button pair.
    expect(at('es-double')).toBeGreaterThan(at('es-perfect'));
    expect(at('es-pair')).toBeGreaterThan(at('es-double'));
    expect(at('es-link')).toBe(-1); // double or nothing is on offer
    expect(at('es-table')).toBeGreaterThan(at('es-pair'));
    expect(at('es-note')).toBe(at('es-table') + 1);
    expect(at('es-misses')).toBeGreaterThan(at('es-note'));
    expect(at('es-pot')).toBe(-1);
  });
});

describe('the big reveal (R44)', () => {
  test('"Tap to see what that was" is a large control where the score will be, not in the folio', () => {
    mount(c2007Sample());
    const cover = revealButton()!;
    expect(cover.className).toContain('es-cover');
    expect(cover.closest('.es-moment')).not.toBeNull();
    expect(root.querySelector('.es-folio button')).toBeNull();
    cover.click();
    expect(root.querySelector('.es-name')!.textContent).toBe('That was 2008');
    expect(root.querySelector('.es-folio')!.textContent).not.toContain('2008');
  });

  test('the name prints first, in big type; the score follows a beat later', () => {
    mount(c2007Sample());
    revealButton()!.click();
    const name = root.querySelector('.es-name') as HTMLElement;
    expect(name.className).toContain('es-wipe');
    const score = root.querySelector('.es-score') as HTMLElement;
    expect(score.hidden).toBe(true);
    vi.advanceTimersByTime(REVEAL_BEAT_MS - 1);
    expect(score.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(score.hidden).toBe(false);
  });

  test('the reveal is announced once, with the name and the score', () => {
    mount(c2007Sample());
    revealButton()!.click();
    vi.advanceTimersByTime(REVEAL_BEAT_MS + 2000);
    // '' is the result page emptying the live region as it mounts.
    expect(announced().filter((a) => a !== '')).toEqual(['That was 2008. $3,719 ahead of someone who did nothing.']);
  });

  test('a false alarm prints its name large and how long it took to come back under it', () => {
    const m = c2007Sample();
    m.run = { ...m.run, revealLine: 'That was the autumn 2014 wobble. It was back in two weeks.' };
    mount(m);
    revealButton()!.click();
    expect(root.querySelector('.es-name')!.textContent).toBe('That was the autumn 2014 wobble');
    expect(root.querySelector('.es-name-sub')!.textContent).toBe('It was back in two weeks.');
  });

  test('with reduced motion there is no wipe and no wait', () => {
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('reduce'), media: q }) as unknown as MediaQueryList,
    );
    mount(c2007Sample());
    revealButton()!.click();
    expect(root.querySelector('.es-name')!.className).not.toContain('es-wipe');
    expect((root.querySelector('.es-score') as HTMLElement).hidden).toBe(false);
    mm.mockRestore();
  });
});

describe('one screen (R44)', () => {
  test('when the page is taller than the window, the extras go, lowest rank first; a smaller one stays if it fits', () => {
    const m = { ...c2007Sample(), holderNote: true, flags: { blind: false } };
    // A 660 px window: the table costs 60 px, the holder note 60, the near misses 30, over a 560 px page.
    const shown = (q: string) => (root.querySelector(`${q}:not([data-trim])`) ? 1 : 0);
    const html = document.documentElement;
    Object.defineProperty(html, 'scrollHeight', {
      configurable: true,
      get: () => 560 + 60 * shown('.es-table') + 60 * shown('.es-note') + 30 * shown('.es-misses'),
    });
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 660 });
    try {
      mount(m);
      // The table outranks the note, so the note goes; the near misses still fit after it.
      const trimmed = Array.from(root.querySelectorAll('[data-trim]')).map((e) => e.className.split(' ')[0]);
      expect(trimmed).toEqual(['es-note']);
      expect(root.querySelectorAll('button[data-trim], [data-trim] button')).toHaveLength(0);
    } finally {
      delete (html as unknown as Record<string, unknown>).scrollHeight;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight });
    }
  });

  test('before the reveal the page leaves out what the score will need, so nothing vanishes at the reveal', () => {
    const shown = (q: string) => (root.querySelector(`${q}:not([data-trim])`) ? 1 : 0);
    const laidOut = () => (root.querySelector('.es-score:not([hidden])') ? 1 : 0);
    const html = document.documentElement;
    Object.defineProperty(html, 'scrollHeight', { configurable: true, get: () => 500 + 100 * shown('.es-table') + 100 * laidOut() });
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 660 });
    try {
      mount(losingSample());
      const score = root.querySelector('.es-score') as HTMLElement;
      expect(score.hidden).toBe(true);
      expect(score.style.visibility).toBe('');
      expect(root.querySelector('.es-table')!.hasAttribute('data-trim')).toBe(true);
      revealButton()!.click();
      vi.advanceTimersByTime(REVEAL_BEAT_MS);
      expect(root.querySelector('.es-table')!.hasAttribute('data-trim')).toBe(true);
    } finally {
      delete (html as unknown as Record<string, unknown>).scrollHeight;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight });
    }
  });

  test('nothing is left out when the page fits', () => {
    mount({ ...c2007Sample(), holderNote: true, flags: { blind: false } });
    expect(root.querySelectorAll('[data-trim]')).toHaveLength(0);
  });
});

describe('round 2 fixes (R58)', () => {
  const short = (h: number) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('max-height') && h <= 700, media: q }) as unknown as MediaQueryList,
    );
  const reveal = () => {
    revealButton()!.click();
    vi.advanceTimersByTime(REVEAL_BEAT_MS + COUNT_MS + 500);
  };

  test('the keep button says "Keep my win": no figure, the pot is hidden (design #6)', () => {
    const m = winningSample();
    m.actions = { ...m.actions, onDouble: () => {}, onBank: () => {} };
    mount(m);
    reveal();
    const buttons = Array.from(root.querySelectorAll('.es-double button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Double or nothing', 'Keep my win']);
    expect(root.textContent).not.toMatch(/Bank/);
  });

  test('"You finished with $N." is never left out; only the perfect-timing half can go (truth #5)', () => {
    mount(c2007Sample());
    reveal();
    const p = root.querySelector('.es-perfect') as HTMLElement;
    expect(p.textContent).toBe('Perfect timing made $24,188. You finished with $14,513.');
    expect(p.closest('[data-trimmable]')).toBeNull();
    const part = p.querySelector('[data-trimmable]')!;
    expect(part.textContent).toBe('Perfect timing made $24,188. ');
  });

  test('"Best winning streak: N" is never left out (review minor)', () => {
    mount({ ...losingSample(), bestStreak: 3 });
    reveal();
    const best = root.querySelector('.es-best') as HTMLElement;
    expect(best.textContent).toBe('Best winning streak: 3');
    expect(best.closest('[data-trimmable]')).toBeNull();
  });

  test('a page shown again (Back, Keep my win) prints the final lead at once, with no count and no sound (review minor)', () => {
    const sfx = { rise: vi.fn(), thud: vi.fn(), payout: vi.fn() };
    mount({ ...c2007Sample(), sfx, flags: { blind: false, again: true } });
    expect(root.querySelector('[data-lead]')!.textContent).toBe('$3,719 ahead of someone who did nothing');
    vi.advanceTimersByTime(3000);
    expect(sfx.rise).not.toHaveBeenCalled();
    expect(sfx.payout).not.toHaveBeenCalled();
    expect(sfx.thud).not.toHaveBeenCalled();
    handle!.destroy();
    // The first showing still counts and plays.
    mount({ ...c2007Sample(), sfx, flags: { blind: false } });
    vi.advanceTimersByTime(3000);
    expect(sfx.payout).toHaveBeenCalled();
  });

  test('focus on "Tap to see what that was" moves to the crash name at the reveal (review minor)', () => {
    mount(c2007Sample());
    revealButton()!.focus();
    revealButton()!.click();
    const name = root.querySelector('.es-name') as HTMLElement;
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute('tabindex')).toBe('-1');
    handle!.destroy();
    // By itself after 4 s, too.
    mount(c2007Sample());
    revealButton()!.focus();
    vi.advanceTimersByTime(4000);
    expect(document.activeElement).toBe(root.querySelector('.es-name'));
    handle!.destroy();
    // Focus elsewhere is left alone.
    mount(c2007Sample());
    vi.advanceTimersByTime(4000);
    expect(document.activeElement).toBe(document.body);
  });

  test('the live region drops the play screen\'s last words when the result mounts (design minor)', () => {
    mount({ ...c2007Sample(), flags: { blind: false } });
    expect(announced()[0]).toBe('');
  });

  test('the spare room sits above the buttons, so the reveal fills it and nothing below moves (design minor)', () => {
    const m = winningSample();
    m.actions = { ...m.actions, onDouble: () => {}, onBank: () => {}, onRematch: () => {} };
    mount(m);
    const grow = root.querySelector('.es-grow')!;
    expect(grow.nextElementSibling!.className).toBe('es-pair');
    reveal();
    expect(grow.previousElementSibling!.className).toBe('es-double');
    expect(grow.nextElementSibling!.className).toBe('es-pair');
  });

  test.each([
    [660, 140],
    [844, 160],
  ])('at %i px the result chart is at least %i tall: 100 px of line or more (review #4, design #1)', (h, min) => {
    const mm = short(h);
    try {
      mount(c2007Sample());
      const vb = root.querySelector('main.es svg')!.getAttribute('viewBox')!.split(' ').map(Number);
      expect(vb[3]).toBeGreaterThanOrEqual(min);
    } finally {
      mm.mockRestore();
    }
  });

  test('the foot links are the last extra to give way on a short screen; buttons never do', () => {
    mount({ ...c2007Sample(), actions: { onNewMystery: () => {}, onPick: () => {}, onCollection: () => {} } });
    expect(root.querySelector('.es-foot')!.hasAttribute('data-trimmable')).toBe(true);
    expect(root.querySelector('.es-pair[data-trimmable], .es-double[data-trimmable]')).toBeNull();
  });
});


// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { keep } from '../../src/ui/endchart';
import { mountEndScreen, type EndModel } from '../../src/ui/endscreen';
import { c2007Sample, losingSample, winningSample } from '../fixtures/sample-result';

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
    const lead = () => root.querySelector('[data-lead]')!.textContent;
    expect(lead()).toBe('$0 ahead of someone who did nothing');
    revealButton()!.click();
    vi.advanceTimersByTime(700);
    const mid = lead();
    expect(mid).not.toBe('$0 ahead of someone who did nothing');
    vi.advanceTimersByTime(900);
    expect(lead()).toBe('$3,719 ahead of someone who did nothing');
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
    expect(root.textContent).toContain('Next mystery crash in 10. Tap to stop.');
    vi.advanceTimersByTime(1000);
    expect(root.textContent).toContain('Next mystery crash in 9. Tap to stop.');
    vi.advanceTimersByTime(9000);
    expect(onNewMystery).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(onNewMystery).toHaveBeenCalledTimes(1);
  });

  test('any touch on the page stops it', () => {
    const m = c2007Sample();
    const onNewMystery = vi.fn();
    m.actions.onNewMystery = onNewMystery;
    mount(m);
    revealButton()!.click();
    vi.advanceTimersByTime(2000);
    root.querySelector('h1')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(root.textContent).not.toContain('Next mystery crash in');
    vi.advanceTimersByTime(20000);
    expect(onNewMystery).not.toHaveBeenCalled();
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
      'Keep your $3,591 win, or take all $14,427 into another mystery game. Finish behind and the run is over.',
    );
    expect(t).toContain('Wins in a row');
    for (const title of ["Beginner's luck", 'Hot hand', 'Shark', 'Whale', 'Untouchable']) expect(t).toContain(title);
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
    byText('Bank $3,591').click();
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
});

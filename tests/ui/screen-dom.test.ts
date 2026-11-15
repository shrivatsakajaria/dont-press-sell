// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { Step } from '../../src/game/schedule';
import { startPlay } from '../../src/ui/screen';

const closes = [100, 101, 99, 100, 90, 92, 95, 100, 104, 108];
const dates = closes.map((_, i) => `2007-11-${String(10 + i).padStart(2, '0')}`);
const run = { id: 't', kind: 'crash' as const, pickName: '', revealLine: '', dates, closes, lowIndex: 4, fallEndIndex: 7 };
const steps: Step[] = closes.map((_, d) => ({ dayIndex: d, holdMs: 100, phase: d < 7 ? 'fall' : 'forward', slow: d === 4 }));

it('renders the play screen, sells on a tap, pauses, and ends', async () => {
  vi.useFakeTimers();
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onEnd = vi.fn();
  startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd });
  const btn = root.querySelector('button.act') as HTMLButtonElement;
  expect(btn.textContent).toBe('Sell for $10,000');
  expect(root.querySelector('h1')?.textContent).toBe('Headline for day 1');
  expect(root.querySelector('.folio')?.textContent).toContain('Price: your nerve');

  vi.advanceTimersByTime(100); // day 2
  expect(btn.textContent).toBe('Sell for $10,100');
  btn.click();
  expect(btn.textContent).toMatch(/^Buy back now: \$[\d,]+ (ahead|behind)$/);
  expect(root.querySelector('.standfirst')?.textContent).toBe('You are out. To win, buy back in for less than you sold.');

  const pause = root.querySelector('button.pause') as HTMLButtonElement;
  pause.click();
  expect(pause.textContent).toBe('Resume');
  expect(root.querySelector('.folio')?.textContent).toContain('Paused');
  vi.advanceTimersByTime(5000);
  expect(onEnd).not.toHaveBeenCalled();
  pause.click();
  expect(pause.textContent).toBe('Pause');
  vi.advanceTimersByTime(5000);
  expect(onEnd).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

it('borrowed money: its opening line, the counter against the unborrowed market, and a wipe-out ends the run at once', async () => {
  const { simulateBorrowed } = await import('../../src/engine/borrowed');
  vi.useFakeTimers();
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const c = [100, 95, 90, 60, 70, 80, 90, 100, 105, 110];
  const onEnd = vi.fn();
  startPlay(root, { ...run, closes: c }, steps, {
    runLabel: 'Borrowed money', onEnd, simulateFn: simulateBorrowed, borrowed: true,
    opening: 'You have borrowed $20,000. Every move is three times bigger. Fall a third and you are wiped out.',
  });
  expect(root.querySelector('.standfirst')?.textContent).toMatch(/^You have borrowed \$20,000/);
  const btn = root.querySelector('button.act') as HTMLButtonElement;
  vi.advanceTimersByTime(100); // day 2: 3 x 10,000 x 0.95 - 20,000 = 8,500
  expect(btn.textContent).toBe('Sell for $8,500');
  btn.click();
  // In cash with 8,500 while someone who did nothing (unborrowed) has 9,500.
  expect(btn.textContent).toBe('Buy back now: $1,000 behind');
  vi.advanceTimersByTime(100); // day 3: buy back at 90, borrowing twice the balance
  btn.click();
  expect(onEnd).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100); // day 4: 3 x 8,500 x 60 / 90 - 17,000 = 0, wiped out
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(onEnd.mock.calls[0][0].wipedAt).toBe(3);
  vi.advanceTimersByTime(5000);
  expect(onEnd).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

const FAKE = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

it('a tap is pinned to the step that was painted when the finger went down', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  const root = document.createElement('div');
  document.body.appendChild(root);
  const play = startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd: () => {} });
  const btn = root.querySelector('button.act') as HTMLButtonElement;
  vi.advanceTimersByTime(116); // day 2 on screen and painted
  expect(btn.textContent).toBe('Sell for $10,100');
  btn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  vi.advanceTimersByTime(100); // the clock moves on to day 3 (99) before the finger lifts
  expect(btn.textContent).toBe('Sell for $9,900');
  btn.click();
  // Sold at day 2's close, the amount the player saw.
  expect(root.querySelector('.balance')?.textContent).toBe('$10,100');
  expect(btn.textContent).toMatch(/^Buy back now: /);
  play.teardown();
});

it('a keyboard press is pinned the same way', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  const root = document.createElement('div');
  document.body.appendChild(root);
  const play = startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd: () => {} });
  const btn = root.querySelector('button.act') as HTMLButtonElement;
  vi.advanceTimersByTime(116);
  btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  vi.advanceTimersByTime(100);
  btn.click();
  expect(root.querySelector('.balance')?.textContent).toBe('$10,100');
  play.teardown();
});

it('the paper switches into and out of the worst day at once, and fades otherwise', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  const root = document.createElement('div');
  document.body.appendChild(root);
  const play = startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd: () => {} });
  const page = root.querySelector('.play') as HTMLElement;
  const html = document.documentElement;
  vi.advanceTimersByTime(300); // day 4, an ordinary step
  vi.advanceTimersByTime(20);
  expect(page.style.transition).toBe('');
  vi.advanceTimersByTime(80); // t = 400: day 5 is the slow falling day
  expect(page.classList.contains('is-worst')).toBe(true);
  expect(page.style.transition).toBe('none');
  expect(html.style.transition).toBe('none');
  expect(document.body.style.transition).toBe('none');
  vi.advanceTimersByTime(40);
  expect(page.style.transition).toBe('');
  expect(html.style.transition).toBe('');
  vi.advanceTimersByTime(60); // t = 500: out of the worst day, at once again
  expect(page.classList.contains('is-worst')).toBe(false);
  expect(page.style.transition).toBe('none');
  vi.advanceTimersByTime(40);
  vi.advanceTimersByTime(80); // t = 620: an ordinary change keeps the fade
  expect(page.style.transition).toBe('');
  play.teardown();
});

it('teardown stops the clock, disconnects the resize watcher and clears the page colours', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  const disconnect = vi.fn();
  const RO = vi.fn(() => ({ observe: vi.fn(), disconnect }));
  vi.stubGlobal('ResizeObserver', RO);
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onEnd = vi.fn();
  const play = startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd });
  expect(document.documentElement.style.getPropertyValue('--bg')).not.toBe('');
  play.teardown();
  expect(disconnect).toHaveBeenCalled();
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('');
  expect(document.documentElement.style.getPropertyValue('--ink')).toBe('');
  vi.advanceTimersByTime(10_000);
  expect(onEnd).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('passes pause and resume on to the caller (for sound)', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onPause = vi.fn();
  const onResume = vi.fn();
  const play = startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd: () => {}, onPause, onResume });
  (root.querySelector('button.pause') as HTMLButtonElement).click();
  expect(onPause).toHaveBeenCalledTimes(1);
  (root.querySelector('button.pause') as HTMLButtonElement).click();
  expect(onResume).toHaveBeenCalledTimes(1);
  play.teardown();
});

it('tells the caller about each new step and each trade (for sound and vibration), and the sound switch is the caller\'s', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  const root = document.createElement('div');
  document.body.appendChild(root);
  const frames: { step: number; newStep: boolean; trade: string | null; holdMs: number }[] = [];
  let on = false;
  const play = startPlay(root, run, steps, {
    runLabel: 'Mystery crash', onEnd: () => {}, soundOn: false,
    onSoundToggle: () => (on = !on),
    onFrame: (v, _m, e) => frames.push({ step: v.stepIndex, ...e }),
  });
  const sound = root.querySelector('button.sound') as HTMLButtonElement;
  expect(sound.textContent).toBe('Sound off');
  sound.click();
  expect(sound.textContent).toBe('Sound on');
  vi.advanceTimersByTime(116);
  (root.querySelector('button.act') as HTMLButtonElement).click();
  expect(frames[0]).toEqual({ step: 0, newStep: true, trade: null, holdMs: 100 });
  expect(frames[1]).toEqual({ step: 1, newStep: true, trade: null, holdMs: 100 });
  expect(frames[frames.length - 1]).toEqual({ step: 1, newStep: false, trade: 'sell', holdMs: 100 });
  play.teardown();
});

it('start screen: the front page stands still with the start lines until Start is pressed', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onEnd = vi.fn();
  const onFrame = vi.fn();
  const lines = ['Line one here.', 'Line two here.', 'Line three here.'];
  const play = startPlay(root, run, steps, {
    runLabel: 'Daily crash 3', onEnd, onFrame, gate: { lines, note: 'Score to beat: $11,341' },
  });
  const page = root.querySelector('.play')!;
  const btn = root.querySelector('button.act') as HTMLButtonElement;
  expect(page.classList.contains('is-gate')).toBe(true);
  expect(btn.textContent).toBe('Start');
  const intro = [...root.querySelectorAll('.intro p')].map((p) => p.textContent);
  expect(intro).toEqual([...lines, 'Score to beat: $11,341']);
  expect(root.querySelector('.folio')?.textContent).toContain('Daily crash 3');
  expect(root.querySelector('.folio')?.textContent).toContain('Day 1');
  expect(root.querySelector('.balance')?.textContent).toBe('$10,000');
  // The clock does not move.
  vi.advanceTimersByTime(60_000);
  expect(onEnd).not.toHaveBeenCalled();
  expect(root.querySelector('.folio')?.textContent).toContain('Day 1');
  expect(onFrame).not.toHaveBeenCalled();
  // Pause does nothing while the page waits.
  (root.querySelector('button.pause') as HTMLButtonElement).click();
  expect(root.querySelector('.folio')?.textContent).not.toContain('Paused');

  btn.click();
  expect(page.classList.contains('is-gate')).toBe(false);
  expect(btn.textContent).toBe('Sell for $10,000');
  expect(root.querySelector('.standfirst')?.textContent).toBe(
    'You have $10,000 of play money in the stock market. Hold your nerve or bail.',
  );
  vi.advanceTimersByTime(100);
  expect(root.querySelector('.folio')?.textContent).toContain('Day 2');
  vi.advanceTimersByTime(5000);
  expect(onEnd).toHaveBeenCalledTimes(1);
  play.teardown();
  vi.useRealTimers();
});

it('start screen without a note shows exactly the three lines', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const play = startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd: vi.fn(), gate: { lines: ['a', 'b', 'c'] } });
  expect(root.querySelectorAll('.intro p').length).toBe(3);
  play.teardown();
  vi.useRealTimers();
});

it('start screen with borrowed money: the three lines, then the borrowed line in the secondary colour', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const play = startPlay(root, run, steps, {
    runLabel: 'Borrowed money', onEnd: vi.fn(), gate: { lines: ['a', 'b', 'c'], extra: 'Borrowed line.' },
  });
  const ps = [...root.querySelectorAll('.intro p')];
  expect(ps.map((p) => p.textContent)).toEqual(['a', 'b', 'c', 'Borrowed line.']);
  expect(ps[3].className).toBe('extra');
  play.teardown();
  vi.useRealTimers();
});

it('start screen on a slow, red day 1: calm paper, "Price: your nerve", no "level" and no chart band before play', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const slow0 = steps.map((st, i) => (i === 0 ? { ...st, slow: true } : st));
  const play = startPlay(root, { ...run, preCloses: [110] }, slow0, { runLabel: 'Mystery crash', onEnd: vi.fn(), gate: { lines: ['a', 'b', 'c'] } });
  const page = root.querySelector('.play')!;
  const folio = root.querySelector('.folio')!.textContent!;
  expect(folio).toContain('Price: your nerve');
  expect(folio).not.toContain('Time slowed');
  expect(page.classList.contains('is-worst')).toBe(false);
  expect(page.classList.contains('is-big')).toBe(false);
  expect(root.querySelector('.delta')!.textContent).toBe('');
  expect(page.classList.contains('is-gate')).toBe(true); // CSS hides the chart band while the page waits
  // Start: day 1 is a red day at once.
  (root.querySelector('button.act') as HTMLButtonElement).click();
  expect(page.classList.contains('is-worst')).toBe(true);
  expect(root.querySelector('.folio')!.textContent).toContain('Time slowed');
  play.teardown();
  vi.useRealTimers();
});

it('a press capture is cleared when the finger is cancelled or leaves the button', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const play = startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd: vi.fn() });
  const btn = root.querySelector('button.act') as HTMLButtonElement;
  vi.advanceTimersByTime(16); // day 1 painted
  btn.dispatchEvent(new Event('pointerdown'));
  btn.dispatchEvent(new Event('pointercancel'));
  vi.advanceTimersByTime(100); // day 2, painted
  vi.advanceTimersByTime(16);
  btn.click(); // a keyboard or late click: trades on the day on screen, not the cancelled capture's day 1
  expect(btn.textContent).toMatch(/^Buy back now/);
  const sold = play.view();
  expect(sold.dayIndex).toBe(1);
  expect(sold.invested).toBe(false);
  // The trade is on day 2's close ($10,100), not day 1's ($10,000).
  expect(sold.balance).toBeCloseTo(10100);
  play.teardown();
  vi.useRealTimers();
});

it('a finger dragged off the button clears the capture; a touch tap (pointerleave after lifting) keeps it', () => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  const mk = () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const play = startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd: vi.fn() });
    return { play, btn: root.querySelector('button.act') as HTMLButtonElement };
  };
  const leave = (buttons: number) => Object.assign(new Event('pointerleave'), { buttons });
  // Dragged off while pressed: the click (if any) trades on the day on screen.
  let { play, btn } = mk();
  vi.advanceTimersByTime(16);
  btn.dispatchEvent(new Event('pointerdown'));
  btn.dispatchEvent(leave(1));
  vi.advanceTimersByTime(116);
  btn.click();
  expect(play.view().balance).toBeCloseTo(10100);
  play.teardown();
  // A touch tap: pointerup, then pointerleave with no button down, then the click a step later: still pinned to day 1.
  ({ play, btn } = mk());
  vi.advanceTimersByTime(16);
  btn.dispatchEvent(new Event('pointerdown'));
  btn.dispatchEvent(leave(0));
  vi.advanceTimersByTime(100);
  btn.click();
  expect(play.view().balance).toBeCloseTo(10000);
  play.teardown();
  vi.useRealTimers();
});

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

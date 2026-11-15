// @vitest-environment happy-dom
// Round 2 fix lane FC: red only on slow falls of 2% or more (R55), a readable stamp that waits out a pause (R56),
// Pause looking dead when it does nothing, sound paced by the step actually running, and a cached headline fit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Step } from '../../src/game/schedule';
import type { SessionView } from '../../src/game/session';
import { paperFor } from '../../src/ui/paper';
import { STAMP_MS, chooseHeadlineStep, screenModel, startPlay, type PlayState } from '../../src/ui/screen';

describe('R55: red paper only on slow falls of 2% or more', () => {
  const closes = [100, 99, 98.5, 96.53];
  const dates = closes.map((_, i) => `2018-02-0${i + 1}`);
  const steps: Step[] = closes.map((_, d) => ({ dayIndex: d, holdMs: 3000, phase: 'fall', slow: true }));
  const view = (i: number): SessionView => {
    const bal = 100 * closes[i];
    return { stepIndex: i, dayIndex: i, balance: bal, invested: true, marketBalance: bal, peakBalance: 10000, leadNow: 0, phase: 'fall', slow: true, stepMs: 3000 };
  };
  const state = (i: number): PlayState => ({
    run: { closes, dates }, steps, start: 10000, view: view(i), runLabel: 'Mystery crash',
    history: new Map(), trades: [], firstSaleStep: null, paused: false, pot: 10000,
  });

  it('a slow 1% fall slows down (big) but is not red', () => {
    const m = screenModel(state(1));
    expect(m.big).toBe(true);
    expect(m.worst).toBe(false);
    expect(m.paper).toEqual(paperFor({ lossFrac: 0.01, inCash: false, worstDay: false }));
  });

  it('a slow fall of just under 2% is not red; 2% or more is', () => {
    expect(screenModel(state(2)).worst).toBe(false); // 99 -> 98.5: 0.5%
    expect(screenModel(state(3)).worst).toBe(true); // 98.5 -> 96.53: 2.0%
  });
});

describe('play screen DOM', () => {
  const closes = [100, 101, 99, 100, 90, 92, 95, 100, 104, 108];
  const dates = closes.map((_, i) => `2007-11-${String(10 + i).padStart(2, '0')}`);
  const run = { id: 't', kind: 'crash' as const, pickName: '', revealLine: '', dates, closes, lowIndex: 4, fallEndIndex: 7 };
  const steps: Step[] = closes.map((_, d) => ({ dayIndex: d, holdMs: 1000, cashMs: 800, phase: d < 7 ? 'fall' : 'forward', slow: false }));

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  function mount(extra: Partial<Parameters<typeof startPlay>[3]> = {}) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onFrame = vi.fn();
    const play = startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd: vi.fn(), onFrame, ...extra });
    const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
    return { root, play, q, onFrame, btn: q<HTMLButtonElement>('button.act'), pause: q<HTMLButtonElement>('button.pause') };
  }

  it('R56: the stamp stays up for at least 1.2 s after the press, then goes', () => {
    const { btn, q } = mount();
    vi.advanceTimersByTime(1000);
    btn.click();
    const stamp = q<HTMLElement>('.stamp');
    expect(STAMP_MS).toBeGreaterThanOrEqual(1400);
    vi.advanceTimersByTime(1300);
    expect(stamp.hidden).toBe(false);
    vi.advanceTimersByTime(STAMP_MS - 1300);
    expect(stamp.hidden).toBe(true);
  });

  it('the stamp waits while the game is paused', () => {
    const { btn, q, pause } = mount();
    vi.advanceTimersByTime(1000);
    btn.click();
    vi.advanceTimersByTime(300);
    pause.click();
    vi.advanceTimersByTime(10_000);
    const stamp = q<HTMLElement>('.stamp');
    expect(stamp.hidden).toBe(false);
    pause.click();
    vi.advanceTimersByTime(STAMP_MS - 300 - 50);
    expect(stamp.hidden).toBe(false);
    vi.advanceTimersByTime(100);
    expect(stamp.hidden).toBe(true);
  });

  it('Pause reads as dead on the Start screen and in the final hold, live in play', () => {
    const { btn, pause } = mount({ gate: { lines: ['a', 'b', 'c'] } });
    expect(pause.getAttribute('aria-disabled')).toBe('true');
    btn.click(); // Start
    expect(pause.getAttribute('aria-disabled')).toBe('false');
    vi.advanceTimersByTime(steps.length * 1000 + 100); // the clock runs out
    expect(pause.getAttribute('aria-disabled')).toBe('true');
  });

  it('sound and vibration are paced by the step actually running (in cash, after a press)', () => {
    const { btn, onFrame } = mount();
    vi.advanceTimersByTime(1000);
    btn.click();
    vi.advanceTimersByTime(3000);
    expect(onFrame.mock.calls.length).toBeGreaterThan(3);
    for (const [v, , e] of onFrame.mock.calls) expect(e.holdMs).toBe(v.stepMs);
    expect(onFrame.mock.calls.some(([v]) => v.stepMs !== 1000)).toBe(true);
  });

  it('the shake moves the headline and the chart, never the button (R55)', () => {
    const slow = steps.map((s) => (s.dayIndex === 4 ? { ...s, slow: true } : s));
    const root = document.createElement('div');
    document.body.appendChild(root);
    const shook: Element[] = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, k: Keyframe[] | PropertyIndexedKeyframes | null, o?: number | KeyframeAnimationOptions) {
      if (JSON.stringify(k).includes('translateX')) shook.push(this);
      void o;
      return { cancel() {}, pause() {}, play() {}, finish() {} } as unknown as Animation;
    };
    try {
      startPlay(root, run, slow, { runLabel: 'Mystery crash', onEnd: vi.fn() });
      vi.advanceTimersByTime(4000); // day 5: a slow 10% fall
      expect(root.querySelector('.play')!.classList.contains('is-worst')).toBe(true);
      expect(shook.length).toBeGreaterThan(0);
      for (const e of shook) {
        expect(e.contains(root.querySelector('button.act'))).toBe(false);
        expect(e.classList.contains('play')).toBe(false);
      }
    } finally {
      if (orig) Element.prototype.animate = orig;
      else delete (Element.prototype as { animate?: unknown }).animate;
    }
  });
});

describe('headline fit (R57: a constant chart, one measure per new headline)', () => {
  it('takes the largest size that keeps three lines and fits the news block', () => {
    expect(chooseHeadlineStep([{ lines: 2, fits: true }, { lines: 2, fits: true }])).toBe(0);
    expect(chooseHeadlineStep([{ lines: 4, fits: false }, { lines: 3, fits: false }, { lines: 3, fits: true }])).toBe(2);
    expect(chooseHeadlineStep([{ lines: 3, fits: true }, { lines: 2, fits: true }])).toBe(0);
    expect(chooseHeadlineStep([{ lines: 4, fits: true }, { lines: 3, fits: true }])).toBe(1);
  });

  it('falls back to the smallest size when none fits', () => {
    expect(chooseHeadlineStep([{ lines: 5, fits: false }, { lines: 4, fits: false }])).toBe(1);
  });
});

describe('Start screen', () => {
  const closes = [100, 101, 99];
  const run = { id: 't', kind: 'crash' as const, pickName: '', revealLine: '', dates: closes.map((_, i) => `2007-11-1${i}`), closes, lowIndex: 2, fallEndIndex: 2 };
  const steps: Step[] = closes.map((_, d) => ({ dayIndex: d, holdMs: 1000, phase: 'fall', slow: false }));
  afterEach(() => document.body.replaceChildren());
  const mountGate = (lines: string[], note?: string) => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    startPlay(root, run, steps, { runLabel: 'Rematch', onEnd: vi.fn(), gate: { lines, note } });
    return root.querySelector('.intro') as HTMLElement;
  };

  it('the first line is the page heading (design minor: the h1 is hidden on the gate)', () => {
    const lead = mountGate(['a', 'b', 'c']).querySelector('p')!;
    expect(lead.getAttribute('role')).toBe('heading');
    expect(lead.getAttribute('aria-level')).toBe('1');
  });

  it('the short version is marked so it sits down by the balance (no dead band)', () => {
    expect(mountGate(['Rematch'], 'Score to beat: $9,146').classList.contains('short')).toBe(true);
    document.body.replaceChildren();
    expect(mountGate(['a', 'b', 'c']).classList.contains('short')).toBe(false);
  });
});

// @vitest-environment happy-dom
// Round 3, lane S: the progress line under the masthead (R60) and the "Game over" line (R61).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Step } from '../../src/game/schedule';
import { GAME_OVER } from '../../src/content/copy';
import { createProgressLine, progressTarget, remainingPlan, startPlay, END_HOLD_MS } from '../../src/ui/screen';

const closes = [100, 101, 99, 100, 90, 92, 95, 100, 104, 108];
const dates = closes.map((_, i) => `2007-11-${String(10 + i).padStart(2, '0')}`);
const run = { id: 't', kind: 'crash' as const, pickName: '', revealLine: '', dates, closes, lowIndex: 4, fallEndIndex: 7 };
// Holds vary, and quiet fall days run quicker in cash (cashMs), so the plan depends on the position.
const steps: Step[] = closes.map((_, d) => ({
  dayIndex: d, holdMs: d === 4 ? 300 : 100, cashMs: d < 7 && d !== 4 ? 60 : undefined, phase: d < 7 ? 'fall' : 'forward', slow: d === 4,
}));

describe('remainingPlan: the planned time of the steps after this one, at a position', () => {
  it('sums the holds of the later steps, invested or in cash', () => {
    const plan = remainingPlan(steps);
    expect(plan(0, true)).toBe(100 * 8 + 300);
    expect(plan(9, true)).toBe(0);
    expect(plan(5, false)).toBe(60 + 100 + 100 + 100);
    expect(plan(3, false)).toBe(300 + 60 + 60 + 300);
  });
});

describe('progressTarget: the share of the game done at the end of this step', () => {
  it('is elapsed / total when nothing changed: from 0, a 100 ms step of a 1,000 ms game ends at 0.1', () => {
    expect(progressTarget(0, 100, 900)).toBeCloseTo(0.1);
    expect(progressTarget(0.1, 100, 800)).toBeCloseTo(0.2);
  });
  it('is 1 on the last step, and never below where the line already is', () => {
    expect(progressTarget(0.93, 100, 0)).toBe(1);
    expect(progressTarget(0.5, 0, 500)).toBe(0.5);
    expect(progressTarget(0.5, 100, 5000)).toBeGreaterThan(0.5);
  });
});

describe('createProgressLine (R60)', () => {
  function line(reduced = false) {
    let t = 0;
    const el = document.createElement('div');
    const p = createProgressLine(el, () => t, () => reduced);
    return { el, p, tick: (ms: number) => (t += ms) };
  }
  it('runs linearly over the step with a CSS transition on transform, never width', () => {
    const { el, p, tick } = line();
    p.step(0.2, 1000);
    expect(el.style.transform).toBe('scaleX(0.2)');
    expect(el.style.transition).toBe('transform 1000ms linear');
    tick(500);
    expect(p.value()).toBeCloseTo(0.1);
    tick(500);
    expect(p.value()).toBeCloseTo(0.2);
  });
  it('freezes while paused, and runs on for the time that was left', () => {
    const { el, p, tick } = line();
    p.step(0.2, 1000);
    tick(250);
    p.pause();
    const at = p.value();
    expect(at).toBeCloseTo(0.05);
    expect(el.style.transition).toBe('none');
    expect(el.style.transform).toBe('scaleX(0.05)');
    tick(5000);
    expect(p.value()).toBeCloseTo(at);
    p.resume();
    expect(el.style.transition).toBe('transform 750ms linear');
    expect(el.style.transform).toBe('scaleX(0.2)');
    tick(750);
    expect(p.value()).toBeCloseTo(0.2);
  });
  it('a press hold stretches the rest of the step without a jump', () => {
    const { el, p, tick } = line();
    p.step(0.2, 1000);
    tick(500);
    p.hold(500);
    expect(p.value()).toBeCloseTo(0.1);
    expect(el.style.transition).toBe('transform 1000ms linear');
    tick(500);
    expect(p.value()).toBeCloseTo(0.15);
  });
  it('full at the end; with reduced motion it steps without a transition', () => {
    const a = line();
    a.p.step(0.4, 1000);
    a.p.finish();
    expect(a.el.style.transform).toBe('scaleX(1)');
    expect(a.p.value()).toBe(1);
    const b = line(true);
    b.p.step(0.4, 1000);
    expect(b.el.style.transition).toBe('none');
    expect(b.el.style.transform).toBe('scaleX(0.4)');
  });
});

describe('the play screen (R60, R61)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });
  const scale = (el: HTMLElement) => Number(/scaleX\(([\d.e-]+)\)/.exec(el.style.transform)?.[1] ?? NaN);

  function mount(gate = false) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onEnd = vi.fn();
    const play = startPlay(root, run, steps, {
      runLabel: 'Mystery crash', onEnd, gate: gate ? { lines: ['a', 'b', 'c', 'd'] } : undefined,
    });
    const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
    return { root, play, q, onEnd, bar: q<HTMLElement>('.masthead .progress') };
  }

  it('sits inside the masthead, out of the flow, and starts empty on the Start screen', () => {
    const { bar, q } = mount(true);
    expect(bar).not.toBeNull();
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect(scale(bar)).toBe(0);
    expect(q('main.play').classList.contains('is-gate')).toBe(true);
  });

  it('grows monotonically step by step and reaches 100% at the end, trades included', () => {
    const { bar, q, onEnd } = mount();
    const seen = [scale(bar)];
    const btn = q<HTMLButtonElement>('button.act');
    for (let i = 0; i < 12; i++) {
      if (i === 2 || i === 5) btn.click(); // sell, then buy back: the plan changes under the line
      vi.advanceTimersByTime(100);
      seen.push(scale(bar));
    }
    vi.advanceTimersByTime(2000);
    seen.push(scale(bar));
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(0.2);
    expect(seen.at(-1)).toBe(1);
    expect(onEnd).toHaveBeenCalled();
  });

  it('is frozen while paused', () => {
    const { bar, play } = mount();
    vi.advanceTimersByTime(250);
    play.pause();
    const t = bar.style.transform;
    expect(bar.style.transition).toBe('none');
    vi.advanceTimersByTime(3000);
    expect(bar.style.transform).toBe(t);
    play.resume();
    expect(bar.style.transition).toMatch(/^transform \d+(\.\d+)?ms linear$/);
  });

  it('R61: in the final hold the Sell button gives way to a "Game over" line in the same box', () => {
    const { q, onEnd } = mount();
    const over = q<HTMLElement>('.over');
    expect(over).not.toBeNull();
    expect(over.tagName).not.toBe('BUTTON');
    expect(over.getAttribute('aria-live')).toBe('polite');
    expect(over.textContent).toBe('');
    vi.advanceTimersByTime(100 * 9 + 300 + 50);
    expect(q('main.play').classList.contains('is-over')).toBe(true);
    expect(over.textContent).toBe(GAME_OVER);
    expect(GAME_OVER).toBe('Game over');
    // The button stays in the page (no reflow of what is above it), out of reach.
    expect(q<HTMLButtonElement>('button.act').getAttribute('aria-disabled')).toBe('true');
    vi.advanceTimersByTime(END_HOLD_MS);
    expect(onEnd).toHaveBeenCalled();
  });
});

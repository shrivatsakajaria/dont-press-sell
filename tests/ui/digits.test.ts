// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { createRoll } from '../../src/ui/digits';

it('shows exactly the text it is given, one slot per character', () => {
  const el = document.createElement('span');
  const r = createRoll(el);
  r.set('$10,340');
  expect(el.textContent).toBe('$10,340');
  expect(el.children.length).toBe(7);
  r.set('$9,812');
  expect(el.textContent).toBe('$9,812');
  r.set('$9,813');
  expect(el.textContent).toBe('$9,813');
});

it('keeps unchanged slots and marks the changed ones', () => {
  const el = document.createElement('span');
  const r = createRoll(el);
  r.set('$9,812');
  const first = el.children[0];
  r.set('$9,813');
  expect(el.children[0]).toBe(first);
  expect(r.lastChanged()).toEqual([5]);
});

it('a changing digit cross-fades in place, briefly, and never slides out of its slot (R28)', () => {
  const el = document.createElement('span');
  const r = createRoll(el);
  r.set('$9,812');
  const calls: { frames: Keyframe[]; opts: KeyframeAnimationOptions }[] = [];
  const proto = HTMLElement.prototype as unknown as { animate?: unknown };
  const had = proto.animate;
  proto.animate = vi.fn(function (frames: Keyframe[], opts: KeyframeAnimationOptions) {
    calls.push({ frames, opts });
    return {} as Animation;
  });
  try {
    r.set('$9,903');
  } finally {
    proto.animate = had;
  }
  expect(calls.length).toBeGreaterThan(0);
  for (const c of calls) {
    expect(Number(c.opts.duration)).toBeLessThanOrEqual(60);
    for (const f of c.frames) {
      expect(f.transform).toBeUndefined();
      // Always readable: never fades below half strength.
      if (f.opacity !== undefined) expect(Number(f.opacity)).toBeGreaterThanOrEqual(0.5);
    }
  }
});

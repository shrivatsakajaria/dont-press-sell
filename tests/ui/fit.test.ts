import { describe, expect, it } from 'vitest';
import { settleStep, wholeLines } from '../../src/ui/fit';

// R64: the headline fit is checked on the real element after it is applied, and steps down until it holds.
describe('settleStep', () => {
  const run = (start: number, ok: (i: number) => boolean, count = 6) => {
    const applied: number[] = [];
    let cur = -1;
    const r = settleStep(start, count, (i) => { cur = i; applied.push(i); }, () => (ok(cur) ? { overflow: 0, lines: 3 } : { overflow: 12, lines: 3 }));
    return { ...r, applied, cur };
  };

  it('keeps the first step when the real element fits', () => {
    expect(run(2, () => true)).toMatchObject({ step: 2, ok: true, applied: [2], cur: 2 });
  });

  it('steps down from the probe guess until the real element fits', () => {
    expect(run(0, (i) => i >= 3)).toMatchObject({ step: 3, ok: true, applied: [0, 1, 2, 3], cur: 3 });
  });

  it('counts a headline over three lines as not fitting, and allows half a pixel of rounding', () => {
    let cur = -1;
    const r = settleStep(0, 4, (i) => { cur = i; }, () => ({ overflow: 0.4, lines: cur < 2 ? 4 : 3 }));
    expect(r).toEqual({ step: 2, ok: true });
  });

  it('is bounded: at most one try per step, and ends on the floor when nothing fits', () => {
    const r = run(1, () => false, 6);
    expect(r).toMatchObject({ step: 5, ok: false, applied: [1, 2, 3, 4, 5], cur: 5 });
  });

  it('a start past the last step is the floor', () => {
    expect(run(9, () => true, 6)).toMatchObject({ step: 5, ok: true, applied: [5] });
  });
});

describe('wholeLines', () => {
  it('is the whole lines that fit the room (never a part line)', () => {
    expect(wholeLines(68, 20)).toBe(3);
    expect(wholeLines(59.9, 20)).toBe(2);
    expect(wholeLines(60, 20)).toBe(3);
    expect(wholeLines(10, 20)).toBe(0);
    expect(wholeLines(-5, 20)).toBe(0);
    expect(wholeLines(50, NaN)).toBe(0);
  });
});

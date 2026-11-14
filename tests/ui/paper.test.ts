import { describe, expect, it } from 'vitest';
import { MARKET_DASH, paperFor } from '../../src/ui/paper';

type P = ReturnType<typeof paperFor>;

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('paperFor', () => {
  it('calm', () => {
    expect(paperFor({ lossFrac: 0, inCash: false, worstDay: false })).toEqual({
      bg: '#f3e2d0', ink: '#1c1a17', secondary: '#4a443c', accent: '#a3201a',
      buttonBg: '#1c1a17', buttonInk: '#f3e2d0',
    });
  });
  it('losing at 0.3 and clamped beyond', () => {
    for (const lf of [0.3, 0.5, 2]) {
      const p = paperFor({ lossFrac: lf, inCash: false, worstDay: false });
      expect(p.bg).toBe('#efc3b2');
      expect(p.secondary).toBe('#4a2f28');
      expect(p.buttonInk).toBe('#efc3b2');
    }
  });
  it('interpolates between and clamps below zero', () => {
    const mid = paperFor({ lossFrac: 0.15, inCash: false, worstDay: false });
    expect(mid.bg).toBe('#f1d3c1');
    expect(paperFor({ lossFrac: -1, inCash: false, worstDay: false }).bg).toBe('#f3e2d0');
  });
  it('worst day', () => {
    const p = paperFor({ lossFrac: 0.1, inCash: false, worstDay: true });
    expect(p).toMatchObject({
      bg: '#b3142a', ink: '#fbeee2', secondary: '#fbeee2', accent: '#fbeee2',
      buttonBg: '#fbeee2', buttonInk: '#8f0f22',
    });
  });
  it('in cash', () => {
    const p = paperFor({ lossFrac: 0.2, inCash: true, worstDay: false });
    expect(p).toMatchObject({ bg: '#ebe4d6', secondary: '#4a463c', accent: '#a3201a', ink: '#1c1a17' });
  });
  it('worst day wins over in cash', () => {
    expect(paperFor({ lossFrac: 0, inCash: true, worstDay: true }).bg).toBe('#b3142a');
  });
  it('treats a non-finite lossFrac as 0', () => {
    const calm = paperFor({ lossFrac: 0, inCash: false, worstDay: false });
    for (const lf of [NaN, Infinity, -Infinity]) {
      expect(paperFor({ lossFrac: lf, inCash: false, worstDay: false })).toEqual(calm);
    }
  });
  it('exports the market dashed line colour', () => {
    expect(MARKET_DASH).toBe('#6b6558');
  });
});

describe('paper contrast (WCAG, at least 4.5:1)', () => {
  const states: [string, P][] = [
    ['lossFrac 0', paperFor({ lossFrac: 0, inCash: false, worstDay: false })],
    ['lossFrac 0.15', paperFor({ lossFrac: 0.15, inCash: false, worstDay: false })],
    ['lossFrac 0.3', paperFor({ lossFrac: 0.3, inCash: false, worstDay: false })],
    ['worst day', paperFor({ lossFrac: 0.3, inCash: false, worstDay: true })],
    ['in cash', paperFor({ lossFrac: 0, inCash: true, worstDay: false })],
  ];
  for (const [name, p] of states) {
    it(name, () => {
      expect(contrast(p.ink, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.secondary, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.buttonInk, p.buttonBg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

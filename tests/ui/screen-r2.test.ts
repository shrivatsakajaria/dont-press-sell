// Round 2, lane C: the play screen's buy-back label (R38), folio (R39), pot (R40) and press stamps (R41).
import { describe, expect, it } from 'vitest';
import { FOOTER_PLAY, boughtStamp, buyBackLabel, soldStamp } from '../../src/content/copy';
import type { Trade } from '../../src/engine/types';
import type { Step } from '../../src/game/schedule';
import type { SessionView } from '../../src/game/session';
import { buyBackSaving, screenModel, type PlayState } from '../../src/ui/screen';

describe('buyBackSaving (R38): round(cash x (1 - today / close on the day of the latest sale))', () => {
  it('is positive when today is cheaper than the sale', () => {
    expect(buyBackSaving(9000, 90, 100)).toBe(900);
  });
  it('is negative when today is dearer', () => {
    expect(buyBackSaving(9000, 110, 100)).toBe(-900);
  });
  it('rounds to whole dollars', () => {
    expect(buyBackSaving(8780, 2711.02, 2882.23)).toBe(Math.round(8780 * (1 - 2711.02 / 2882.23)));
    expect(buyBackSaving(10000, 99.99, 100)).toBe(1);
    expect(buyBackSaving(10000, 99.996, 100)).toBe(0);
  });
  it('is 0 (never -0) on the same price, and for tiny moves', () => {
    expect(Object.is(buyBackSaving(9000, 100, 100), 0)).toBe(true);
    expect(Object.is(buyBackSaving(9000, 100.004, 100), 0)).toBe(true);
  });
  it('is 0 with no sale close to compare', () => {
    expect(buyBackSaving(9000, 90, 0)).toBe(0);
  });
});

describe('buyBackLabel (R38)', () => {
  it('cheaper, dearer and the same price, with thousands commas and never "$0"', () => {
    expect(buyBackLabel(1120)).toBe('Buy back $1,120 cheaper');
    expect(buyBackLabel(-12345)).toBe('Buy back $12,345 dearer');
    expect(buyBackLabel(0)).toBe('Buy back at the same price');
  });
});

describe('press stamps (R41)', () => {
  it('reads the sale and the buy-back', () => {
    expect(soldStamp(9750)).toBe('Sold at $9,750');
    expect(boughtStamp(1120)).toBe('Bought back $1,120 cheaper');
    expect(boughtStamp(-75)).toBe('Bought back $75 dearer');
    expect(boughtStamp(0)).toBe('Bought back at the same price');
  });
});

// Ten days: flat, a 10% fall on day 4 (slow), recovery in the forward phase.
const closes = [100, 101, 99, 100, 90, 92, 95, 100, 104, 108];
const dates = closes.map((_, i) => `2007-11-${String(10 + i).padStart(2, '0')}`);
const steps: Step[] = closes.map((_, d) => ({ dayIndex: d, holdMs: 1000, phase: d < 7 ? 'fall' : 'forward', slow: d === 4 || d === 5 }));

function state(v: Partial<SessionView> & { stepIndex: number }, trades: Trade[] = [], over: Partial<PlayState> = {}): PlayState {
  const d = steps[v.stepIndex].dayIndex;
  const bal = (10000 / closes[0]) * closes[d];
  const view: SessionView = {
    dayIndex: d, balance: bal, invested: true, marketBalance: bal, peakBalance: bal, leadNow: 0,
    phase: steps[v.stepIndex].phase, slow: steps[v.stepIndex].slow, stepMs: 1000, ...v,
  };
  const history = new Map<number, { balance: number; invested: boolean }>();
  for (let i = 0; i <= v.stepIndex; i++) history.set(steps[i].dayIndex, { balance: (10000 / closes[0]) * closes[steps[i].dayIndex], invested: true });
  return {
    run: { closes, dates }, steps, start: 10000, view, runLabel: 'Mystery crash', history, trades,
    firstSaleStep: null, paused: false, pot: 10000, ...over,
  };
}

describe('screenModel in cash (R38)', () => {
  it('the button names the saving against the latest sale close; no regret line', () => {
    // Sold at the close of day 3 (100) with 10,000; day 4 closes at 90: 1,000 cheaper.
    const m = screenModel(state({ stepIndex: 4, invested: false, balance: 10000, leadNow: 1000 }, [{ dayIndex: 3, side: 'sell' }]));
    expect(m.buttonLabel).toBe('Buy back $1,000 cheaper');
    expect(m.cheaper).toBe(true);
    expect(m.regret).toBeNull();
  });

  it('dearer when today is above the sale close, and not cheaper', () => {
    const m = screenModel(state({ stepIndex: 8, invested: false, balance: 9000 }, [{ dayIndex: 4, side: 'sell' }]));
    // 9,000 x (1 - 104 / 90) = -1,400
    expect(m.buttonLabel).toBe('Buy back $1,400 dearer');
    expect(m.cheaper).toBe(false);
  });

  it('the same price on the day of the sale (never "$0 cheaper")', () => {
    const m = screenModel(state({ stepIndex: 4, invested: false, balance: 9000 }, [{ dayIndex: 4, side: 'sell' }]));
    expect(m.buttonLabel).toBe('Buy back at the same price');
    expect(m.cheaper).toBe(false);
  });

  it('uses the most recent sale after a round trip', () => {
    const trades: Trade[] = [{ dayIndex: 1, side: 'sell' }, { dayIndex: 2, side: 'buy' }, { dayIndex: 4, side: 'sell' }];
    const m = screenModel(state({ stepIndex: 6, invested: false, balance: 9000 }, trades));
    // 9,000 x (1 - 95 / 90) = -500
    expect(m.buttonLabel).toBe('Buy back $500 dearer');
  });

  it('no second number while in cash: no score to beat, no regret', () => {
    const m = screenModel(state({ stepIndex: 6, invested: false, balance: 9000 }, [{ dayIndex: 4, side: 'sell' }], { scoreToBeat: 7150 }));
    expect(m.regret).toBeNull();
    expect(m.underButton).toBe(FOOTER_PLAY);
    expect(m.deltaLabel).toBe('in cash');
  });

  it('invested: still "Sell for $N" and not cheaper', () => {
    const m = screenModel(state({ stepIndex: 2 }));
    expect(m.buttonLabel).toBe('Sell for $9,900');
    expect(m.cheaper).toBe(false);
  });
});

describe('folio and pot (R39, R40)', () => {
  it('no "Price: your nerve" and no "Time slowed": the status slot is empty', () => {
    expect(screenModel(state({ stepIndex: 1 })).status).toBe('');
    const slow = screenModel(state({ stepIndex: 4 }));
    expect(slow.big).toBe(true);
    expect(slow.status).toBe('');
  });
  it('keeps "You are in cash" (slow days too), "Fast forward" and "Paused"', () => {
    expect(screenModel(state({ stepIndex: 5, invested: false, balance: 9000 }, [{ dayIndex: 4, side: 'sell' }])).status).toBe('You are in cash');
    expect(screenModel(state({ stepIndex: 8 })).status).toBe('Fast forward');
    expect(screenModel(state({ stepIndex: 2 }, [], { paused: true })).status).toBe('Paused');
  });
  it('the pot line is empty on the play screen', () => {
    expect(screenModel(state({ stepIndex: 1 })).pot).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { FIRST_SALE_LINE, FOOTER_PLAY, OPENING_LINE } from '../../src/content/copy';
import type { Trade } from '../../src/engine/types';
import type { Step } from '../../src/game/schedule';
import type { SessionView } from '../../src/game/session';
import { paperFor } from '../../src/ui/paper';
import { screenModel, type PlayState } from '../../src/ui/screen';

// Ten days: flat, a 10% fall on day 4 (slow), recovery in the forward phase.
const closes = [100, 101, 99, 100, 90, 92, 95, 100, 104, 108];
const dates = [
  '2007-11-09', '2007-11-12', '2007-11-13', '2007-11-14', '2007-11-15',
  '2008-11-17', '2009-11-17', '2009-11-18', '2010-11-18', '2010-11-19',
];
const steps: Step[] = [
  { dayIndex: 0, holdMs: 300, phase: 'fall', slow: false },
  { dayIndex: 1, holdMs: 300, phase: 'fall', slow: false },
  { dayIndex: 2, holdMs: 300, phase: 'fall', slow: false },
  { dayIndex: 3, holdMs: 300, phase: 'fall', slow: false },
  { dayIndex: 4, holdMs: 800, phase: 'fall', slow: true },
  { dayIndex: 5, holdMs: 300, phase: 'fall', slow: true },
  { dayIndex: 6, holdMs: 300, phase: 'fall', slow: false },
  { dayIndex: 7, holdMs: 300, phase: 'forward', slow: false },
  { dayIndex: 9, holdMs: 300, phase: 'forward', slow: false },
];

function view(stepIndex: number, over: Partial<SessionView> = {}): SessionView {
  const d = steps[stepIndex].dayIndex;
  const bal = (10000 / closes[0]) * closes[d];
  return {
    stepIndex, dayIndex: d, balance: bal, invested: true, marketBalance: bal,
    peakBalance: bal, leadNow: 0, phase: steps[stepIndex].phase, slow: steps[stepIndex].slow, stepMs: steps[stepIndex].holdMs, ...over,
  };
}

function state(v: SessionView, over: Partial<PlayState> = {}): PlayState {
  const history = new Map<number, { balance: number; invested: boolean }>();
  for (let i = 0; i <= v.stepIndex; i++) {
    const d = steps[i].dayIndex;
    history.set(d, { balance: (10000 / closes[0]) * closes[d], invested: true });
  }
  history.set(v.dayIndex, { balance: v.balance, invested: v.invested });
  return {
    run: { closes, dates }, steps, start: 10000, view: v, runLabel: 'Mystery crash',
    history, trades: [] as Trade[], firstSaleStep: null, paused: false, pot: 10000, ...over,
  };
}

describe('screenModel', () => {
  it('day 1 while holding: sell label, opening line, default status, footer under the button', () => {
    const m = screenModel(state(view(0)));
    expect(m.buttonLabel).toBe('Sell for $10,000');
    expect(m.standfirst).toBe(OPENING_LINE);
    expect(m.status).toBe('Price: your nerve');
    expect(m.dayLabel).toBe('Day 1');
    expect(m.runLabel).toBe('Mystery crash');
    expect(m.headline).toBe('Headline for day 1');
    expect(m.underButton).toBe(FOOTER_PLAY);
    expect(m.regret).toBeNull();
    expect(m.paper).toEqual(paperFor({ lossFrac: 0, inCash: false, worstDay: false }));
    expect(m.pot).toBe('Your pot: $10,000');
    expect(m.deltaLabel).toBe('level');
  });

  it('a slow day 1 that fell from the close before the run (preCloses) is a red day', () => {
    const slow0 = steps.map((st, i) => (i === 0 ? { ...st, slow: true } : st));
    const v = { ...view(0), slow: true };
    const red = screenModel(state(v, { steps: slow0, run: { closes, dates, preCloses: [104, 103] } }));
    expect(red.worst).toBe(true);
    expect(red.paper).toEqual(paperFor({ lossFrac: 0, inCash: false, worstDay: true }));
    // Rose from the close before, or no closes before in the file: not red.
    expect(screenModel(state(v, { steps: slow0, run: { closes, dates, preCloses: [98] } })).worst).toBe(false);
    expect(screenModel(state(v, { steps: slow0 })).worst).toBe(false);
  });

  it('opening line stays up for the first four seconds of play, however short the steps', () => {
    expect(screenModel(state(view(3))).standfirst).toBe(OPENING_LINE);
    expect(screenModel(state(view(6))).standfirst).toBe(OPENING_LINE);
    const fast = steps.map((s) => ({ ...s, holdMs: 125 }));
    expect(screenModel(state(view(6), { steps: fast })).standfirst).toBe(OPENING_LINE);
    const slow = steps.map((s) => ({ ...s, holdMs: 1000 }));
    expect(screenModel(state(view(3), { steps: slow })).standfirst).toBe(OPENING_LINE);
    expect(screenModel(state(view(4), { steps: slow })).standfirst).not.toBe(OPENING_LINE);
  });

  it('a slow falling day is the worst day: red paper, time slowed, you had $N yesterday', () => {
    const m = screenModel(state(view(4, { peakBalance: 10100 })));
    expect(m.worst).toBe(true);
    expect(m.big).toBe(true);
    expect(m.status).toBe('Time slowed');
    expect(m.paper.bg).toBe('#b3142a');
    expect(m.underButton).toBe('You had $10,000 yesterday');
    expect(m.deltaLabel).toBe('down $1,000');
  });

  it('a slow rising day is big but not the worst', () => {
    const m = screenModel(state(view(5)));
    expect(m.big).toBe(true);
    expect(m.worst).toBe(false);
    expect(m.status).toBe('Time slowed');
  });

  it('selling at the top line once the gap from the peak is 500 or more', () => {
    const m = screenModel(state(view(6, { peakBalance: 10100 })));
    expect(m.underButton).toBe('Selling at the top would have saved you $600');
    const n = screenModel(state(view(6, { peakBalance: 9999 })));
    expect(n.underButton).toBe(FOOTER_PLAY);
  });

  it('paper deepens with the loss', () => {
    const m = screenModel(state(view(6)));
    expect(m.paper).toEqual(paperFor({ lossFrac: 0.05, inCash: false, worstDay: false }));
  });

  it('in cash: buy-back label from leadNow, grey paper, status, first-sale line, regret', () => {
    // Sold at the close of day 4 (balance 9,000); now day 5, market up 92/90.
    const v = view(5, { invested: false, balance: 9000, leadNow: 9000 - 9200, slow: false });
    const trades: Trade[] = [{ dayIndex: 4, side: 'sell' }];
    const s = state(v, { trades, firstSaleStep: 4 });
    s.history.set(4, { balance: 9000, invested: false });
    const m = screenModel(s);
    expect(m.buttonLabel).toBe('Buy back now: $200 behind');
    expect(m.inCash).toBe(true);
    expect(m.status).toBe('You are in cash');
    expect(m.paper.bg).toBe('#ebe4d6');
    expect(m.standfirst).toBe(FIRST_SALE_LINE);
    expect(m.regret).toEqual({ text: 'Holding today would have made you $200', rose: true });
    expect(m.deltaLabel).toBe('in cash');
    // The dashed market line runs from the sale.
    const ghost = m.chart.points.filter((p) => p.ghost !== null);
    expect(ghost.map((p) => p.dayIndex)).toEqual([4, 5]);
    expect(ghost[1].ghost).toBeCloseTo(9200);
  });

  it('regret on a falling day is the cost line, and none on the sale day itself', () => {
    const v = view(2, { invested: false, balance: 10100 });
    const s = state(v, { trades: [{ dayIndex: 1, side: 'sell' }] });
    expect(screenModel(s).regret).toEqual({ text: 'Holding today would have cost you $200', rose: false });
    const sameDay = state(view(1, { invested: false }), { trades: [{ dayIndex: 1, side: 'sell' }] });
    expect(screenModel(sameDay).regret).toBeNull();
  });

  it('first-sale line lasts about four seconds from the sale', () => {
    const slow = steps.map((s) => ({ ...s, holdMs: 1000 }));
    const v = view(7, { invested: false, balance: 9000 });
    expect(screenModel(state(v, { steps: slow, firstSaleStep: 4 })).standfirst).toBe(FIRST_SALE_LINE);
    const later = view(8, { invested: false, balance: 9000 });
    expect(screenModel(state(later, { steps: slow, firstSaleStep: 4 })).standfirst).not.toBe(FIRST_SALE_LINE);
  });

  it('every buy-back label is set at the long size and every sell label at full size (R26)', () => {
    const v = view(5, { invested: false, balance: 9000, leadNow: -12345 });
    const m = screenModel(state(v, { trades: [{ dayIndex: 4, side: 'sell' }] }));
    expect(m.buttonLabel).toBe('Buy back now: $12,345 behind');
    expect(m.longLabel).toBe(true);
    const short = screenModel(state(view(5, { invested: false, balance: 9000, leadNow: 0 }), { trades: [{ dayIndex: 4, side: 'sell' }] }));
    expect(short.buttonLabel).toBe('Buy back now: $0 ahead');
    expect(short.longLabel).toBe(true);
    expect(screenModel(state(view(0))).longLabel).toBe(false);
    expect(screenModel(state(view(0, { balance: 123456 }))).longLabel).toBe(false);
  });

  it('regret uses today\'s move only, even when the step covers several days', () => {
    // One quiet step covers days 2 and 3; the previous step showed day 1.
    const grouped: Step[] = [
      { dayIndex: 0, holdMs: 300, phase: 'fall', slow: false },
      { dayIndex: 1, holdMs: 300, phase: 'fall', slow: false },
      { dayIndex: 3, holdMs: 300, phase: 'fall', slow: false },
    ];
    const v: SessionView = {
      stepIndex: 2, dayIndex: 3, balance: 10100, invested: false, marketBalance: 10000,
      peakBalance: 10100, leadNow: 100, phase: 'fall', slow: false, stepMs: 300,
    };
    const s = state(v, { steps: grouped, trades: [{ dayIndex: 1, side: 'sell' }] });
    // closes[3] / closes[2] = 100 / 99: today's move is up about 1%, so $102 (not the $100 cost since day 1).
    expect(screenModel(s).regret).toEqual({ text: 'Holding today would have made you $102', rose: true });
  });

  it('no regret line in the fast-forward', () => {
    const v = view(7, { invested: false, balance: 9000 });
    expect(screenModel(state(v, { trades: [{ dayIndex: 4, side: 'sell' }] })).regret).toBeNull();
  });

  it('fast forward shows the status and a year counter, never a date', () => {
    const m = screenModel(state(view(7)));
    expect(m.status).toBe('Fast forward');
    expect(m.dayLabel).toBe('Year 3');
    expect(screenModel(state(view(8))).dayLabel).toBe('Year 4');
  });

  it('paused overrides the status', () => {
    expect(screenModel(state(view(2), { paused: true })).status).toBe('Paused');
  });

  it('shows the narrated headline and commentary once the opening line has gone', () => {
    const slow = steps.map((x) => ({ ...x, holdMs: 1000 }));
    const words = { headline: 'A big bank fails', commentary: 'Down two days in a row.' };
    expect(screenModel(state(view(0), words)).headline).toBe('A big bank fails');
    expect(screenModel(state(view(0), words)).standfirst).toBe(OPENING_LINE);
    expect(screenModel(state(view(6), { ...words, steps: slow })).standfirst).toBe('Down two days in a row.');
  });

  it('a rematch: "This is the day you sold last time." on that day, and the score to beat under the balance', () => {
    const slow = steps.map((x) => ({ ...x, holdMs: 1000 }));
    const words = { commentary: 'Commentary.', soldLastTime: 5, scoreToBeat: 7150, other: [10000, 9000] };
    expect(screenModel(state(view(4), { ...words, steps: slow })).standfirst).toBe('Commentary.');
    const m = screenModel(state(view(5), { ...words, steps: slow }));
    expect(m.standfirst).toBe('This is the day you sold last time.');
    expect(m.regret).toEqual({ text: 'Score to beat: $7,150', rose: false });
    expect(m.chart.other).toEqual([10000, 9000]);
    expect(screenModel(state(view(8), { ...words, steps: slow })).standfirst).toBe('Commentary.');
  });
});


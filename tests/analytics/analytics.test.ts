import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createAnalytics, watchExit, type AnalyticsDeps } from '../../src/analytics/analytics';
import { resetCells } from '../../src/store/store';

const g = globalThis as unknown as { localStorage?: unknown };
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

type Call = [string, Record<string, unknown>];
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

function setup(over: Partial<AnalyticsDeps> = {}) {
  const calls: Call[] = [];
  const clock = { t: 0, day: '2026-11-14', sound: true };
  const umami = { track: (name: string, data?: Record<string, unknown>) => void calls.push([name, data ?? {}]) };
  let present = true;
  const an = createAnalytics({
    umami: () => (present ? umami : undefined),
    ua: SAFARI,
    now: () => clock.t,
    today: () => clock.day,
    sound: () => clock.sound,
    ...over,
  });
  return { an, calls, clock, setPresent: (p: boolean) => (present = p), names: () => calls.map((c) => c[0]) };
}

/** A game of 10 equal steps: step i starts at i * 10% of the plan. */
const plain = { entry: 'new' as const, kind: 'crash' as const, run: 'c2007', double: false, progress: (i: number) => i * 10 };
const f = (stepIndex: number, o: { invested?: boolean; red?: boolean; trade?: 'sell' | 'buy' | null; forward?: boolean } = {}) => ({
  stepIndex, invested: o.invested ?? true, red: o.red ?? false, trade: o.trade ?? null, forward: o.forward ?? false,
});

beforeEach(() => {
  g.localStorage = memoryStorage();
  resetCells();
});
afterEach(() => {
  delete g.localStorage;
  resetCells();
});

describe('sending', () => {
  test('events wait in order until the tracker is there, then go first', () => {
    const s = setup();
    s.setPresent(false);
    s.an.loadError('c1929');
    s.an.loadError('c1987');
    expect(s.calls).toEqual([]);
    s.setPresent(true);
    s.an.flush();
    expect(s.calls.map((c) => c[1].run)).toEqual(['c1929', 'c1987']);
    s.an.loadError('c2000');
    expect(s.calls.map((c) => c[1].run)).toEqual(['c1929', 'c1987', 'c2000']);
  });

  test('no tracker (blocked) or a tracker that throws: nothing breaks', () => {
    const none = createAnalytics({ umami: () => undefined, ua: '', now: () => 0, today: () => '2026-11-14', sound: () => true });
    expect(() => {
      const gm = none.game(plain);
      gm.frame(f(0));
      gm.end({ lead: 10, trades: 0, bust: false });
      none.hidden();
    }).not.toThrow();
    const bad = createAnalytics({
      umami: () => ({ track: () => { throw new Error('x'); } }), ua: '', now: () => 0, today: () => '2026-11-14', sound: () => true,
    });
    expect(() => bad.game(plain).frame(f(0))).not.toThrow();
    const worse = createAnalytics({
      umami: () => { throw new Error('getter'); }, ua: '', now: () => 0, today: () => '2026-11-14', sound: () => true,
    });
    expect(() => worse.loadError('c1929')).not.toThrow();
  });

  test('the queue is capped', () => {
    const s = setup();
    s.setPresent(false);
    for (let i = 0; i < 100; i++) s.an.loadError('c1929');
    s.setPresent(true);
    s.an.flush();
    expect(s.calls.length).toBeLessThanOrEqual(30);
  });
});

describe('game_start and the shared context', () => {
  test('sent on the first frame (Start pressed), once, with the context', () => {
    const s = setup();
    s.clock.t = 4200;
    const gm = s.an.game(plain);
    expect(s.calls).toEqual([]);
    gm.frame(f(0));
    gm.frame(f(1));
    expect(s.names()).toEqual(['game_start']);
    expect(s.calls[0][1]).toEqual({
      g: 1, gt: '1', dsf: '0', entry: 'new', kind: 'crash', run: 'c2007', inapp: 'none', snd: 'on', ms_to_start: '3-10s',
    });
  });

  test('ms_to_start on the first game of the visit only; g counts games this visit', () => {
    const s = setup();
    s.an.game(plain).frame(f(0));
    s.clock.sound = false;
    s.an.game({ ...plain, entry: 'rematch' }).frame(f(0));
    expect(s.calls[1][1]).toMatchObject({ g: 2, gt: '2', entry: 'rematch', snd: 'off' });
    expect(s.calls[1][1]).not.toHaveProperty('ms_to_start');
  });

  test('games ever and days since first play come from the phone', () => {
    const a = setup();
    for (let i = 0; i < 3; i++) a.an.game(plain).frame(f(0));
    resetCells(); // a new visit
    const b = setup();
    b.clock.day = '2026-11-17';
    b.an.game({ ...plain, kind: 'scare', run: 's2018', entry: 'challenge' }).frame(f(0));
    expect(b.calls[0][1]).toMatchObject({ g: 1, gt: '3-5', dsf: '2-7', kind: 'scare', run: 's2018', entry: 'challenge' });
  });

  test('still counts for the visit with storage blocked', () => {
    g.localStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    resetCells();
    const s = setup();
    s.an.game(plain).frame(f(0));
    s.an.game(plain).frame(f(0));
    expect(s.calls.map((c) => c[1].gt)).toEqual(['1', '2']);
  });

  test('the in-app browser is read from the user agent', () => {
    const s = setup({ ua: 'Mozilla/5.0 (iPhone) AppleWebKit Mobile/15E148 [LinkedInApp]/9.29' });
    s.an.game(plain).frame(f(0));
    expect(s.calls[0][1].inapp).toBe('linkedin');
  });
});

describe('game_end', () => {
  function played(s: ReturnType<typeof setup>, script: (gm: ReturnType<typeof s.an.game>) => void, r = { lead: 812, trades: 2, bust: false }) {
    const gm = s.an.game(plain);
    script(gm);
    gm.end(r);
    return s.calls.find((c) => c[0] === 'game_end')![1];
  }

  test('a hold to the end: win, never sold, no time in cash', () => {
    const s = setup();
    const e = played(s, (gm) => {
      gm.frame(f(0));
      s.clock.t = 100_000;
      gm.frame(f(9));
      s.clock.t = 120_000;
    }, { lead: 812, trades: 0, bust: false });
    expect(e).toMatchObject({
      g: 1, outcome: 'win', lead: '500 to 1999', sec: '120-179', trades: 0, first_sell: 'never', cash_pct: 0, double: false,
    });
    expect(e).not.toHaveProperty('first_sell_pct');
  });

  test('sold before the first red day, bought back after it; cash time and seconds leave out the pause', () => {
    const s = setup();
    const e = played(s, (gm) => {
      gm.frame(f(0));
      s.clock.t = 20_000;
      gm.frame(f(2, { invested: false, trade: 'sell' }));
      s.clock.t = 40_000;
      gm.pause();
      s.clock.t = 100_000; // a minute away: not play time
      gm.resume();
      gm.frame(f(4, { invested: false, red: true }));
      s.clock.t = 110_000;
      gm.frame(f(6, { invested: true, trade: 'buy' }));
      s.clock.t = 140_000;
    }, { lead: -300, trades: 2, bust: false });
    // 80 s of play; 30 s of it in cash.
    expect(e).toMatchObject({ outcome: 'loss', lead: '-499 to -1', sec: '60-89', trades: 2, first_sell: 'before_red', first_sell_pct: 20, cash_pct: 30 });
  });

  test('sold on the red day, and after it', () => {
    const on = setup();
    expect(played(on, (gm) => {
      gm.frame(f(0));
      gm.frame(f(3, { red: true }));
      gm.frame(f(3, { red: true, invested: false, trade: 'sell' }));
    }).first_sell).toBe('on_red');
    resetCells();
    const after = setup();
    const e = played(after, (gm) => {
      gm.frame(f(0));
      gm.frame(f(3, { red: true }));
      gm.frame(f(5));
      gm.frame(f(5, { invested: false, trade: 'sell' }));
    });
    expect(e).toMatchObject({ first_sell: 'after_red', first_sell_pct: 50 });
  });

  test('draw, bust and a double-or-nothing game', () => {
    const s = setup();
    expect(played(s, (gm) => gm.frame(f(0)), { lead: 0.3, trades: 0, bust: false }).outcome).toBe('draw');
    const b = setup();
    expect(played(b, (gm) => gm.frame(f(0)), { lead: -10000, trades: 0, bust: true }).outcome).toBe('bust');
    const d = setup();
    const gm = d.an.game({ ...plain, entry: 'double', double: true });
    gm.frame(f(0));
    gm.end({ lead: 5, trades: 0, bust: false });
    expect(d.calls[1][1]).toMatchObject({ entry: 'double', double: true });
  });
});

describe('result_action', () => {
  function toResult(s: ReturnType<typeof setup>) {
    const gm = s.an.game(plain);
    gm.frame(f(0));
    s.clock.t = 120_000;
    gm.end({ lead: 1, trades: 0, bust: false });
  }

  test('the first move on the result page, once, with seconds there and whether they tapped the reveal', () => {
    const s = setup();
    toResult(s);
    s.clock.t = 127_000;
    s.an.revealed();
    s.an.action('rematch');
    s.an.action('new');
    expect(s.names()).toEqual(['game_start', 'game_end', 'result_action']);
    expect(s.calls[2][1]).toMatchObject({ g: 1, action: 'rematch', result_sec: '5-14', revealed: true });
  });

  test('page hidden on the result page: left, or reveal_only after the reveal; once', () => {
    const a = setup();
    toResult(a);
    a.an.hidden();
    a.an.hidden();
    a.an.action('new');
    expect(a.calls.filter((c) => c[0] === 'result_action').map((c) => c[1].action)).toEqual(['left']);
    const b = setup();
    toResult(b);
    b.an.revealed();
    b.an.hidden();
    expect(b.calls.at(-1)).toEqual(['result_action', expect.objectContaining({ action: 'reveal_only', revealed: true })]);
  });

  test('no result page, no result_action', () => {
    const s = setup();
    s.an.action('rematch');
    expect(s.calls).toEqual([]);
  });

  test('share carries how it went out', () => {
    const s = setup();
    toResult(s);
    s.an.action('challenge');
    s.an.share('native');
    expect(s.calls.at(-1)).toEqual(['share', expect.objectContaining({ g: 1, via: 'native', run: 'c2007' })]);
  });
});

describe('game_quit (page hidden mid-game)', () => {
  const quit = (s: ReturnType<typeof setup>) => s.calls.filter((c) => c[0] === 'game_quit').map((c) => c[1]);

  test('on the start screen', () => {
    const s = setup();
    s.an.game(plain);
    s.an.hidden();
    expect(quit(s)).toEqual([expect.objectContaining({ g: 1, phase: 'start_screen', pct: 0, sold: false })]);
  });

  test('each phase of play', () => {
    const phases: [string, (gm: ReturnType<ReturnType<typeof setup>['an']['game']>) => void][] = [
      ['before_red', (gm) => gm.frame(f(1))],
      ['holding', (gm) => { gm.frame(f(1, { red: true })); gm.frame(f(2)); }],
      ['in_cash', (gm) => { gm.frame(f(1)); gm.frame(f(3, { invested: false, trade: 'sell' })); }],
      ['fast_forward', (gm) => { gm.frame(f(1)); gm.frame(f(8, { forward: true })); }],
    ];
    for (const [phase, script] of phases) {
      resetCells();
      const s = setup();
      script(s.an.game(plain));
      s.an.hidden();
      expect(quit(s)[0]?.phase).toBe(phase);
    }
  });

  test('once per game, with progress and whether they sold', () => {
    const s = setup();
    const gm = s.an.game(plain);
    gm.frame(f(0));
    gm.frame(f(4, { invested: false, trade: 'sell' }));
    gm.frame(f(5, { invested: true, trade: 'buy' }));
    s.an.hidden();
    s.an.hidden();
    expect(quit(s)).toEqual([expect.objectContaining({ phase: 'before_red', pct: 50, sold: true })]);
    // Came back and finished: the end still counts, no second quit.
    gm.end({ lead: 1, trades: 2, bust: false });
    s.an.hidden();
    expect(quit(s).length).toBe(1);
  });

  test('a game that has ended never quits', () => {
    const s = setup();
    const gm = s.an.game(plain);
    gm.frame(f(0));
    gm.end({ lead: 1, trades: 0, bust: false });
    s.an.hidden();
    expect(quit(s)).toEqual([]);
  });
});

describe('feedback (R69)', () => {
  test('due once, after the third finished game ever', () => {
    const s = setup();
    const due: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const gm = s.an.game(plain);
      gm.frame(f(0));
      gm.end({ lead: 1, trades: 0, bust: false });
      due.push(s.an.feedbackDue());
    }
    expect(due).toEqual([false, false, true, false, false]);
    resetCells();
    expect(setup().an.feedbackDue()).toBe(false);
  });

  test('the answer goes out as feedback', () => {
    const s = setup();
    s.an.feedback(true);
    s.an.feedback(false);
    expect(s.calls.map((c) => [c[0], c[1].answer])).toEqual([['feedback', 'yes'], ['feedback', 'no']]);
  });

  test('pagehide and visibility hidden both report the exit, and it goes out once', () => {
    const s = setup();
    s.an.game(plain).frame(f(0));
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const win = new EventTarget();
    watchExit(s.an, doc, win);
    doc.dispatchEvent(new Event('visibilitychange')); // still visible: nothing
    expect(s.names()).toEqual(['game_start']);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('pagehide'));
    expect(s.names()).toEqual(['game_start', 'game_quit']);
  });

  test('never an identifier in any event', () => {
    const s = setup();
    const gm = s.an.game(plain);
    gm.frame(f(0));
    gm.end({ lead: 1, trades: 0, bust: false });
    s.an.action('new');
    for (const [, data] of s.calls) {
      for (const k of Object.keys(data)) expect(k).not.toMatch(/id|user|session|uuid/i);
    }
  });
});

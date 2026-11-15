import { describe, it, expect } from 'vitest';
import { commentaryFor, isPlainLine, NEUTRAL_LINES } from '../../src/content/commentary';

type Ctx = Parameters<typeof commentaryFor>[0];

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Thirty quiet pre-run closes ending at `last`, all at or below `high`. */
function pre(last: number, high = last): number[] {
  const out: number[] = [];
  for (let k = 0; k < 30; k++) out.push(k % 2 === 0 ? high : high - 0.2);
  out[29] = last;
  return out;
}

function base(over: Partial<Ctx> & { closes: number[] }): Omit<Ctx, 'rng'> {
  return {
    dayIndex: over.closes.length - 1,
    invested: true,
    neverSold: true,
    balance: 10000,
    start: 10000,
    sombre: false,
    high: 100,
    preCloses: pre(100),
    ...over,
  };
}

function lines(c: Omit<Ctx, 'rng'>, n = 300): Set<string> {
  const out = new Set<string>();
  for (let k = 1; k <= n; k++) out.add(commentaryFor({ ...c, rng: lcg(k * 7919) }));
  return out;
}

const YEAR = /\b(1[5-9]|20)\d\d\b/;
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

function randomCtx(rand: () => number, previous?: string): Ctx {
  const n = 2 + Math.floor(rand() * 40);
  const closes = [92 + rand() * 2];
  for (let i = 1; i < n; i++) closes.push(closes[i - 1] * (1 + (rand() - 0.5) * 0.14));
  const p: number[] = [];
  let x = 100;
  for (let k = 0; k < 30; k++) {
    p.push(x);
    x = Math.min(100, x * (1 + (rand() - 0.5) * 0.03));
  }
  p[29] = Math.max(p[29], closes[0] * 1.01);
  return {
    closes,
    dayIndex: Math.floor(rand() * n),
    invested: rand() < 0.5,
    neverSold: rand() < 0.5,
    balance: 5000 + rand() * 12000,
    start: 10000,
    sombre: rand() < 0.2,
    high: 100,
    preCloses: p,
    rng: rand,
    previous,
  };
}

describe('commentaryFor', () => {
  it('names a streak of seven falling days', () => {
    const closes = [99, 98, 97, 96, 95, 94, 93];
    const seen = lines(base({ closes, balance: 9300 }));
    expect([...seen].some((l) => l.includes('seven days in a row'))).toBe(true);
    for (const l of seen) if (/days in a row/.test(l)) expect(l).toContain('seven days in a row');
  });

  it('counts a streak back through the pre-run closes (not cut off at day one)', () => {
    // Seven falls before day 1 plus three inside the run: ten in a row, never "three".
    const p = pre(100);
    const lead = [107, 106, 105, 104, 103, 102, 101, 100];
    for (let k = 0; k < lead.length; k++) p[22 + k] = lead[k];
    const closes = [99, 98, 97];
    const seen = lines(base({ closes, preCloses: p, high: 107 }));
    for (const l of seen) {
      expect(l).not.toContain('three days in a row');
      if (/days in a row/.test(l)) expect(l).toContain('ten days in a row');
    }
  });

  it('says nothing about a streak when it reaches the start of the data', () => {
    const seen = lines(base({ closes: [99, 98, 97, 96], preCloses: [101, 100.5, 100] }));
    for (const l of seen) expect(l).not.toMatch(/days in a row/);
  });

  it('does not undercount the fall before a bounce', () => {
    const p = pre(100);
    const lead = [107, 106, 105, 104, 103, 102, 101, 100];
    for (let k = 0; k < lead.length; k++) p[22 + k] = lead[k];
    const seen = lines(base({ closes: [99, 98, 99.5], preCloses: p, high: 107 }));
    for (const l of seen) expect(l).not.toMatch(/bounce after (three|two|four) falling/);
  });

  it('can say more than 35% below the peak when 40% has gone (R37: "more than", so it stays true)', () => {
    const closes = [90, 80, 70, 60];
    const seen = lines(base({ closes, balance: 6000 }));
    expect(seen.has('The market is more than 35% below the peak. Still holding?')).toBe(true);
    for (const l of seen) expect(l).not.toMatch(/more than 40%/);
  });

  it('measures the peak from the pre-run high and rounds to whole numbers', () => {
    // High 120, close 96: 20% below the high, though only 4% below the run's first close.
    const seen = lines(base({ closes: [100, 96], high: 120, preCloses: pre(105, 120) }));
    expect(seen.has('More than 15% below the peak. Officially a bear market.')).toBe(true);
    // 19.9% down must not read as more than 20%, nor as a bear market.
    const s2 = lines(base({ closes: [100, 80.1], high: 100, preCloses: pre(100, 100) }));
    for (const l of s2) {
      expect(l).not.toMatch(/more than 20%/i);
      expect(l).not.toContain('bear market');
    }
    expect(s2.has('More than 15% off the peak. The polite word for this is a correction.')).toBe(true);
  });

  it('rounds one-day moves instead of flooring them', () => {
    const closes = [96.01];
    const seen = lines(base({ closes, preCloses: pre(100), high: 100 }));
    expect(seen.has('The market fell 4% in a single day. Not a quiet one.')).toBe(true);
    for (const l of seen) expect(l).not.toContain('fell 3%');
  });

  it('rounds the percentage on your money', () => {
    const seen = lines(base({ closes: [92], balance: 8010 }));
    expect(seen.has('Down 20% on your money.')).toBe(true);
    for (const l of seen) expect(l).not.toContain('Down 10% on');
  });

  it('only says holding when the player has never sold, and never says behind', () => {
    const closes = [95, 94];
    const sold = lines(base({ closes, balance: 9400, neverSold: false }));
    for (const l of sold) {
      expect(l).not.toMatch(/Holding|Still holding/);
      expect(l).not.toMatch(/behind|ahead/i);
    }
    const held = lines(base({ closes, balance: 9400, neverSold: true }));
    expect(held.has('Holding, and below where you started.')).toBe(true);
  });

  it('mentions the sidelines on the best day when the player sat out the move', () => {
    const closes = [98, 97, 95, 94, 101];
    for (let k = 1; k <= 50; k++) {
      const l = commentaryFor({
        ...base({ closes, invested: false, balance: 9700 }),
        rng: lcg(k),
      });
      expect(l.toLowerCase()).toContain('sideline');
    }
  });

  it('does not say you watched from the sidelines when you held through the move', () => {
    const seen = lines(base({ closes: [98, 97, 95, 94, 101], invested: true }));
    for (const l of seen) expect(l).not.toContain('sidelines');
  });

  it('does not call a day the best when a bigger rise came before the run', () => {
    const p = pre(100);
    p[20] = 97;
    p[21] = 98.5; // +1.5%
    p[22] = 100;
    const seen = lines(base({ closes: [92.9, 92, 91, 91.3], preCloses: p, invested: false }));
    for (const l of seen) expect(l).not.toContain('best day');
  });

  it('counts day one’s own fall when naming the worst day', () => {
    // Day one falls 7.1% from the last pre-run close; a later 2% day is not the worst.
    const seen = lines(base({ closes: [92.9, 92, 91, 89.2], preCloses: pre(100) }));
    for (const l of seen) expect(l).not.toContain('worst day');
  });

  it('does not claim a best day when the day is not the best', () => {
    const seen = lines(base({ closes: [90, 100, 101], invested: false }));
    for (const l of seen) expect(l).not.toContain('best day');
  });

  it('ignores future days', () => {
    const b = { dayIndex: 2, balance: 9800 };
    const a = lines(base({ ...b, closes: [99, 98, 97] }));
    const c = lines(base({ ...b, closes: [99, 98, 97, 50, 40, 30, 20] }));
    expect([...c].sort()).toEqual([...a].sort());
  });

  it('throws when dayIndex is outside closes', () => {
    expect(() => commentaryFor({ ...base({ closes: [99, 98] }), dayIndex: 5, rng: lcg(1) })).toThrow();
  });

  it('has no digit-year, emoji, exclamation mark or curly apostrophe in any line', () => {
    const rand = lcg(42);
    for (let k = 0; k < 3000; k++) {
      const l = commentaryFor(randomCtx(rand));
      expect(l).not.toMatch(YEAR);
      expect(l).not.toMatch(EMOJI);
      expect(l).not.toContain('!');
      expect(l).not.toContain('’');
      expect(l.length).toBeGreaterThan(0);
    }
    for (const l of NEUTRAL_LINES) {
      expect(l).not.toMatch(YEAR);
      expect(l).not.toContain('!');
    }
  });

  it('never repeats a line on consecutive days over 500 contexts', () => {
    const rand = lcg(2024);
    let previous: string | undefined;
    for (let k = 0; k < 500; k++) {
      const l = commentaryFor(randomCtx(rand, previous));
      if (previous !== undefined) expect(l).not.toBe(previous);
      previous = l;
    }
  });

  it('takes every sombre line from the plain set (no jokes), or none when no plain line is true', () => {
    expect(NEUTRAL_LINES.length).toBeGreaterThanOrEqual(8);
    const rand = lcg(7);
    for (let k = 0; k < 500; k++) {
      const c = { ...randomCtx(rand), sombre: true };
      const l = commentaryFor(c);
      if (l) expect(isPlainLine(l), l).toBe(true);
    }
  });

  it('keeps neutral lines true: no fall wording on a rising day', () => {
    const seen = lines(base({ closes: [99, 98, 99.5], sombre: true }));
    // Daily wording only: a rising day can still be lower than a week ago.
    for (const l of seen) expect(l).not.toMatch(/fall\.|fall again|closes lower|losses|fell/i);
  });

  it('only says markets recover when yesterday was below the high so far', () => {
    // Up day with yesterday already at a new high: not a recovery.
    const seen = lines(base({ closes: [95, 99, 100.5], sombre: true, high: 100, preCloses: pre(100) }));
    // Yesterday 99 was below the 100 high, so recovery is fine here ...
    expect(seen.has('Markets recover some ground.')).toBe(true);
    // ... but with yesterday at the high itself it is not.
    const s2 = lines(base({ closes: [95, 100, 101], sombre: true, high: 100, preCloses: pre(100) }));
    expect(s2.has('Markets recover some ground.')).toBe(false);
  });

  it('does not say markets recover when yesterday closed at the highest level seen', () => {
    const s = lines(base({ closes: [95, 101, 102], sombre: true, high: 100, preCloses: pre(100) }));
    expect(s.has('Markets recover some ground.')).toBe(false);
    expect(s.has('Markets close higher.')).toBe(true);
  });

  it('is deterministic for the same rng seed', () => {
    const b = base({ closes: [99, 98, 97, 96], balance: 9700 });
    expect(commentaryFor({ ...b, rng: lcg(5) })).toBe(commentaryFor({ ...b, rng: lcg(5) }));
  });

  // Property test: every number a line prints must match the state computed independently here.
  it('prints numbers that match the prices over many random contexts', () => {
    const rand = lcg(99);
    const W: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
    let checked = 0;
    for (let k = 0; k < 4000; k++) {
      const c = randomCtx(rand);
      c.sombre = false;
      const l = commentaryFor(c);
      const series = [...c.preCloses, ...c.closes.slice(0, c.dayIndex + 1)];
      const n = series.length - 1;
      const px = series[n];
      const chg = (series[n] / series[n - 1] - 1) * 100;
      const peak = Math.max(c.high, ...series);
      const dd = ((peak - px) / peak) * 100;
      let m: RegExpMatchArray | null;
      if ((m = l.match(/more than (\d+)% (?:below|off) the peak/i))) {
        expect(dd).toBeGreaterThan(Number(m[1]));
        checked++;
      }
      if ((m = l.match(/(?:fell|lost|rose) (\d+)% in (?:one|a) day/))) {
        expect(Number(m[1])).toBe(Math.round(Math.abs(chg)));
        expect(/rose/.test(l) ? chg > 0 : chg < 0).toBe(true);
        checked++;
      }
      if ((m = l.match(/more than (\d+)% (?:down since day one|below where it began)/))) {
        const f = c.closes[0];
        expect(((f - px) / f) * 100).toBeGreaterThan(Number(m[1]));
        checked++;
      }
      if ((m = l.match(/more than (\d+)% up from its lowest close/))) {
        const low = Math.min(...c.closes.slice(0, c.dayIndex + 1));
        expect(((px - low) / low) * 100).toBeGreaterThan(Number(m[1]));
        checked++;
      }
      if ((m = l.match(/(Down|Up) (\d+)% on your money/))) {
        const r = (c.balance / c.start - 1) * 100;
        expect(Number(m[2])).toBe(Math.round(Math.abs(r)));
        expect(m[1] === 'Down' ? r < 0 : r > 0).toBe(true);
        checked++;
      }
      if ((m = l.match(/(?:Prices )?(down|up) (\w+) days in a row/i))) {
        const dir = m[1].toLowerCase() === 'down' ? -1 : 1;
        let run = 0;
        for (let j = n; j >= 1 && (series[j] - series[j - 1]) * dir > 0; j--) run++;
        expect(run).toBeGreaterThanOrEqual(W[m[2]] ?? Number(m[2]));
        if (dir === -1) expect(run).toBeLessThan(n);
        checked++;
      }
      if ((m = l.match(/Your \$([\d,]+) is now \$([\d,]+)/))) {
        expect(m[1]).toBe(Math.round(c.start).toLocaleString('en-US'));
        expect(m[2]).toBe(Math.round(c.balance).toLocaleString('en-US'));
        checked++;
      }
      if (/in the market for it|there for it/.test(l)) expect(c.invested).toBe(true);
      if (/sat out|without you|sidelines|missed it/.test(l)) expect(c.invested).toBe(false);
      if (/^Holding|Still holding|held through/.test(l)) expect(c.neverSold).toBe(true);
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe('round 2 counterexamples', () => {
  /** Pre-run closes falling from `high` to `last` so a deep fall is already in the window. */
  const fall = (high: number, last: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k < 30; k++) out.push(high - ((high - last) * k) / 29);
    return out;
  };

  it('N1: no "correction" once the market has been 20% down', () => {
    const seen = lines(base({ closes: [90, 80, 75, 82], preCloses: fall(100, 91) }));
    for (const l of seen) expect(l).not.toContain('correction');
    const s2 = lines(base({ closes: [90, 85, 84], preCloses: fall(100, 91) }));
    expect([...s2].some((l) => l.includes('correction'))).toBe(true);
  });

  it('N2: never prints a bare 20% for a fall short of 20%', () => {
    const seen = lines(base({ closes: [90, 80.2], preCloses: fall(100, 91) }));
    for (const l of seen) expect(l).not.toMatch(/more than 20%/i);
    expect([...seen].some((l) => /more than 15%/i.test(l))).toBe(true);
  });

  it('N3/N5: half and third lines stay inside their bands', () => {
    const deep = lines(base({ closes: [80, 60, 43], preCloses: fall(100, 91) }));
    for (const l of deep) {
      expect(l).not.toContain('About half');
      expect(l).not.toContain('About a third');
      expect(l).not.toContain('Half of it is still there');
    }
    expect([...deep].some((l) => l.startsWith('More than half'))).toBe(true);
    const mid = lines(base({ closes: [80, 60, 50], preCloses: fall(100, 91) }));
    expect([...mid].some((l) => l.startsWith('About half'))).toBe(true);
  });

  it('N4: held-through figure is the player’s own fall from the run high', () => {
    const seen = lines(base({ closes: [100, 90, 80], high: 120, balance: 8000, preCloses: fall(120, 101) }));
    for (const l of seen) expect(l).not.toMatch(/held through a fall of more than (2\d|3\d)%/);
    expect(seen.has('You have held through a fall of more than 15% so far.')).toBe(true);
  });

  it('N6: a dip line needs a rise of at least 1% the day before', () => {
    const seen = lines(base({ closes: [95, 94, 94.01, 93], preCloses: fall(100, 96) }));
    for (const l of seen) expect(l).not.toContain('dip kept dipping');
    const s2 = lines(base({ closes: [95, 94, 95.5, 93], preCloses: fall(100, 96) }));
    expect([...s2].some((l) => l.includes('dip kept dipping'))).toBe(true);
  });

  it('N7: day one has no lines about the player and today’s move', () => {
    for (const invested of [true, false]) {
      const seen = lines(base({ closes: [92], dayIndex: 0, invested }));
      for (const l of seen) {
        expect(l).not.toMatch(/in the market for it|there for it|sat out|without you|missed it|out of it|Out for today|sidelines/);
      }
    }
  });

  it('N8: single-day lines name the market', () => {
    const seen = lines(base({ closes: [96.01] }));
    expect(seen.has('The market fell 4% in a single day. Not a quiet one.')).toBe(true);
    for (const l of seen) expect(l).not.toMatch(/^(Down|Up|A fall of) \d+%/);
  });
});

describe('in cash, money lines say the cash is not moving (lane C finding)', () => {
  it('no in-cash line describes the player’s money as falling or rising, over many random contexts', () => {
    const rand = lcg(4242);
    let cashLines = 0;
    for (let k = 0; k < 3000; k++) {
      const c = { ...randomCtx(rand), invested: false, neverSold: false, sombre: false };
      if (c.dayIndex === 0) continue;
      for (let r = 0; r < 3; r++) {
        const l = commentaryFor({ ...c, rng: lcg(k * 13 + r) });
        expect(l).not.toMatch(/on your money|is now \$|where you started/);
        if (/\$/.test(l)) {
          expect(l).toMatch(/sitting in cash/);
          cashLines++;
        }
      }
    }
    expect(cashLines).toBeGreaterThan(0);
  });

  it('pairs the cash with a market fact', () => {
    const seen = lines(base({ closes: [90, 85, 80], invested: false, neverSold: false, balance: 8782 }));
    expect(seen.has('Your $8,782 is sitting in cash. The market is more than 15% below the peak.')).toBe(true);
  });
});

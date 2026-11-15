import { describe, expect, it } from 'vitest';
import { cardChart, cardLines, drawCard, shareLine, type ResultCardModel } from '../../src/share/card';

const base: ResultCardModel = {
  headline: 'Local investor sells three days before the bottom',
  verdictTitle: 'Paper hands',
  verdictLine: 'Sold near the low, then bought back higher',
  you: 7150,
  holder: 9450,
  perfect: 17900,
  lead: -2300,
  series: [10000, 9000, 8000, 9500],
  trades: [{ dayIndex: 1, side: 'sell' }],
  url: 'https://example.pages.dev/',
};

const all = (m: ResultCardModel) => JSON.stringify(cardLines(m));

describe('cardLines', () => {
  it('hides the crash on a blind card', () => {
    const l = cardLines(base);
    expect(l.folioRight).toBe('Can you guess which crash this was?');
    expect(l.folioLeft).toBe('Mystery crash');
    expect(all(base)).not.toMatch(/That was|19\d\d|20\d\d/);
  });
  it('a level finish reads "Level with someone who did nothing", never "$0 ahead" (R32)', () => {
    const l = cardLines({ ...base, lead: 0, you: 9450 });
    expect(l.lead).toBe('Level with someone who did nothing');
    expect(l.leadBehind).toBe(false);
    expect(l.shareLine).toBe('Level with someone who did nothing in a crash I could not see coming. Beat me.');
    expect(JSON.stringify(l)).not.toMatch(/\$0 ahead|by \$0/);
    const p = cardLines({ ...base, lead: 0, practice: { crashName: '2008', attempt: 2 } });
    expect(p.shareLine).toBe('Level with someone who did nothing on my second go at 2008. Beat me.');
  });
  it('never says the holder and uses the plain lead line', () => {
    expect(all(base)).not.toMatch(/holder/i);
    expect(cardLines(base).lead).toBe('$2,300 behind someone who did nothing');
    expect(cardLines({ ...base, lead: 1640 }).lead).toBe('$1,640 ahead of someone who did nothing');
  });
  it('prints the rows, perfect line, address and footer', () => {
    const l = cardLines(base);
    expect(l.rows).toEqual([
      ['You', '$7,150'],
      ['Someone who did nothing', '$9,450'],
      ['Perfect timing', '$17,900'],
    ]);
    expect(l.perfect).toBe('Perfect timing finished with $17,900. You finished with $7,150.'); // R49 wording
    expect(l.beatMe).toBe('Beat me');
    expect(l.url).toBe('https://example.pages.dev/');
    expect(l.footer).toBe('US stock market · A Still Signal build');
  });
  it('names the daily number', () => {
    expect(cardLines({ ...base, dailyNumber: 12 }).folioLeft).toBe('Daily crash 12');
  });
  it('adds the streak line from two wins', () => {
    expect(cardLines({ ...base, lead: 1640, streak: 3 }).streak).toBe('Survived 3 crashes in a row');
    expect(cardLines({ ...base, streak: 1 }).streak).toBeNull();
    expect(cardLines(base).streak).toBeNull();
  });
  it('names the crash on a practice card', () => {
    const m = { ...base, lead: 1640, practice: { crashName: '2008', attempt: 2 } };
    const l = cardLines(m);
    expect(l.folioLeft).toBe('Rematch, 2008');
    expect(l.folioRight).not.toMatch(/guess/);
    expect(l.shareLine).toBe('I beat the market by $1,640 on my second go at 2008. Beat me.');
  });
});

describe('card rules', () => {
  it('keeps the verdict headline and never prints a dated one on a blind card', () => {
    expect(cardLines(base).headline).toBe(base.headline);
    const dated = { ...base, headline: 'Shares fall for a sixth week, September 2008' };
    expect(cardLines(dated).headline).toBe('Paper hands');
    expect(cardLines({ ...base, headline: 'Lehman fails on 15 March 2009' }).headline).toBe('Paper hands');
  });
  it('never shows a streak line on a practice card', () => {
    const m = { ...base, lead: 1640, streak: 3, practice: { crashName: '2008', attempt: 2 } };
    expect(cardLines(m).streak).toBeNull();
  });
  it('words a practice card that finished behind', () => {
    const m = { ...base, practice: { crashName: '2008', attempt: 3 } };
    expect(shareLine(m)).toBe('I finished $2,300 behind someone who did nothing on my third go at 2008. Beat me.');
  });
  it('throws a clear error when there is no 2D context', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => drawCard(canvas, base)).toThrow(/2D context/);
  });
});

describe('shareLine', () => {
  it('matches the spec sentences for blind runs', () => {
    expect(shareLine(base)).toBe('I finished $2,300 behind someone who did nothing. Beat me.');
    expect(shareLine({ ...base, lead: 1640 })).toBe('I beat the market by $1,640 in a crash I could not see coming. Beat me.');
  });
});

describe('the card chart (R42): the market price, trade dots on it, a dotted level while in cash', () => {
  const measure = (s: string) => s.length * 19;
  const W = 936;
  const H = 200;
  it('the dots sit on the price line, and each spell in cash has a level at the sale close', () => {
    const series = Array.from({ length: 400 }, (_, i) => 100 + Math.sin(i / 9) * 8 - i * 0.03);
    const trades: ResultCardModel['trades'] = [{ dayIndex: 101, side: 'sell' }, { dayIndex: 203, side: 'buy' }, { dayIndex: 307, side: 'sell' }];
    const c = cardChart({ ...base, series, trades }, 72, 500, W, H, measure);
    for (const mk of c.marks) expect(c.line.some(([x, y]) => x === mk.cx && y === mk.cy)).toBe(true);
    expect(c.levels.length).toBe(2);
    expect(c.levels[0]).toEqual([[c.marks[0].cx, c.marks[0].cy], [c.marks[1].cx, c.marks[0].cy]]);
    expect(c.levels[1][1][0]).toBeCloseTo(c.line[c.line.length - 1][0]);
  });
  it('tiny moves never fill the height: the range spans 2% either side of day 1', () => {
    const c = cardChart({ ...base, series: [100, 100.3, 100.6, 100.2], trades: [] }, 72, 500, W, H, measure);
    const ys = c.line.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(H * 0.4);
  });
  it('a short chart near the start line still names the sale and the buy-back', () => {
    const series = Array.from({ length: 300 }, (_, i) => (i < 20 ? 100 : i < 40 ? 100 - (i - 20) * 0.6 : 88 + (i - 40) * 0.05));
    const c = cardChart({ ...base, series, trades: [{ dayIndex: 18, side: 'sell' }, { dayIndex: 30, side: 'buy' }] }, 72, 500, W, 120, measure);
    expect(c.labels.map((l) => l.text)).toEqual(['Sold', 'Bought']);
  });
  function rand(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }
  const crosses = (b: { x0: number; x1: number; y0: number; y1: number }, pl: [number, number][]) => {
    for (let i = 1; i < pl.length; i++) {
      const [x1, y1] = pl[i - 1];
      const [x2, y2] = pl[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
      for (let k = 0; k <= n; k++) {
        const x = x1 + ((x2 - x1) * k) / n;
        const y = y1 + ((y2 - y1) * k) / n;
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
      }
    }
    return false;
  };
  for (let seed = 1; seed <= 30; seed++) {
    it(`labels clear of every line, the dots, each other and the edges (${seed})`, () => {
      const r = rand(seed);
      const n = 40 + Math.floor(r() * 500);
      const series = [100];
      for (let i = 1; i < n; i++) series.push(series[i - 1] * (1 + (r() - 0.52) * 0.05));
      const s = Math.floor(r() * (n - 2));
      const trades: ResultCardModel['trades'] = [{ dayIndex: s, side: 'sell' }];
      if (r() < 0.6) trades.push({ dayIndex: s + 1 + Math.floor(r() * (n - s - 1)), side: 'buy' });
      const c = cardChart({ ...base, series, trades }, 72, 500, W, H, measure);
      // The faint dotted lines may run behind a word (it is drawn on a paper-coloured edge, as before); the price line never.
      const lines = [c.line];
      c.labels.forEach((l, i) => {
        expect(l.box.x0).toBeGreaterThanOrEqual(72);
        expect(l.box.x1).toBeLessThanOrEqual(72 + W);
        expect(l.box.y0).toBeGreaterThanOrEqual(500);
        expect(l.box.y1).toBeLessThanOrEqual(500 + H);
        for (const pl of lines) expect(crosses(l.box, pl)).toBe(false);
        for (const mk of c.marks) {
          const hitDot = l.box.x0 < mk.cx + 15 && mk.cx - 15 < l.box.x1 && l.box.y0 < mk.cy + 15 && mk.cy - 15 < l.box.y1;
          expect(hitDot).toBe(false);
        }
        for (let j = 0; j < i; j++) {
          const o = c.labels[j].box;
          expect(l.box.x0 < o.x1 && o.x0 < l.box.x1 && l.box.y0 < o.y1 && o.y0 < l.box.y1).toBe(false);
        }
      });
    });
  }
});

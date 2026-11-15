import { describe, expect, it } from 'vitest';
import { cardLines, drawCard, shareLine, type ResultCardModel } from '../../src/share/card';

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
    expect(l.perfect).toBe('Perfect timing made $17,900. You made $7,150.');
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

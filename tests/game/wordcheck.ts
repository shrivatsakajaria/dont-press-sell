// Independent checks of the words on the play screen, from the prices alone (R36, R37).
// Shared by the narrator sweep and the whole-run commentary scan.
import type { RunData } from '../../src/engine/types';

export type RunFile = RunData & { high: number; preCloses: number[] };

// ---------- Independent facts from the prices ----------
const WORD: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const ORD: Record<string, number> = {
  third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
};
const num = (w: string) => WORD[w] ?? Number(w);

export interface Facts {
  day: number;
  m: number; // today's move, percent
  prev: number | null;
  dn: number;
  up: number;
  prevDn: number;
  dnCut: boolean;
  dd: number;
  maxDd: number;
  fromLow: number;
  belowFirst: number;
  aboveHigh: boolean;
  newLow: boolean;
  week: number | null;
  ch: number[];
  runFall: number;
  high: number;
  closes: number[];
}
const run_closes = (f: Facts) => f.closes;

export function facts(run: RunFile, i: number): Facts {
  const series = [...run.preCloses, ...run.closes.slice(0, i + 1)];
  const n = series.length - 1;
  const px = series[n];
  const ch: number[] = [];
  for (let k = 1; k <= n; k++) ch.push((series[k] / series[k - 1] - 1) * 100);
  const streak = (dir: 1 | -1, end: number) => {
    let r = 0;
    for (let j = end; j >= 1 && (series[j] - series[j - 1]) * dir > 0; j--) r++;
    return r;
  };
  const peak = Math.max(run.high, ...series);
  let maxDd = 0;
  let rp = run.high;
  for (const x of series) {
    rp = Math.max(rp, x);
    maxDd = Math.max(maxDd, ((rp - x) / rp) * 100);
  }
  const rc = run.closes.slice(0, i + 1);
  const low = Math.min(...rc);
  const first = run.closes[0];
  const dn = streak(-1, n);
  return {
    day: i,
    m: ch[n - 1],
    prev: n >= 2 ? ch[n - 2] : null,
    dn,
    up: streak(1, n),
    prevDn: n >= 1 ? streak(-1, n - 1) : 0,
    dnCut: dn === n,
    dd: ((peak - px) / peak) * 100,
    maxDd,
    fromLow: ((px - low) / low) * 100,
    belowFirst: px < first ? ((first - px) / first) * 100 : 0,
    aboveHigh: px > run.high,
    newLow: i >= 1 && px < Math.min(...run.closes.slice(0, i)),
    week: n >= 5 ? (px / series[n - 5] - 1) * 100 : null,
    ch,
    runFall: ((Math.max(...rc) - px) / Math.max(...rc)) * 100,
    high: run.high,
    closes: rc,
  };
}

export type Dir = 'up' | 'down' | null;
/** The direction a headline claims, read from its words. */
export function headlineDir(t: string): Dir {
  const down = /\b(plunge|plunges|crash|crashes|fall|falls|fell|drop|drops|slide|slides|slid|slip|slips|sink|sinks|worst|panic|selling|lower|slump|slumps|tumble|loss|losing|losses|lose|dip|down day|beating|brutal|new low|fresh low|give back)\b/i;
  const up = /\b(jump|jumps|leap|leaps|surge|surges|soar|soars|rally|rallies|bounce|bounces|best|higher|gain|gains|rise|rises|rose|climb|climbs|rebound|rebounds|up day|buyers return|winning|good day|big day for buyers|inch up|tick up)\b/i;
  const d = down.test(t);
  const u = up.test(t);
  return d && !u ? 'down' : u && !d ? 'up' : null;
}

/** The direction a commentary line claims, read from its words. */
export function lineDir(t: string): Dir {
  if (/^(The market fell|The market lost|The worst day|A rise of a percent or more, then a fall|A fresh low|Prices hit a new low|Prices down|Prices have fallen|Another down day|Prices are down at least|Prices fell|A down day|Markets fall again|Prices fall|The market closes lower)/.test(t)) return 'down';
  if (/^(The market rose|The best day|A bounce after|A rise at last|Back within three|Above the old peak|The market is more than \d+% up|More than \d+% up|Prices up|Up again|Prices are up at least|Prices rose|An up day|Markets close higher|Prices rise|Markets recover)/.test(t)) return 'up';
  return null;
}

const ordinal = (w: string) => ORD[w];

/** Checks a generated headline against the day it is shown on. Throws on a false one. */
export function checkGenerated(t: string, f: Facts) {
  const m = f.m;
  const fail = (why: string) => {
    throw new Error(`headline "${t}" false on day ${f.day} (move ${m.toFixed(2)}%): ${why}`);
  };
  let r: RegExpMatchArray | null;
  if ((r = t.match(/^(?:Shares|Stocks) (fall|rise|close) ([\d.]+)%(?: (lower|higher))?$/) || t.match(/^The market (loses|gains) ([\d.]+)%$/))) {
    const neg = /fall|lower|loses/.test(t);
    const x = Number(r[2]);
    const dec = r[2].split('.')[1]?.length ?? 0;
    if ((neg ? -m : m) <= 0) fail('direction');
    if (Math.abs(Math.abs(m) - x) > 0.5 * 10 ** -dec + 1e-9) fail('figure');
    return;
  }
  if ((r = t.match(/^A ([\d.]+)% (fall|rise) for shares$/))) {
    if ((r[2] === 'fall' ? -m : m) <= 0) fail('direction');
    if (Math.abs(Math.abs(m) - Number(r[1])) > 0.05 + 1e-9) fail('figure');
    return;
  }
  if ((r = t.match(/^(?:Shares fall for a|Stocks down for a) (\w+) day(?: in a row)?$/))) {
    if (!(f.dn === ordinal(r[1]) && !f.dnCut)) fail('falling streak');
    return;
  }
  if ((r = t.match(/^Shares rise for a (\w+) day$/))) {
    if (f.up !== ordinal(r[1])) fail('rising streak');
    return;
  }
  const rules: [RegExp, () => boolean][] = [
    [/^(Shares plunge|Stocks tumble|A heavy day of selling|Shares slump|Stocks take a beating|Sellers rush for the exit|A brutal day for shares)$/, () => m <= -3],
    [/^Shares fall sharply$/, () => m <= -1.5],
    [/^(Stocks lose ground|Shares slide|Sellers take charge|A bad day for shares|Stocks drop|Shares head lower)$/, () => m <= -1],
    [/^(Shares edge lower|A small loss for shares|Stocks drift lower|Shares slip a little)$/, () => m < 0 && m > -1],
    [/^(Stocks slip|Shares dip)$/, () => m < 0 && m > -1.5],
    [/^(A quiet day for shares|Stocks barely move|Little change for shares|Shares mark time|A flat day on the market|Stocks go nowhere much|Shares hardly budge|A calm day for shares|Stocks hold steady|Hardly a move for shares)$/, () => Math.abs(m) < 0.2],
    [/^(Shares close almost unchanged|Shares end where they began)$/, () => Math.abs(m) < 0.05],
    [/^No change for shares on day \d+$/, () => Math.abs(m) < 1e-9 && t === `No change for shares on day ${f.day + 1}`],
    [/^(Shares edge higher|Stocks inch up|A small gain for shares|Stocks tick up|Shares drift higher)$/, () => m > 0 && m < 1],
    [/^(Shares rise|Stocks climb|Buyers return|A good day for shares|Stocks gain ground|Shares head higher)$/, () => m >= 1],
    [/^(Shares surge|Stocks rally hard|Shares soar|A big day for buyers|Stocks jump)$/, () => m >= 3],
    [/^(Another down day|Shares fall again|Stocks lower again)$/, () => m < 0 && f.prev !== null && f.prev < 0],
    [/^(Another up day|Shares rise again)$/, () => m > 0 && f.prev !== null && f.prev > 0],
    [/^(Shares hit a new low|Stocks close at a fresh low)$/, () => f.newLow],
    [/^Shares bounce back$/, () => m >= 0.5 && f.prev !== null && f.prev < 0],
    [/^Stocks rebound$/, () => m >= 1 && f.prev !== null && f.prev <= -1],
    [/^Shares give back gains$/, () => m < 0 && f.prev !== null && f.prev > 0],
    [/^Another day below the old peak$/, () => f.dd >= 5],
    [/^Shares end another day well off their highs$/, () => f.dd >= 10],
    [/^A losing week for shares$/, () => f.week !== null && f.week < 0],
    [/^A winning week for shares$/, () => f.week !== null && f.week > 0],
    [/^Shares stay near their lows$/, () => f.fromLow < 5 && f.dd >= 10],
    [/^Shares hold above their lows$/, () => f.fromLow >= 5],
    [/^Shares stay below their starting point$/, () => f.belowFirst > 0],
    [/^More down days than up for shares$/, () => f.ch.length >= 10 && f.ch.slice(-10).filter((x) => x < 0).length >= 6],
    [/^More up days than down for shares$/, () => f.ch.length >= 10 && f.ch.slice(-10).filter((x) => x > 0).length >= 6],
    [/^Shares still short of their old peak$/, () => f.day >= 5 && Math.max(...run_closes(f)) < f.high],
  ];
  for (const [re, ok] of rules) {
    if (re.test(t)) {
      if (!ok()) fail(String(re));
      return;
    }
  }
  fail('unknown generated headline');
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * Checks a commentary line on one visible day. `first` is the day the line went up (event lines are
 * about that day), `bal` the player's balance that day, `held` whether the player held through the
 * day's move, `neverSold` whether no sale has happened.
 */
export function checkLine(t: string, f: Facts, first: Facts, ctx: { bal: number; start: number; held: boolean; neverSold: boolean }) {
  const fail = (why: string) => {
    throw new Error(`line "${t}" false on day ${f.day} (shown from day ${first.day}): ${why}`);
  };
  const need = (c: boolean, why: string) => {
    if (!c) fail(why);
  };
  let r: RegExpMatchArray | null;
  if (/days in a row/.test(t) && !/at least/i.test(t)) fail('a streak count held over several days must say "at least" (R53)');
  // Event lines: about the first day, and only for a few days after it.
  const event = (c: boolean, why: string) => {
    need(f.day - first.day <= 4, 'event line shown too long after its day');
    need(c, why);
  };
  if ((r = t.match(/^The market (fell|lost|rose) (\d+)% in (?:a single|one) day/)) || (r = t.match(/^The market (rose) (\d+)% in a day, straight after a fall/))) {
    event(Math.round(Math.abs(first.m)) === Number(r[2]) && (r[1] === 'rose' ? first.m >= 3 : first.m <= -3), 'one-day move');
    if (/straight after a fall/.test(t)) event(first.prev !== null && first.prev < 0 && first.m >= 5, 'whiplash');
    if (/^The market lost/.test(t)) event(first.m <= -5, 'lost five');
  }
  if ((r = t.match(/^The (best|worst) day in at least (\w+) weeks/))) {
    const w = num(r[2]);
    const earlier = first.ch.slice(0, -1);
    event(w >= 2 && w <= Math.floor(first.ch.length / 5), 'weeks');
    if (r[1] === 'best') event(first.m >= 1 && first.m > Math.max(...earlier), 'best');
    else event(first.m <= -1 && first.m < Math.min(...earlier), 'worst');
    if (/sidelines/.test(t)) need(!ctx.held, 'sidelines');
    if (/there for it/.test(t)) need(ctx.held || f.day !== first.day, 'there for it');
  }
  if (/dip kept dipping/.test(t)) event(first.newLow && first.m < 0 && (first.prev ?? 0) >= 1, 'dip');
  if (/^(A fresh low|Prices hit a new low)/.test(t)) event(first.newLow, 'new low');
  if ((r = t.match(/^A bounce after (\w+) falling days/))) event(first.m > 0 && first.prevDn === num(r[1]), 'bounce');
  if (/^A rise at last/.test(t)) event(first.m > 0 && first.prevDn >= 2, 'rise at last');

  // State lines: true on every visible day.
  if ((r = t.match(/^The market is more than (\d+)% below the peak/))) need(f.dd > Number(r[1]), 'below peak');
  if ((r = t.match(/^More than (\d+)% (?:off|below) the peak/))) need(f.dd > Number(r[1]), 'off peak');
  if (/correction/.test(t)) need(f.dd < 20 && f.maxDd < 20 && f.dd >= 10, 'correction');
  if (/bear market/.test(t)) need(f.dd >= 20, 'bear');
  if (/^About a third gone/.test(t)) need(f.dd >= 30 && f.dd <= 40, 'third');
  if (/^About half gone/.test(t)) need(f.dd >= 45 && f.dd <= 55, 'half');
  if (/^More than half gone/.test(t)) need(f.dd > 55, 'more than half');
  if ((r = t.match(/more than (\d+)% (?:down since day one|below where it began)/))) need(f.belowFirst > Number(r[1]), 'since day one');
  if (/^Back within three percent/.test(t)) need(f.dd > 0 && f.dd <= 3, 'within three');
  if (/^Above the old peak/.test(t)) need(f.aboveHigh, 'above peak');
  if ((r = t.match(/more than (\d+)% up from its lowest close/)) || (r = t.match(/^More than (\d+)% up from the lowest close/))) need(f.fromLow > Number(r[1]), 'from low');
  if ((r = t.match(/still more than (\d+)% below the peak/))) need(f.dd > Number(r[1]), 'still below');
  if ((r = t.match(/^Prices (?:down at least|have fallen at least) (\w+) days in a row/))) need(f.dn >= num(r[1]) && !f.dnCut, 'down streak');
  if ((r = t.match(/^Prices up at least (\w+) days in a row/))) need(f.up >= num(r[1]), 'up streak');
  if (/^Another down day/.test(t)) need(f.m < 0 && (f.prev ?? 0) < 0, 'another down');
  if (/^Up again/.test(t)) need(f.m > 0 && (f.prev ?? 0) > 0, 'up again');
  if (/^Barely moved/.test(t)) need(Math.abs(f.m) < 0.25 && f.dd >= 3, 'barely');
  if (/quiet days in a row/.test(t)) need(f.ch.slice(-5).every((x) => Math.abs(x) < 0.5), 'quiet');
  if ((r = t.match(/^Prices are (down|up) at least (\d+)% on the week/))) {
    need(f.week !== null && (r[1] === 'down' ? -f.week : f.week) >= Number(r[2]), 'week');
  }
  if ((r = t.match(/^(Down|Up) (\d+)% on your money/))) {
    const x = (ctx.bal / ctx.start - 1) * 100;
    need(Math.round(Math.abs(x)) === Number(r[2]) && (r[1] === 'Down' ? x < 0 : x > 0), 'money pct');
  }
  if ((r = t.match(/^Your (\$[\d,]+) is now (\$[\d,]+)/))) need(r[1] === fmt(ctx.start) && r[2] === fmt(ctx.bal), 'money');
  if (/^Holding, and below/.test(t)) need(ctx.bal < ctx.start && ctx.held && ctx.neverSold, 'holding below');
  if (/^Holding, and above/.test(t)) need(ctx.bal > ctx.start && ctx.held && ctx.neverSold, 'holding above');
  if ((r = t.match(/held through a fall of more than (\d+)%/))) need(f.runFall > Number(r[1]) && ctx.held && ctx.neverSold, 'held through');
  if (/Still holding\?/.test(t)) need(ctx.held && ctx.neverSold, 'still holding');
  if (/sat out|without you|out of it|Out for today|missed it/.test(t)) need(!ctx.held && f.day > 0, 'out');
  if (/in the market for it/.test(t)) need(ctx.held && f.day > 0, 'in');
  if (/^(Prices fell|A down day|Markets fall again|Prices fall\.|The market closes lower)/.test(t)) need(f.m < 0, 'fell');
  if (/^Markets fall again/.test(t)) need((f.prev ?? 0) < 0, 'again');
  if (/^(Prices rose|An up day|Markets close higher|Prices rise\.|Markets recover)/.test(t)) need(f.m > 0, 'rose');
  if (/below where this all began/.test(t)) need(f.belowFirst > 0, 'below start');
  if (/^Prices are below where they were/.test(t)) need(f.dd >= 5, 'below');
  if (/^Prices are lower than a week ago/.test(t)) need(f.week !== null && f.week < 0, 'lower than a week ago');
  if (/^Prices are higher than a week ago/.test(t)) need(f.week !== null && f.week > 0, 'higher than a week ago');
  if ((r = t.match(/^The market has (fallen|risen) on at least (\w+) of the last ten days/))) {
    const last = f.ch.slice(-10);
    need(f.ch.length >= 10 && last.filter((x) => (r![1] === 'fallen' ? x < 0 : x > 0)).length >= num(r[2]), 'of ten');
  }
  if (/^Moves of a percent or more both ways this week/.test(t)) need(f.ch.slice(-5).some((x) => x >= 1) && f.ch.slice(-5).some((x) => x <= -1), 'swings');
  if (/^Not one close so far has made it back to the old peak/.test(t)) need(Math.max(...run_closes(f)) < f.high, 'never back');
  if ((r = t.match(/^The market is within (\w+) percent of its lowest close so far/))) need(f.fromLow <= num(r[1]), 'near low');
  if (/^About a tenth below/.test(t)) need(f.dd >= 8 && f.dd <= 12, 'tenth');
  if (/^About a fifth gone/.test(t)) need(f.dd >= 18 && f.dd <= 22, 'fifth');
  if (/^About a quarter gone/.test(t)) need(f.dd >= 23 && f.dd <= 27, 'quarter');
  if ((r = t.match(/^No new low for (?:at least (\w+) (days|weeks)|months)/))) {
    const low = Math.min(...f.closes);
    const age = f.day - f.closes.lastIndexOf(low);
    const want = r[1] === undefined ? 65 : r[2] === 'weeks' ? num(r[1]) * 5 : num(r[1]);
    need(age >= want, 'no new low');
  }
  if (/^You still hold every share/.test(t)) need(ctx.held && ctx.neverSold && f.day > 0, 'all shares');
  if (/^You are back in the market/.test(t)) need(ctx.held && !ctx.neverSold && f.day > 0, 'back in');
  if ((r = t.match(/^Your (\$[\d,]+) is sitting in cash/))) need(!ctx.held && r[1] === fmt(ctx.bal), 'cash');
  if (!ctx.held && f.day > 0) need(!/on your money|is now \$|where you started/.test(t), 'in cash, money lines say the cash is not moving');
}

export const FILLER = [
  'Another day on the markets.', 'Prices move. Opinions move faster.', 'The market has made no promises.',
  'Somewhere, a chart is being refreshed.', 'Everyone has a view. Prices have the final say.',
  'The chart does not care how you feel.', 'Trading continues.', 'Markets remain open.',
];


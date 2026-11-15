// Plain price-action headlines (ruling R36): when a real headline has been up 8 s, the paper prints
// one of these for the day, true to that day's move, until the next real headline. Each is guarded by
// a condition on the day's market facts; a headline stays up only while it is true for each new day.
// House rules: sentence case, no full stop, British spelling, no exclamation marks.
import type { Dir, MarketState } from './commentary';

export interface DayHeadline {
  text: string;
  key: string;
  dir: Dir;
  /** About where prices stand rather than the day's move alone: used when the steps run fast. */
  standing: boolean;
}

interface Template {
  key: string;
  dir: Dir;
  standing?: boolean;
  when: (s: MarketState) => boolean;
  text: (s: MarketState) => string;
}

const ORDINALS = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const m = (s: MarketState) => s.chg ?? 0;
const has = (s: MarketState) => s.chg !== null;
const prevDown = (s: MarketState) => s.prevChg !== null && s.prevChg < 0;
const prevUp = (s: MarketState) => s.prevChg !== null && s.prevChg > 0;

function words(key: string, dir: Dir, list: string[], when: (s: MarketState) => boolean): Template[] {
  return list.map((t, i) => ({ key: `${key}${i}`, dir, when: (s) => has(s) && when(s), text: () => t }));
}

const TEMPLATES: Template[] = [
  ...words('bigdown', 'down', ['Shares plunge', 'Stocks tumble', 'A heavy day of selling', 'Shares slump', 'Stocks take a beating', 'Sellers rush for the exit', 'A brutal day for shares'], (s) => m(s) <= -3),
  ...words('sharp', 'down', ['Shares fall sharply'], (s) => m(s) <= -1.5),
  ...words('down', 'down', ['Stocks lose ground', 'Shares slide', 'Sellers take charge', 'A bad day for shares', 'Stocks drop', 'Shares head lower'], (s) => m(s) <= -1),
  ...words('edgedown', 'down', ['Shares edge lower', 'A small loss for shares', 'Stocks drift lower', 'Shares slip a little'], (s) => m(s) < 0 && m(s) > -1),
  ...words('slip', 'down', ['Stocks slip', 'Shares dip'], (s) => m(s) < 0 && m(s) > -1.5),
  ...words('flat', null, [
    'A quiet day for shares', 'Stocks barely move', 'Little change for shares', 'Shares mark time', 'A flat day on the market',
    'Stocks go nowhere much', 'Shares hardly budge', 'A calm day for shares', 'Stocks hold steady', 'Hardly a move for shares',
  ], (s) => Math.abs(m(s)) < 0.2),
  ...words('unchanged', null, ['Shares close almost unchanged', 'Shares end where they began'], (s) => Math.abs(m(s)) < 0.05),
  ...words('edgeup', 'up', ['Shares edge higher', 'Stocks inch up', 'A small gain for shares', 'Stocks tick up', 'Shares drift higher'], (s) => m(s) > 0 && m(s) < 1),
  ...words('up', 'up', ['Shares rise', 'Stocks climb', 'Buyers return', 'A good day for shares', 'Stocks gain ground', 'Shares head higher'], (s) => m(s) >= 1),
  ...words('bigup', 'up', ['Shares surge', 'Stocks rally hard', 'Shares soar', 'A big day for buyers', 'Stocks jump'], (s) => m(s) >= 3),
  ...words('again-down', 'down', ['Another down day', 'Shares fall again', 'Stocks lower again'], (s) => m(s) < 0 && prevDown(s)),
  ...words('again-up', 'up', ['Another up day', 'Shares rise again'], (s) => m(s) > 0 && prevUp(s)),
  ...words('low', 'down', ['Shares hit a new low', 'Stocks close at a fresh low'], (s) => s.newLow),
  ...words('bounce', 'up', ['Shares bounce back'], (s) => m(s) >= 0.5 && prevDown(s)),
  ...words('rebound', 'up', ['Stocks rebound'], (s) => m(s) >= 1 && s.prevChg !== null && s.prevChg <= -1),
  ...words('giveback', 'down', ['Shares give back gains'], (s) => m(s) < 0 && prevUp(s)),
  {
    key: 'streak-down', dir: 'down', when: (s) => has(s) && s.dn >= 3 && s.dn < ORDINALS.length && !s.dnCut,
    text: (s) => `Shares fall for a ${ORDINALS[s.dn]} day`,
  },
  {
    key: 'streak-down2', dir: 'down', when: (s) => has(s) && s.dn >= 3 && s.dn < ORDINALS.length && !s.dnCut,
    text: (s) => `Stocks down for a ${ORDINALS[s.dn]} day in a row`,
  },
  { key: 'streak-up', dir: 'up', when: (s) => has(s) && s.up >= 3 && s.up < ORDINALS.length, text: (s) => `Shares rise for a ${ORDINALS[s.up]} day` },
  // Standing: true day after day, for fast stretches where a move headline would flicker.
  { key: 'st-peak', dir: null, standing: true, when: (s) => s.dd >= 5, text: () => 'Another day below the old peak' },
  { key: 'st-highs', dir: null, standing: true, when: (s) => s.dd >= 10, text: () => 'Shares end another day well off their highs' },
  { key: 'st-wk-down', dir: 'down', standing: true, when: (s) => s.week !== null && s.week < 0, text: () => 'A losing week for shares' },
  { key: 'st-wk-up', dir: 'up', standing: true, when: (s) => s.week !== null && s.week > 0, text: () => 'A winning week for shares' },
  { key: 'st-lows', dir: null, standing: true, when: (s) => s.fromLow < 5 && s.dd >= 10, text: () => 'Shares stay near their lows' },
  { key: 'st-above', dir: null, standing: true, when: (s) => s.fromLow >= 5, text: () => 'Shares hold above their lows' },
  { key: 'st-start', dir: null, standing: true, when: (s) => s.belowFirst > 0, text: () => 'Shares stay below their starting point' },
  { key: 'st-ten-down', dir: 'down', standing: true, when: (s) => s.downOfTen >= 6, text: () => 'More down days than up for shares' },
  { key: 'st-ten-up', dir: 'up', standing: true, when: (s) => s.upOfTen >= 6, text: () => 'More up days than down for shares' },
  { key: 'st-never', dir: null, standing: true, when: (s) => s.day >= 5 && s.allBelowHigh, text: () => 'Shares still short of their old peak' },
  // Figures: always one that fits, so the paper never runs out.
  ...figure('fig-a', (x, neg) => `Shares ${neg ? 'fall' : 'rise'} ${x}%`),
  ...figure('fig-b', (x, neg) => `Stocks close ${x}% ${neg ? 'lower' : 'higher'}`),
  ...figure('fig-c', (x, neg) => `The market ${neg ? 'loses' : 'gains'} ${x}%`),
  ...figure('fig-d', (x, neg) => `A ${x}% ${neg ? 'fall' : 'rise'} for shares`),
  ...figure('fig-e', (x, neg) => `Shares ${neg ? 'fall' : 'rise'} ${x}%`, 2),
];

function figure(key: string, f: (x: string, neg: boolean) => string, decimals = 1): Template[] {
  const fig = (s: MarketState) => Math.abs(m(s)).toFixed(decimals);
  const ok = (s: MarketState) => has(s) && m(s) !== 0 && Number(fig(s)) > 0;
  return [
    { key: `${key}-down`, dir: 'down', when: (s) => ok(s) && m(s) < 0, text: (s) => f(fig(s), true) },
    { key: `${key}-up`, dir: 'up', when: (s) => ok(s) && m(s) > 0, text: (s) => f(fig(s), false) },
  ];
}

/** Every generated headline true for the day. */
export function dayHeadlines(s: MarketState): DayHeadline[] {
  return TEMPLATES.filter((t) => t.when(s)).map((t) => ({ text: t.text(s), key: t.key, dir: t.dir, standing: !!t.standing }));
}

/** Whether a generated headline is still true, word for word, on another day. */
export function stillTrue(h: DayHeadline, s: MarketState): boolean {
  const t = TEMPLATES.find((x) => x.key === h.key);
  return !!t && t.when(s) && t.text(s) === h.text;
}

/** The direction a real headline claims, read from its words (null when it names none or both). */
export function realHeadlineDir(text: string): Dir {
  const down = /\b(plunge|plunges|crash|crashes|fall|falls|fell|drop|drops|slide|slides|slid|slip|slips|sink|sinks|worst|panic|selling|lower|slump|slumps|tumble|tumbles|loss|losses|lose|dip|beating|brutal|new low|give back)\b/i;
  const up = /\b(jump|jumps|leap|leaps|surge|surges|soar|soars|rally|rallies|bounce|bounces|best|higher|gain|gains|rise|rises|rose|climb|climbs|rebound|rebounds|recovery)\b/i;
  const d = down.test(text);
  const u = up.test(text);
  return d && !u ? 'down' : u && !d ? 'up' : null;
}

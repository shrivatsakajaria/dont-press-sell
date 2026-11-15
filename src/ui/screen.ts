// The play screen (spec 6.2 to 6.6, 9; mock-ups 1, 2, 3 and 5).
// screenModel() turns the session's view into what the page shows (pure, tested);
// mountScreen() draws it; startPlay() runs one session on it.
import {
  FIRST_SALE_LINE, FOOTER_PLAY, MASTHEAD, OPENING_LINE, SOLD_LAST_TIME, START_LABEL, boughtStamp, buyBackLabel, dollars, marketChartLabel, potLine,
  scoreToBeatLine, sellLabel, sellingAtTopLine, soldStamp,
} from '../content/copy';
import type { RunData, RunResult, Trade } from '../engine/types';
import type { Step } from '../game/schedule';
import { createSession, type Session, type SessionView, type SimulateFn } from '../game/session';
import { load, save } from '../store/store';
import { announce, initAnnouncer } from './a11y';
import { drawChart, type ChartModel } from './chart';
import * as chartApi from './chart';
import { createRoll } from './digits';
import { paperFor, type Paper } from './paper';

// Strings this screen shows live in src/content/copy.ts; re-exported for existing importers.
export {
  STATUS_DEFAULT, STATUS_SLOW, STATUS_CASH, STATUS_FORWARD, STATUS_PAUSED, MYSTERY_LABEL, PAUSE, RESUME, SOUND_ON, SOUND_OFF, IN_CASH, LEVEL, dayLabel, yearLabel, youHadLine, regretMadeLine, regretCostLine, upLabel, downLabel, placeholderHeadline, placeholderStandfirst, chartLabel, soldAnnouncement, boughtAnnouncement,
} from '../content/copy';
import {
  STATUS_CASH, STATUS_FORWARD, STATUS_PAUSED, PAUSE, RESUME, SOUND_ON, SOUND_OFF, IN_CASH, LEVEL, dayLabel, yearLabel, youHadLine, upLabel, downLabel, placeholderHeadline, placeholderStandfirst,
} from '../content/copy';

/** How long the opening line stays up, and the first-sale line after a first sale (clock time). */
const OPENING_MS = 4000;
const FIRST_SALE_MS = 4000;
/** How long "This is the day you sold last time." stays up (clock time). */
const SOLD_LAST_TIME_MS = 3000;
/** Gap from the peak at which the "Selling at the top" line appears (spec 6.4). */
const TOP_GAP = 500;
const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const EASE = 'cubic-bezier(0.22,1,0.36,1)';
const SEEN_FIRST_SALE = 'seenFirstSale';
/** R30: the headline's size steps (of its CSS size), its line limit, and the chart's least height. */
const HEADLINE_STEPS = [1, 0.82, 0.68, 0.6, 0.52];
const MAX_HEADLINE_LINES = 3;
/** R55: a slow day is a red day only when the market fell at least this much since the step before. */
export const RED_FALL = 0.02;
/** R40: the pot is hidden on the play screen; the code stays for when it comes back. */
const SHOW_POT = false;
/** R41: the day clock holds this long on each press. */
export const PRESS_HOLD_MS = 500;
/**
 * R56: the press stamp's whole life: in over STAMP_IN_MS, fully readable until STAMP_MS - STAMP_OUT_MS
 * (1.28 s), then a short fade. The days carry on under it once the clock's 0.5 s hold is over.
 */
export const STAMP_MS = 1600;
const STAMP_IN_MS = 120;
const STAMP_OUT_MS = 200;
/** R49: the last day (the final balance, as the result will print it) stays on screen this long before the result. */
export const END_HOLD_MS = 1200;
/** R39: the folio's status slot stays empty on ordinary and slow days (no "Price: your nerve", no "Time slowed"). */
const QUIET_STATUS = '';

/**
 * R38: what buying back today saves against the most recent sale, in whole dollars:
 * round(cash x (1 - today's close / the close on the day of that sale)). Positive is cheaper.
 */
export function buyBackSaving(cash: number, todayClose: number, saleClose: number): number {
  if (!(saleClose > 0) || !Number.isFinite(todayClose) || !Number.isFinite(cash)) return 0;
  const n = Math.round(cash * (1 - todayClose / saleClose));
  return n === 0 ? 0 : n;
}

/**
 * R30/R57: the headline step to use, given each step's measure (largest first): the first that keeps the
 * headline to three lines and fits the news block, else the smallest.
 */
export function chooseHeadlineStep(results: { lines: number; fits: boolean }[]): number {
  const i = results.findIndex((r) => r.lines <= MAX_HEADLINE_LINES && r.fits);
  return i >= 0 ? i : Math.max(0, results.length - 1);
}

export interface ScreenModel {
  runLabel: string;
  dayLabel: string;
  status: string;
  headline: string;
  standfirst: string;
  /** A slow-motion day: the headline grows. */
  big: boolean;
  /** A slow-motion falling day: the paper floods red. */
  worst: boolean;
  inCash: boolean;
  balance: number;
  delta: number;
  /** "up $340", "down $3,588", "level" or "in cash". */
  deltaLabel: string;
  buttonLabel: string;
  /** R38: in cash and buying back today is cheaper than the latest sale (the button turns green and pulses). */
  cheaper: boolean;
  /** A buy-back label: set at 20px (ruling R26); sell labels stay 24px. */
  longLabel: boolean;
  underButton: string;
  regret: { text: string; rose: boolean } | null;
  paper: Paper;
  chart: ChartModel;
  paused: boolean;
  pot: string;
}

export interface DayPoint {
  balance: number;
  invested: boolean;
}

/** Everything screenModel needs: the session's view plus what the screen has seen so far. */
export interface PlayState {
  run: Pick<RunData, 'closes' | 'dates' | 'preCloses'>;
  steps: Step[];
  start: number;
  view: SessionView;
  runLabel: string;
  /** Balance at the close of every day shown so far, keyed by day index. */
  history: Map<number, DayPoint>;
  trades: Trade[];
  /** Step index at which this phone's first-ever sale happened in this run, or null. */
  firstSaleStep: number | null;
  paused: boolean;
  pot: number;
  /** The day's news line and the commentary under it (src/game/narrator.ts); placeholders when absent. */
  headline?: string;
  commentary?: string;
  /** Rematch: the day the player sold last time, the score to beat and the previous go's balances (spec 6.7). */
  soldLastTime?: number | null;
  scoreToBeat?: number | null;
  other?: number[] | null;
  /** The line under the headline for the first seconds (borrowed money has its own). */
  opening?: string;
}

function yearsSince(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / YEAR_MS)) : 0;
}

export function screenModel(s: PlayState): ScreenModel {
  const { view: v, run, steps, start } = s;
  const closes = run.closes;
  const d = v.dayIndex;
  const prevStep = v.stepIndex > 0 ? steps[v.stepIndex - 1] : undefined;
  const prevDay = prevStep ? prevStep.dayIndex : d;
  // Day 1 has no step before it: it fell if it closed below the close before the run (preCloses).
  const pre = run.preCloses;
  const before = prevStep !== undefined ? closes[prevDay] : pre && pre.length > 0 ? pre[pre.length - 1] : NaN;
  const fall = before > 0 ? 1 - closes[d] / before : 0;
  const inCash = !v.invested;
  // R55: the red flood (and its shake) only on slow falls of 2% or more; smaller slow days only slow down.
  const worst = v.slow && fall >= RED_FALL - 1e-9;
  const forward = v.phase === 'forward';

  const status = s.paused
    ? STATUS_PAUSED
    : forward
      ? STATUS_FORWARD
      : inCash
        ? STATUS_CASH
        : QUIET_STATUS;

  const day = forward
    ? yearLabel(yearsSince(run.dates[0], run.dates[d]) + 1)
    : dayLabel(d + 1);

  // Clock time between the start of two steps.
  const msBetween = (a: number, b: number) => {
    let t = 0;
    for (let i = a; i < b; i++) t += steps[i]?.holdMs ?? 0;
    return t;
  };
  // The first step that shows the day the player sold last time (a step may cover several days).
  const soldIdx = s.soldLastTime == null ? -1 : steps.findIndex((st) => st.dayIndex >= s.soldLastTime!);
  const soldStep = soldIdx >= 0 ? soldIdx : null;
  let standfirst = s.commentary ?? placeholderStandfirst(d + 1);
  if (s.firstSaleStep !== null && v.stepIndex >= s.firstSaleStep && msBetween(s.firstSaleStep, v.stepIndex) < FIRST_SALE_MS) {
    standfirst = FIRST_SALE_LINE;
  } else if (soldStep !== null && v.stepIndex >= soldStep && msBetween(soldStep, v.stepIndex) < SOLD_LAST_TIME_MS) {
    standfirst = SOLD_LAST_TIME;
  } else if (msBetween(0, v.stepIndex) < OPENING_MS) {
    standfirst = s.opening ?? OPENING_LINE;
  }

  let underButton = FOOTER_PLAY;
  if (!inCash) {
    const yesterday = prevStep ? s.history.get(prevDay) : undefined;
    if (worst && yesterday) underButton = youHadLine(yesterday.balance);
    else if (!worst && v.peakBalance - v.balance >= TOP_GAP) underButton = sellingAtTopLine(v.peakBalance - v.balance);
  }

  // R38: one number while in cash, the one on the button. No regret line, no score to beat.
  const lastSell = [...s.trades].reverse().find((t) => t.side === 'sell');
  let regret: ScreenModel['regret'] = null;
  if (!inCash && s.scoreToBeat != null) regret = { text: scoreToBeatLine(s.scoreToBeat), rose: false };
  const saving = inCash && lastSell ? buyBackSaving(v.balance, closes[d], closes[lastSell.dayIndex]) : 0;

  const delta = v.balance - start;
  const roundedDelta = Math.round(delta);
  const deltaLabel = inCash ? IN_CASH : roundedDelta > 0 ? upLabel(delta) : roundedDelta < 0 ? downLabel(delta) : LEVEL;

  const lossFrac = Math.max(0, (start - v.balance) / start);
  const buttonLabel = v.invested ? sellLabel(v.balance) : buyBackLabel(saving);

  return {
    runLabel: s.runLabel,
    dayLabel: day,
    status,
    headline: s.headline ?? placeholderHeadline(d + 1),
    standfirst,
    big: v.slow,
    worst,
    inCash,
    balance: v.balance,
    delta,
    deltaLabel,
    buttonLabel,
    cheaper: inCash && saving > 0,
    // Ruling R26: every buy-back label is 20px, so the size only changes on a trade.
    longLabel: !v.invested,
    underButton,
    regret,
    paper: paperFor({ lossFrac, inCash, worstDay: worst }),
    chart: chartModel(s, worst, inCash),
    paused: s.paused,
    pot: SHOW_POT ? potLine(s.pot) : '',
  };
}

/** R42: the chart is the market price from day 1 to today, with the trades as dots and, in cash, the sale close as a level. */
function chartModel(s: PlayState, worst: boolean, inCash: boolean): ChartModel {
  const today = s.view.dayIndex;
  const closes = s.run.closes.slice(0, today + 1);
  const trades = s.trades.filter((t) => t.dayIndex <= today);
  let saleDay: number | null = null;
  for (const t of trades) if (t.side === 'sell') saleDay = t.dayIndex;
  const soldAt = inCash && saleDay !== null ? closes[saleDay] : null;
  const now = closes[closes.length - 1];
  return {
    closes,
    trades,
    soldAt,
    worst,
    label: marketChartLabel(closes.length, now / closes[0] - 1, soldAt === null ? null : now / soldAt - 1),
    // Contract C1: the session's stepMs when it has one, else the step's own hold.
    growMs: (s.view as SessionView & { stepMs?: number }).stepMs ?? s.steps[s.view.stepIndex]?.holdMs ?? 0,
  };
}

// --- Drawing ---------------------------------------------------------------

export interface ScreenHandlers {
  /** The finger (or Enter/Space key) went down on the main button. */
  onPressStart?(): void;
  /** The press was cancelled, or the finger left the button while still down. */
  onPressCancel?(): void;
  onPress?(): void;
  /** The frame showing the latest render is about to be painted. */
  onPainted?(): void;
  onPauseToggle?(): void;
  onSoundToggle?(): void;
}

export interface Screen {
  render(v: ScreenModel): void;
  /**
   * The start screen (R28): lines in place of the headline and standfirst, then an optional line in the
   * secondary colour (borrowed money) and a note (score to beat); null takes them away.
   */
  setGate(g: { lines: string[]; extra?: string | null; note?: string | null } | null): void;
  setSound(on: boolean): void;
  /** R41: a short stamp over the paper for `ms` ("Sold at $9,750"); `win` styles a cheaper buy-back as a win. */
  stamp(text: string, win: boolean, ms: number): void;
  /** K2: a press hold stretches the chart's running growth by `ms` (lane FB's chart extend, when present). */
  extendChart(ms: number): void;
  /** The run is over: the button no longer takes presses (the last day stays on screen). */
  freeze(): void;
  /** Disconnects the resize watcher and clears the page colours on <html>. */
  destroy(): void;
}

const raf = (f: () => void): number =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(f) : (setTimeout(f, 16) as unknown as number);
const cancelRaf = (id: number) => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Round 2 play-screen styles (lane C). index.html is lead-only, so the screen brings these itself,
 * once, after the page's own sheet so they win on equal specificity.
 * - .act.cheaper: R38's green buy-back, pulsing in colour only so the button never moves under a finger
 *   (white on #1d6b3a is 6.5:1, on #23804a 4.9:1; no pulse with reduced motion).
 * - .stamp: R41's press stamp over the chart, out of the flow (no layout jump).
 * - .pot: R40 hides the pot.
 * - R48: the folio, the line under the button and the footer at 14px.
 */
const STYLE_ID = 'play-r2-c';
const STYLE = `
.chart{position:relative}
.stamp{position:absolute;left:0;right:0;top:50%;margin:-22px 0 0;padding:0;text-align:center;pointer-events:none;
  font-family:var(--sans);font-weight:700;font-size:min(24px,6.2vw);line-height:44px;letter-spacing:-0.01em;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--ink)}
.stamp>span{display:inline-block;padding:0 12px;background:var(--bg);border-top:2px solid currentColor;border-bottom:2px solid currentColor}
.stamp.win{color:#1d6b3a}
.is-worst .stamp.win{color:var(--ink)}
.stamp[hidden]{display:none}
.act.cheaper{background:#1d6b3a;color:#ffffff;animation:dps-pulse 1600ms ease-in-out infinite}
@keyframes dps-pulse{0%,100%{background-color:#1d6b3a}50%{background-color:#23804a}}
@media (prefers-reduced-motion:reduce){.act.cheaper{animation:none}}
.pot:empty{display:none}
.is-over .act{opacity:0.45;animation:none}
.foot .quiet{flex:none}
.foot .sound{margin-left:auto}
.folio,.foot{font-size:14px}
.under{font-size:14px;line-height:20px;height:40px}
.pause[aria-disabled="true"]{opacity:0.45;cursor:default;text-decoration:none}
/* Design minor: the day stays put in the middle of the folio whether or not the status slot has words. */
.folio{display:grid;grid-template-columns:1fr auto 1fr;justify-content:normal}
.folio>span:nth-child(2){text-align:center}
.folio>span:nth-child(3){text-align:right}
/* R57: the headline and the line under it sit in a block of fixed height (three headline lines and two lines
   under them), so a new headline never changes the chart's size. The headline steps down (--k) to fit it. */
.news{flex:none;height:206px;overflow:hidden}
.is-gate .news{display:none}
.headline{--hs:40px}
.is-big .headline{--hs:44px}
.is-worst .headline{--hs:56px}
.headline,.is-big .headline,.is-worst .headline{font-size:calc(var(--hs) * var(--k, 1))}
.play{position:relative}
.news-measure{position:absolute;left:0;right:0;top:0;visibility:hidden;pointer-events:none;contain:layout style}
.news-measure>.news{height:auto;overflow:visible}
/* The red day keeps the chart's inset and padding: same size, and the line never starts off the paper. */
.is-worst .chart{margin-left:0;margin-right:0;padding:8px 0}
/* R57: the balance and the figure beside it always share one line, so the block never changes height. */
.figures{flex-wrap:nowrap}
.balance{font-size:min(64px,16.4vw)}
.delta{flex:0 1 auto;min-width:0}
.regret.reserve{visibility:hidden}
/* Design minor: the short Start screen (later games) sets its heading as a headline just above the balance. */
.is-gate .intro.short{margin-top:auto}
.is-gate .intro.short ~ .figures{margin-top:32px}
.intro.short .lead{font-size:40px;line-height:1;letter-spacing:-0.02em}
@media (max-height:760px){
  .news{height:clamp(100px,calc(100dvh - 492px),168px)}
  .headline{--hs:34px}
  .is-big .headline{--hs:38px}
  .is-worst .headline{--hs:42px}
  .balance{font-size:min(56px,15vw)}
  .intro.short .lead{font-size:34px}
  .is-gate .intro.short ~ .figures{margin-top:24px}
}
`;
function ensureStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = STYLE;
  document.head.append(el);
}

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Splits "Sell for $6,412" into the words and the figure, so only the figure rolls. */
function splitFigure(label: string): [string, string, string] {
  const m = /^(.*?)(\$[\d,]+)(.*)$/.exec(label);
  return m ? [m[1], m[2], m[3]] : [label, '', ''];
}

export function mountScreen(root: HTMLElement, handlers: ScreenHandlers = {}): Screen {
  const page = h('main', 'play');
  const masthead = h('div', 'masthead', MASTHEAD);
  const folio = h('div', 'folio');
  const fRun = h('span', '');
  const fDay = h('span', '');
  const fStatus = h('span', '');
  folio.append(fRun, fDay, fStatus);
  const headline = h('h1', 'headline');
  const standfirst = h('p', 'standfirst');
  const news = h('div', 'news');
  news.append(headline, standfirst);
  const intro = h('div', 'intro');
  const chartWrap = h('div', 'chart');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  // R41: the press stamp sits over the chart, out of the flow, so nothing moves when it shows.
  const stampEl = h('p', 'stamp');
  stampEl.hidden = true;
  stampEl.setAttribute('aria-hidden', 'true');
  chartWrap.append(svg, stampEl);
  ensureStyle();
  const figures = h('div', 'figures');
  const balance = h('div', 'balance');
  const delta = h('div', 'delta');
  figures.append(balance, delta);
  const regret = h('p', 'regret');
  const spacer = h('div', 'spacer');
  const act = h('button', 'act');
  act.type = 'button';
  const actPre = h('span', '');
  const actFig = h('span', 'fig');
  const actPost = h('span', '');
  act.append(actPre, actFig, actPost);
  const under = h('p', 'under');
  const foot = h('div', 'foot');
  const pot = h('span', 'pot');
  const sound = h('button', 'quiet sound', SOUND_ON);
  sound.type = 'button';
  sound.setAttribute('aria-pressed', 'true');
  const pause = h('button', 'quiet pause', PAUSE);
  pause.type = 'button';
  foot.append(pot, sound, pause);
  page.append(masthead, folio, intro, news, chartWrap, figures, regret, spacer, act, under, foot);
  root.replaceChildren(page);

  const balanceRoll = createRoll(balance);
  const actRoll = createRoll(actFig);

  act.addEventListener('pointerdown', () => handlers.onPressStart?.());
  act.addEventListener('pointercancel', () => handlers.onPressCancel?.());
  // Touch fires pointerleave after the finger lifts (before the click): only a leave with a button still down cancels.
  act.addEventListener('pointerleave', (e) => {
    if ((e as PointerEvent).buttons) handlers.onPressCancel?.();
  });
  act.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handlers.onPressStart?.();
  });
  act.addEventListener('click', () => handlers.onPress?.());
  pause.addEventListener('click', () => handlers.onPauseToggle?.());
  sound.addEventListener('click', () => handlers.onSoundToggle?.());

  let last: ScreenModel | null = null;
  let frozen = false;
  let stampTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFitKey = '';
  /** R57: the chosen headline size per (words, state, block size): measured once, then reused. */
  const fitCache = new Map<string, number>();
  let newsSize = '';
  let regretSeen = false;
  let stampEnd = 0;
  let stampLeft = 0;
  let stampPaused = false;
  let wasPaused = false;
  let paintFrame = 0;
  let snapFrame = 0;
  let observer: ResizeObserver | null = null;
  /** Elements whose colours otherwise cross-fade. */
  const fading = (): HTMLElement[] => [document.documentElement, document.body, page, act];

  function applyPaper(p: Paper) {
    const s = page.style;
    s.setProperty('--bg', p.bg);
    s.setProperty('--ink', p.ink);
    s.setProperty('--sec', p.secondary);
    s.setProperty('--accent', p.accent);
    s.setProperty('--btn-bg', p.buttonBg);
    s.setProperty('--btn-ink', p.buttonInk);
    // The whole page, not just the column, takes the paper colour.
    document.documentElement.style.setProperty('--bg', p.bg);
    document.documentElement.style.setProperty('--ink', p.ink);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', p.bg);
  }

  /**
   * R30 + R57: the headline never runs past three lines, and it and the line under it fit the fixed news block.
   * The headline steps down from its CSS size until both hold; the smallest step is the floor. Each new
   * (headline, line, state, block size) is measured once, all steps in one layout pass, then cached.
   */
  function fitHeadline() {
    if (page.classList.contains('is-gate')) return;
    const words = `${headline.textContent}\u0000${standfirst.textContent}\u0000${page.classList.contains('is-big')}${page.classList.contains('is-worst')}`;
    const known = newsSize ? fitCache.get(`${words}\u0000${newsSize}`) : undefined;
    if (known !== undefined) return setStep(known);
    const box = h('div', 'news-measure');
    const probes = HEADLINE_STEPS.map((k) => {
      const wrap = h('div', 'news');
      const hl = h('div', 'headline', headline.textContent ?? '');
      hl.style.setProperty('--k', String(k));
      wrap.append(hl, h('p', 'standfirst', standfirst.textContent ?? ''));
      box.append(wrap);
      return { wrap, hl };
    });
    page.append(box);
    // One read phase: every probe is laid out by the first read.
    const width = news.clientWidth;
    const height = news.clientHeight;
    const results = probes.map(({ wrap, hl }) => {
      let lh = 0;
      try {
        lh = parseFloat(getComputedStyle(hl).lineHeight);
      } catch {
        /* no layout */
      }
      const lines = lh > 0 ? Math.round(hl.getBoundingClientRect().height / lh) : 0;
      return { lines, fits: wrap.scrollHeight <= height };
    });
    box.remove();
    if (!(width > 0 && height > 0)) return setStep(0);
    newsSize = `${width}x${height}`;
    const i = chooseHeadlineStep(results);
    fitCache.set(`${words}\u0000${newsSize}`, i);
    setStep(i);
  }
  function setStep(i: number) {
    const k = HEADLINE_STEPS[i] ?? 1;
    if (k === 1) headline.style.removeProperty('--k');
    else headline.style.setProperty('--k', String(k));
  }

  /**
   * R43: the chart's drawing box is kept from the resize watcher, so a new day never forces a layout.
   * Only the first draw (before the watcher has reported) measures.
   */
  let chartBox: { w: number; h: number } | null = null;
  const boxFrom = (width: number, height: number) => ({ w: Math.round(width) || 342, h: Math.max(Math.round(height) || 160, 40) });
  function measureChart() {
    let pad = 0;
    try {
      const cs = getComputedStyle(chartWrap);
      pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    } catch {
      /* happy-dom or no layout */
    }
    chartBox = boxFrom(chartWrap.getBoundingClientRect().width, chartWrap.clientHeight - pad);
  }

  /** Draws the chart; on a new day its segment grows over the step (none for reduced motion). */
  function drawChartNow(m: ScreenModel) {
    if (!chartBox) measureChart();
    const { w, h: hgt } = chartBox!;
    const px = `${hgt}px`;
    if (svg.style.height !== px) svg.style.height = px;
    drawChart(svg, m.chart, m.paper, w, hgt, { animateMs: reducedMotion() ? 0 : m.chart.growMs ?? 0 });
  }

  // Redraw the chart when the column changes size (rotation, browser bars); refit when the news block does.
  if (typeof ResizeObserver === 'function') {
    let lastSize = '';
    observer = new ResizeObserver((entries) => {
      let refit = false;
      let redraw = false;
      for (const e of entries) {
        const r = e.contentRect;
        if (e.target === news) {
          const size = `${Math.round(r.width)}x${Math.round(r.height)}`;
          if (r.height > 0 && size !== newsSize) {
            newsSize = '';
            refit = true;
          }
          continue;
        }
        const box = boxFrom(r.width, r.height);
        const key = `${box.w}x${box.h}`;
        if (key !== lastSize) {
          lastSize = key;
          chartBox = box;
          redraw = true;
        }
      }
      if (!last) return;
      if (refit) fitHeadline();
      if (redraw) drawChartNow(last);
    });
    observer.observe(chartWrap);
    observer.observe(news);
  }

  /** R56: the stamp's timer and fade wait while the game is paused (M3). */
  function pauseStamp(on: boolean) {
    if (stampEl.hidden || on === stampPaused) return;
    stampPaused = on;
    const anims = stampEl.getAnimations?.() ?? [];
    if (on) {
      clearTimeout(stampTimer);
      stampLeft = Math.max(0, stampEnd - Date.now());
      for (const a of anims) a.pause();
    } else {
      for (const a of anims) a.play();
      armStamp(stampLeft);
    }
  }
  function armStamp(ms: number) {
    clearTimeout(stampTimer);
    stampEnd = Date.now() + ms;
    stampTimer = setTimeout(() => {
      stampEl.hidden = true;
    }, ms);
  }

  return {
    render(m) {
      const prev = last;
      last = m;
      // Into and out of the worst day the paper switches at once (the jolt marks it);
      // between the other states it keeps its slow cross-fade.
      const snap = prev !== null && prev.worst !== m.worst;
      if (snap) {
        cancelRaf(snapFrame);
        for (const e of fading()) e.style.transition = 'none';
      }
      applyPaper(m.paper);
      if (snap) {
        void page.offsetWidth; // commit the new colours before the fade comes back
        snapFrame = raf(() => {
          for (const e of fading()) e.style.transition = '';
        });
      }
      page.classList.toggle('is-worst', m.worst);
      page.classList.toggle('is-big', m.big);
      page.classList.toggle('is-cash', m.inCash);
      fRun.textContent = m.runLabel;
      fDay.textContent = m.dayLabel;
      fStatus.textContent = m.status;
      if (headline.textContent !== m.headline) {
        headline.textContent = m.headline;
        // A quick press-in on slow-motion days only.
        if (m.big && !reducedMotion() && typeof headline.animate === 'function') {
          headline.animate([{ transform: 'scale(1.04)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], {
            duration: 220, easing: EASE,
          });
        }
      }
      standfirst.textContent = m.standfirst;
      balanceRoll.set(dollars(m.balance));
      delta.textContent = m.deltaLabel;
      delta.classList.toggle('loss', !m.inCash && Math.round(m.delta) < 0);
      // R57: once a game has shown the score to beat, its line keeps its room while in cash (no jump).
      if (m.regret) regretSeen = true;
      regret.textContent = m.regret ? m.regret.text : regretSeen ? '\u00a0' : '';
      regret.hidden = !m.regret && !regretSeen;
      regret.classList.toggle('reserve', !m.regret && regretSeen);
      regret.classList.toggle('rose', !!m.regret?.rose);
      const [pre, fig, post] = splitFigure(m.buttonLabel);
      actPre.textContent = pre;
      actRoll.set(fig);
      actPost.textContent = post;
      act.classList.toggle('long', m.longLabel);
      if (act.classList.contains('cheaper') !== m.cheaper) {
        // In and out of green at once: a fading green would sit behind "Sell for" (slowest with reduced motion).
        act.style.transition = 'none';
        act.classList.toggle('cheaper', m.cheaper);
        void act.offsetWidth;
        raf(() => {
          act.style.transition = '';
        });
      }
      act.setAttribute('aria-disabled', String(m.paused || frozen));
      under.textContent = m.underButton;
      pot.textContent = m.pot;
      pause.textContent = m.paused ? RESUME : PAUSE;
      pause.setAttribute('aria-pressed', String(m.paused));
      // Review M9: Pause does nothing on the Start screen or in the final hold, and says so.
      pause.setAttribute('aria-disabled', String(frozen || page.classList.contains('is-gate')));
      if (m.paused !== wasPaused) {
        wasPaused = m.paused;
        pauseStamp(m.paused);
      }
      // R43: fitting measures the page (a forced layout), so only when what it depends on changed;
      // any other change of the chart's height reaches the resize watcher, which fits again.
      const fitKey = `${m.headline}|${m.standfirst}|${m.big}|${m.worst}|${page.classList.contains('is-gate')}`;
      if (fitKey !== lastFitKey) {
        lastFitKey = fitKey;
        fitHeadline();
      }
      drawChartNow(m);
      cancelRaf(paintFrame);
      paintFrame = raf(() => handlers.onPainted?.());
      // A short jolt when a red day arrives (R55): the news and the chart, never the button under the finger.
      if (m.worst && !prev?.worst && !reducedMotion()) {
        for (const e of [news, chartWrap]) {
          if (typeof e.animate !== 'function') continue;
          e.animate(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
            { duration: 240, easing: EASE },
          );
        }
      }
    },
    setGate(g) {
      page.classList.toggle('is-gate', !!g);
      pause.setAttribute('aria-disabled', String(frozen || !!g));
      const ps = g ? g.lines.map((t, i) => h('p', i === 0 ? 'lead' : '', t)) : [];
      // The headline h1 is hidden on the gate: its first line is the page's heading instead.
      ps[0]?.setAttribute('role', 'heading');
      ps[0]?.setAttribute('aria-level', '1');
      // The short version (later games, R45) sits down by the balance instead of leaving a dead band.
      intro.classList.toggle('short', !!g && g.lines.length < 3);
      if (g?.extra) ps.push(h('p', 'extra', g.extra));
      if (g?.note) ps.push(h('p', 'note', g.note));
      intro.replaceChildren(...ps);
    },
    setSound(on) {
      sound.textContent = on ? SOUND_ON : SOUND_OFF;
      sound.setAttribute('aria-pressed', String(on));
    },
    stamp(text, win, ms) {
      clearTimeout(stampTimer);
      stampEl.getAnimations?.().forEach((a) => a.cancel());
      stampEl.replaceChildren(h('span', '', text));
      stampEl.classList.toggle('win', win);
      stampEl.hidden = false;
      stampPaused = false;
      if (!reducedMotion() && typeof stampEl.animate === 'function') {
        // R56: in quickly (a small lift for a win), fully readable for 1.2 s or more, then a short fade.
        // With reduced motion it stays as long and then goes at once.
        const lift = win ? 'translateY(-6px)' : 'none';
        stampEl.animate(
          [
            { opacity: 0, transform: 'translateY(6px)' },
            { opacity: 1, transform: lift, offset: Math.min(0.3, STAMP_IN_MS / ms) },
            { opacity: 1, transform: lift, offset: Math.max(0.7, 1 - STAMP_OUT_MS / ms) },
            { opacity: 0, transform: lift },
          ],
          { duration: ms, easing: EASE, fill: 'forwards' },
        );
      }
      armStamp(ms);
      if (wasPaused) pauseStamp(true);
    },
    extendChart(ms) {
      (chartApi as unknown as { extend?(svg: SVGSVGElement, ms: number): void }).extend?.(svg, ms);
    },
    freeze() {
      frozen = true;
      page.classList.add('is-over');
      act.setAttribute('aria-disabled', 'true');
      pause.setAttribute('aria-disabled', 'true');
    },
    destroy() {
      clearTimeout(stampTimer);
      observer?.disconnect();
      observer = null;
      cancelRaf(paintFrame);
      cancelRaf(snapFrame);
      for (const e of fading()) e.style.transition = '';
      document.documentElement.style.removeProperty('--bg');
      document.documentElement.style.removeProperty('--ink');
    },
  };
}

// --- Running a session on the screen -----------------------------------------

export interface PlayOpts {
  runLabel: string;
  start?: number;
  pot?: number;
  onEnd(r: RunResult): void;
  /** The headline and commentary for each new step (src/game/narrator.ts). */
  narrate?(dayIndex: number, prevDay: number | null, balance: number, trades: Trade[]): { headline: string; commentary: string };
  /** Rematch and challenge extras (spec 6.7). */
  soldLastTime?: number | null;
  scoreToBeat?: number | null;
  other?: number[] | null;
  opening?: string;
  /**
   * The start screen (R28): the front page stands still on day 1 with these lines in place of the
   * headline and standfirst, and a Start button. The clock starts only when Start is pressed.
   */
  gate?: { lines: string[]; extra?: string | null; note?: string | null };
  /** Rule book for balances (borrowed money plugs in simulateBorrowed). */
  simulateFn?: SimulateFn;
  /**
   * Borrowed money (spec 6.13): the live counter is the balance against someone who put in
   * the same amount unborrowed, and a balance at zero while invested ends the run at once.
   */
  borrowed?: boolean;
  /** The sound switch: its first state, and the toggle (returns the new state). */
  soundOn?: boolean;
  onSoundToggle?(): boolean;
  /** After every render: whether it is a new step, the trade just made, and the step's hold (for sound and vibration). */
  onFrame?(v: SessionView, m: ScreenModel, e: { newStep: boolean; trade: Trade['side'] | null; win: boolean; holdMs: number }): void;
  /** The clock paused (Pause button or the page hidden): stop sound here. */
  onPause?(): void;
  onResume?(): void;
}

export interface Play extends Session {
  /** Stops the run and undoes what the screen set on the page (resize watcher, page colours). */
  teardown(): void;
}

export function startPlay(root: HTMLElement, run: RunData, steps: Step[], opts: PlayOpts): Play {
  const start = opts.start ?? 10000;
  initAnnouncer();
  const history = new Map<number, DayPoint>();
  const trades: Trade[] = [];
  let firstSaleStep: number | null = null;
  let paused = false;
  let soundOn = opts.soundOn ?? true;
  let lastFrameStep = -1;
  let rendered: SessionView | null = null;
  let pendingStep: number | null = null;
  /** The step on screen in the last painted frame, and the one captured when the finger went down. */
  let paintedStep: number | null = null;
  let capturedStep: number | null = null;
  let lastInvested = true;
  let lastAnnouncedStep = -1;
  let words: { headline: string; commentary: string } | undefined;
  let wordsStep = -1;
  let gated = !!opts.gate;

  const screen = mountScreen(root, {
    onPressStart() {
      capturedStep = paintedStep ?? rendered?.stepIndex ?? null;
    },
    onPressCancel() {
      capturedStep = null;
    },
    onPainted() {
      if (rendered) paintedStep = rendered.stepIndex;
    },
    onPress() {
      if (gated) {
        gated = false;
        screen.setGate(null);
        session.start();
        return;
      }
      if (!rendered || paused) {
        capturedStep = null;
        return;
      }
      // Trade at the amount the player saw: the step painted when the finger went down.
      // A finger held for two steps or more falls back to the step painted now.
      let target = capturedStep ?? paintedStep ?? rendered.stepIndex;
      if (target < rendered.stepIndex - 1) target = paintedStep ?? rendered.stepIndex;
      capturedStep = null;
      pendingStep = target;
      session.press(target);
    },
    onPauseToggle() {
      if (gated) return;
      if (paused) session.resume();
      else session.pause();
    },
    onSoundToggle() {
      // The caller owns the choice (stored, and it mutes the sound); without one the switch only flips.
      soundOn = opts.onSoundToggle ? opts.onSoundToggle() : !soundOn;
      screen.setSound(soundOn);
    },
  });
  screen.setSound(soundOn);

  let ended = false;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * R49: the last day stays on screen (its balance is the result's final) for END_HOLD_MS before the
   * result, so the last live number the player reads is the number the result prints.
   */
  const end = (r: RunResult) => {
    if (ended) return;
    ended = true;
    screen.freeze();
    endTimer = setTimeout(() => opts.onEnd(r), END_HOLD_MS);
  };

  function draw(raw: SessionView) {
    if (ended) return;
    // Borrowed money: leadAt measures an unborrowed player, so the counter is taken from the view itself.
    const v = opts.borrowed ? { ...raw, leadNow: Math.round(raw.balance) - Math.round(raw.marketBalance) } : raw;
    rendered = v;
    history.set(v.dayIndex, { balance: v.balance, invested: v.invested });
    let traded: Trade['side'] | null = null;
    let stamp: { text: string; win: boolean } | null = null;
    if (v.invested !== lastInvested) {
      const at = pendingStep !== null ? steps[pendingStep].dayIndex : v.dayIndex;
      const side: Trade['side'] = v.invested ? 'buy' : 'sell';
      if (side === 'sell') stamp = { text: soldStamp(v.balance), win: false };
      else {
        const sale = [...trades].reverse().find((t) => t.side === 'sell');
        // The cash is the balance at the sale's close (a buy pinned to the step before shows today's balance).
        const cash = sale ? history.get(sale.dayIndex)?.balance ?? v.balance : v.balance;
        const saving = sale ? buyBackSaving(cash, run.closes[at], run.closes[sale.dayIndex]) : 0;
        stamp = { text: boughtStamp(saving), win: saving > 0 };
      }
      trades.push({ dayIndex: at, side });
      traded = side;
      lastInvested = v.invested;
      if (side === 'sell' && firstSaleStep === null && !load(SEEN_FIRST_SALE, false)) {
        firstSaleStep = v.stepIndex;
        save(SEEN_FIRST_SALE, true);
      }
      announce(stamp.text);
    }
    pendingStep = null;
    if (opts.narrate && v.stepIndex !== wordsStep) {
      wordsStep = v.stepIndex;
      const prevDay = v.stepIndex > 0 ? steps[v.stepIndex - 1].dayIndex : null;
      words = opts.narrate(v.dayIndex, prevDay, v.balance, trades);
    }
    const m = screenModel({
      run, steps, start, view: v, runLabel: opts.runLabel, history, trades, firstSaleStep, paused, pot: opts.pot ?? start,
      headline: words?.headline, commentary: words?.commentary,
      soldLastTime: opts.soldLastTime, scoreToBeat: opts.scoreToBeat, other: opts.other, opening: opts.opening,
    });
    screen.render(m);
    if (stamp) {
      screen.stamp(stamp.text, stamp.win, STAMP_MS);
      // C1: the day clock holds on each press (lane A's session; absent, the stamp still shows).
      (session as Session & { holdFor?(ms: number): void }).holdFor?.(PRESS_HOLD_MS);
      // K2: the line keeps growing through the hold instead of stopping dead.
      screen.extendChart(PRESS_HOLD_MS);
    }
    const newStep = v.stepIndex !== lastFrameStep;
    lastFrameStep = v.stepIndex;
    try {
      opts.onFrame?.(v, m, { newStep, trade: traded, win: !!stamp?.win, holdMs: v.stepMs ?? steps[v.stepIndex]?.holdMs ?? 0 });
    } catch {
      /* sound and vibration are optional */
    }
    if (v.slow && v.stepIndex !== lastAnnouncedStep) {
      lastAnnouncedStep = v.stepIndex;
      announce(`${m.status}. ${m.headline}. ${dollars(v.balance)}, ${m.deltaLabel}.`);
    }
    // A wipe-out ends the run on the spot (spec 6.13).
    if (opts.borrowed && opts.simulateFn && v.invested && v.balance <= 0) {
      session.destroy();
      end(opts.simulateFn(run.closes, trades, start));
    }
  }

  const session = createSession(run, steps, {
    start,
    onStep: draw,
    onEnd: end,
    simulateFn: opts.simulateFn,
    onPause() {
      paused = true;
      opts.onPause?.();
      if (rendered) draw(session.view());
    },
    onResume() {
      paused = false;
      opts.onResume?.();
      if (rendered) draw(session.view());
    },
  });
  if (opts.gate) showGate(opts.gate);
  else session.start();

  /** The still front page: day 1, the starting balance, the Start button. */
  function showGate(g: NonNullable<PlayOpts['gate']>) {
    const v = session.view();
    const still = new Map<number, DayPoint>([[v.dayIndex, { balance: v.balance, invested: true }]]);
    const m = screenModel({
      run, steps, start, view: v, runLabel: opts.runLabel, history: still, trades: [], firstSaleStep: null, paused: false,
      pot: opts.pot ?? start, headline: '', commentary: '', other: opts.other,
    });
    screen.setGate(g);
    // Nothing has happened yet: calm paper and the default status even when day 1 is a slow or red day,
    // no "level" beside the balance, and (CSS) no chart band.
    screen.render({
      ...m, status: QUIET_STATUS, big: false, worst: false, paper: paperFor({ lossFrac: 0, inCash: false, worstDay: false }),
      chart: { ...m.chart, worst: false }, deltaLabel: '',
      buttonLabel: START_LABEL, longLabel: false, regret: null, underButton: FOOTER_PLAY,
    });
  }

  return {
    ...session,
    teardown() {
      clearTimeout(endTimer);
      ended = true;
      session.destroy();
      screen.destroy();
    },
  };
}

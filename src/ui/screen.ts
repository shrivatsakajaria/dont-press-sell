// The play screen (spec 6.2 to 6.6, 9; mock-ups 1, 2, 3 and 5).
// screenModel() turns the session's view into what the page shows (pure, tested);
// mountScreen() draws it; startPlay() runs one session on it.
import {
  FIRST_SALE_LINE, FOOTER_PLAY, MASTHEAD, OPENING_LINE, SOLD_LAST_TIME, buyBackLabel, dollars, potLine, scoreToBeatLine,
  sellLabel, sellingAtTopLine,
} from '../content/copy';
import type { RunData, RunResult, Trade } from '../engine/types';
import type { Step } from '../game/schedule';
import { createSession, type Session, type SessionView } from '../game/session';
import { load, save } from '../store/store';
import { announce, initAnnouncer } from './a11y';
import { drawChart, type ChartModel, type ChartPoint } from './chart';
import { createRoll } from './digits';
import { paperFor, type Paper } from './paper';

// --- Strings this screen owns (to move into copy.ts later; listed in the lane report).
export const STATUS_DEFAULT = 'Price: your nerve';
export const STATUS_SLOW = 'Time slowed';
export const STATUS_CASH = 'You are in cash';
export const STATUS_FORWARD = 'Fast forward';
export const STATUS_PAUSED = 'Paused';
export const MYSTERY_LABEL = 'Mystery crash';
export const PAUSE = 'Pause';
export const RESUME = 'Resume';
export const SOUND_ON = 'Sound on';
export const SOUND_OFF = 'Sound off';
export const IN_CASH = 'in cash';
export const LEVEL = 'level';
export const dayLabel = (n: number) => `Day ${n}`;
export const yearLabel = (n: number) => `Year ${n}`;
export const youHadLine = (n: number) => `You had ${dollars(n)} yesterday`;
export const regretMadeLine = (n: number) => `Holding today would have made you ${dollars(n)}`;
export const regretCostLine = (n: number) => `Holding today would have cost you ${dollars(n)}`;
export const upLabel = (n: number) => `up ${dollars(n)}`;
export const downLabel = (n: number) => `down ${dollars(n)}`;
/** Placeholders until the real headlines and commentary arrive (Tasks 7 and 10). */
export const placeholderHeadline = (day: number) => `Headline for day ${day}`;
export const placeholderStandfirst = (day: number) => `Commentary for day ${day}`;
export const chartLabel = (days: number, bal: number, start: number) =>
  `Chart of your balance over ${days} ${days === 1 ? 'day' : 'days'}: ${dollars(bal)} against the ${dollars(start)} you started with`;
export const soldAnnouncement = (n: number) => `Sold for ${dollars(n)}`;
export const boughtAnnouncement = (n: number) => `Bought back with ${dollars(n)}`;

/** How long the opening line stays up, and the first-sale line after a first sale (clock time). */
const OPENING_MS = 4000;
const FIRST_SALE_MS = 4000;
/** How long "This is the day you sold last time." stays up (clock time). */
const SOLD_LAST_TIME_MS = 3000;
/** Button labels longer than this wrap at 24px in a 342px column, so they drop to the long size. */
const LONG_LABEL_CHARS = 25;
/** Gap from the peak at which the "Selling at the top" line appears (spec 6.4). */
const TOP_GAP = 500;
const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const EASE = 'cubic-bezier(0.22,1,0.36,1)';
const SEEN_FIRST_SALE = 'seenFirstSale';

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
  /** The label is too long for 24px on one line: it is set a size smaller. */
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
  run: Pick<RunData, 'closes' | 'dates'>;
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
  const fell = prevStep !== undefined && closes[d] < closes[prevDay];
  const inCash = !v.invested;
  const worst = v.slow && fell;
  const forward = v.phase === 'forward';

  const status = s.paused
    ? STATUS_PAUSED
    : forward
      ? STATUS_FORWARD
      : v.slow
        ? STATUS_SLOW
        : inCash
          ? STATUS_CASH
          : STATUS_DEFAULT;

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
    standfirst = OPENING_LINE;
  }

  let underButton = FOOTER_PLAY;
  if (!inCash) {
    const yesterday = prevStep ? s.history.get(prevDay) : undefined;
    if (worst && yesterday) underButton = youHadLine(yesterday.balance);
    else if (!worst && v.peakBalance - v.balance >= TOP_GAP) underButton = sellingAtTopLine(v.peakBalance - v.balance);
  }

  // Regret while in cash: what the cash would have made (or lost) since the last step, had it stayed in.
  const lastSell = [...s.trades].reverse().find((t) => t.side === 'sell');
  let regret: ScreenModel['regret'] = null;
  if (inCash && prevStep && lastSell && lastSell.dayIndex <= prevDay && lastSell.dayIndex < d) {
    const amount = v.balance * (closes[d] / closes[prevDay] - 1);
    if (Math.round(Math.abs(amount)) >= 1) {
      regret = amount > 0 ? { text: regretMadeLine(amount), rose: true } : { text: regretCostLine(amount), rose: false };
    }
  }

  if (!regret && s.scoreToBeat != null) regret = { text: scoreToBeatLine(s.scoreToBeat), rose: false };

  const delta = v.balance - start;
  const roundedDelta = Math.round(delta);
  const deltaLabel = inCash ? IN_CASH : roundedDelta > 0 ? upLabel(delta) : roundedDelta < 0 ? downLabel(delta) : LEVEL;

  const lossFrac = Math.max(0, (start - v.balance) / start);
  const buttonLabel = v.invested ? sellLabel(v.balance) : buyBackLabel(v.leadNow);

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
    longLabel: buttonLabel.length > LONG_LABEL_CHARS,
    underButton,
    regret,
    paper: paperFor({ lossFrac, inCash, worstDay: worst }),
    chart: chartModel(s, worst, inCash),
    paused: s.paused,
    pot: potLine(s.pot),
  };
}

function chartModel(s: PlayState, worst: boolean, inCash: boolean): ChartModel {
  const closes = s.run.closes;
  const days = [...s.history.keys()].filter((d) => d <= s.view.dayIndex).sort((a, b) => a - b);
  // Cash periods: from each sale to the next buy (or today). The dashed line spans them, ends included.
  const periods: [number, number, number][] = []; // [sellDay, endDay, cash]
  let open: number | null = null;
  for (const t of s.trades) {
    if (t.side === 'sell') open = t.dayIndex;
    else if (open !== null) {
      periods.push([open, t.dayIndex, s.history.get(open)?.balance ?? 0]);
      open = null;
    }
  }
  if (open !== null) periods.push([open, Infinity, s.history.get(open)?.balance ?? 0]);
  const points: ChartPoint[] = days.map((d) => {
    const p = periods.find(([a, b]) => d >= a && d <= b);
    return {
      dayIndex: d,
      balance: s.history.get(d)!.balance,
      ghost: p ? (p[2] * closes[d]) / closes[p[0]] : null,
    };
  });
  return {
    start: s.start,
    points,
    trades: s.trades.slice(),
    worst,
    inCash,
    label: chartLabel(s.view.dayIndex + 1, s.view.balance, s.start),
    other: s.other ?? undefined,
  };
}

// --- Drawing ---------------------------------------------------------------

export interface ScreenHandlers {
  onPress?(): void;
  onPauseToggle?(): void;
  onSoundToggle?(): void;
}

export interface Screen {
  render(v: ScreenModel): void;
  setSound(on: boolean): void;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
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
  const chartWrap = h('div', 'chart');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chartWrap.append(svg);
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
  page.append(masthead, folio, headline, standfirst, chartWrap, figures, regret, spacer, act, under, foot);
  root.replaceChildren(page);

  const balanceRoll = createRoll(balance);
  const actRoll = createRoll(actFig);

  act.addEventListener('click', () => handlers.onPress?.());
  pause.addEventListener('click', () => handlers.onPauseToggle?.());
  sound.addEventListener('click', () => handlers.onSoundToggle?.());

  let last: ScreenModel | null = null;

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

  function drawChartNow(m: ScreenModel) {
    const r = chartWrap.getBoundingClientRect();
    const w = Math.round(r.width) || 342;
    let pad = 0;
    try {
      const cs = getComputedStyle(chartWrap);
      pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    } catch {
      /* happy-dom or no layout */
    }
    const hgt = Math.round(chartWrap.clientHeight - pad) || 160;
    svg.style.height = `${Math.max(hgt, 40)}px`;
    drawChart(svg, m.chart, m.paper, w, Math.max(hgt, 40));
  }

  // Redraw the chart when the column changes size (rotation, browser bars).
  if (typeof ResizeObserver === 'function') {
    let lastSize = '';
    new ResizeObserver(() => {
      const r = chartWrap.getBoundingClientRect();
      const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (key !== lastSize && last) {
        lastSize = key;
        drawChartNow(last);
      }
    }).observe(chartWrap);
  }

  return {
    render(m) {
      const prev = last;
      last = m;
      applyPaper(m.paper);
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
      regret.textContent = m.regret ? m.regret.text : '';
      regret.hidden = !m.regret;
      regret.classList.toggle('rose', !!m.regret?.rose);
      const [pre, fig, post] = splitFigure(m.buttonLabel);
      actPre.textContent = pre;
      actRoll.set(fig);
      actPost.textContent = post;
      act.classList.toggle('long', m.longLabel);
      act.setAttribute('aria-disabled', String(m.paused));
      under.textContent = m.underButton;
      pot.textContent = m.pot;
      pause.textContent = m.paused ? RESUME : PAUSE;
      pause.setAttribute('aria-pressed', String(m.paused));
      drawChartNow(m);
      // A short jolt when a worst day arrives.
      if (m.worst && !prev?.worst && !reducedMotion() && typeof page.animate === 'function') {
        page.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
          { duration: 240, easing: EASE },
        );
      }
    },
    setSound(on) {
      sound.textContent = on ? SOUND_ON : SOUND_OFF;
      sound.setAttribute('aria-pressed', String(on));
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
}

export function startPlay(root: HTMLElement, run: RunData, steps: Step[], opts: PlayOpts): Session {
  const start = opts.start ?? 10000;
  initAnnouncer();
  const history = new Map<number, DayPoint>();
  const trades: Trade[] = [];
  let firstSaleStep: number | null = null;
  let paused = false;
  let soundOn = true;
  let rendered: SessionView | null = null;
  let pendingStep: number | null = null;
  let lastInvested = true;
  let lastAnnouncedStep = -1;
  let words: { headline: string; commentary: string } | undefined;
  let wordsStep = -1;

  const screen = mountScreen(root, {
    onPress() {
      if (!rendered || paused) return;
      pendingStep = rendered.stepIndex;
      session.press(rendered.stepIndex);
    },
    onPauseToggle() {
      if (paused) session.resume();
      else session.pause();
    },
    onSoundToggle() {
      // Placeholder: the sound arrives with Task 12. The switch already remembers the choice.
      soundOn = !soundOn;
      screen.setSound(soundOn);
    },
  });

  function draw(v: SessionView) {
    rendered = v;
    history.set(v.dayIndex, { balance: v.balance, invested: v.invested });
    if (v.invested !== lastInvested) {
      const at = pendingStep !== null ? steps[pendingStep].dayIndex : v.dayIndex;
      const side: Trade['side'] = v.invested ? 'buy' : 'sell';
      trades.push({ dayIndex: at, side });
      lastInvested = v.invested;
      if (side === 'sell' && firstSaleStep === null && !load(SEEN_FIRST_SALE, false)) {
        firstSaleStep = v.stepIndex;
        save(SEEN_FIRST_SALE, true);
      }
      announce(side === 'sell' ? soldAnnouncement(v.balance) : boughtAnnouncement(v.balance));
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
      soldLastTime: opts.soldLastTime, scoreToBeat: opts.scoreToBeat, other: opts.other,
    });
    screen.render(m);
    if (v.slow && v.stepIndex !== lastAnnouncedStep) {
      lastAnnouncedStep = v.stepIndex;
      announce(`${m.status}. ${m.headline}. ${dollars(v.balance)}, ${m.deltaLabel}.`);
    }
  }

  const session = createSession(run, steps, {
    start,
    onStep: draw,
    onEnd: (r) => opts.onEnd(r),
    onPause() {
      paused = true;
      if (rendered) draw(session.view());
    },
    onResume() {
      paused = false;
      if (rendered) draw(session.view());
    },
  });
  session.start();
  return session;
}

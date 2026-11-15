// The play screen (spec 6.2 to 6.6, 9; mock-ups 1, 2, 3 and 5).
// screenModel() turns the session's view into what the page shows (pure, tested);
// mountScreen() draws it; startPlay() runs one session on it.
import {
  FIRST_SALE_LINE, FOOTER_PLAY, MASTHEAD, OPENING_LINE, SOLD_LAST_TIME, START_LABEL, buyBackLabel, dollars, marketChartLabel, potLine,
  scoreToBeatLine, sellLabel, sellingAtTopLine,
} from '../content/copy';
import type { RunData, RunResult, Trade } from '../engine/types';
import type { Step } from '../game/schedule';
import { createSession, type Session, type SessionView, type SimulateFn } from '../game/session';
import { load, save } from '../store/store';
import { announce, initAnnouncer } from './a11y';
import { drawChart, type ChartModel } from './chart';
import { createRoll } from './digits';
import { paperFor, type Paper } from './paper';

// Strings this screen shows live in src/content/copy.ts; re-exported for existing importers.
export {
  STATUS_DEFAULT, STATUS_SLOW, STATUS_CASH, STATUS_FORWARD, STATUS_PAUSED, MYSTERY_LABEL, PAUSE, RESUME, SOUND_ON, SOUND_OFF, IN_CASH, LEVEL, dayLabel, yearLabel, youHadLine, regretMadeLine, regretCostLine, upLabel, downLabel, placeholderHeadline, placeholderStandfirst, chartLabel, soldAnnouncement, boughtAnnouncement,
} from '../content/copy';
import {
  STATUS_DEFAULT, STATUS_SLOW, STATUS_CASH, STATUS_FORWARD, STATUS_PAUSED, PAUSE, RESUME, SOUND_ON, SOUND_OFF, IN_CASH, LEVEL, dayLabel, yearLabel, youHadLine, regretMadeLine, regretCostLine, upLabel, downLabel, placeholderHeadline, placeholderStandfirst, soldAnnouncement, boughtAnnouncement,
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
const MIN_CHART = 120;

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
  const fell = prevStep !== undefined
    ? closes[d] < closes[prevDay]
    : !!pre && pre.length > 0 && closes[d] < pre[pre.length - 1];
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
    standfirst = s.opening ?? OPENING_LINE;
  }

  let underButton = FOOTER_PLAY;
  if (!inCash) {
    const yesterday = prevStep ? s.history.get(prevDay) : undefined;
    if (worst && yesterday) underButton = youHadLine(yesterday.balance);
    else if (!worst && v.peakBalance - v.balance >= TOP_GAP) underButton = sellingAtTopLine(v.peakBalance - v.balance);
  }

  // Regret while in cash: what the cash would have made (or lost) on today's move alone, had it
  // stayed in. Today only, even when a quiet step covers several days; none in the fast-forward.
  const lastSell = [...s.trades].reverse().find((t) => t.side === 'sell');
  let regret: ScreenModel['regret'] = null;
  if (inCash && !forward && d >= 1 && lastSell && lastSell.dayIndex < d) {
    const amount = v.balance * (closes[d] / closes[d - 1] - 1);
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
    // Ruling R26: every buy-back label is 20px, so the size only changes on a trade.
    longLabel: !v.invested,
    underButton,
    regret,
    paper: paperFor({ lossFrac, inCash, worstDay: worst }),
    chart: chartModel(s, worst, inCash),
    paused: s.paused,
    pot: potLine(s.pot),
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
  const intro = h('div', 'intro');
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
  page.append(masthead, folio, intro, headline, standfirst, chartWrap, figures, regret, spacer, act, under, foot);
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
  let lastFitKey = '';
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
   * R30: the headline never runs past three lines and the chart keeps at least MIN_CHART px. The headline
   * steps down from its CSS size (82%, 68%, then 60% and 52% for the longest lines) until both hold; the smallest step is the floor.
   */
  function fitHeadline() {
    headline.style.fontSize = '';
    if (page.classList.contains('is-gate') || chartWrap.getBoundingClientRect().height === 0) return;
    let base = 0;
    try {
      base = parseFloat(getComputedStyle(headline).fontSize);
    } catch {
      return;
    }
    if (!(base > 0)) return;
    for (const k of HEADLINE_STEPS) {
      const px = Math.round(base * k);
      headline.style.fontSize = k === 1 ? '' : `${px}px`;
      const lh = parseFloat(getComputedStyle(headline).lineHeight) || px;
      const lines = Math.round(headline.getBoundingClientRect().height / lh);
      if (lines <= MAX_HEADLINE_LINES && chartWrap.getBoundingClientRect().height >= MIN_CHART) return;
    }
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

  // Redraw the chart when the column changes size (rotation, browser bars, the headline's size).
  if (typeof ResizeObserver === 'function') {
    let lastSize = '';
    observer = new ResizeObserver((entries) => {
      const r = entries[entries.length - 1]?.contentRect;
      if (!r) return;
      const box = boxFrom(r.width, r.height);
      const key = `${box.w}x${box.h}`;
      if (key !== lastSize && last) {
        lastSize = key;
        chartBox = box;
        fitHeadline();
        drawChartNow(last);
      }
    });
    observer.observe(chartWrap);
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
      // A short jolt when a worst day arrives.
      if (m.worst && !prev?.worst && !reducedMotion() && typeof page.animate === 'function') {
        page.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
          { duration: 240, easing: EASE },
        );
      }
    },
    setGate(g) {
      page.classList.toggle('is-gate', !!g);
      const ps = g ? g.lines.map((t, i) => h('p', i === 0 ? 'lead' : '', t)) : [];
      if (g?.extra) ps.push(h('p', 'extra', g.extra));
      if (g?.note) ps.push(h('p', 'note', g.note));
      intro.replaceChildren(...ps);
    },
    setSound(on) {
      sound.textContent = on ? SOUND_ON : SOUND_OFF;
      sound.setAttribute('aria-pressed', String(on));
    },
    destroy() {
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
  onFrame?(v: SessionView, m: ScreenModel, e: { newStep: boolean; trade: Trade['side'] | null; holdMs: number }): void;
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
  const end = (r: RunResult) => {
    if (ended) return;
    ended = true;
    opts.onEnd(r);
  };

  function draw(raw: SessionView) {
    if (ended) return;
    // Borrowed money: leadAt measures an unborrowed player, so the counter is taken from the view itself.
    const v = opts.borrowed ? { ...raw, leadNow: Math.round(raw.balance) - Math.round(raw.marketBalance) } : raw;
    rendered = v;
    history.set(v.dayIndex, { balance: v.balance, invested: v.invested });
    let traded: Trade['side'] | null = null;
    if (v.invested !== lastInvested) {
      const at = pendingStep !== null ? steps[pendingStep].dayIndex : v.dayIndex;
      const side: Trade['side'] = v.invested ? 'buy' : 'sell';
      trades.push({ dayIndex: at, side });
      traded = side;
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
      soldLastTime: opts.soldLastTime, scoreToBeat: opts.scoreToBeat, other: opts.other, opening: opts.opening,
    });
    screen.render(m);
    const newStep = v.stepIndex !== lastFrameStep;
    lastFrameStep = v.stepIndex;
    try {
      opts.onFrame?.(v, m, { newStep, trade: traded, holdMs: steps[v.stepIndex]?.holdMs ?? 0 });
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
      ...m, status: STATUS_DEFAULT, big: false, worst: false, paper: paperFor({ lossFrac: 0, inCash: false, worstDay: false }),
      chart: { ...m.chart, worst: false }, deltaLabel: '',
      buttonLabel: START_LABEL, longLabel: false, regret: null, underButton: FOOTER_PLAY,
    });
  }

  return {
    ...session,
    teardown() {
      session.destroy();
      screen.destroy();
    },
  };
}

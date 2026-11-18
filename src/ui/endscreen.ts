// The result front page and its reveal (spec 6.6, 6.7, 6.8, 6.12, 8.2, 8.3, 9; mock-ups 4 and 6; R40, R44, R48, R49).
// Plain DOM. The lead wires the callbacks; this module only draws and times.
// R44: the whole page, buttons included, fits one screen. What does not fit is left out, extras first.
import {
  bestWinningStreakLine,
  CHALLENGE,
  COPIED,
  COPY_RESULT,
  dollars,
  DOUBLE_OR_NOTHING,
  FOOTER_RESULT,
  finishedLine,
  HOLDER_NOTE,
  KEEP_MY_WIN,
  leadLine,
  MASTHEAD,
  NEW_MYSTERY,
  perfectTimingPart,
  REMATCH,
  TAP_TO_REVEAL,
  aheadBehindLine,
  winsInRowLine,
  ASK_NO,
  ASK_TOMORROW,
  ASK_YES,
} from '../content/copy';
import type { RunKind, RunResult, VerdictId } from '../engine/types';
import type { Sfx } from '../fx/sound';
import { ladder } from '../game/streak';
import { load, save } from '../store/store';
import { announce } from './a11y';
import { CHART_W, endChart, marketInCash } from './endchart';
import { paperFor } from './paper';

// Strings this screen shows live in src/content/copy.ts; re-exported for existing importers.
export {
  LATE_EDITION, SCORE_TO_BEAT, YOUR_CHALLENGER, SOMEONE_WHO_DID_NOTHING, PERFECT_TIMING, YOU, DAILY_CRASH, PICK_A_CRASH, YOUR_COLLECTION, soundLabel, tradeNewsLabel, doubleStakeLine, potResultLine, challengerLine,
} from '../content/copy';
import {
  LATE_EDITION, SCORE_TO_BEAT, YOUR_CHALLENGER, SOMEONE_WHO_DID_NOTHING, PERFECT_TIMING, YOU, DAILY_CRASH, PICK_A_CRASH, YOUR_COLLECTION, soundLabel, tradeNewsLabel, doubleStakeLine, potResultLine, challengerLine,
} from '../content/copy';

export const REVEAL_AFTER_MS = 4000;
/** The beat between the crash's name printing and the score appearing (R44: the reveal is a moment). */
export const REVEAL_BEAT_MS = 450;
export const COUNT_MS = 1500;
const COUNT_STEP_MS = 30;
/** After the score appears, buttons ignore taps this long (they have just moved). */
const SETTLE_MS = 350;

export interface EndModel {
  run: { pickName: string; revealLine: string; kind: RunKind };
  /** Folio run label: "Mystery crash", "Rematch", "Borrowed money", "2008"... */
  modeLabel: string;
  result: RunResult;
  closes: number[];
  /** What the player, the holder and perfect timing started with (carried amount in a streak). Default 10000. */
  start?: number;
  verdictId?: VerdictId;
  verdict: { title: string; line: string; headline: string };
  nearMisses: string[];
  /** Real headlines for days the player traded (mystery runs). Only days that have a line. */
  tradeNews?: { side: 'sell' | 'buy'; real: string }[];
  /** A previous go at this crash (rematch) or a challenger's run, drawn dashed. */
  other?: { kind: 'previous' | 'challenger'; balances: number[]; final: number };
  /** Present only when the model offers double or nothing. `wins` counts this win; `net` is the streak's whole win (what banking adds). */
  double?: { net: number; final: number; wins: number };
  /** Wins in a row to print large after a win (defaults to double.wins); a banked streak keeps it. */
  wins?: number;
  /** After a loss: the best winning streak ever ended. Printed only when above 0 and there is no win to show. */
  bestStreak?: number;
  /** The pot is hidden this round (R40); the line is still here for when it comes back. */
  pot: { pot: number; tonight: number };
  showPot?: boolean;
  /** blind: the crash name waits behind the cover. again: the page is shown a second time (Back, Keep my win): no count, no sound. */
  flags: { blind: boolean; again?: boolean };
  /** Print the plain line about someone who did nothing under the table (R28: first result only). */
  holderNote?: boolean;
  /** Plain lines printed under the score, such as "4 days in a row" on a daily result. */
  extraLines?: string[];
  /** Replaces the verdict headline (bust: "Local investor loses the lot"; eighth rung). */
  headlineOverride?: string;
  /** The black-bordered front page for the eighth win in a row (6.8). */
  blackBorder?: boolean;
  sound?: { on: boolean };
  /** R69: one line, "Play again tomorrow?" with Yes and No; called with the answer, and the line goes. */
  ask?: (yes: boolean) => void;
  sfx?: Pick<Sfx, 'rise' | 'thud' | 'payout'>;
  actions: {
    onNewMystery: () => void;
    onRematch?: () => void;
    onChallenge?: () => void;
    onDouble?: () => void;
    onBank?: () => void;
    /** The daily crash waits for phase 2 (R47): main passes none while it is off. */
    onDaily?: () => void;
    onPick?: () => void;
    onCollection?: () => void;
    /** Returns the new state (true = on). */
    onToggleSound?: () => boolean;
    /** Daily crash: copy the short text result (spec 6.9). Resolves true when copied. */
    onCopyResult?: () => Promise<boolean>;
  };
}

const STYLE_ID = 'es-style';
const EASE = 'cubic-bezier(0.22,1,0.36,1)';
const SANS = "'Libre Franklin', Arial, sans-serif";

function css(p: ReturnType<typeof paperFor>): string {
  return `
.es{--bg:${p.bg};--ink:${p.ink};--sec:${p.secondary};--red:${p.accent};--soft:rgba(28,26,23,0.25);display:flex;flex-direction:column;min-height:calc(100dvh - 48px);padding-bottom:env(safe-area-inset-bottom);color:var(--ink);background:var(--bg);font-family:'Newsreader',Georgia,serif;font-variant-numeric:lining-nums tabular-nums}
.es ::selection{background:var(--ink);color:var(--bg)}
.es [data-trim],.es [hidden]{display:none!important}
:where(.es) button{font:inherit;color:inherit;background:none;border:0;border-radius:0;padding:0;margin:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
:where(.es) :is(p,h1,h2,ul){margin:0}
.es button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.es-black{outline:4px solid var(--ink);outline-offset:12px}
.es-mast{border-top:4px solid var(--ink);border-bottom:1px solid var(--ink);padding:8px 0 4px;text-align:center;font-weight:700;font-size:30px;line-height:1;letter-spacing:-0.02em}
.es-folio{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--ink);font-family:${SANS};font-weight:500;font-size:14px;line-height:1;color:var(--sec)}
.es-h1{margin-top:16px;font-weight:700;font-size:36px;line-height:0.98;letter-spacing:-0.02em;text-wrap:balance}
.es-verdict{margin-top:8px;font-size:18px;line-height:1.3;color:var(--sec)}
.es-verdict b{font-weight:700;color:var(--ink)}
.es-verdict.es-behind b{color:var(--red)}
.es-chart{display:block;width:100%;height:auto;margin-top:12px;padding:8px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);box-sizing:content-box;overflow:visible}
.es-chart-word{font-family:${SANS};font-weight:700;font-size:14px;paint-order:stroke;stroke:var(--bg);stroke-width:4px;stroke-linejoin:round}
.es-moment{margin-top:12px}
.es-name:focus{outline:none}
.es-cover{position:relative;display:flex;align-items:center;justify-content:center;width:100%;min-height:88px;padding:12px 16px;overflow:hidden;background:var(--ink);color:var(--bg);font-weight:700;font-size:26px;line-height:1.1;letter-spacing:-0.02em;text-align:center}
.es-cover i{position:absolute;left:0;right:0;bottom:0;height:4px;background:var(--red);transform-origin:left;transform:scaleX(0);animation:es-fill ${REVEAL_AFTER_MS}ms linear both}
@keyframes es-fill{to{transform:scaleX(1)}}
.es-name{font-weight:700;font-size:34px;line-height:1.02;letter-spacing:-0.025em;text-wrap:balance}
.es-name.es-wipe{animation:es-wipe 420ms ${EASE} both}
@keyframes es-wipe{from{clip-path:inset(0 100% 0 0);transform:translateY(6px)}to{clip-path:inset(0 0 0 0);transform:none}}
.es-name-sub{margin-top:4px;font-family:${SANS};font-weight:500;font-size:14px;line-height:1.35;color:var(--sec)}
.es-score{margin-top:8px}
.es[data-settling] button{pointer-events:none}
.es-news{font-family:${SANS};font-weight:500;font-size:14px;line-height:1.35;color:var(--sec)}
.es-news b{font-weight:700;color:var(--ink)}
.es-news+.es-news{margin-top:4px}
.es-newsbox:not(:empty){margin-bottom:8px}
.es-lead{font-weight:700;font-size:26px;line-height:1.08;letter-spacing:-0.02em}
.es-lead.es-behind{color:var(--red)}
.es-perfect{margin-top:4px;font-size:16px;line-height:1.3}
.es-vs{margin-top:4px;font-family:${SANS};font-weight:700;font-size:14px;line-height:1.35}
.es-best{margin-top:8px;font-family:${SANS};font-weight:700;font-size:16px;line-height:1.3}
.es-double{margin-top:12px;border-top:4px solid var(--ink);padding-top:8px}
.es-wins{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:12px}
.es-double h2{font-weight:700;font-size:30px;line-height:1.05;letter-spacing:-0.02em}
.es-title{font-family:${SANS};font-weight:700;font-size:14px;line-height:1.3;color:var(--sec)}
.es-stake{margin-top:4px;font-family:${SANS};font-weight:500;font-size:14px;line-height:1.35;color:var(--sec)}
.es-pair{display:flex;gap:12px;margin-top:12px}
.es-double .es-pair{margin-top:8px}
.es-pair button{flex:1 1 0;min-height:52px;padding:0 4px;font-family:${SANS};font-weight:700;font-size:16px;line-height:1.1;letter-spacing:-0.01em}
.es-main{background:var(--ink);color:var(--bg)}
.es-dbl{background:var(--red);color:#fbeee2}
.es-out{border:2px solid var(--ink)}
.es-link{display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;margin-top:4px;font-family:${SANS};font-weight:700;font-size:16px;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.es-table{margin-top:12px;font-family:${SANS};font-size:16px;line-height:1}
.es-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--soft);font-weight:500}
.es-row:last-child{border-bottom-color:var(--ink)}
.es-row-you{font-weight:700}
.es-key{display:inline-block;width:16px;margin-right:8px;vertical-align:middle;border-top:2.5px solid var(--ink)}
.es-key-dash{border-top:2px dashed #6b6558}
.es-note{margin-top:8px;font-family:${SANS};font-weight:500;font-size:14px;line-height:1.35;color:var(--sec)}
.es-misses{list-style:none;padding:0;margin-top:12px;border-top:1px solid var(--soft)}
.es-misses li{padding:8px 0;border-bottom:1px solid var(--soft);font-family:${SANS};font-weight:500;font-size:14px;line-height:1.3}
.es-grow{flex-grow:1;min-height:8px}
.es-ask{display:flex;align-items:center;gap:16px;font-family:${SANS};font-weight:500;font-size:14px;line-height:1.3;color:var(--sec)}
.es-ask span{margin-right:auto}
.es-ask button{min-width:44px;min-height:44px;font-weight:700;color:var(--ink);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.es-pot{margin-top:8px;padding-top:8px;border-top:1px solid var(--ink);font-family:${SANS};font-weight:700;font-size:14px;line-height:1.35}
.es-foot{display:flex;flex-wrap:wrap;column-gap:20px;border-top:1px solid var(--ink)}
.es-foot button{min-height:44px;font-family:${SANS};font-weight:500;font-size:14px;color:var(--sec);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.es-footer{font-family:${SANS};font-weight:500;font-size:14px;line-height:1.35;color:var(--sec)}
.es :is(.es-verdict,.es-news,.es-perfect,.es-stake,.es-vs,.es-misses li,.es-pot,.es-name-sub){text-wrap:pretty}
@media (max-height: 700px){
  .es-mast{padding:4px 0 2px;font-size:22px}
  .es-folio{padding:4px 0}
  .es-h1{margin-top:6px;font-size:26px}
  .es-verdict{margin-top:4px;font-size:16px}
  .es-chart{margin-top:6px;padding:2px 0}
  .es-moment{margin-top:6px}
  .es-grow{min-height:0}
  .es-cover{min-height:72px;font-size:24px}
  .es-name{font-size:28px}
  .es-lead{font-size:24px}
  .es-double{margin-top:8px;padding-top:4px}
  .es-double h2{font-size:28px}
  .es-pair{margin-top:8px}
  .es-pair button{min-height:48px}
  .es-link{margin-top:0}
}
/* Hover colours only where there is a pointer that hovers: on phones :hover sticks after a tap. */
@media (hover: hover){.es-cover:hover{background:#3a362f}.es-main:hover{background:#3a362f}.es-dbl:hover{background:#8f0f22}.es-out:hover{background:rgba(28,26,23,0.06)}.es-link:hover{color:var(--red)}.es-foot button:hover{color:var(--ink)}}
@media (prefers-reduced-motion: reduce){.es-name.es-wipe{animation:none}.es-cover i{display:none}}
`;
}

const SEEN_HOLDER_NOTE = 'seenHolderNote';

/**
 * Whether this result should explain "someone who did nothing": the first result on this phone,
 * and every result when storage is unavailable. Marks it seen.
 */
export function holderNoteDue(): boolean {
  if (load<boolean>(SEEN_HOLDER_NOTE, false) === true) return false;
  save(SEEN_HOLDER_NOTE, true); // when this fails, the next result explains again
  return true;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(cls: string, text: string, on?: () => void): HTMLButtonElement {
  const b = h('button', cls, text);
  b.type = 'button';
  if (on) b.addEventListener('click', () => on());
  return b;
}

/** cubic-bezier(0.22,1,0.36,1): the one easing curve (spec 9). */
function ease(t: number): number {
  const [x1, y1, x2, y2] = [0.22, 1, 0.36, 1];
  const bx = (s: number) => 3 * (1 - s) ** 2 * s * x1 + 3 * (1 - s) * s * s * x2 + s ** 3;
  const by = (s: number) => 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s * s * y2 + s ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < t) lo = mid;
    else hi = mid;
  }
  return by((lo + hi) / 2);
}

function matches(query: string): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** In-app browsers show about 660px. */
const shortViewport = () => matches('(max-height: 700px)');
/**
 * The result chart's least height (R58): 100 px of line at 390 x 660 inside endchart's top and bottom margins
 * (20 + 20), 120 px on taller screens. Room the page does not need goes to the chart too, up to CHART_MAX.
 */
const chartMinHeight = () => (shortViewport() ? 140 : 160);
/**
 * When the foot links (Pick a crash, Your collection, Sound) do not fit beside that, the chart may come down
 * to this to keep them: still 100 px tall or more, so tighter chart margins keep about 100 px of line.
 */
const chartFloor = () => (shortViewport() ? 124 : 112);
const CHART_MAX = 260;
const reducedMotion = () => matches('(prefers-reduced-motion: reduce)');

/** The lead line: the final one at the end of the count; on the way, the final's words ("ahead"/"behind") at every figure, $0 included. */
function leadText(value: number, finalLead: number): string {
  if (value === finalLead) return leadLine(finalLead);
  // Never "$0" on the way: the count starts at $1.
  return aheadBehindLine(Math.max(1, Math.abs(Math.round(value))), Math.round(finalLead) < 0);
}

/** The reveal in two parts: the name, large ("That was 2008"), and any second sentence under it. */
function revealParts(line: string): { name: string; rest: string } {
  const i = line.indexOf('. ');
  if (i < 0) return { name: line.replace(/\.$/, ''), rest: '' };
  return { name: line.slice(0, i), rest: line.slice(i + 2) };
}

export function mountEndScreen(root: HTMLElement, model: EndModel): { destroy(): void } {
  const paper = paperFor({ lossFrac: 0, inCash: false, worstDay: false });
  const start = model.start ?? 10000;
  const { result, actions } = model;
  const behind = Math.round(result.lead) < 0;
  const won = Math.round(result.lead) > 0;

  if (!document.getElementById(STYLE_ID)) {
    const style = h('style');
    style.id = STYLE_ID;
    style.textContent = css(paper);
    document.head.appendChild(style);
  }

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  let destroyed = false;

  /** Elements left out first when the page does not fit the screen, in that order (see fit). */
  const trimmable: HTMLElement[] = [];
  const optional = <T extends HTMLElement>(e: T, rank: number): T => {
    e.setAttribute('data-trimmable', String(rank));
    trimmable.push(e);
    return e;
  };

  const page = h('main', 'es' + (model.blackBorder ? ' es-black' : ''));
  // The live region still holds the play screen's last words: a result page starts it empty.
  announce('');

  page.appendChild(h('div', 'es-mast', MASTHEAD));

  const folio = h('div', 'es-folio');
  folio.appendChild(h('span', '', model.modeLabel));
  folio.appendChild(h('span', '', LATE_EDITION));
  page.appendChild(folio);

  page.appendChild(h('h1', 'es-h1', model.headlineOverride ?? model.verdict.headline));

  const verdict = h('p', 'es-verdict' + (behind ? ' es-behind' : ''));
  verdict.appendChild(h('b', '', `${model.verdict.title}.`));
  verdict.appendChild(optional(h('span', '', ` ${model.verdict.line}.`), 5));
  page.appendChild(verdict);

  const sold = result.trades.filter((t) => t.side === 'sell').length;
  const bought = result.trades.filter((t) => t.side === 'buy').length;
  const otherName = model.other ? (model.other.kind === 'challenger' ? YOUR_CHALLENGER : SCORE_TO_BEAT) : '';
  const chartLabel =
    `Chart of the market price through the whole run; you finished with ${dollars(result.final)} from ${dollars(start)}. ` +
    (sold === 0
      ? 'You never sold.'
      : `You sold ${sold === 1 ? 'once' : `${sold} times`} and bought back ${bought === 1 ? 'once' : `${bought} times`}; dots on the price line mark each sale and buy.`);
  const chartInput = {
    balances: result.balances,
    trades: result.trades,
    start,
    other: model.other?.balances,
    label: chartLabel,
    ink: paper.ink,
    red: paper.accent,
    paper: paper.bg,
    market: marketInCash(result.balances, result.trades, model.closes),
    closes: model.closes,
  };
  const chartMin = chartMinHeight();
  let chartH = chartMin;
  let chartEl: SVGSVGElement | HTMLElement = endChart({ ...chartInput, height: chartH });
  page.appendChild(chartEl);

  // The moment (R44): on a blind page a large "Tap to see what that was" stands where the name and the
  // score will print. The name comes first, in big type; the score a beat later.
  const moment = h('div', 'es-moment');
  page.appendChild(moment);
  const parts = revealParts(model.run.revealLine);

  // The score block (trade headlines, the lead, perfect timing and the lines under it) stays out of the
  // page until the reveal: real headlines name the crash and the score gives the ending away.
  const score = h('div', 'es-score');
  score.hidden = true;
  page.appendChild(score);
  const news = (model.tradeNews ?? []).filter((n) => n.real);
  const newsBox = optional(h('div', 'es-newsbox'), 3);
  score.appendChild(newsBox);
  const printNews = () => {
    for (const n of news) {
      const p = h('p', 'es-news');
      p.appendChild(h('b', '', tradeNewsLabel(n.side)));
      p.appendChild(document.createTextNode(` ${n.real}`));
      newsBox.appendChild(p);
    }
  };

  // Figures that give the score away (the table's money, money near misses) keep their space but stay
  // hidden until the reveal, so nothing moves when they show.
  const secret: HTMLElement[] = [];
  const hideUntilReveal = (e: HTMLElement) => {
    if (!model.flags.blind) return e;
    e.style.visibility = 'hidden';
    secret.push(e);
    return e;
  };
  const table = optional(h('div', 'es-table'), 2);
  const row = (label: string, value: number, cls = '', key?: 'solid' | 'dash') => {
    const r = h('div', 'es-row ' + cls);
    const l = h('span');
    if (key) {
      const k = h('span', key === 'dash' ? 'es-key es-key-dash' : 'es-key');
      k.setAttribute('aria-hidden', 'true');
      l.appendChild(k);
    }
    l.appendChild(document.createTextNode(label));
    r.appendChild(l);
    r.appendChild(hideUntilReveal(h('span', '', dollars(value))));
    table.appendChild(r);
  };
  row(YOU, result.final, 'es-row-you', model.other ? 'solid' : undefined);
  if (model.other) row(otherName, model.other.final, '', 'dash');
  row(SOMEONE_WHO_DID_NOTHING, result.holderFinal);
  row(PERFECT_TIMING, result.perfectFinal);

  const lead = h('p', 'es-lead' + (behind ? ' es-behind' : ''), leadText(result.lead, result.lead));
  lead.setAttribute('data-lead', '');
  score.appendChild(lead);
  // The last to go, and only on a very short screen: the lead above says the score.
  // "You finished with $N" (R49) always stays: it ties the result to the last balance of the play screen.
  const perfect = h('p', 'es-perfect');
  perfect.appendChild(optional(h('span', '', `${perfectTimingPart(result.perfectFinal)} `), 9));
  perfect.appendChild(document.createTextNode(finishedLine(result.final)));
  score.appendChild(perfect);
  if (model.other?.kind === 'challenger') {
    score.appendChild(optional(h('p', 'es-vs', challengerLine(result.final, model.other.final)), 8));
  }
  for (const line of model.extraLines ?? []) score.appendChild(optional(h('p', 'es-vs', line), 8));

  // After a win, "Wins in a row: N" large with its title, and double or nothing under it (R44).
  // After anything else, the best winning streak, when there has been one.
  const wins = model.double?.wins ?? model.wins ?? 0;
  let winBlock: HTMLElement | null = null;
  if (wins > 0) {
    const block = h('section', 'es-double');
    const head = h('div', 'es-wins');
    head.appendChild(h('h2', '', winsInRowLine(wins)));
    const title = ladder(wins).title;
    if (title) head.appendChild(h('p', 'es-title', title));
    block.appendChild(head);
    if (model.double) {
      const d = model.double;
      block.appendChild(optional(h('p', 'es-stake', doubleStakeLine(d.net, d.final)), 4));
      const pair = h('div', 'es-pair');
      pair.appendChild(button('es-dbl', DOUBLE_OR_NOTHING, actions.onDouble));
      pair.appendChild(button('es-out', KEEP_MY_WIN, actions.onBank));
      block.appendChild(pair);
    }
    winBlock = block;
  } else if (!won && (model.bestStreak ?? 0) > 0) {
    score.appendChild(h('p', 'es-best', bestWinningStreakLine(model.bestStreak!)));
  }
  // Only a win has this block, so on a blind page it is not even there (no space kept: a gap would be
  // a tell) until the reveal, when it is put in place and slides in; the tap guard covers the move.
  if (winBlock && !model.flags.blind) page.appendChild(winBlock);
  // The spare room sits above the buttons: the score (and a win's block) fill it at the reveal, so the
  // buttons and everything under them stay where they are.
  const grow = h('div', 'es-grow');
  page.appendChild(grow);

  const pair = h('div', 'es-pair');
  // R24: with the double block, its red button is the only filled one.
  // A blind page keeps Rematch filled until the reveal brings the double block (an outline would be a tell).
  const outlined = !!model.double && !model.flags.blind;
  let rematchButton: HTMLButtonElement | null = null;
  if (actions.onRematch) {
    rematchButton = button(outlined ? 'es-out' : 'es-main', REMATCH, actions.onRematch);
    pair.appendChild(rematchButton);
  }
  if (actions.onChallenge) pair.appendChild(button('es-out', CHALLENGE, actions.onChallenge));
  if (actions.onCopyResult) {
    const copyFn = actions.onCopyResult;
    const b = button('es-out', COPY_RESULT);
    b.addEventListener('click', () => {
      void copyFn().then((ok) => {
        if (ok) b.textContent = COPIED;
      });
    });
    pair.appendChild(b);
  }
  if (pair.childElementCount) page.appendChild(pair);
  // With double or nothing on offer the choice is double or bank; "Play a new mystery crash" (which banks)
  // comes back once the win is banked. On a blind page it stays until the reveal (no tell).
  const newLink = button('es-link', NEW_MYSTERY, actions.onNewMystery);
  page.appendChild(newLink);
  // R69: never left out to fit (it is asked once); answered, it goes and the page refits.
  if (model.ask) {
    const answer = model.ask;
    const ask = h('div', 'es-ask');
    ask.appendChild(h('span', '', ASK_TOMORROW));
    for (const [label, yes] of [[ASK_YES, true], [ASK_NO, false]] as const) {
      ask.appendChild(
        button('', label, () => {
          ask.remove();
          answer(yes);
          refit();
        }),
      );
    }
    page.appendChild(ask);
  }

  // R28: the table and the near misses come after the buttons; on a short screen they are left out.
  page.appendChild(table);
  if (model.holderNote) page.appendChild(optional(h('p', 'es-note', HOLDER_NOTE), 1));
  if (model.nearMisses.length) {
    const ul = optional(h('ul', 'es-misses'), 0);
    // A near miss with a figure in it ("perfect timing made $N") gives the score away: it waits too.
    for (const m of model.nearMisses) ul.appendChild(m.includes('$') ? hideUntilReveal(h('li', '', m)) : h('li', '', m));
    page.appendChild(ul);
  }

  if (model.showPot) page.appendChild(hideUntilReveal(h('p', 'es-pot', potResultLine(model.pot.pot, model.pot.tonight))));

  // The foot links are the last extra to go: only when the buttons (a win's double-or-keep choice) need the room.
  const links = optional(h('div', 'es-foot'), 10);
  if (actions.onDaily) links.appendChild(button('', DAILY_CRASH, actions.onDaily));
  if (actions.onPick) links.appendChild(button('', PICK_A_CRASH, actions.onPick));
  if (actions.onCollection) links.appendChild(button('', YOUR_COLLECTION, actions.onCollection));
  if (model.sound && actions.onToggleSound) {
    const fn = actions.onToggleSound;
    const b = button('', soundLabel(model.sound.on));
    b.setAttribute('aria-pressed', String(model.sound.on));
    b.addEventListener('click', () => {
      const on = fn();
      b.textContent = soundLabel(on);
      b.setAttribute('aria-pressed', String(on));
    });
    links.appendChild(b);
  }
  if (links.childElementCount) page.appendChild(links);
  page.appendChild(h('p', 'es-footer', FOOTER_RESULT));

  // While the page settles after the reveal, taps on buttons do nothing (they have just moved).
  page.addEventListener(
    'click',
    (e) => {
      if (!page.hasAttribute('data-settling')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    true,
  );
  root.replaceChildren(page);

  /**
   * One screen (R44): when the page is taller than the window, the extras are left out. Each is put
   * back in rank order, highest first, and kept only if the page still fits, so a small extra can stay
   * where a bigger, higher one could not. Buttons, the score and the name are never left out.
   */
  const fit = () => {
    if (destroyed) return;
    // Laid out at its least height first: the extras are fitted around that, then the chart takes the room left.
    const w = chartEl.getBoundingClientRect().width;
    const scale = w > 0 ? w / CHART_W : 1;
    let least = chartMin;
    chartEl.style.height = `${least * scale}px`;
    let over = trim();
    if (links.hasAttribute('data-trim') && links.childElementCount) {
      least = chartFloor();
      chartEl.style.height = `${least * scale}px`;
      over = trim();
      if (links.hasAttribute('data-trim')) {
        least = chartMin;
        chartEl.style.height = `${least * scale}px`;
        over = trim();
      }
    }
    // Still over with every extra out (R69's question takes a line it never gives up): the chart comes down to its floor.
    if (over) {
      least = chartFloor();
      chartEl.style.height = `${least * scale}px`;
      trim();
    }
    const spare = Math.max(0, grow.getBoundingClientRect().height - (parseFloat(getComputedStyle(grow).minHeight) || 0));
    const H = Math.min(CHART_MAX, Math.max(least, Math.floor(least + spare / scale)));
    chartEl.style.height = '';
    if (H !== chartH) {
      chartH = H;
      const next = endChart({ ...chartInput, height: H });
      chartEl.replaceWith(next);
      chartEl = next;
    }
  };
  const trim = () => {
    // Over when the window scrolls, or when the page outgrows its own least height (the column's bottom
    // padding would hide that from the scroll height, but the spare room above the buttons is gone then).
    const least = parseFloat(getComputedStyle(page).minHeight);
    const over = () =>
      document.documentElement.scrollHeight > window.innerHeight + 0.5 ||
      (least > 0 && page.getBoundingClientRect().height > least + 0.5);
    for (const e of trimmable) e.removeAttribute('data-trim');
    if (!over()) return false;
    const ranked = trimmable
      .slice()
      .sort((a, b) => Number(b.getAttribute('data-trimmable')) - Number(a.getAttribute('data-trimmable')));
    for (const e of ranked) e.setAttribute('data-trim', '');
    for (const e of ranked) {
      e.removeAttribute('data-trim');
      if (over()) e.setAttribute('data-trim', '');
    }
    return over();
  };
  /**
   * The name's height in the moment, measured off to the side (a focused cover keeps its focus). Before
   * the reveal the page is fitted with the name in place of the taller cover: the cover's extra height
   * comes out of the room the score fills, and the buttons under it stay put.
   */
  const nameHeight = (): number => {
    const probe = h('div', 'es-moment');
    probe.style.cssText = `position:absolute;visibility:hidden;margin:0;width:${moment.getBoundingClientRect().width}px`;
    probe.append(...nameNodes(false));
    page.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  };
  let revealed = false;
  /**
   * Before the reveal: fit as the page will be once revealed (the score and any win block laid out,
   * unseen), so nothing that shows now has to vanish when the score arrives.
   */
  let scoreShown = false;
  const refit = () => {
    if (scoreShown || destroyed) return fit();
    const nameH = revealed ? 0 : nameHeight();
    if (nameH > 0) {
      moment.style.height = `${nameH}px`;
      moment.style.overflow = 'hidden';
    }
    const insertWin = !!winBlock && !winBlock.isConnected;
    score.hidden = false;
    score.style.visibility = 'hidden';
    if (insertWin) {
      winBlock!.style.visibility = 'hidden';
      score.after(winBlock!);
    }
    if (model.double) newLink.hidden = true;
    printNews();
    fit();
    moment.style.height = '';
    moment.style.overflow = '';
    newsBox.replaceChildren();
    score.hidden = true;
    score.style.visibility = '';
    if (insertWin) {
      winBlock!.remove();
      winBlock!.style.visibility = '';
    }
    newLink.hidden = false;
  };
  const onResize = () => refit();
  window.addEventListener('resize', onResize);

  // The score counts to the lead over about 1.5 s (spec 6.6), at once with reduced motion.
  const count = () => {
    const target = result.lead;
    const up = Math.round(target) > 0;
    const down = Math.round(target) < 0;
    // Shown again (Back from a menu, Keep my win): the figure is known, so no count and no sound.
    if (model.flags.again) {
      lead.textContent = leadText(target, target);
      return;
    }
    if (reducedMotion() || Math.round(target) === 0) {
      lead.textContent = leadText(target, target);
      if (up) model.sfx?.payout(true);
      if (down) model.sfx?.thud();
      return;
    }
    lead.textContent = leadText(0, target);
    if (down) model.sfx?.thud();
    const steps = Math.round(COUNT_MS / COUNT_STEP_MS);
    let i = 0;
    const step = () => {
      i++;
      const p = i / steps;
      lead.textContent = leadText(target * ease(Math.min(1, p)), target);
      if (up && i % 5 === 0) model.sfx?.rise(p);
      if (i < steps) {
        later(step, COUNT_STEP_MS);
        return;
      }
      if (up) model.sfx?.payout(true);
    };
    later(step, COUNT_STEP_MS);
  };

  const nameNodes = (animate: boolean): HTMLElement[] => {
    const name = h('p', 'es-name' + (animate ? ' es-wipe' : ''), parts.name);
    const nodes: HTMLElement[] = [name];
    if (parts.rest) nodes.push(h('p', 'es-name-sub', parts.rest));
    return nodes;
  };
  const printName = (animate: boolean) => {
    // A keyboard or screen reader user on the cover lands on the name, not on <body>, when the cover goes.
    const hadFocus = !!document.activeElement && moment.contains(document.activeElement);
    const nodes = nameNodes(animate);
    moment.replaceChildren(...nodes);
    if (hadFocus) {
      nodes[0].setAttribute('tabindex', '-1');
      nodes[0].focus({ preventScroll: true });
    }
  };

  const showScore = (animate: boolean) => {
    if (destroyed) return;
    scoreShown = true;
    printNews();
    score.hidden = false;
    for (const e of secret) e.style.visibility = '';
    if (model.double) newLink.remove();
    if (winBlock && model.flags.blind) {
      score.after(winBlock);
      if (rematchButton && model.double) rematchButton.className = 'es-out';
      if (animate && typeof winBlock.animate === 'function') {
        winBlock.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], {
          duration: 320, easing: EASE,
        });
      }
    }
    // The score pushes the buttons down: for a moment a tap meant for where a button was does nothing.
    if (animate) {
      page.setAttribute('data-settling', '');
      later(() => page.removeAttribute('data-settling'), SETTLE_MS);
    }
    fit();
    count();
  };

  const reveal = (tapped: boolean) => {
    if (revealed || destroyed) return;
    revealed = true;
    const animate = tapped && !reducedMotion();
    printName(animate);
    // One announcement for the reveal.
    announce(`${model.run.revealLine} ${leadText(result.lead, result.lead)}.`);
    if (animate) {
      page.setAttribute('data-settling', '');
      later(() => showScore(true), REVEAL_BEAT_MS);
    } else {
      showScore(false);
    }
  };

  if (model.flags.blind) {
    const cover = button('es-cover', TAP_TO_REVEAL, () => reveal(true));
    // A thin line fills under the words over the 4 s before the page shows it anyway.
    const bar = h('i');
    bar.setAttribute('aria-hidden', 'true');
    cover.appendChild(bar);
    moment.appendChild(cover);
    later(() => reveal(true), REVEAL_AFTER_MS);
  } else {
    printName(false);
    showScore(false);
  }
  refit();
  // Webfonts can change line breaks after the first layout.
  try {
    void document.fonts?.ready.then(() => refit());
  } catch {
    /* no font loading API */
  }

  return {
    destroy() {
      destroyed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      window.removeEventListener('resize', onResize);
      root.replaceChildren();
      document.getElementById(STYLE_ID)?.remove();
    },
  };
}

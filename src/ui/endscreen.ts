// The result front page and its reveal (spec 6.6, 6.7, 6.8, 6.12, 8.2, 8.3, 9; mock-ups 4 and 6).
// Plain DOM. The lead wires the callbacks; this module only draws and times.
import {
  bankLabel,
  BORROWED_ON,
  CHALLENGE,
  COPIED,
  COPY_RESULT,
  dollars,
  DOUBLE_OR_NOTHING,
  FOOTER_RESULT,
  HOLDER_NOTE,
  leadLine,
  MASTHEAD,
  NEW_MYSTERY,
  nextMysteryLine,
  PLAY_BORROWED,
  perfectLine,
  REMATCH,
  TAP_TO_REVEAL,
  WINS_IN_A_ROW,
} from '../content/copy';
import type { RunKind, RunResult, VerdictId } from '../engine/types';
import type { Sfx } from '../fx/sound';
import { ladder, RUNG_TITLES } from '../game/streak';
import { load, save } from '../store/store';
import { announce } from './a11y';
import { endChart } from './endchart';
import { paperFor } from './paper';

// Strings this screen shows live in src/content/copy.ts; re-exported for existing importers.
export {
  LATE_EDITION, SCORE_TO_BEAT, YOUR_CHALLENGER, SOMEONE_WHO_DID_NOTHING, PERFECT_TIMING, YOU, DAILY_CRASH, PICK_A_CRASH, YOUR_COLLECTION, soundLabel, vibrationLabel, tradeNewsLabel, doubleStakeLine, potResultLine, challengerLine,
} from '../content/copy';
import {
  LATE_EDITION, SCORE_TO_BEAT, YOUR_CHALLENGER, SOMEONE_WHO_DID_NOTHING, PERFECT_TIMING, YOU, DAILY_CRASH, PICK_A_CRASH, YOUR_COLLECTION, soundLabel, vibrationLabel, tradeNewsLabel, doubleStakeLine, potResultLine, challengerLine,
} from '../content/copy';

export const REVEAL_AFTER_MS = 4000;
export const COUNT_MS = 1500;
const COUNT_STEP_MS = 30;
export const COUNTDOWN_FROM = 10;

export interface EndModel {
  run: { pickName: string; revealLine: string; kind: RunKind };
  /** Folio run label: "Mystery crash", "Daily crash 12", "Rematch", "Borrowed money", "2008"... */
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
  /** Present only when the model offers double or nothing. `wins` counts this win. */
  double?: { lead: number; final: number; wins: number };
  pot: { pot: number; tonight: number };
  flags: { showCountdown: boolean; blind: boolean };
  /** Print the plain line about someone who did nothing under the table (R28: first result only). */
  holderNote?: boolean;
  /** Plain lines printed under the score, such as "4 days in a row" on a daily result. */
  extraLines?: string[];
  /** Replaces the verdict headline (bust: "Local investor loses the lot"; eighth rung). */
  headlineOverride?: string;
  /** The black-bordered front page for the eighth win in a row (6.8). */
  blackBorder?: boolean;
  sound?: { on: boolean };
  vibration?: { on: boolean };
  /** The borrowed money switch, once unlocked (spec 6.13). */
  borrowed?: { on: boolean };
  sfx?: Pick<Sfx, 'rise' | 'thud' | 'payout'>;
  actions: {
    onNewMystery: () => void;
    onRematch?: () => void;
    onChallenge?: () => void;
    onDouble?: () => void;
    onBank?: () => void;
    onDaily?: () => void;
    onPick?: () => void;
    onCollection?: () => void;
    /** Returns the new state (true = on). */
    onToggleSound?: () => boolean;
    onToggleVibration?: () => boolean;
    onToggleBorrowed?: () => boolean;
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
:where(.es) button{font:inherit;color:inherit;background:none;border:0;border-radius:0;padding:0;margin:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
:where(.es) :is(p,h1,h2,ul){margin:0}
.es button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.es-black{outline:4px solid var(--ink);outline-offset:12px}
.es-mast{border-top:4px solid var(--ink);border-bottom:1px solid var(--ink);padding:8px 0 4px;text-align:center;font-weight:700;font-size:30px;line-height:1;letter-spacing:-0.02em}
.es-folio{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;column-gap:12px;row-gap:4px;padding:8px 0;border-bottom:1px solid var(--ink);font-family:${SANS};font-weight:500;font-size:12px;line-height:1;color:var(--sec)}
.es-folio-long .es-reveal{flex-basis:100%;line-height:1.35}
.es-cover{display:flex;align-items:center;min-height:44px;margin:-14px 0}
.es-cover span{display:block;padding:4px 8px;background:var(--ink);color:var(--bg);font-weight:700;font-size:12px;line-height:1}
.es-cover:hover span{background:var(--red)}
.es-name{display:inline-block;color:var(--ink);font-weight:700}
.es-name.es-wipe{animation:es-wipe 420ms ${EASE} both}
@keyframes es-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
.es-newsbox{min-height:var(--news-h,0px)}
.es-h1{margin-top:20px;font-weight:700;font-size:40px;line-height:0.98;letter-spacing:-0.02em;text-wrap:balance}
.es-verdict{margin-top:8px;font-size:18px;line-height:1.3;color:var(--sec)}
.es-verdict b{font-weight:700;color:var(--ink)}
.es-verdict.es-behind b{color:var(--red)}
.es-chart{display:block;width:100%;height:auto;margin-top:16px;padding:8px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);box-sizing:content-box;overflow:visible}
.es-chart-word{font-family:${SANS};font-weight:700;font-size:12px;paint-order:stroke;stroke:var(--bg);stroke-width:4px;stroke-linejoin:round}
.es-news{margin-top:8px;font-family:${SANS};font-weight:500;font-size:13px;line-height:1.35;color:var(--sec)}
.es-news b{font-weight:700;color:var(--ink)}
.es-news+.es-news{margin-top:2px}
.es-table{margin-top:12px;font-family:${SANS};font-size:16px;line-height:1}
.es-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--soft);font-weight:500}
.es-row:last-child{border-bottom-color:var(--ink)}
.es-row-you{font-weight:700}
.es-key{display:inline-block;width:16px;margin-right:8px;vertical-align:middle;border-top:2.5px solid var(--ink)}
.es-key-dash{border-top:2px dashed #6b6558}
.es-note{margin-top:8px;font-family:${SANS};font-weight:500;font-size:13px;line-height:1.35;color:var(--sec)}
.es-lead{margin-top:16px;font-weight:700;font-size:28px;line-height:1.05;letter-spacing:-0.02em}
.es-lead.es-behind{color:var(--red)}
.es-perfect{margin-top:8px;font-size:18px;line-height:1.3}
.es-vs{margin-top:8px;font-family:${SANS};font-weight:700;font-size:14px;line-height:1.35}
.es-misses{list-style:none;padding:0;margin-top:16px;border-top:1px solid var(--soft)}
.es-misses li{padding:8px 0;border-bottom:1px solid var(--soft);font-family:${SANS};font-weight:500;font-size:14px;line-height:1.3}
.es-grow{flex-grow:1;min-height:32px}
.es-double{border-top:4px solid var(--ink);padding-top:12px;margin-bottom:32px}
.es-double h2{font-weight:700;font-size:28px;line-height:1.05;letter-spacing:-0.02em}
.es-stake{margin-top:8px;font-size:16px;line-height:1.35;color:var(--sec)}
.es-ladder-label{margin-top:16px;font-family:${SANS};font-weight:700;font-size:12px;line-height:1}
.es-ladder{list-style:none;padding:0;margin-top:8px;display:grid;grid-template-columns:repeat(5,1fr);column-gap:4px}
.es-rung{font-family:${SANS};font-weight:500;font-size:12px;line-height:1.2;color:var(--sec)}
.es-rung i{font-style:normal;display:flex;align-items:center;justify-content:center;width:28px;height:28px;margin-bottom:4px;box-sizing:border-box;font-family:'Newsreader',Georgia,serif;font-weight:500;font-size:18px;color:var(--sec)}
.es-rung[data-rung=reached]{color:var(--ink)}
.es-rung[data-rung=reached] i{background:var(--ink);color:var(--bg);font-weight:700}
.es-rung[data-rung=next]{color:var(--ink);font-weight:700}
.es-rung[data-rung=next] i{color:var(--ink);font-weight:700;border-bottom:2px solid var(--ink)}
.es-pair{display:flex;gap:12px;margin-top:16px}
.es-pair button{flex:1 1 0;min-height:56px;padding:0 4px;font-family:${SANS};font-weight:700;font-size:16px;line-height:1.1;letter-spacing:-0.01em}
.es-main{background:var(--ink);color:var(--bg)}
.es-main:hover{background:#3a362f}
.es-dbl{background:var(--red);color:#fbeee2}
.es-dbl:hover{background:#8f0f22}
.es-out{border:2px solid var(--ink)}
.es-out:hover{background:rgba(28,26,23,0.06)}
.es-link{display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;margin-top:4px;font-family:${SANS};font-weight:700;font-size:14px;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.es-link:hover{color:var(--red)}
.es-count{display:flex;align-items:center;width:100%;min-height:44px;margin-top:4px;text-align:left;font-family:${SANS};font-weight:700;font-size:14px;line-height:1.3;color:var(--ink)}
.es-pot{margin-top:8px;padding-top:8px;border-top:1px solid var(--ink);font-family:${SANS};font-weight:700;font-size:14px;line-height:1.35}
.es-foot{display:flex;flex-wrap:wrap;column-gap:16px}
.es-foot button{min-height:44px;font-family:${SANS};font-weight:500;font-size:13px;color:var(--sec);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.es-foot button:hover{color:var(--ink)}
.es-foot+.es-foot{margin-top:-8px}
.es-footer{margin-top:4px;font-family:${SANS};font-weight:500;font-size:12px;line-height:1.35;color:var(--sec)}
.es :is(.es-verdict,.es-news,.es-perfect,.es-stake,.es-vs,.es-misses li,.es-pot){text-wrap:pretty}
@media (max-height: 700px){.es-h1{margin-top:12px;font-size:34px}.es-chart{margin-top:8px}.es-row{padding:6px 0}.es-lead{margin-top:12px}.es-perfect{font-size:16px}}
@media (prefers-reduced-motion: reduce){.es-name.es-wipe{animation:none}}
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

/** In-app browsers show about 660px: draw a shorter chart so the score is above the fold. */
function shortViewport(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-height: 700px)').matches;
  } catch {
    return false;
  }
}

function reducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The lead line with the final sign kept while the count passes through zero. */
function leadText(value: number, finalLead: number): string {
  return leadLine(finalLead < 0 ? Math.min(value, -1e-9) : Math.max(value, 0));
}

/** The folio's reveal text: one-sentence lines lose their full stop ("That was 2008"). */
function revealText(line: string): string {
  const parts = line.split('. ').length;
  return parts === 1 ? line.replace(/\.$/, '') : line;
}

export function mountEndScreen(root: HTMLElement, model: EndModel): { destroy(): void } {
  const paper = paperFor({ lossFrac: 0, inCash: false, worstDay: false });
  const start = model.start ?? 10000;
  const { result, actions } = model;
  const behind = Math.round(result.lead) < 0;

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

  const page = h('main', 'es' + (model.blackBorder ? ' es-black' : ''));

  page.appendChild(h('div', 'es-mast', MASTHEAD));

  // Folio: run label, "Late edition", the reveal.
  const name = revealText(model.run.revealLine);
  const folio = h('div', 'es-folio' + (name.length > 22 ? ' es-folio-long' : ''));
  folio.appendChild(h('span', '', model.modeLabel));
  folio.appendChild(h('span', '', LATE_EDITION));
  const revealSlot = h('span', 'es-reveal');
  folio.appendChild(revealSlot);
  page.appendChild(folio);

  page.appendChild(h('h1', 'es-h1', model.headlineOverride ?? model.verdict.headline));

  const verdict = h('p', 'es-verdict' + (behind ? ' es-behind' : ''));
  verdict.appendChild(h('b', '', `${model.verdict.title}.`));
  verdict.appendChild(document.createTextNode(` ${model.verdict.line}.`));
  page.appendChild(verdict);

  const sold = result.trades.filter((t) => t.side === 'sell').length;
  const bought = result.trades.filter((t) => t.side === 'buy').length;
  const otherName = model.other ? (model.other.kind === 'challenger' ? YOUR_CHALLENGER : SCORE_TO_BEAT) : '';
  const chartLabel =
    `Chart of your balance through the whole run, from ${dollars(start)} to ${dollars(result.final)}. ` +
    (sold === 0 ? 'You never sold.' : `You sold ${sold === 1 ? 'once' : `${sold} times`} and bought back ${bought === 1 ? 'once' : `${bought} times`}.`) +
    (model.other ? ` A dashed line shows ${model.other.kind === 'challenger' ? 'your challenger' : 'your last go'}, finishing at ${dollars(model.other.final)}.` : '');
  page.appendChild(
    endChart({
      balances: result.balances,
      trades: result.trades,
      start,
      other: model.other?.balances,
      label: chartLabel,
      ink: paper.ink,
      red: paper.accent,
      paper: paper.bg,
      height: shortViewport() ? 68 : undefined,
    }),
  );

  // Real headlines name the crash, so they print only after the reveal. The box keeps one line each meanwhile.
  const news = (model.tradeNews ?? []).filter((n) => n.real);
  const newsBox = h('div', 'es-newsbox');
  if (news.length) newsBox.style.setProperty('--news-h', `${news.length * 18 + 8}px`);
  page.appendChild(newsBox);
  const printNews = () => {
    for (const n of news) {
      const p = h('p', 'es-news');
      p.appendChild(h('b', '', tradeNewsLabel(n.side)));
      p.appendChild(document.createTextNode(` ${n.real}`));
      newsBox.appendChild(p);
    }
  };

  const table = h('div', 'es-table');
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
    r.appendChild(h('span', '', dollars(value)));
    table.appendChild(r);
  };
  row(YOU, result.final, 'es-row-you', model.other ? 'solid' : undefined);
  if (model.other) row(otherName, model.other.final, '', 'dash');
  row(SOMEONE_WHO_DID_NOTHING, result.holderFinal);
  row(PERFECT_TIMING, result.perfectFinal);
  page.appendChild(table);
  if (model.holderNote) page.appendChild(h('p', 'es-note', HOLDER_NOTE));

  // Hidden until the reveal; it holds the final text so the layout does not jump.
  const lead = h('p', 'es-lead' + (behind ? ' es-behind' : ''), leadText(result.lead, result.lead));
  lead.setAttribute('data-lead', '');
  lead.style.visibility = 'hidden';
  page.appendChild(lead);
  let scoreEnd: HTMLElement = h('p', 'es-perfect', perfectLine(result.perfectFinal, result.final));
  page.appendChild(scoreEnd);
  if (model.other?.kind === 'challenger') {
    scoreEnd = h('p', 'es-vs', challengerLine(result.final, model.other.final));
    page.appendChild(scoreEnd);
  }

  for (const line of model.extraLines ?? []) {
    scoreEnd = h('p', 'es-vs', line);
    page.appendChild(scoreEnd);
  }

  if (model.nearMisses.length) {
    const ul = h('ul', 'es-misses');
    for (const m of model.nearMisses) ul.appendChild(h('li', '', m));
    page.appendChild(ul);
  }

  page.appendChild(h('div', 'es-grow'));

  if (model.double) {
    const d = model.double;
    const block = h('section', 'es-double');
    block.appendChild(h('h2', '', DOUBLE_OR_NOTHING));
    block.appendChild(h('p', 'es-stake', doubleStakeLine(d.lead, d.final)));
    const lad = ladder(d.wins);
    block.appendChild(h('p', 'es-ladder-label', WINS_IN_A_ROW));
    const ul = h('ul', 'es-ladder');
    lad.rungs.forEach((r, i) => {
      const state = d.wins >= r ? 'reached' : r === lad.next ? 'next' : 'ahead';
      const title = RUNG_TITLES[i];
      const li = h('li', 'es-rung');
      li.setAttribute('data-rung', state);
      li.setAttribute('aria-label', `${r} ${r === 1 ? 'win' : 'wins'}: ${title}${state === 'reached' ? ', reached' : state === 'next' ? ', next' : ''}`);
      li.appendChild(h('i', '', String(r)));
      li.appendChild(document.createTextNode(title));
      ul.appendChild(li);
    });
    block.appendChild(ul);
    const pair = h('div', 'es-pair');
    pair.appendChild(button('es-dbl', DOUBLE_OR_NOTHING, actions.onDouble));
    pair.appendChild(button('es-out', bankLabel(d.lead), actions.onBank));
    block.appendChild(pair);
    page.appendChild(block);
  }

  const pair = h('div', 'es-pair');
  // R24: with the double block, its red button is the only filled one.
  if (actions.onRematch) pair.appendChild(button(model.double ? 'es-out' : 'es-main', REMATCH, actions.onRematch));
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
  page.appendChild(button('es-link', NEW_MYSTERY, actions.onNewMystery));

  page.appendChild(h('p', 'es-pot', potResultLine(model.pot.pot, model.pot.tonight)));

  const links = h('div', 'es-foot');
  const foot = h('div', 'es-foot');
  if (actions.onDaily) links.appendChild(button('', DAILY_CRASH, actions.onDaily));
  if (actions.onPick) links.appendChild(button('', PICK_A_CRASH, actions.onPick));
  if (actions.onCollection) links.appendChild(button('', YOUR_COLLECTION, actions.onCollection));
  const toggle = (state: { on: boolean } | undefined, fn: (() => boolean) | undefined, label: (on: boolean) => string) => {
    if (!state || !fn) return;
    const b = button('', label(state.on));
    b.setAttribute('aria-pressed', String(state.on));
    b.addEventListener('click', () => {
      const on = fn();
      b.textContent = label(on);
      b.setAttribute('aria-pressed', String(on));
    });
    foot.appendChild(b);
  };
  toggle(model.sound, actions.onToggleSound, soundLabel);
  toggle(model.vibration, actions.onToggleVibration, vibrationLabel);
  toggle(model.borrowed, actions.onToggleBorrowed, (on) => (on ? BORROWED_ON : PLAY_BORROWED));
  if (links.childElementCount) page.appendChild(links);
  if (foot.childElementCount) page.appendChild(foot);
  page.appendChild(h('p', 'es-footer', FOOTER_RESULT));

  root.replaceChildren(page);

  // The score counts to the lead over about 1.5 s (spec 6.6), at once with reduced motion.
  const count = (done: () => void) => {
    const target = result.lead;
    const up = Math.round(target) > 0;
    const down = Math.round(target) < 0;
    lead.style.visibility = '';
    if (reducedMotion() || Math.round(target) === 0) {
      lead.textContent = leadText(target, target);
      if (up) model.sfx?.payout(true);
      if (down) model.sfx?.thud();
      done();
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
      done();
    };
    later(step, COUNT_STEP_MS);
  };

  // "Next mystery crash in N. Tap to stop." Any touch on the page stops it (spec 6.6).
  // It starts once the count-up has finished, sits right under the score and is announced once.
  let stopCountdown = () => {};
  let revealNote: string | null = null;
  const startCountdown = () => {
    if (!model.flags.showCountdown || destroyed) return;
    let n = COUNTDOWN_FROM;
    const line = button('es-count', nextMysteryLine(n));
    scoreEnd.after(line);
    if (revealNote !== null) revealNote += ` ${nextMysteryLine(n)}`;
    else announce(nextMysteryLine(n));
    const events = ['pointerdown', 'touchstart', 'keydown', 'wheel'] as const;
    let interval: ReturnType<typeof setInterval> | null = null;
    stopCountdown = () => {
      if (interval !== null) clearInterval(interval);
      interval = null;
      for (const e of events) document.removeEventListener(e, stopCountdown, true);
      line.remove();
      stopCountdown = () => {};
    };
    for (const e of events) document.addEventListener(e, stopCountdown, true);
    interval = setInterval(() => {
      n--;
      if (n > 0) {
        line.textContent = nextMysteryLine(n);
        return;
      }
      stopCountdown();
      actions.onNewMystery();
    }, 1000);
  };

  let revealed = false;
  const reveal = (animate: boolean) => {
    if (revealed || destroyed) return;
    revealed = true;
    const span = h('span', 'es-name' + (animate && !reducedMotion() ? ' es-wipe' : ''), name);
    revealSlot.replaceChildren(span);
    printNews();
    // One announcement for the reveal; a countdown that starts at once joins it.
    revealNote = `${model.run.revealLine} ${leadText(result.lead, result.lead)}.`;
    count(startCountdown);
    announce(revealNote);
    revealNote = null;
  };

  if (model.flags.blind) {
    const cover = button('es-cover', '', () => reveal(true));
    cover.appendChild(h('span', '', TAP_TO_REVEAL));
    revealSlot.appendChild(cover);
    later(() => reveal(true), REVEAL_AFTER_MS);
  } else {
    reveal(false);
  }

  return {
    destroy() {
      destroyed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      stopCountdown();
      root.replaceChildren();
      document.getElementById(STYLE_ID)?.remove();
    },
  };
}

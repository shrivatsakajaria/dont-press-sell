// The quiet menu screens (spec 6.10, 6.13, 7.5, 9): pick a crash, and the collection.
// Same front-page look as the game: masthead, folio, hairline rules. No badges, no lights.
import { MASTHEAD, PLAY_BORROWED, potLine } from '../content/copy';
import type { RunMeta, VerdictId } from '../engine/types';
import { ladder } from '../game/streak';
import { paperFor } from './paper';

/**
 * Fixed strings owned by this module (for the lead to move into copy.ts).
 * Verdict titles and plain lines mirror verdictCopy in src/engine/verdict.ts (spec 8.3);
 * that function needs a result and a run, so the menu keeps the static pair.
 */
export const VERDICT_TITLES: Record<VerdictId, { title: string; line: string }> = {
  marginCalled: { title: 'Margin called', line: 'Borrowed three times over and lost the lot' },
  bigShort: { title: 'Big Short energy', line: 'Out before the fall and back in near the low' },
  nerves: { title: 'Nerves of steel', line: 'Traded, and still came out in front' },
  diamond: { title: 'Diamond hands', line: 'Did nothing at all' },
  shakenOut: { title: 'Shaken out', line: 'Sold a dip that bounced straight back' },
  paper: { title: 'Paper hands', line: 'Sold near the low, then bought back higher' },
  cashGang: { title: 'Cash gang', line: 'Sold, and watched the whole recovery from the sidelines' },
  overtrader: { title: 'Overtrader', line: 'In and out, and behind for it' },
  bagholder: { title: 'Bagholder', line: 'Held most of the way down, then blinked' },
};
const TITLE_ORDER: VerdictId[] = [
  'bigShort', 'nerves', 'diamond', 'shakenOut', 'paper', 'cashGang', 'overtrader', 'bagholder', 'marginCalled',
];

export { MENU_TEXT } from '../content/copy';
import { MENU_TEXT, bestStreakLine, bustLine, playedLine, runsCountLine, titlesEarnedLine } from '../content/copy';

/** "9 games, 3 wins, sold too early 4 times"; singulars "1 game, 1 win, sold too early once". */
export function recordSentence(r: { games: number; wins: number; soldTooEarly: number }): string {
  if (r.games === 0) return MENU_TEXT.noGames;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const early = r.soldTooEarly === 1 ? 'once' : `${r.soldTooEarly} times`;
  return `${n(r.games, 'game', 'games')}, ${n(r.wins, 'win', 'wins')}, sold too early ${early}`;
}


const CSS = `
.dps-menu{box-sizing:border-box;min-height:100dvh;max-width:440px;margin:0 auto;display:flex;flex-direction:column;
  padding:24px;padding-top:max(24px,env(safe-area-inset-top));padding-bottom:max(24px,env(safe-area-inset-bottom));
  font-family:'Newsreader',Georgia,serif;color:var(--ink)}
.dps-menu *{box-sizing:border-box}
.dps-mast{border-top:4px solid var(--ink);border-bottom:1px solid var(--ink);padding:8px 0 4px;text-align:center;font-weight:700;font-size:30px;line-height:1;letter-spacing:-0.02em}
.dps-folio{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--ink);font-family:'Libre Franklin',Arial,sans-serif;font-weight:500;font-size:12px;line-height:1;color:var(--sec);font-variant-numeric:tabular-nums}
.dps-h1{margin:20px 0 0;font-weight:700;font-size:40px;line-height:1;letter-spacing:-0.02em;text-wrap:balance}
.dps-stand{margin:8px 0 0;font-size:18px;line-height:1.3;color:var(--sec);font-variant-numeric:lining-nums tabular-nums}
.dps-h2{margin:28px 0 0;padding-bottom:8px;border-bottom:1px solid var(--ink);font-family:'Libre Franklin',Arial,sans-serif;font-weight:700;font-size:16px;line-height:1.25}
.dps-list{list-style:none;margin:0;padding:0}
.dps-list>li{border-bottom:1px solid var(--rule)}
.dps-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:52px;padding:8px 0;margin:0;border:0;border-radius:0;background:none;color:var(--ink);text-align:left;font:inherit;cursor:pointer}
.dps-row .n{font-weight:700;font-size:20px;line-height:1.15}
.dps-row .k{flex:none;font-family:'Libre Franklin',Arial,sans-serif;font-weight:500;font-size:12px;color:var(--sec)}
.dps-item{display:flex;justify-content:space-between;align-items:baseline;gap:16px;min-height:44px;padding:8px 0}
.dps-item .n{font-weight:700;font-size:20px;line-height:1.15}
.dps-item .l{font-size:16px;line-height:1.25;color:var(--sec);text-align:right}
.dps-item.t{display:block;padding:8px 0}
.dps-item.t .l{display:block;margin-top:4px;text-align:left;font-size:16px}
.dps-item.dash-row{min-height:32px;padding:4px 0}
.dps-item .dash{color:var(--sec);font-size:16px;line-height:1.25}
.dps-item .n.sec{color:var(--sec)}
.dps-count{margin:8px 0 0;font-size:16px;line-height:1.25;color:var(--sec);font-variant-numeric:lining-nums tabular-nums}
.dps-fact{margin:12px 0 0;font-size:20px;line-height:1.3;font-variant-numeric:lining-nums tabular-nums}
.dps-fact.sec{margin-top:4px;color:var(--sec);font-size:18px}
.dps-switch{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:56px;margin:24px 0 0;padding:8px 0;border:0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);border-radius:0;background:none;color:var(--ink);font:inherit;text-align:left;cursor:pointer}
.dps-switch .t{font-family:'Libre Franklin',Arial,sans-serif;font-weight:700;font-size:16px}
.dps-switch .s{flex:none;display:flex;align-items:center;gap:8px;font-family:'Libre Franklin',Arial,sans-serif;font-weight:500;font-size:12px;color:var(--sec)}
.dps-switch .track{width:40px;height:24px;border:2px solid var(--ink);padding:2px;display:flex;justify-content:flex-start}
.dps-switch .track i{display:block;width:16px;height:16px;background:var(--ink);transition:transform .2s cubic-bezier(0.22,1,0.36,1)}
.dps-switch[aria-checked="true"] .track{background:var(--ink)}
.dps-switch[aria-checked="true"] .track i{background:var(--bg);transform:translateX(16px)}
.dps-grow{flex-grow:1;min-height:24px}
.dps-back{display:block;width:100%;min-height:48px;margin:24px 0 0;padding:0;border:1px solid var(--ink);border-radius:0;background:none;color:var(--ink);font-family:'Libre Franklin',Arial,sans-serif;font-weight:700;font-size:16px;cursor:pointer}
.dps-foot{margin-top:12px;font-family:'Libre Franklin',Arial,sans-serif;font-weight:500;font-size:12px;line-height:1.35;color:var(--sec)}
.dps-menu button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
@media (hover:hover){.dps-row:hover .n{text-decoration:underline;text-underline-offset:3px}}
@media (prefers-reduced-motion:reduce){.dps-switch .track i{transition:none}}
`;

function ensureStyle(): void {
  if (document.getElementById('dps-menu-style')) return;
  const s = document.createElement('style');
  s.id = 'dps-menu-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function frame(root: HTMLElement, folioLeft: string, folioRight: string, title: string, stand: string | null): HTMLElement {
  ensureStyle();
  const paper = paperFor({ lossFrac: 0, inCash: false, worstDay: false });
  root.textContent = '';
  root.style.background = paper.bg;
  const page = el('main', 'dps-menu');
  page.style.setProperty('--bg', paper.bg);
  page.style.setProperty('--ink', paper.ink);
  page.style.setProperty('--sec', paper.secondary);
  page.style.setProperty('--rule', 'rgba(28,26,23,0.25)');
  page.appendChild(el('div', 'dps-mast', MASTHEAD));
  const folio = el('div', 'dps-folio');
  folio.append(el('span', undefined, folioLeft), el('span', undefined, folioRight));
  page.appendChild(folio);
  page.appendChild(el('h1', 'dps-h1', title));
  if (stand) page.appendChild(el('p', 'dps-stand', stand));
  root.appendChild(page);
  return page;
}

function backButton(page: HTMLElement, onBack: () => void): void {
  page.appendChild(el('div', 'dps-grow'));
  const b = el('button', 'dps-back', MENU_TEXT.back);
  b.type = 'button';
  b.setAttribute('data-back', '');
  b.addEventListener('click', onBack);
  page.appendChild(b);
}

const kindLabel = (r: RunMeta) => (r.kind === 'scare' ? MENU_TEXT.falseAlarm : MENU_TEXT.crash);

export interface PickCrashProps {
  runs: RunMeta[];
  onPick(id: string): void;
  onBack(): void;
}

export function mountPickCrash(root: HTMLElement, p: PickCrashProps): () => void {
  const page = frame(root, MENU_TEXT.pickFolio, runsCountLine(p.runs.length), MENU_TEXT.pickTitle, MENU_TEXT.pickStand);
  const list = el('ul', 'dps-list');
  list.style.marginTop = '20px';
  list.style.borderTop = '1px solid var(--ink)';
  for (const r of p.runs) {
    const li = el('li');
    const b = el('button', 'dps-row');
    b.type = 'button';
    b.setAttribute('data-run', r.id);
    b.append(el('span', 'n', r.pickName), el('span', 'k', kindLabel(r)));
    b.addEventListener('click', () => p.onPick(r.id));
    li.appendChild(b);
    list.appendChild(li);
  }
  page.appendChild(list);
  backButton(page, p.onBack);
  return () => {
    root.textContent = '';
  };
}

export interface CollectionProps {
  record: { games: number; wins: number; soldTooEarly: number };
  pot: number;
  busts: number;
  bestStreak: number;
  played: string[];
  titles: VerdictId[];
  runs: RunMeta[];
  /** Borrowed money has been unlocked (first blind win). The switch shows only then. */
  /** False when storage is missing or blocked: the folio then says "For this visit". */
  storageOk?: boolean;
  unlocked?: boolean;
  borrowed?: boolean;
  onToggleBorrowed?(on: boolean): void;
  onBack(): void;
}

export function mountCollection(root: HTMLElement, p: CollectionProps): () => void {
  const playedSet = new Set(p.played);
  const total = p.runs.length;
  const count = p.runs.filter((r) => playedSet.has(r.id)).length;
  const page = frame(root, MENU_TEXT.collectionTitle, p.storageOk ? MENU_TEXT.keptOnPhone : MENU_TEXT.forVisit, MENU_TEXT.collectionTitle, playedLine(count, total));

  // Runs met: every crash by name, false alarms only once met.
  page.appendChild(el('h2', 'dps-h2', MENU_TEXT.runsHeading));
  const runList = el('ul', 'dps-list');
  for (const r of p.runs) {
    if (r.kind === 'scare' && !playedSet.has(r.id)) continue;
    const li = el('li');
    const done = playedSet.has(r.id);
    const item = el('div', 'dps-item t');
    item.setAttribute('data-run', r.id);
    item.append(el('span', done ? 'n' : 'n sec', r.pickName), el('span', 'l', done ? kindLabel(r) : MENU_TEXT.notPlayed));
    li.appendChild(item);
    runList.appendChild(li);
  }
  page.appendChild(runList);

  // Verdict titles: earned in ink with the plain line, the rest a quiet "Not earned yet".
  page.appendChild(el('h2', 'dps-h2', MENU_TEXT.titlesHeading));
  const earned = new Set(TITLE_ORDER.filter((id) => p.titles.includes(id)));
  page.appendChild(el('p', 'dps-count', titlesEarnedLine(earned.size, TITLE_ORDER.length)));
  const titleList = el('ul', 'dps-list');
  titleList.style.marginTop = '8px';
  for (const id of TITLE_ORDER) {
    const li = el('li');
    const item = el('div', 'dps-item');
    if (earned.has(id)) {
      item.classList.add('t');
      item.setAttribute('data-title', id);
      item.append(el('span', 'n', VERDICT_TITLES[id].title), el('span', 'l', VERDICT_TITLES[id].line));
    } else {
      item.classList.add('dash-row');
      item.setAttribute('data-title', 'empty');
      item.appendChild(el('span', 'dash', MENU_TEXT.notEarned));
    }
    li.appendChild(item);
    titleList.appendChild(li);
  }
  page.appendChild(titleList);

  // The record in plain words, the pot, busts and the best streak.
  page.appendChild(el('h2', 'dps-h2', MENU_TEXT.recordHeading));
  page.appendChild(el('p', 'dps-fact', recordSentence(p.record)));
  page.appendChild(el('p', 'dps-fact', potLine(p.pot)));
  if (p.busts > 0) page.appendChild(el('p', 'dps-fact sec', bustLine(p.busts)));
  const lad = ladder(p.bestStreak);
  const streak =
    p.bestStreak > 0
      ? bestStreakLine(p.bestStreak, lad.title)
      : MENU_TEXT.noStreak;
  page.appendChild(el('p', 'dps-fact', streak));

  if (p.unlocked) {
    let on = !!p.borrowed;
    const sw = el('button', 'dps-switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    const state = el('span', 's');
    const label = el('span', undefined);
    const track = el('span', 'track');
    track.appendChild(el('i'));
    state.append(label, track);
    sw.append(el('span', 't', PLAY_BORROWED), state);
    const paint = () => {
      sw.setAttribute('aria-checked', String(on));
      label.textContent = on ? MENU_TEXT.on : MENU_TEXT.off;
    };
    paint();
    sw.addEventListener('click', () => {
      on = !on;
      paint();
      p.onToggleBorrowed?.(on);
    });
    page.appendChild(sw);
  }

  backButton(page, p.onBack);
  return () => {
    root.textContent = '';
  };
}

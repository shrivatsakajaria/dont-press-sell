// Boot and flow (spec 6): straight into a mystery run, then the result front page, from which
// every other mode starts. Rules live in the modules; this file only joins them.
import {
  BORROWED_LABEL, BORROWED_OPENING, BUST_HEADLINE, ISLAND_HEADLINE, REMATCH_LABEL, dailyLabel, scoreToBeatLine, startLines,
} from './content/copy';
import { loadHeadlines } from './content/headlines';
import { RUNS, RUN_IDS, loadRun, runMeta } from './content/runs';
import { simulateBorrowed } from './engine/borrowed';
import { nearMisses } from './engine/nearmiss';
import { simulate } from './engine/simulate';
import type { Headline, RunData, RunResult } from './engine/types';
import { verdictCopy, verdictFor } from './engine/verdict';
import { playCues } from './fx/cues';
import { buzz, setHapticsEnabled } from './fx/haptics';
import { createSfx } from './fx/sound';
import {
  bankPending, borrowedOn, borrowedUnlocked, challengeFits, currentStreak, doubleUp, setBorrowed, settle,
} from './game/flow';
import { createNarrator, tradeNews, type NarratorRun } from './game/narrator';
import { dailyPick, pickMystery } from './game/picker';
import { getPot } from './game/pot';
import { hashString, mulberry32 } from './game/rng';
import { buildSchedule } from './game/schedule';
import { daysInRowText, getDailyResult, getLastRun, getRecord, type LastRun, type Mode } from './store/record';
import { renderCard, shareLine } from './share/card';
import { dailyText } from './share/dailytext';
import { decodeChallenge, type Challenge } from './share/link';
import { challengeLink, resultCard } from './share/result';
import { copyText, shareResult } from './share/share';
import { cell, save } from './store/store';
import { mountEndScreen, type EndModel } from './ui/endscreen';
import { mountCollection, mountPickCrash } from './ui/menus';
import { paperFor } from './ui/paper';
import { MYSTERY_LABEL, startPlay, type Play } from './ui/screen';

type RunFile = RunData & NarratorRun;

interface Game {
  mode: Mode;
  runId: string;
  /** Folio run label: "Mystery crash", "Daily crash 12", "2008", "Rematch". */
  label: string;
  /** What the player and the holder start with: $10,000, or the carried amount in a streak. */
  start: number;
  /** Real headlines (picked and rematch runs); anonymised in blind runs. */
  real: boolean;
  /** UTC date of a daily run, and its number. */
  date?: string;
  dailyNumber?: number;
  /** Rematch: the previous go at this crash. */
  previous?: LastRun | null;
  /** Borrowed money (mystery runs only, spec 6.13). */
  borrowed?: boolean;
  /** A challenge from a link: the challenger's final and trades. */
  challenge?: Challenge;
}

const START = 10000;
/** Mystery runs remembered so the picker never serves one three times running. */
const RECENT_KEEP = 6;

const recentCell = cell<string[]>('recent', []);
const soundCell = cell<boolean>('sound', true);
const vibrationCell = cell<boolean>('vibration', true);

const root = document.getElementById('app')!;
let session: Play | null = null;
let teardown: (() => void) | null = null;
let lastGame: Game | null = null;
let lastEnd: EndModel | null = null;
/** Each play() takes a ticket; a slower load that has been overtaken does nothing. */
let ticket = 0;

setHapticsEnabled(vibrationCell.get() !== false);

// Sound and vibration are on by default; phones allow them only after a tap, so the first tap anywhere unlocks them.
const sfx = createSfx();
const soundOn = () => soundCell.get() !== false;
sfx.setMuted(!soundOn());
for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) {
  document.addEventListener(ev, () => sfx.unlock(), { capture: true, passive: true });
}
function toggleSound(): boolean {
  const on = !soundOn();
  soundCell.set(on);
  sfx.setMuted(!on);
  if (on) sfx.unlock();
  return on;
}

function clear() {
  session?.teardown();
  session = null;
  sfx.setMuted(!soundOn()); // a run left while paused must not leave the sound off
  teardown?.();
  teardown = null;
  // Back to calm paper: the play screen tints the whole page, the menus set the column's background.
  const calm = paperFor({ lossFrac: 0, inCash: false, worstDay: false });
  document.documentElement.style.setProperty('--bg', calm.bg);
  document.documentElement.style.setProperty('--ink', calm.ink);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', calm.bg);
  root.style.background = '';
  window.scrollTo(0, 0);
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** The folio label of a picked run: "2008" for a crash, the plain name for a false alarm. */
function shortName(runId: string): string {
  const meta = runMeta(runId)!;
  return meta.kind === 'crash' ? meta.pickName.split(':')[0] : meta.pickName;
}

async function load(runId: string): Promise<{ run: RunFile; headlines: Headline[] }> {
  const [run, headlines] = await Promise.all([loadRun(runId) as Promise<RunFile>, loadHeadlines(runId)]);
  return { run, headlines };
}

/** Pot shown on the play footer: a running double-or-nothing streak counts its wins so far. */
const potNow = () => getPot().pot + currentStreak().net;

/**
 * opts.gate: the start screen (R28). Only the first game of a fresh page load gets it; rematch, double
 * or nothing, the countdown's next game and a challenge link opened again in the visit start at once.
 */
async function play(game: Game, opts: { double?: boolean; gate?: boolean } = {}) {
  const mine = ++ticket;
  // Starting anything but the double banks a win that was waiting for a choice (spec 6.8).
  if (!opts.double) bankPending();
  const { run, headlines } = await load(game.runId);
  if (mine !== ticket) return;
  clear();
  lastGame = game;
  const steps = buildSchedule(run, headlines);
  const narrator = createNarrator(run, headlines, {
    real: game.real,
    rng: mulberry32(hashString(`${game.runId}:${Date.now()}`)),
    start: game.start,
  });
  const prev = game.previous ?? null;
  const borrowed = !!game.borrowed;
  const firstForward = steps.findIndex((st) => st.phase === 'forward');
  const forwardSteps = firstForward < 0 ? 0 : steps.length - firstForward;
  session = startPlay(root, run, steps, {
    runLabel: game.label,
    borrowed,
    simulateFn: borrowed ? simulateBorrowed : undefined,
    opening: borrowed ? BORROWED_OPENING : undefined,
    gate: opts.gate
      ? { lines: startLines(borrowed), note: game.challenge ? scoreToBeatLine(game.challenge.final) : null }
      : undefined,
    start: game.start,
    pot: potNow(),
    narrate: (d, prevDay, balance, trades) => narrator.step(d, prevDay, balance, trades),
    soldLastTime: prev?.trades.find((t) => t.side === 'sell')?.dayIndex ?? null,
    scoreToBeat: prev ? prev.final : game.challenge ? game.challenge.final : null,
    other: prev ? prev.balances : null,
    onEnd: (r) => finish(game, run, headlines, r),
    soundOn: soundOn(),
    onSoundToggle: toggleSound,
    // A paused clock (Pause, or the page hidden) is silent.
    onPause: () => sfx.setMuted(true),
    onResume: () => sfx.setMuted(!soundOn()),
    onFrame: (v, m, e) =>
      playCues(sfx, buzz, {
        ...e, worst: m.worst, invested: v.invested, phase: v.phase, leadNow: v.leadNow, start: game.start,
        forwardProgress: forwardSteps ? (v.stepIndex - firstForward + 1) / forwardSteps : 0,
      }),
  });
}

function finish(game: Game, run: RunFile, headlines: Headline[], r: RunResult) {
  const meta = runMeta(run.id)!;
  const verdictId = verdictFor(r, run);
  const s = settle({
    mode: game.mode, runId: run.id, result: r, verdict: verdictId, lowIndex: run.lowIndex,
    date: game.date, start: game.start, borrowed: !!game.borrowed,
  });
  const days = s.daysInRow !== null ? daysInRowText(s.daysInRow) : null;
  const verdict = verdictCopy(verdictId, r, run);
  const actions = resultActions(game, !!s.double);
  // Challenge a friend: never from borrowed money (spec 6.13), nor from a run with nothing left to beat.
  if (!game.borrowed && r.final >= 1) {
    actions.onChallenge = () => void challengeFriend(game, run, r, verdict, s.double?.wins);
  }
  if (game.mode === 'daily' && s.blind && game.dailyNumber !== undefined) {
    const n = game.dailyNumber;
    actions.onCopyResult = () => copyText(dailyText(n, verdict.title, r.lead, r.balances, siteBase(), s.daysInRow ?? 1));
  }
  showResult({
    run: { pickName: meta.pickName, revealLine: meta.revealLine, kind: meta.kind },
    modeLabel: game.label,
    result: r,
    closes: run.closes,
    start: game.start,
    verdictId,
    verdict,
    nearMisses: nearMisses(r, run),
    tradeNews: tradeNews(headlines, r.trades),
    other: game.previous
      ? { kind: 'previous', balances: game.previous.balances, final: game.previous.final }
      : game.challenge
        ? { kind: 'challenger', balances: simulate(run.closes, game.challenge.trades, game.start).balances, final: game.challenge.final }
        : undefined,
    double: s.double ?? undefined,
    pot: s.pot,
    flags: { showCountdown: game.mode === 'mystery', blind: !game.real },
    headlineOverride: s.bust ? BUST_HEADLINE : s.island ? ISLAND_HEADLINE : undefined,
    blackBorder: s.island,
    extraLines: days ? [days] : undefined,
    sound: { on: soundOn() },
    sfx,
    vibration: { on: vibrationCell.get() !== false },
    borrowed: borrowedUnlocked() ? { on: borrowedOn() } : undefined,
    actions,
  });
}

/** The address the page is served from, read at the time (spec 10): never hard-coded. */
const siteBase = () => location.origin + location.pathname;

async function challengeFriend(
  game: Game, run: RunFile, r: RunResult, verdict: { title: string; line: string; headline: string }, streak?: number,
) {
  const url = challengeLink(siteBase(), run.id, r, game.start);
  const card = resultCard({
    result: r, verdict, closes: run.closes, url: location.host,
    practiceName: game.real ? shortName(run.id) : null,
    dailyNumber: game.mode === 'daily' ? game.dailyNumber : undefined,
    streak,
  });
  let image: Blob | null = null;
  try {
    image = await renderCard(card);
  } catch {
    /* no canvas here: share the line and the link alone */
  }
  await shareResult({ text: shareLine(card), url, image });
}

function resultActions(game: Game, offered: boolean): EndModel['actions'] {
  return {
    onNewMystery: () => void newMystery(),
    onRematch: () => void rematch(game),
    onDouble: offered ? () => void double() : undefined,
    onBank: offered ? bankNow : undefined,
    onDaily: () => void daily(),
    onPick: pickCrash,
    onCollection: collection,
    onToggleSound: toggleSound,
    onToggleVibration: () => {
      const on = vibrationCell.get() === false;
      vibrationCell.set(on);
      setHapticsEnabled(on);
      return on;
    },
    onToggleBorrowed: toggleBorrowed,
  };
}

function toggleBorrowed(): boolean {
  const on = !borrowedOn();
  setBorrowed(on);
  return on;
}

function showResult(model: EndModel) {
  clear();
  lastEnd = model;
  const end = mountEndScreen(root, model);
  teardown = () => end.destroy();
}

/** Back from a menu: the same front page, already revealed, without the countdown. */
function back() {
  if (!lastEnd) return void newMystery();
  showResult({ ...lastEnd, flags: { showCountdown: false, blind: false } });
}

function bankNow() {
  bankPending();
  if (!lastEnd || !lastGame) return;
  const p = getPot();
  showResult({
    ...lastEnd,
    double: undefined,
    pot: { pot: p.pot, tonight: p.tonight },
    flags: { ...lastEnd.flags, blind: false },
    actions: resultActions(lastGame, false),
  });
}

function newMystery(start = START, opts: { double?: boolean; gate?: boolean } = {}) {
  const recent = Array.isArray(recentCell.get()) ? recentCell.get() : [];
  const runId = pickMystery(Math.random, recent);
  recentCell.set([runId, ...recent].slice(0, RECENT_KEEP));
  return play(mysteryGame(runId, start, !opts.double && borrowedOn()), opts);
}

function mysteryGame(runId: string, start: number, borrowed: boolean): Game {
  return { mode: 'mystery', runId, label: borrowed ? BORROWED_LABEL : MYSTERY_LABEL, start, real: false, borrowed };
}

function double() {
  const s = doubleUp();
  return newMystery(s.start, { double: true });
}

/** Rematch: the same crash from the same start, as practice. Never borrowed; a borrowed go is not a fair score to beat. */
function rematch(game: Game) {
  return play({
    mode: 'rematch', runId: game.runId, label: REMATCH_LABEL, start: game.start, real: true,
    previous: game.borrowed ? null : getLastRun(game.runId),
  });
}

/** The daily crash (spec 6.9): blind the first time on a date; a replay is a rematch. */
function daily() {
  const date = todayUtc();
  const { number, runId } = dailyPick(date);
  if (getDailyResult(date)) {
    return play({ mode: 'rematch', runId, label: REMATCH_LABEL, start: START, real: true, previous: getLastRun(runId) });
  }
  const n = Math.max(1, number);
  return play({ mode: 'daily', runId, label: dailyLabel(n), start: START, real: false, date, dailyNumber: n });
}

function pickCrash() {
  clear();
  mountPickCrash(root, {
    runs: RUNS,
    onPick: (runId) => void play({ mode: 'picked', runId, label: shortName(runId), start: START, real: true }),
    onBack: back,
  });
}

function collection() {
  clear();
  const rec = getRecord();
  const p = getPot();
  mountCollection(root, {
    record: rec,
    pot: p.pot,
    busts: p.busts,
    bestStreak: rec.bestStreak,
    played: rec.played,
    titles: rec.titles,
    runs: RUNS,
    storageOk: save('probe', true),
    unlocked: borrowedUnlocked(),
    borrowed: borrowedOn(),
    onToggleBorrowed: (on) => setBorrowed(on),
    onBack: back,
  });
}

/**
 * A challenge link (#c=<code>) opens that exact run, blind, with the score to beat (spec 6.7).
 * A code that does not decode, or whose trades fall outside the run, starts a fresh mystery with no error.
 */
async function challenge(code: string) {
  history.replaceState(null, '', location.pathname + location.search);
  const gate = !challengeSeen(code);
  const c = decodeChallenge(code);
  if (c) {
    try {
      const run = await loadRun(c.runId);
      if (challengeFits(c, run.closes.length)) {
        return play({ mode: 'challenge', runId: c.runId, label: MYSTERY_LABEL, start: START, real: false, challenge: c }, { gate });
      }
    } catch {
      /* fall through to a mystery */
    }
  }
  return newMystery(START, { gate });
}

/** Whether this challenge link was already opened in this visit (and remember it now). Unknown counts as new. */
function challengeSeen(code: string): boolean {
  try {
    const key = 'dps:challenges';
    const seen: string[] = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    if (seen.includes(code)) return true;
    sessionStorage.setItem(key, JSON.stringify([...seen, code].slice(-20)));
  } catch {
    /* no session storage: show the start screen */
  }
  return false;
}

function boot() {
  const hash = /^#c=(.*)$/.exec(location.hash);
  if (hash) return challenge(hash[1]);
  // ?run=<id> opens that run as a mystery (testing and screenshots).
  const asked = new URLSearchParams(location.search).get('run') ?? '';
  if (RUN_IDS.includes(asked)) return play(mysteryGame(asked, START, borrowedOn()), { gate: true });
  return newMystery(START, { gate: true });
}

void boot();

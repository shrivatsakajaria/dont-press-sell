// Boot and flow: straight into a mystery run, then the result front page.
import { loadHeadlines } from './content/headlines';
import { RUN_IDS, loadRun, runMeta } from './content/runs';
import type { Headline, RunData, RunResult } from './engine/types';
import { nearMisses } from './engine/nearmiss';
import { verdictCopy, verdictFor } from './engine/verdict';
import { createNarrator, tradeNews, type NarratorRun } from './game/narrator';
import { hashString, mulberry32 } from './game/rng';
import { buildSchedule } from './game/schedule';
import type { Session } from './game/session';
import { mountEndScreen } from './ui/endscreen';
import { paperFor } from './ui/paper';
import { MYSTERY_LABEL, startPlay } from './ui/screen';

type RunFile = RunData & NarratorRun;

interface Game {
  runId: string;
  /** Headlines with real names (picked and rematch runs); anonymised otherwise. */
  real: boolean;
  label: string;
}

const root = document.getElementById('app')!;
let session: Session | null = null;
let teardown: (() => void) | null = null;

function clear() {
  session?.destroy();
  session = null;
  teardown?.();
  teardown = null;
  // Back to calm paper: the play screen tints the whole page.
  const calm = paperFor({ lossFrac: 0, inCash: false, worstDay: false });
  document.documentElement.style.setProperty('--bg', calm.bg);
  document.documentElement.style.setProperty('--ink', calm.ink);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', calm.bg);
  window.scrollTo(0, 0);
}

async function load(runId: string): Promise<{ run: RunFile; headlines: Headline[] }> {
  const [run, headlines] = await Promise.all([loadRun(runId) as Promise<RunFile>, loadHeadlines(runId)]);
  return { run, headlines };
}

async function play(game: Game) {
  const { run, headlines } = await load(game.runId);
  clear();
  const start = 10000;
  const steps = buildSchedule(run, headlines);
  const narrator = createNarrator(run, headlines, {
    real: game.real,
    rng: mulberry32(hashString(`${game.runId}:${Date.now()}`)),
    start,
  });
  session = startPlay(root, run, steps, {
    runLabel: game.label,
    start,
    narrate: (d, prev, balance, trades) => narrator.step(d, prev, balance, trades),
    onEnd: (r) => finish(game, run, headlines, r),
  });
}

function finish(game: Game, run: RunFile, headlines: Headline[], r: RunResult) {
  clear();
  const meta = runMeta(run.id)!;
  const verdictId = verdictFor(r, run);
  const end = mountEndScreen(root, {
    run: { pickName: meta.pickName, revealLine: meta.revealLine, kind: meta.kind },
    modeLabel: game.label,
    result: r,
    closes: run.closes,
    verdictId,
    verdict: verdictCopy(verdictId, r, run),
    nearMisses: nearMisses(r, run),
    tradeNews: tradeNews(headlines, r.trades),
    pot: { pot: 10000, tonight: 0 },
    flags: { showCountdown: true, blind: !game.real },
    actions: { onNewMystery: () => void boot() },
  });
  teardown = () => end.destroy();
}

async function boot() {
  const asked = new URLSearchParams(location.search).get('run') ?? '';
  const runId = RUN_IDS.includes(asked) ? asked : RUN_IDS[Math.floor(Math.random() * RUN_IDS.length)];
  await play({ runId, real: false, label: MYSTERY_LABEL });
}

void boot();

// Boot: straight into a run chosen by ?run=<id> (default c2007 for now).
import { MASTHEAD } from './content/copy';
import { RUN_IDS, loadRun } from './content/runs';
import { buildSchedule } from './game/schedule';
import { MYSTERY_LABEL, startPlay } from './ui/screen';

const RUN_OVER = 'Run over';

async function boot() {
  const root = document.getElementById('app');
  if (!root) return;
  const asked = new URLSearchParams(location.search).get('run') ?? '';
  const id = RUN_IDS.includes(asked) ? asked : 'c2007';
  const run = await loadRun(id);
  // Real headlines arrive later; until then the big days come from the price moves alone.
  const steps = buildSchedule(run, []);
  startPlay(root, run, steps, {
    runLabel: MYSTERY_LABEL,
    onEnd() {
      // Placeholder until the end screen lane lands.
      const head = document.createElement('div');
      head.className = 'masthead';
      head.textContent = MASTHEAD;
      const line = document.createElement('p');
      line.className = 'run-over';
      line.textContent = RUN_OVER;
      root.replaceChildren(head, line);
    },
  });
}

void boot();

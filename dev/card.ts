// Dev page: renders sample cards to <img> elements. Every figure comes from simulate() on a real run file.
import { loadRun } from '../src/content/runs';
import { simulate } from '../src/engine/simulate';
import { verdictCopy, verdictFor } from '../src/engine/verdict';
import type { RunData, Trade } from '../src/engine/types';
import { renderCard, type ResultCardModel } from '../src/share/card';

function model(run: RunData, trades: Trade[], start: number, extra: Partial<ResultCardModel>): ResultCardModel {
  const r = simulate(run.closes, trades, start);
  const v = verdictCopy(verdictFor(r, run), r, run);
  return {
    headline: v.headline,
    verdictTitle: v.title,
    verdictLine: v.line,
    you: r.final,
    holder: r.holderFinal,
    perfect: r.perfectFinal,
    lead: r.lead,
    series: run.closes,
    trades: r.trades,
    url: location.origin + '/',
    ...extra,
  };
}

async function main(): Promise<void> {
  const r2007 = await loadRun('c2007');
  const r2020 = await loadRun('c2020');
  const r2022 = await loadRun('c2022');
  const day = (run: RunData, iso: string): number => {
    const i = run.dates.indexOf(iso);
    if (i < 0) throw new Error('No such day ' + iso);
    return i;
  };

  // Paper hands: sold three days before the low, bought back higher on 2009-03-23.
  const lost = model(
    r2007,
    [
      { dayIndex: r2007.lowIndex - 3, side: 'sell' },
      { dayIndex: day(r2007, '2009-03-23'), side: 'buy' },
    ],
    10000,
    { dailyNumber: 12 },
  );
  // A winning mystery run with the start carried (12,500), third win in a row.
  const won = model(
    r2020,
    [
      { dayIndex: day(r2020, '2020-03-04'), side: 'sell' },
      { dayIndex: day(r2020, '2020-03-20'), side: 'buy' },
    ],
    12500,
    { streak: 3 },
  );
  // Practice: the 2008 crash named, second go.
  const practice = model(
    r2007,
    [
      { dayIndex: day(r2007, '2008-09-29'), side: 'sell' },
      { dayIndex: day(r2007, '2009-03-23'), side: 'buy' },
    ],
    10000,
    { practice: { crashName: '2008', attempt: 2 } },
  );
  // Worst case: three-line headline, two-line verdict line, streak line, many trades.
  const worst = model(
    r2022,
    [20, 40, 60, 80, 100, 120, 140, 160, 180].map((d, i) => ({ dayIndex: d, side: i % 2 ? 'buy' : 'sell' }) as Trade),
    12500,
    {
      streak: 5,
      headline: 'Local investor trades nine times, loses to a houseplant, and tells everyone about it',
      verdictLine: 'In and out, and behind for it, with plenty of time to think about every single move',
    },
  );

  const host = document.getElementById('cards')!;
  const cards: [string, ResultCardModel][] = [
    ['blind-lost', lost],
    ['streak-won', won],
    ['practice', practice],
    ['worst-case', worst],
  ];
  for (const [name, m] of cards) {
    console.log(name, m.verdictTitle, Math.round(m.you), Math.round(m.holder), Math.round(m.lead));
    const blob = await renderCard(m);
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = name;
    const img = document.createElement('img');
    img.id = name;
    img.alt = name;
    img.src = URL.createObjectURL(blob);
    fig.append(cap, img);
    host.append(fig);
  }
  document.body.setAttribute('data-ready', '1');
}

void main();

// Dev page: renders three sample cards to <img> elements.
import { loadRun } from '../src/content/runs';
import { renderCard, type ResultCardModel } from '../src/share/card';

async function main(): Promise<void> {
  const url = location.origin + '/';
  const r2007 = await loadRun('c2007');
  const r2020 = await loadRun('c2020');
  const r2022 = await loadRun('c2022');
  const pick = (c: number[], f: number) => Math.round(f * (c.length - 1));

  const lost: ResultCardModel = {
    headline: 'Local investor sells three days before the bottom',
    verdictTitle: 'Paper hands',
    verdictLine: 'Sold near the low, then bought back higher',
    you: 7150, holder: 9450, perfect: 17900, lead: -2300,
    series: r2007.closes,
    trades: [
      { dayIndex: r2007.lowIndex - 3, side: 'sell' },
      { dayIndex: pick(r2007.closes, 0.8), side: 'buy' },
    ],
    url, dailyNumber: 12,
  };
  const won: ResultCardModel = {
    headline: 'Local investor dodges the worst of the crash',
    verdictTitle: 'Big Short energy',
    verdictLine: 'Out before the fall and back in near the low',
    you: 13240, holder: 11600, perfect: 16900, lead: 1640,
    series: r2020.closes,
    trades: [
      { dayIndex: 8, side: 'sell' },
      { dayIndex: r2020.lowIndex + 2, side: 'buy' },
    ],
    url, streak: 3,
  };
  const practice: ResultCardModel = {
    headline: 'Local investor beats the market, tells everyone',
    verdictTitle: 'Nerves of steel',
    verdictLine: 'Traded, and still came out in front',
    you: 10640, holder: 9000, perfect: 15200, lead: 1640,
    series: r2022.closes,
    trades: [
      { dayIndex: 30, side: 'sell' },
      { dayIndex: 120, side: 'buy' },
    ],
    url,
    practice: { crashName: '2008', attempt: 2 },
  };

  const host = document.getElementById('cards')!;
  for (const [name, m] of [['blind-lost', lost], ['streak-won', won], ['practice', practice]] as const) {
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

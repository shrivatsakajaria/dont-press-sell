// Fixed end-screen samples built from the real price files (Lane K).
// Imported by tests/ui/endscreen.test.ts and by the dev page dev/end.ts.
import c2007Json from '../../data/runs/c2007.prices.json';
import c2020Json from '../../data/runs/c2020.prices.json';
import { nearMisses } from '../../src/engine/nearmiss';
import { simulate } from '../../src/engine/simulate';
import type { RunData, Trade } from '../../src/engine/types';
import { verdictCopy, verdictFor } from '../../src/engine/verdict';
import { runMeta } from '../../src/content/runs';
import type { EndModel } from '../../src/ui/endscreen';

export const c2007 = c2007Json as unknown as RunData;
export const c2020 = c2020Json as unknown as RunData;

function day(run: RunData, date: string): number {
  const i = run.dates.indexOf(date);
  if (i < 0) throw new Error(`${run.id} has no close on ${date}`);
  return i;
}

function build(
  run: RunData,
  sells: [string, string],
  extra: Partial<EndModel> & { modeLabel: string; news?: [string, string] },
): EndModel {
  const trades: Trade[] = [
    { dayIndex: day(run, sells[0]), side: 'sell' },
    { dayIndex: day(run, sells[1]), side: 'buy' },
  ];
  const result = simulate(run.closes, trades);
  const id = verdictFor(result, run);
  const meta = runMeta(run.id)!;
  const { news, ...rest } = extra;
  return {
    run: { pickName: meta.pickName, revealLine: meta.revealLine, kind: meta.kind },
    result,
    closes: run.closes,
    verdictId: id,
    verdict: verdictCopy(id, result, run),
    nearMisses: nearMisses(result, run),
    // Real lines from data/runs/<id>.headlines.csv for the two trade days.
    // A trade day with no headline row gets no line.
    tradeNews: news
      ? (
          [
            { side: 'sell', real: news[0] },
            { side: 'buy', real: news[1] },
          ] as const
        ).filter((n) => n.real !== '')
      : undefined,
    pot: { pot: 10000, tonight: 0 },
    flags: { blind: true },
    actions: { onNewMystery: () => {} },
    ...rest,
  };
}

/** The brief's sample: c2007, sold 2008-09-29, bought back 2009-03-23. It finishes ahead ("Nerves of steel"). */
export function c2007Sample(): EndModel {
  const m = build(c2007, ['2008-09-29', '2009-03-23'], {
    modeLabel: 'Mystery crash',
    news: ["House rejects the $700 billion bank rescue plan", "Treasury details a plan to buy banks' bad assets"],
    pot: { pot: 13719, tonight: 3719 },
    flags: { blind: true },
  });
  // A winning mystery run, so double or nothing is offered (first win of a streak).
  m.double = { net: m.result.lead, final: m.result.final, wins: 1 };
  return m;
}

/** A winning mystery run with the double-or-nothing block: c2020, out 2020-02-27, back in 2020-03-23. */
export function winningSample(): EndModel {
  const m = build(c2020, ['2020-02-27', '2020-03-23'], {
    modeLabel: 'Mystery crash',
    news: ['US stock market falls into a correction', 'Fed promises to buy as much as needed to steady markets'],
    flags: { blind: true },
  });
  // Second win in a row: the net counts an earlier $1,500 win too (what banking adds to the pot).
  m.double = { net: m.result.lead + 1500, final: m.result.final, wins: 2 };
  m.pot = { pot: 16480, tonight: 5310 };
  return m;
}

/** A losing challenge: c2007, sold 2009-03-02 near the low, bought back 2009-04-17 higher ("Paper hands"). */
export function losingSample(): EndModel {
  const challenger = simulate(c2007.closes, [
    { dayIndex: day(c2007, '2008-09-29'), side: 'sell' },
    { dayIndex: day(c2007, '2009-03-23'), side: 'buy' },
  ]);
  return build(c2007, ['2009-03-02', '2009-04-17'], {
    modeLabel: 'Challenge',
    news: ['US deepens its rescue of AIG after record loss', ''],
    other: { kind: 'challenger', balances: challenger.balances, final: challenger.final },
    pot: { pot: 7905, tonight: -2095 },
    flags: { blind: true },
  });
}

// Downloads the full daily close history of the US stock market index (^GSPC)
// from Yahoo Finance's free chart API and writes data/raw/gspc-daily.csv (date,close).
// Run: npm run data:fetch
//
// Yahoo answers 429 to requests with no User-Agent, so this sends an honest client
// name. It does not impersonate a browser. If the download is refused, stop: do not
// switch source without asking.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/raw/gspc-daily.csv');
const USER_AGENT = 'dont-press-sell-price-script/1.0';
const PERIOD1 = -1325635200; // 1927-12-29 00:00 UTC, before the first row (1927-12-30)

interface ChartResponse {
  chart: {
    result:
      | {
          meta: {
            symbol: string;
            exchangeTimezoneName: string;
            currentTradingPeriod?: { regular?: { start: number; end: number } };
          };
          timestamp: number[];
          indicators: { quote: { close: (number | null)[] }[] };
        }[]
      | null;
    error: unknown;
  };
}

/** The trading date in the exchange's own time zone (New York), as yyyy-mm-dd. */
function tradingDate(unixSeconds: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(unixSeconds * 1000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function main(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC` +
    `?period1=${PERIOD1}&period2=${now}&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`download refused: HTTP ${res.status} ${res.statusText}. Stop and report; do not switch source.`);
  }
  const body = (await res.json()) as ChartResponse;
  const result = body.chart.result?.[0];
  if (!result) throw new Error(`no data in response: ${JSON.stringify(body.chart.error)}`);
  if (result.meta.symbol !== '^GSPC') throw new Error(`unexpected symbol ${result.meta.symbol}`);
  const tz = result.meta.exchangeTimezoneName;
  if (tz !== 'America/New_York') throw new Error(`unexpected exchange time zone ${tz}`);

  const closes = result.indicators.quote[0].close;
  const stamps = result.timestamp;
  // Drop a session that has not closed yet (its "close" is a live price).
  const regularEnd = result.meta.currentTradingPeriod?.regular?.end;
  const sessionOpen = regularEnd !== undefined && now < regularEnd;
  const todayNY = tradingDate(now, tz);

  const rows: string[] = ['date,close'];
  let last = '';
  let skippedNull = 0;
  for (let i = 0; i < stamps.length; i++) {
    const c = closes[i];
    const date = tradingDate(stamps[i], tz);
    if (c === null || c === undefined) {
      skippedNull++;
      continue;
    }
    if (sessionOpen && date === todayNY) continue;
    if (date <= last) throw new Error(`dates out of order or repeated at ${date}`);
    last = date;
    rows.push(`${date},${c.toFixed(2)}`);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, rows.join('\n') + '\n');
  console.log(
    `wrote ${rows.length - 1} rows (${rows[1].split(',')[0]} to ${last}) to data/raw/gspc-daily.csv` +
      (skippedNull ? `; skipped ${skippedNull} empty rows` : ''),
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

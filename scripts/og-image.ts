// Draws public/og.png (1200 x 627), the link preview: the red worst-day front page of the real
// 2008 run (its largest one-day fall), with the anonymised headline so the preview spoils nothing.
// Usage: npx tsx scripts/og-image.ts  (needs Playwright's Chromium, as the e2e tests do)
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { MASTHEAD, dollars, sellLabel } from '../src/content/copy';
import type { Headline, RunData } from '../src/engine/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = JSON.parse(readFileSync(join(ROOT, 'data/runs/c2007.prices.json'), 'utf8')) as RunData;
const news = JSON.parse(readFileSync(join(ROOT, 'data/runs/c2007.headlines.json'), 'utf8')) as Headline[];

// The largest one-day fall before the fall ends.
let worst = 1;
for (let d = 1; d < run.fallEndIndex; d++) {
  if (run.closes[d] / run.closes[d - 1] < run.closes[worst] / run.closes[worst - 1]) worst = d;
}
const bal = (d: number) => (10000 * run.closes[d]) / run.closes[0];
const headline = news.filter((h) => h.dayIndex <= worst).pop()!.anon;

// The balance line from day 1 to the worst day, cream on red with a darker fill (spec 9).
const W = 1104;
const H = 200;
const lo = Math.min(...run.closes.slice(0, worst + 1).map((_, d) => bal(d)), 10000);
const hi = Math.max(...run.closes.slice(0, worst + 1).map((_, d) => bal(d)), 10000);
const x = (d: number) => (d / worst) * (W - 16);
const y = (v: number) => 10 + ((hi - v) / (hi - lo)) * (H - 20);
const pts = Array.from({ length: worst + 1 }, (_, d) => `${x(d).toFixed(1)},${y(bal(d)).toFixed(1)}`).join(' ');
const font = (f: string) => `url(data:font/woff2;base64,${readFileSync(join(ROOT, 'public/fonts', f)).toString('base64')}) format('woff2')`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:N;src:${font('newsreader.woff2')};font-weight:200 800}
@font-face{font-family:F;src:${font('libre-franklin-500.woff2')};font-weight:500}
@font-face{font-family:F;src:${font('libre-franklin-700.woff2')};font-weight:700}
body{margin:0;width:1200px;height:627px;background:#b3142a;color:#fbeee2;font-family:N;overflow:hidden}
.p{padding:28px 48px}
.m{border-top:6px solid #fbeee2;border-bottom:2px solid #fbeee2;padding:10px 0 6px;text-align:center;font-weight:700;font-size:48px;line-height:1;letter-spacing:-0.02em}
.f{display:flex;justify-content:space-between;padding:10px 0;border-bottom:2px solid #fbeee2;font-family:F;font-weight:500;font-size:20px}
h1{margin:18px 0 0;font-weight:800;font-size:64px;line-height:0.98;letter-spacing:-0.03em}
.row{display:flex;justify-content:space-between;align-items:flex-end;margin-top:14px}
.b{font-weight:700;font-size:84px;line-height:1;font-variant-numeric:lining-nums tabular-nums;letter-spacing:-0.03em}
.btn{background:#fbeee2;color:#8f0f22;font-family:F;font-weight:700;font-size:32px;padding:18px 32px}
svg{display:block;margin-top:14px}
</style></head><body><div class="p">
<div class="m">${MASTHEAD}</div>
<div class="f"><span>Mystery crash</span><span>Day ${worst + 1}</span><span>Time slowed</span></div>
<h1>${headline}</h1>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<polygon fill="#96102a" points="${pts} ${x(worst)},${H} 0,${H}"/>
<line x1="0" x2="${W}" y1="${y(10000)}" y2="${y(10000)}" stroke="#fbeee2" stroke-width="1.5" stroke-dasharray="2 6"/>
<polyline fill="none" stroke="#fbeee2" stroke-width="4" stroke-linejoin="round" points="${pts}"/>
<circle cx="${x(worst)}" cy="${y(bal(worst))}" r="10" fill="#fbeee2"/>
</svg>
<div class="row"><div class="b">${dollars(bal(worst))}</div><div class="btn">${sellLabel(bal(worst))}</div></div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 627 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(ROOT, 'public/og.png') });
await browser.close();
console.log(`public/og.png: day ${worst + 1}, ${dollars(bal(worst))}, "${headline}"`);

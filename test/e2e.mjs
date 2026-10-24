// Headless verification (Playwright + Chromium), desktop 1280 and mobile 390.
//   npm run test:e2e                     builds nothing; serves ./dist on a random port and tests it
//   npm run test:pages                   same, but served under /subak-lab/ like GitHub Pages
//   BASE=https://andreolf.github.io/subak-lab SHOT_PREFIX=live- node test/e2e.mjs   tests the live site
import { chromium } from 'playwright';
import { serve } from './static-server.mjs';
const OTHER = 'coconut-lab';
let server = null, BASE = process.env.BASE;
if (!BASE) { server = await serve(new URL('../dist/', import.meta.url).pathname, process.env.SUBPATH || ''); BASE = server.url; }
BASE = BASE.replace(/\/$/, '');
const SHOTS = process.env.NO_SHOTS ? null : new URL('../screenshots/', import.meta.url).pathname;
const PFX = process.env.SHOT_PREFIX || '';
const shot = (p, name, opts = {}) => SHOTS ? p.screenshot({ path: SHOTS + PFX + name, ...opts }) : null;
console.log('testing', BASE);
const browser = await chromium.launch();
const results = []; const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); };
async function page(w, h, mobile = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage(); p._errs = []; p._bad = [];
  p.on('console', (m) => { if (m.type() === 'error') p._errs.push(m.text()); });
  p.on('pageerror', (e) => p._errs.push(String(e)));
  p.on('response', (r) => { if (r.status() >= 400) p._bad.push(r.status() + ' ' + r.url()); });
  p.on('requestfailed', (r) => p._bad.push('failed ' + r.url()));
  return p;
}
const lab = (p) => p.evaluate(() => window.__lab);
const setRange = (p, id, v) => p.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); }, [id, v]);
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---- landing (site root = the lab) + tools page: assets load under the (sub)path, standalone, disclaimer present
for (const [name, url] of [['root /', `${BASE}/`], ['tools', `${BASE}/tools.html`]]) {
  for (const [w, h, m] of [[1280, 900, false], [390, 844, true]]) {
    const p = await page(w, h, m); const resp = await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const tag = `${name} @${w}`;
    ok(`${tag}: HTTP 200`, resp && resp.status() === 200, String(resp && resp.status()));
    ok(`${tag}: all assets load (no 4xx / failed requests)`, p._bad.length === 0, p._bad.join(' | '));
    const fontOk = await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px Archivo'); });
    ok(`${tag}: self-hosted font loaded`, fontOk);
    const css = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); ok(`${tag}: stylesheet applied`, css === 'rgb(0, 0, 0)', css);
    const hrefs = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
    const abs = hrefs.filter((x) => x.startsWith('/') && !x.startsWith('//')); ok(`${tag}: no root-absolute links`, abs.length === 0, abs.join(' '));
    const cross = hrefs.filter((x) => /coconut\.html|subak\.html/.test(x) || (x.includes(OTHER) && !x.startsWith(`https://andreolf.github.io/${OTHER}/`)));
    const footerOnly = await p.$$eval(`a[href*="${OTHER}"]`, (as) => as.every((a) => a.closest('footer')));
    ok(`${tag}: standalone (other lab only linked from footer)`, cross.length === 0 && footerOnly, cross.join(' '));
    const txt = await p.textContent('body'); ok(`${tag}: honest educational disclaimer`, /simplified, educational approximation/.test(txt));
    if (name === 'root /') { ok(`${tag}: lab is the landing page`, !!(await lab(p)), ''); if (w === 1280) await shot(p, 'desktop-1280.png'); }
    if (name === 'tools' && w === 1280) await shot(p, 'tools-desktop-1280.png');
    ok(`${tag}: no horizontal overflow`, await noOverflow(p));
    ok(`${tag}: no console errors`, p._errs.length === 0, p._errs.join(' | '));
    await p.context().close();
  }
}

// ---- subak desktop
{
  const p = await page(1280, 900); await p.goto(`${BASE}/index.html`);
  await setRange(p, 'spd', 90); await p.waitForTimeout(22000);
  let s = await lab(p);
  const steady = s.h.every((h) => Math.abs(h - 0.0705) < 0.004);
  ok('subak: status reports steady', s.status.startsWith('STEADY'), s.status);
  ok('subak: 5 paddies fill & settle near 7 cm', s.h.length === 5 && steady, `t=${(s.t / 3600).toFixed(1)}h h=${s.h.map((x) => (x * 100).toFixed(2))}`);
  const kpa = await p.textContent('#n-p'); ok('subak: floor pressure ≈ 0.69 kPa', /0\.69|0\.7\b|0\.70/.test(kpa), kpa);
  await setRange(p, 'spd', 30);
  await p.locator('#stage').scrollIntoViewIfNeeded(); await shot(p, 'subak-stage-1280.png');
  await p.selectOption('#tgt', '2'); await p.click('#block'); await setRange(p, 'spd', 90); await p.waitForTimeout(6000);
  s = await lab(p); ok('subak: blocking notch 2 raises paddy 2 / overtops', s.h[1] > 0.1, `h2=${(s.h[1] * 100).toFixed(1)} status=${s.status}`);
  await p.click('#block'); await p.click('#stones'); await setRange(p, 'Qin', 3); await p.waitForTimeout(6000);
  s = await lab(p); ok('subak: removing stones erodes crest 2', s.c[1] < 0.045, `c2=${(s.c[1] * 100).toFixed(1)} cm status=${s.status}`);
  await shot(p, 'subak-broken-1280.png');
  await p.click('#tem'); await p.waitForTimeout(300);
  ok('subak: open tembuku shows share slider', await p.isVisible('#share-row'), '');
  ok('subak desktop: no console errors', p._errs.length === 0 && s.errors === 0, p._errs.join(' | '));
  await p.context().close();
}
// ---- subak mobile
{
  const p = await page(390, 844, true); await p.goto(`${BASE}/`); await p.waitForTimeout(5000);
  const s = await lab(p); ok('subak mobile: running', s && s.t > 0, JSON.stringify(s && { t: s.t, status: s.status }));
  await shot(p, 'mobile-390.png');
  await p.locator('#stage').scrollIntoViewIfNeeded(); await shot(p, 'subak-stage-mobile-390.png');
  ok('subak mobile: no horizontal overflow', await noOverflow(p));
  await p.tap('#tem'); await p.waitForTimeout(300); ok('subak mobile: tap tembuku works', await p.isVisible('#share-row'));
  ok('subak mobile: no console errors', p._errs.length === 0 && p._bad.length === 0, [...p._errs, ...p._bad].join(' | '));
  await p.context().close();
}

await browser.close(); if (server) server.close();
for (const r of results) console.log(r.join('  '));
const f = results.filter((r) => r[0] === 'FAIL').length; console.log(`\n${results.length - f}/${results.length} passed`);
process.exit(f ? 1 : 0);

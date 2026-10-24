import { Cascade, K } from './subak-core.js';
import { fit, wobblyPoly, wobblyLine, bindSlider, rng } from './sketch.js';
const $ = (id) => document.getElementById(id);
const cs = new Cascade();
const stage = $('stage'), cv = $('sec'), cvC = $('chart');
let g, gc, W, H, CH, sel = 1, speed = 30, paused = false, errors = 0;
const hist = []; let lastSample = -1e9; const drops = [];
const COLS = ['#EEFF41', '#7CFFB2', '#5abeff', '#ffffff', '#ff9f43'];

function resize() {
  W = stage.clientWidth; H = Math.round(W < 640 ? W * 0.82 : W * 0.46); CH = W < 640 ? 170 : 200;
  g = fit(cv, W, H); gc = fit(cvC, W, CH);
}
addEventListener('resize', resize); resize();

bindSlider('Qin', (v) => v.toFixed(1) + ' L/s', (v) => (cs.Qin = v / 1000));
bindSlider('b', (v) => Math.round(v) + ' cm', (v) => (cs.b = v / 100));
bindSlider('A', (v) => Math.round(v) + ' m²', (v) => (cs.A = v));
bindSlider('spd', (v) => v + ' min/s', (v) => (speed = v));
bindSlider('share', (v) => Math.round(v * 100) + '%', (v) => (cs.share = v));
$('tgt').onchange = (e) => { sel = +e.target.value; syncBtns(); };
function syncBtns() {
  const p = cs.P[sel - 1];
  $('block').setAttribute('aria-pressed', p.blocked); $('block').textContent = p.blocked ? `Unblock notch ${sel}` : `Block notch ${sel}`;
  $('stones').setAttribute('aria-pressed', !p.stones); $('stones').textContent = p.stones ? `Remove stones (paddy ${sel})` : `Put stones back (${sel})`;
  $('tem').setAttribute('aria-pressed', cs.tembuku); $('tem').textContent = cs.tembuku ? 'Close tembuku divider' : 'Open tembuku divider';
  $('share-row').style.display = cs.tembuku ? '' : 'none';
}
$('block').onclick = () => { cs.P[sel - 1].blocked = !cs.P[sel - 1].blocked; syncBtns(); };
$('stones').onclick = () => { const p = cs.P[sel - 1]; p.stones = !p.stones; syncBtns(); };
$('tem').onclick = () => { cs.tembuku = !cs.tembuku; syncBtns(); };
$('empty').onclick = () => { cs.reset(false); hist.length = 0; lastSample = -1e9; syncBtns(); };
$('full').onclick = () => { cs.reset(true); hist.length = 0; lastSample = -1e9; syncBtns(); };
$('pause').onclick = (e) => { paused = !paused; e.target.setAttribute('aria-pressed', paused); e.target.textContent = paused ? '▶ Play' : '❚❚ Pause'; };
cv.addEventListener('click', (e) => { const r = cv.getBoundingClientRect(); const i = geo().idx(e.clientX - r.left); if (i >= 0) { sel = i + 1; $('tgt').value = sel; syncBtns(); } });
syncBtns();

function geo() {
  const left = W * 0.04, right = W * 0.98, pw = (right - left) / (K.N + 0.15), top = H * 0.14, step = (H * 0.78 - top) / K.N;
  const hs = step * 0.55 / 0.16; // px per m of water (vertical exaggeration)
  return { left, pw, top, step, hs, floor: (i) => top + step * (i + 1) - step * 0.15, x0: (i) => left + i * pw, idx: (x) => { const i = Math.floor((x - left) / pw); return i >= 0 && i < K.N ? i : -1; } };
}
function draw(dt) {
  const G = geo(); g.clearRect(0, 0, W, H);
  const small = W < 640;
  // jungle & canal
  g.fillStyle = '#0d1f0d'; wobblyPoly(g, [[0, 0], [W * 0.3, 0], [W * 0.18, G.top * 0.9], [0, G.top * 1.4]], 2, 3); g.fill();
  g.font = `700 ${small ? 14 : 18}px Caveat, cursive`; g.fillStyle = '#7CFFB2'; g.fillText('jungle → canal (telabah)', 8, small ? 16 : 22);
  const y0 = G.floor(0) - Math.max(cs.P[0].h, 0.02) * G.hs;
  g.strokeStyle = '#5abeff'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, G.top * 0.9); g.quadraticCurveTo(G.left, G.top * 0.9, G.left + 4, y0); g.stroke();
  if (cs.tembuku) { g.strokeStyle = '#ff9f43'; g.lineWidth = 3; g.beginPath(); g.moveTo(G.left * 0.6, G.top * 0.9); g.lineTo(G.left * 0.6 + 30, G.top * 0.25); g.stroke(); g.fillStyle = '#ff9f43'; g.fillText(`tembuku: ${Math.round((1 - cs.share) * 100)}% → neighbour subak`, G.left + 34, G.top * 0.45); }
  for (let i = 0; i < K.N; i++) {
    const p = cs.P[i], x0 = G.x0(i), x1 = x0 + G.pw, fl = G.floor(i), bw = G.pw * 0.08;
    // soil body
    g.fillStyle = '#3b2a1a'; wobblyPoly(g, [[x0, fl], [x1, fl], [x1, H], [x0, H]], 10 + i, 2); g.fill();
    g.fillStyle = '#5a3f26'; g.fillRect(x0, fl, G.pw, Math.max(3, G.step * 0.08)); // compacted clay layer
    // water
    const hpx = p.h * G.hs;
    if (hpx > 0.3) { g.fillStyle = 'rgba(63,169,245,0.55)'; g.fillRect(x0, fl - hpx, G.pw - bw, hpx); g.strokeStyle = '#5abeff'; g.lineWidth = 1.5; wobblyLine(g, x0, fl - hpx, x1 - bw, fl - hpx, 30 + i, 1.2, 10); g.stroke(); }
    // rice
    const r = rng(100 + i); g.strokeStyle = p.h < 0.01 ? '#a38f3c' : '#8bc34a'; g.lineWidth = 1.4;
    for (let k = 0; k < 9; k++) { const xr = x0 + G.pw * (0.08 + 0.09 * k); g.beginPath(); g.moveTo(xr, fl); g.lineTo(xr - 3 + r() * 6, fl - G.step * 0.4 - r() * 6); g.moveTo(xr, fl); g.lineTo(xr + 4, fl - G.step * 0.33); g.stroke(); }
    // bund with notch
    const bundTop = fl - K.bund * G.hs, crestY = fl - p.c * G.hs;
    g.fillStyle = '#6d4c2f'; wobblyPoly(g, [[x1 - bw, fl], [x1 - bw, bundTop], [x1, bundTop], [x1, fl + G.step]], 40 + i, 1.5); g.fill();
    g.strokeStyle = p.overtop ? '#ff5c39' : '#EEFF41'; g.lineWidth = 1.6; g.stroke();
    // notch (lighter cut) & stones
    g.fillStyle = 'rgba(63,169,245,0.25)'; g.fillRect(x1 - bw, bundTop, bw, crestY - bundTop);
    if (p.stones) { g.fillStyle = '#cfcfcf'; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x1 - bw + bw * (0.2 + 0.3 * k), crestY + 2, bw * 0.17, 3, 0, 0, 7); g.fill(); } }
    if (p.blocked) { g.fillStyle = '#ff5c39'; g.fillRect(x1 - bw, bundTop, bw, crestY - bundTop + 2); g.fillStyle = '#000'; g.font = '900 11px Archivo'; g.fillText('X', x1 - bw * 0.8, crestY - 2); }
    // jet: droplets
    const Q = p.Qn + p.Qo;
    if (Q > 1e-6) {
      const n = Math.min(60, 3 + Q * 1e4); const yl = i < K.N - 1 ? G.floor(i + 1) - cs.P[i + 1].h * G.hs : H * 0.95;
      g.strokeStyle = 'rgba(120,200,255,0.8)'; g.lineWidth = Math.min(8, 1 + Q * 800); g.beginPath(); g.moveTo(x1, crestY - (p.h - p.c) * G.hs * 0.5);
      g.quadraticCurveTo(x1 + G.pw * 0.12, crestY, x1 + G.pw * 0.16, yl); g.stroke();
      if (!paused) for (let k = 0; k < n * dt * 3; k++) drops.push({ x: x1 + 2, y: crestY - 3, vx: 25 + Math.random() * 25, vy: -Math.random() * 10, yl });
    }
    // labels
    g.fillStyle = sel === i + 1 ? '#EEFF41' : '#ddd'; g.font = `800 ${small ? 11 : 13}px Archivo, sans-serif`;
    const ly = fl + (small ? 16 : 20);
    g.fillText(`${sel === i + 1 ? '▶ ' : ''}Paddy ${i + 1}`, x0 + 4, ly);
    g.font = `600 ${small ? 10 : 12}px Archivo, sans-serif`; g.fillStyle = '#bbb';
    g.fillText(`h ${(p.h * 100).toFixed(1)} cm`, x0 + 4, ly + (small ? 13 : 16));
    g.fillStyle = '#EEFF41'; g.fillText(`p ${(cs.pressure(i) / 1000).toFixed(2)} kPa`, x0 + 4, ly + (small ? 26 : 32));
    if (!p.stones) { g.fillStyle = '#ff9f43'; g.fillText(`crest ${(p.c * 100).toFixed(1)} cm`, x0 + 4, ly + (small ? 39 : 48)); }
    if (p.overtop) { g.fillStyle = '#ff5c39'; g.font = `700 ${small ? 14 : 17}px Caveat, cursive`; g.fillText('overtopping! bund erodes', x0 + 2, bundTop - 8); }
  }
  // droplets
  g.fillStyle = '#bfe6ff';
  for (let k = drops.length - 1; k >= 0; k--) { const d = drops[k]; if (!paused) { d.vy += 300 * dt; d.x += d.vx * dt; d.y += d.vy * dt; } if (d.y > d.yl) { drops.splice(k, 1); continue; } g.fillRect(d.x, d.y, 2, 2); }
  if (drops.length > 1500) drops.splice(0, drops.length - 1500);
  g.fillStyle = '#777'; g.font = `600 ${small ? 10 : 12}px Archivo, sans-serif`; g.fillText('vertical scale of the water ×~40 · tap a paddy to select it', 8, H - 8);
  g.fillStyle = '#5abeff'; g.fillText('→ river', W - 60, H - 8);
}
function chart() {
  const c = gc, pad = 34, w = W - pad - 8, h = CH - 34; c.clearRect(0, 0, W, CH);
  c.fillStyle = '#050505'; c.fillRect(0, 0, W, CH);
  const ymax = 0.18, span = 24 * 3600, tEnd = Math.max(span, cs.t), t0 = tEnd - span;
  const X = (t) => pad + (t - t0) / span * w, Y = (v) => 8 + h - v / ymax * h;
  c.strokeStyle = '#222'; c.lineWidth = 1; c.font = '600 10px Archivo, sans-serif'; c.fillStyle = '#888';
  for (let v = 0; v <= 0.18; v += 0.03) { c.beginPath(); c.moveTo(pad, Y(v)); c.lineTo(pad + w, Y(v)); c.stroke(); c.fillText((v * 100).toFixed(0), 6, Y(v) + 3); }
  for (let hr = Math.ceil(t0 / 3600 / 4) * 4; hr * 3600 <= tEnd; hr += 4) { const x = X(hr * 3600); c.fillText(hr + 'h', x - 6, CH - 6); }
  c.setLineDash([4, 4]); c.strokeStyle = '#555'; c.beginPath(); c.moveTo(pad, Y(K.crest)); c.lineTo(pad + w, Y(K.crest)); c.stroke();
  c.strokeStyle = '#ff5c39'; c.beginPath(); c.moveTo(pad, Y(K.bund)); c.lineTo(pad + w, Y(K.bund)); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#888'; c.fillText('notch crest', pad + 4, Y(K.crest) - 3); c.fillStyle = '#ff5c39'; c.fillText('bund top', pad + 4, Y(K.bund) - 3);
  c.fillStyle = '#ccc'; c.fillText('h(t) [cm]', pad + 4, 16);
  for (let i = 0; i < K.N; i++) {
    c.strokeStyle = COLS[i]; c.lineWidth = sel === i + 1 ? 2.6 : 1.5; c.beginPath(); let first = true;
    for (const s of hist) { if (s[0] < t0) continue; const x = X(s[0]), y = Y(Math.min(ymax, s[1][i])); first ? c.moveTo(x, y) : c.lineTo(x, y); first = false; }
    c.stroke(); c.fillStyle = COLS[i]; c.fillText('P' + (i + 1), pad + w - 150 + i * 30, 16);
  }
}
function hud() {
  const H0 = cs.H0(), p0 = cs.P[sel - 1];
  $('n-p').textContent = (cs.pressure(sel - 1) / 1000).toFixed(2) + ' kPa';
  $('n-h').textContent = (p0.h * 100).toFixed(1) + ' cm';
  $('n-H').textContent = (Math.max(0, p0.h - p0.c) * 100).toFixed(1) + ' cm';
  $('n-q').textContent = (cs.outflow() * 1000).toFixed(2) + ' L/s';
  $('n-tau').textContent = isFinite(cs.tau()) ? (cs.tau() / 60).toFixed(0) + ' min' : '∞';
  $('n-t').textContent = Math.floor(cs.t / 3600) + 'h ' + String(Math.floor(cs.t / 60) % 60).padStart(2, '0') + 'm';
  $('n-H0').textContent = (H0 * 100).toFixed(1) + ' cm';
  $('n-vol').textContent = cs.stored().toFixed(1) + ' m³';
  const st = $('status'), any = cs.P.some((p) => p.overtop), dry = cs.P.some((p) => p.h < 0.03 && cs.t > 3 * 3600), ero = cs.P.some((p) => p.c < K.crest - 0.005);
  if (any) { st.className = 'status bad'; st.textContent = 'BUND OVERTOPPING'; }
  else if (ero) { st.className = 'status bad'; st.textContent = 'NOTCH ERODING'; }
  else if (dry) { st.className = 'status mid'; st.textContent = 'PADDY TOO DRY'; }
  else if (cs.P.every((p) => p.h > p.c) && Math.max(...cs.rates(cs.P.map((p) => p.h)).dh.map(Math.abs)) < 0.0005 / 3600) { st.className = 'status ok'; st.textContent = 'STEADY · BALANCED'; }
  else { st.className = 'status mid'; st.textContent = 'FILLING / SETTLING'; }
  window.__lab = { t: cs.t, h: cs.P.map((p) => p.h), c: cs.P.map((p) => p.c), status: st.textContent, errors };
}
let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  try {
    if (!paused) {
      const simDt = dt * speed * 60, n = Math.ceil(simDt / 2);
      for (let k = 0; k < n; k++) cs.step(simDt / n);
      if (cs.t - lastSample > 120) { hist.push([cs.t, cs.P.map((p) => p.h)]); lastSample = cs.t; if (hist.length > 2000) hist.shift(); }
    }
    draw(dt); chart(); hud();
  } catch (e) { errors++; console.error(e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

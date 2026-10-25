(() => {
const E = window.Echo;
const $ = id => document.getElementById(id);
const FILES = 'abcdefgh';
const sqName = i => FILES[i & 7] + (8 - (i >> 3));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MS = ms => REDUCE ? 1 : ms;

// ---------- settings ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const prefs = Object.assign({lang:'en', rulesLang:'en', sound:true, haptics:true, diff:2}, store.get('ef-prefs', {}));
const savePrefs = () => store.set('ef-prefs', prefs);
const t = (k, vars) => {
  let s = (STR[prefs.lang] || STR.en)[k]; if (s == null) s = STR.en[k]; if (s == null) s = k;
  if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
  return s;
};
const LEVELS = {1:{depth:1, slack:70}, 2:{depth:2, slack:15}, 3:{depth:3, slack:4}};

// ---------- sound (synthesised, no files) ----------
let ac = null, noiseBuf = null;
function actx() {
  if (!prefs.sound) return null;
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(f, dur, type = 'sine', vol = .2, to = null, when = 0) {
  const a = actx(); if (!a) return;
  const t0 = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + .02);
}
function noise(dur, vol, ftype, freq, q = 1, when = 0, to = null) {
  const a = actx(); if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = a.currentTime + when, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; f.type = ftype; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t0); s.stop(t0 + dur + .02);
}
const SFX = {
  tap() { tone(900, .05, 'triangle', .07); },
  lift() { tone(300, .08, 'sine', .12, 520); },
  move() { tone(420, .1, 'sine', .25, 210); noise(.04, .12, 'highpass', 2500); },
  capture() { tone(320, .16, 'square', .1, 80); noise(.14, .28, 'bandpass', 1300, 1.4); },
  crack() { for (let k = 0; k < 5; k++) noise(.03, .25, 'bandpass', rand(3000, 6500), 9, k * .03); tone(2600, .06, 'triangle', .04, 1700); },
  fall() { for (let k = 0; k < 6; k++) noise(.03, .25, 'bandpass', rand(2500, 6000), 8, k * .025); noise(.45, .3, 'lowpass', 3000, 1, .1, 180); tone(150, .45, 'sine', .4, 45, .15); noise(.5, .14, 'bandpass', 700, 2, .4, 250); },
  win() { [523, 659, 784, 1047].forEach((f, k) => tone(f, .24, 'triangle', .18, null, k * .11)); tone(1319, .6, 'triangle', .16, null, .5); tone(1568, .6, 'sine', .08, null, .5); },
  lose() { [392, 330, 262, 196].forEach((f, k) => tone(f, .32, 'sawtooth', .07, f * .96, k * .17)); },
  hint() { tone(660, .08, 'sine', .12); tone(990, .12, 'sine', .12, null, .08); },
  deny() { tone(180, .12, 'square', .06, 140); }
};
const sfx = name => { try { SFX[name](); } catch (e) {} };

// ---------- haptics (native bridge on Android, web fallback elsewhere) ----------
function buzz(p) {
  if (!prefs.haptics) return;
  try {
    if (window.EchoNative) { Array.isArray(p) ? EchoNative.vibratePattern(p.join(',')) : EchoNative.vibrate(p); }
    else if (navigator.vibrate) navigator.vibrate(p);
  } catch (e) {}
}

// ---------- art ----------
const PIECE = {
  p:'<circle cx="50" cy="30" r="14"/><path d="M35 82 L39 57 Q50 49 61 57 L65 82 Z"/>',
  r:'<path d="M31 80 L34 44 H66 L69 80 Z"/><path d="M26 45 V20 H36 V28 H45 V20 H55 V28 H64 V20 H74 V45 Z"/>',
  n:'<path d="M28 82 L30 66 Q30 47 44 38 L40 23 L51 31 Q68 22 76 42 L79 56 Q73 63 64 57 L58 53 Q60 67 71 82 Z"/><circle class="eye" cx="58" cy="39" r="3.8"/>',
  b:'<circle cx="50" cy="15" r="6.5"/><path d="M34 82 Q28 58 50 23 Q72 58 66 82 Z"/><path class="slit" d="M57 40 L45 55"/>',
  q:'<path d="M30 80 L21 37 L38 56 L50 28 L62 56 L79 37 L70 80 Z"/><circle cx="21" cy="32" r="6.5"/><circle cx="50" cy="22" r="6.5"/><circle cx="79" cy="32" r="6.5"/>',
  k:'<path d="M30 80 Q23 53 36 47 Q50 41 64 47 Q77 53 70 80 Z"/><path d="M45 10 H55 V19 H63 V29 H55 V42 H45 V29 H37 V19 H45 Z"/>'
};
const BASE = '<rect x="23" y="78" width="54" height="13" rx="6"/>';
const pieceSVG = (t, c, cls = '') => `<svg viewBox="0 0 100 100" class="pz ${c} ${cls}"><g class="body">${PIECE[t]}${BASE}</g><path class="shine" d="M40 62 Q42 70 41 75"/></svg>`;

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed);
    x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}
function arm(R, x, y, ang, steps) {
  let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
  for (let k = 0; k < steps; k++) {
    ang += (R() - .5) * 1.1; const len = 7 + R() * 11;
    x += Math.cos(ang) * len; y += Math.sin(ang) * len;
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}
const perim = t => { t = ((t % 4) + 4) % 4; const s = Math.floor(t), f = (t - s) * 100;
  return s === 0 ? [f, 0] : s === 1 ? [100, f] : s === 2 ? [100 - f, 100] : [0, 100 - f]; };
const CORNER = [[0, 0], [100, 0], [100, 100], [0, 100]];
// Per-square art: crack paths for each level, shard polygons for the fall, and the jagged hole outline.
const ART = [];
for (let i = 0; i < 64; i++) {
  const R = rng(i * 9973 + 17);
  const cx = 30 + R() * 40, cy = 30 + R() * 40, a = R() * Math.PI * 2;
  const one = [arm(R, cx, cy, a, 5), arm(R, cx, cy, a + Math.PI, 4)];
  const two = [arm(R, cx, cy, a + 1.9, 5), arm(R, cx, cy, a - 1.6, 4), arm(R, 20 + R() * 60, 20 + R() * 60, R() * 6.3, 3)];
  const N = 7, ts = [];
  for (let k = 0; k < N; k++) ts.push((k + .2 + R() * .6) / N * 4);
  const shards = ts.map((ta, k) => {
    const tb = k === N - 1 ? ts[0] + 4 : ts[k + 1];
    const pts = [[cx, cy], perim(ta)];
    for (let c = Math.ceil(ta); c < tb; c++) if (c > ta) pts.push(CORNER[c % 4]);
    pts.push(perim(tb));
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return {clip:`polygon(${pts.map(p => `${p[0].toFixed(1)}% ${p[1].toFixed(1)}%`).join(',')})`, dx:mx - cx, dy:my - cy};
  });
  const hp = [];
  for (let k = 0; k < 14; k++) {
    const an = k / 14 * Math.PI * 2, rad = 38 + R() * 12;
    hp.push(`${Math.max(1, Math.min(99, 50 + Math.cos(an) * rad)).toFixed(1)}% ${Math.max(1, Math.min(99, 50 + Math.sin(an) * rad)).toFixed(1)}%`);
  }
  ART.push({one, two, cx, cy, shards, hole:`polygon(${hp.join(',')})`});
}
function crackSVG(i, level, from = 9) {
  const a = ART[i]; let h = '<svg class="crk" viewBox="0 0 100 100" preserveAspectRatio="none">';
  const add = (paths, anim) => paths.forEach((d, k) => {
    const st = anim ? ` style="animation-delay:${k * 70}ms"` : '';
    h += `<path class="h${anim ? ' draw' : ''}"${st} pathLength="1" d="${d}"/><path class="c${anim ? ' draw' : ''}"${st} pathLength="1" d="${d}"/>`;
  });
  if (level >= 1) add(a.one, from < 1);
  if (level >= 2) add(a.two, from < 2);
  return h + '</svg>';
}
const voidHTML = i => `<div class="void" style="clip-path:${ART[i].hole}"></div>`;

// ---------- effects ----------
const fxEl = $('fx'), boardEl = $('board'), tilesEl = $('tiles'), piecesEl = $('pieces');
const T = i => `translate(${(i & 7) * 100}%,${(i >> 3) * 100}%)`;
function fxBox(i) {
  const b = document.createElement('div'); b.className = 'fxbox';
  b.style.left = (i & 7) * 12.5 + '%'; b.style.top = (i >> 3) * 12.5 + '%';
  fxEl.appendChild(b); return b;
}
function chips(box, n, color, spread = 90, up = 60) {
  const S = box.offsetWidth || 40, u = S / 100;
  for (let k = 0; k < n; k++) {
    const c = document.createElement('i'); c.className = color ? 'spark' : 'chip';
    if (color) c.style.background = color[k % color.length];
    box.appendChild(c);
    const ang = rand(0, Math.PI * 2), d = rand(spread * .4, spread) * u;
    c.animate([
      {transform:'translate(-50%,-50%) scale(1) rotate(0)', opacity:1},
      {transform:`translate(calc(${Math.cos(ang) * d}px - 50%),calc(${Math.sin(ang) * d - up * u}px - 50%)) scale(.9) rotate(${rand(-200, 200)}deg)`, opacity:1, offset:.45},
      {transform:`translate(calc(${Math.cos(ang) * d * 1.3}px - 50%),calc(${Math.sin(ang) * d + 140 * u}px - 50%)) scale(.2) rotate(${rand(-400, 400)}deg)`, opacity:0}
    ], {duration:MS(rand(650, 950)), easing:'cubic-bezier(.3,.6,.6,1)', fill:'forwards'});
  }
}
// Tile breaks into shards that tumble into the water, then the water ripples.
function fallFX(host, i, tone) {
  const a = ART[i];
  a.shards.forEach((s, k) => {
    const d = document.createElement('div');
    d.className = 'shard ' + tone; d.style.clipPath = s.clip; d.style.webkitClipPath = s.clip;
    d.innerHTML = crackSVG(i, 2);
    host.appendChild(d);
    const rot = rand(-50, 50), push = .55;
    d.animate([
      {transform:'translate(0,0) rotate(0) scale(1)', opacity:1, filter:'brightness(1)'},
      {transform:`translate(${s.dx * .12}%,${s.dy * .12}%) rotate(${rot * .1}deg) scale(1)`, opacity:1, offset:.18},
      {transform:`translate(${s.dx * push}%,${s.dy * push + 40}%) rotate(${rot}deg) scale(.3)`, opacity:0, filter:'brightness(.4)'}
    ], {duration:MS(rand(750, 1050)), delay:MS(k * 35), easing:'cubic-bezier(.55,0,.8,.45)', fill:'forwards'});
  });
  [0, 260, 520].forEach(delay => {
    const r = document.createElement('i'); r.className = 'ripple'; host.appendChild(r);
    r.animate([{transform:'scale(.15)', opacity:0}, {transform:'scale(.3)', opacity:.9, offset:.15}, {transform:'scale(1.25)', opacity:0}],
      {duration:MS(900), delay:MS(420 + delay), easing:'ease-out', fill:'both'});
  });
  chips(host, 7, null, 70, 50);
}
function crackFX(i) {
  const tile = tileRefs[i].el;
  tile.animate([{transform:'none'}, {transform:'translate(-2px,1px)'}, {transform:'translate(2px,-1px)'}, {transform:'translate(-1px,0)'}, {transform:'none'}], {duration:MS(220)});
  const box = fxBox(i); chips(box, 4, null, 45, 35);
  setTimeout(() => box.remove(), 1100);
}
function shakeBoard(power = 4) {
  boardEl.animate([{transform:'none'}, {transform:`translate(${power}px,${-power / 2}px) rotate(.4deg)`}, {transform:`translate(${-power}px,${power / 2}px) rotate(-.4deg)`}, {transform:`translate(${power / 2}px,0)`}, {transform:'none'}], {duration:MS(320)});
}
function trailFX(from, to, color) {
  const fr = from >> 3, fc = from & 7, tr = to >> 3, tc = to & 7;
  const x1 = fc * 100 + 50, y1 = fr * 100 + 50, x2 = tc * 100 + 50, y2 = tr * 100 + 50;
  // Knights get an L-shaped trail so the jump reads clearly.
  const knight = Math.abs(fr - tr) + Math.abs(fc - tc) === 3 && fr !== tr && fc !== tc;
  const d = knight ? (Math.abs(tr - fr) === 2 ? `M${x1} ${y1} L${x1} ${y2} L${x2} ${y2}` : `M${x1} ${y1} L${x2} ${y1} L${x2} ${y2}`) : `M${x1} ${y1} L${x2} ${y2}`;
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 800 800'); s.setAttribute('class', 'trail');
  s.innerHTML = `<path d="${d}" stroke="#0a0516" stroke-width="22" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" opacity=".55"/><path d="${d}" stroke="${color}" stroke-width="12" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/><circle cx="${x2}" cy="${y2}" r="16" fill="${color}" stroke="#0a0516" stroke-width="5" opacity="0"/>`;
  fxEl.appendChild(s);
  const dur = MS(380);
  s.querySelectorAll('path').forEach(p => p.animate([{strokeDashoffset:1}, {strokeDashoffset:0}], {duration:dur, easing:'ease-out', fill:'forwards'}));
  s.querySelector('circle').animate([{opacity:0}, {opacity:1}], {duration:120, delay:dur, fill:'forwards'});
  s.animate([{opacity:1}, {opacity:1, offset:.6}, {opacity:0}], {duration:MS(1700), fill:'forwards'}).finished.then(() => s.remove());
}
function animateMove(el, from, to, dur, knight) {
  const fr = from >> 3, fc = from & 7, tr = to >> 3, tc = to & 7;
  const dist = Math.hypot(tr - fr, tc - fc), lift = knight ? 70 : Math.min(45, 14 + dist * 6);
  el.classList.add('lift'); el.style.zIndex = 5;
  const anim = el.animate([
    {transform:`translate(${fc * 100}%,${fr * 100}%) scale(1)`},
    {transform:`translate(${fc * 100}%,${fr * 100 - 12}%) scale(1.18)`, offset:.15},
    {transform:`translate(${(fc + tc) * 50}%,${(fr + tr) * 50 - lift}%) scale(1.28)`, offset:.55},
    {transform:`translate(${tc * 100}%,${tr * 100}%) scale(1)`}
  ], {duration:MS(dur), easing:'cubic-bezier(.4,0,.3,1)'});
  el.style.transform = T(to);
  return anim.finished.then(() => {
    el.classList.remove('lift'); el.style.zIndex = '';
    el.animate([{transform:T(to) + ' scale(1.16,.82)'}, {transform:T(to) + ' scale(.95,1.06)'}, {transform:T(to)}], {duration:MS(220), easing:'ease-out'});
  });
}
function explode(el, i) {
  el.style.zIndex = 4;
  el.animate([{transform:T(i) + ' scale(1) rotate(0)', opacity:1}, {transform:T(i) + ' scale(1.35) rotate(-12deg)', opacity:1, offset:.3}, {transform:T(i) + ' scale(0) rotate(40deg)', opacity:0}],
    {duration:MS(380), easing:'cubic-bezier(.5,0,.7,1)', fill:'forwards'}).finished.then(() => el.remove());
  const box = fxBox(i); chips(box, 12, ['#ff3d9a', '#ffe14a', '#53d8ff', '#fff3d6'], 110, 40);
  setTimeout(() => box.remove(), 1200);
}

// ---------- board DOM ----------
const tileRefs = [];
for (let i = 0; i < 64; i++) {
  const el = document.createElement('div');
  const tone = ((i >> 3) + (i & 7)) % 2 ? 'dark' : 'light';
  el.className = 't ' + tone;
  el.innerHTML = '<div class="ice"></div><div class="ov"></div>' +
    ((i & 7) === 0 ? `<span class="rk">${8 - (i >> 3)}</span>` : '') + ((i >> 3) === 7 ? `<span class="fl">${FILES[i & 7]}</span>` : '');
  tilesEl.appendChild(el);
  tileRefs.push({el, tone, ice:el.querySelector('.ice'), ov:el.querySelector('.ov'), k:-1, sig:''});
}
const pieceEls = new Map();

// ---------- game state ----------
let gameId = 0, G = null, hist = [], mode = 'ai', sel = -1, busy = false, hintMove = null, rulesReturn = 'home', screen = 'home';
const humanTurn = () => !G.winner && (mode === 'duo' || G.turn === 'w');
const sideName = s => t(s === 'w' ? 'white' : 'black');

function updateTiles(animate) {
  const legal = sel >= 0 ? E.gen(G).filter(m => m.from === sel) : [];
  const tgt = new Map(legal.map(m => [m.to, m]));
  for (let i = 0; i < 64; i++) {
    const ref = tileRefs[i], k = G.cracks[i];
    if (k !== ref.k) {
      if (animate && ref.k >= 0 && k > ref.k) {
        if (k >= 3) {
          ref.ice.innerHTML = voidHTML(i);
          const box = fxBox(i); fallFX(box, i, ref.tone); setTimeout(() => box.remove(), 2200);
        } else { ref.ice.innerHTML = crackSVG(i, k, ref.k); crackFX(i); }
      } else ref.ice.innerHTML = k >= 3 ? voidHTML(i) : k ? crackSVG(i, k) : '';
      ref.k = k;
    }
    let cls = 't ' + ref.tone;
    if (G.last && (G.last.from === i || G.last.to === i) && k < 3) cls += ' last';
    if (i === sel) cls += ' sel';
    if (hintMove && (hintMove.from === i || hintMove.to === i)) cls += ' hintsq';
    if (ref.el.classList.contains('tele')) cls += ' tele';
    ref.el.className = cls;
    const echo = i === G.echo && G.echoPiece;
    const tm = tgt.get(i);
    const sig = (echo ? 'e' + G.echoPiece.t + G.echoPiece.c : '') + (tm ? (tm.cap ? 'x' : 'o') : '');
    if (sig !== ref.sig) {
      ref.ov.innerHTML = (echo ? `<i class="ring"></i>${pieceSVG(G.echoPiece.t, G.echoPiece.c, 'ghost')}` : '') + (tm ? (tm.cap ? '<i class="capring"></i>' : '<i class="dot"></i>') : '');
      if (echo && animate) ref.ov.animate([{opacity:0, transform:'scale(.6)'}, {opacity:1, transform:'none'}], {duration:MS(350), easing:'ease-out'});
      ref.sig = sig;
    }
  }
}

function syncPieces(animate) {
  const seen = new Set();
  G.board.forEach((p, i) => {
    if (!p) return;
    seen.add(p.id);
    let el = pieceEls.get(p.id);
    if (!el) { el = document.createElement('div'); el.className = 'pc'; piecesEl.appendChild(el); pieceEls.set(p.id, el); }
    if (el.dataset.k !== p.t + p.c) {
      const promo = animate && el.dataset.k;
      el.innerHTML = pieceSVG(p.t, p.c); el.dataset.k = p.t + p.c;
      if (promo) {
        el.animate([{transform:T(i) + ' scale(.3) rotate(-30deg)'}, {transform:T(i) + ' scale(1.4) rotate(10deg)'}, {transform:T(i)}], {duration:MS(500), easing:'cubic-bezier(.2,1.6,.4,1)'});
        const box = fxBox(i); chips(box, 14, ['#ffe14a', '#fff3d6'], 120, 50); setTimeout(() => box.remove(), 1200);
      }
    }
    el.dataset.sq = i;
    el.style.transform = T(i);
  });
  for (const [id, el] of pieceEls) if (!seen.has(id)) {
    pieceEls.delete(id);
    if (animate) explode(el, +el.dataset.sq); else el.remove();
  }
}

function capturedBy(side) {
  // Pieces of the other colour missing from the board.
  const start = {p:8, n:2, b:2, r:2, q:1}, have = {p:0, n:0, b:0, r:0, q:0}, foe = E.other(side);
  G.board.forEach(p => { if (p && p.c === foe && p.t !== 'k') have[p.t]++; });
  const out = [];
  for (const k of ['q', 'r', 'b', 'n', 'p']) for (let n = Math.max(0, start[k] - have[k]); n > 0; n--) out.push(k);
  return out;
}
const material = side => G.board.reduce((s, p) => s + (p && p.c === side && p.t !== 'k' ? {p:1, n:3, b:3, r:5, q:9}[p.t] : 0), 0);

function renderStatus() {
  const pill = $('g-status'), sub = $('g-sub');
  pill.className = 'pill';
  sub.classList.remove('alarm');
  if (G.winner) { pill.textContent = G.winner === 'draw' ? t('drawTitle') : t('wins', {side:sideName(G.winner).toUpperCase()}); pill.classList.add('done'); sub.textContent = ''; }
  else if (mode === 'ai') {
    if (G.turn === 'w') { pill.textContent = t('yourMove'); }
    else { pill.textContent = t('botCooking'); pill.classList.add('bot', 'cook'); }
  } else { pill.textContent = t(G.turn === 'w' ? 'whiteMove' : 'blackMove'); pill.classList.add(G.turn === 'w' ? 'wside' : 'bside'); }
  if (!G.winner) {
    const showFor = mode === 'ai' ? 'w' : G.turn;
    if (G.turn === showFor && E.kingAttacked(G, showFor)) { sub.textContent = t('kingDanger'); sub.classList.add('alarm'); }
    else if (G.echo >= 0) sub.textContent = t('sealed', {sq:sqName(G.echo)});
    else sub.textContent = G.ply ? t('noEcho') : t('pickPiece');
  }
  const cards = [['p-top', 'b'], ['p-bot', 'w']];
  for (const [id, side] of cards) {
    const card = $(id);
    card.classList.toggle('on', !G.winner && G.turn === side);
    card.querySelector('.ava').innerHTML = pieceSVG('k', side);
    const name = mode === 'ai' ? (side === 'w' ? t('you') : `${t('bot')} · ${t({1:'chill', 2:'mid', 3:'sweaty'}[prefs.diff])}`) : sideName(side);
    card.querySelector('.pname').textContent = name;
    card.querySelector('.caps').innerHTML = capturedBy(side).map(k => pieceSVG(k, E.other(side))).join('');
    const adv = material(side) - material(E.other(side));
    card.querySelector('.adv').textContent = adv > 0 ? '+' + adv : '';
  }
  $('st-quiet').textContent = `${Math.floor(G.clock / 2)}/40`;
  $('st-fallen').textContent = G.cracks.filter(k => k >= 3).length;
  $('a-undo').disabled = busy || !hist.length;
  $('a-hint').disabled = busy || !humanTurn();
}
function renderAll() { updateTiles(false); syncPieces(false); renderStatus(); }

function save() { store.set('ef-save', {G, hist:hist.slice(-150), mode, diff:prefs.diff}); }

async function play(m, who) {
  busy = true; sel = -1; hintMove = null;
  const prev = G, mover = prev.board[m.from];
  const el = pieceEls.get(mover.id);
  if (who === 'bot') {
    // Telegraph: flash the bot's piece before it moves so the move is easy to follow.
    const tile = tileRefs[m.from].el; tile.classList.add('tele');
    el.animate([{transform:T(m.from)}, {transform:T(m.from) + ' translateY(-10%) scale(1.15)'}, {transform:T(m.from)}], {duration:MS(380), easing:'ease-in-out'});
    sfx('lift');
    await sleep(MS(420));
    tile.classList.remove('tele');
  }
  G = E.settle(E.apply(prev, m));
  hist.push(prev);
  const dur = who === 'bot' ? 620 : 430;
  trailFX(m.from, m.to, mover.c === 'w' ? '#ffe14a' : '#ff3d9a');
  const moving = animateMove(el, m.from, m.to, dur, m.pt === 'n');
  updateTiles(true); // the square cracks or falls as the piece lifts off
  if (G.last.fell) { sfx('fall'); buzz([0, 30, 40, 70]); setTimeout(() => shakeBoard(5), MS(380)); }
  else sfx('crack');
  renderStatus();
  await moving;
  if (G.last.cap) { sfx('capture'); buzz(G.last.cap.t === 'k' ? [0, 80, 50, 140] : 45); if (G.last.cap.t === 'k') shakeBoard(8); }
  else { sfx('move'); buzz(12); }
  syncPieces(true);
  updateTiles(false);
  renderStatus();
  save();
  if (G.winner) { await celebrate(); busy = false; renderStatus(); return; }
  busy = false;
  renderStatus();
  if (mode === 'ai' && G.turn === 'b') botTurn();
}

async function botTurn() {
  busy = true; renderStatus();
  const id = gameId;
  await sleep(MS(300));
  if (id !== gameId) return;
  const t0 = performance.now();
  const lv = LEVELS[prefs.diff] || LEVELS[2];
  const m = E.pickMove(G, lv.depth, lv.slack);
  const spent = performance.now() - t0;
  if (spent < 450) await sleep(MS(450 - spent));
  if (id !== gameId) return;
  if (screen !== 'game' && screen !== 'rules') { busy = false; return; }
  await play(m, 'bot');
}

function onBoardTap(ev) {
  if (busy || !G || !humanTurn()) return;
  const r = boardEl.getBoundingClientRect();
  const c = Math.floor((ev.clientX - r.left) / r.width * 8), rr = Math.floor((ev.clientY - r.top) / r.height * 8);
  if (c < 0 || c > 7 || rr < 0 || rr > 7) return;
  const i = rr * 8 + c;
  if (sel >= 0) {
    const m = E.gen(G).find(x => x.from === sel && x.to === i);
    if (m) { play(m, 'human'); return; }
  }
  const p = G.board[i];
  if (p && p.c === G.turn && i !== sel) {
    sel = i; sfx('tap'); buzz(8);
    const el = pieceEls.get(p.id);
    el.animate([{transform:T(i)}, {transform:T(i) + ' translateY(-8%) scale(1.1)'}, {transform:T(i)}], {duration:MS(240), easing:'ease-out'});
  } else {
    if (sel >= 0 && G.cracks[i] >= 3 || i === G.echo) { sfx('deny'); tileRefs[i].el.animate([{transform:'none'}, {transform:'translateX(-3px)'}, {transform:'translateX(3px)'}, {transform:'none'}], {duration:MS(200)}); }
    sel = -1;
  }
  hintMove = null;
  updateTiles(false);
}
boardEl.addEventListener('pointerdown', onBoardTap);

async function celebrate() {
  const win = G.winner;
  await sleep(MS(350));
  if (win !== 'draw') {
    // Winning side's pieces do a wave of hops.
    let k = 0;
    G.board.forEach((p, i) => {
      if (!p || p.c !== win) return;
      const el = pieceEls.get(p.id);
      el.animate([{transform:T(i)}, {transform:T(i) + ' translateY(-30%) scale(1.15) rotate(-8deg)'}, {transform:T(i)}],
        {duration:MS(420), delay:MS(k++ * 45), easing:'cubic-bezier(.3,1.5,.5,1)'});
    });
    await sleep(MS(500 + k * 45));
  }
  showResult();
}

function showResult() {
  const w = G.winner, card = $('result-card'), title = $('r-title'), ava = $('r-ava');
  const humanWon = mode === 'duo' ? w !== 'draw' : w === 'w';
  title.className = 'stamp';
  if (w === 'draw') { title.textContent = t('drawTitle'); title.classList.add('draw'); $('r-reason').textContent = t('draw'); ava.innerHTML = ''; }
  else {
    if (mode === 'duo') { title.textContent = t('wins', {side:sideName(w).toUpperCase()}); title.classList.add('small'); }
    else title.textContent = humanWon ? t('gg') : t('oof');
    if (!humanWon) title.classList.add('lose');
    const reason = mode === 'ai'
      ? (G.reason === 'king' ? t(humanWon ? 'winYou' : 'loseYou') : t(humanWon ? 'strandedYou' : 'strandedBot'))
      : (G.reason === 'king' ? t('winSide', {side:sideName(w)}) : t('strandedSide', {side:sideName(E.other(w))}));
    $('r-reason').textContent = reason;
    ava.innerHTML = humanWon ? pieceSVG('k', w, 'crown') : `<div class="lose-ava">${pieceSVG('k', 'w', 'crown')}</div>`;
  }
  const taken = capturedBy('w').length + capturedBy('b').length;
  $('r-stats').innerHTML = [[t('moves'), Math.ceil(G.ply / 2)], [t('fallen'), G.cracks.filter(k => k >= 3).length], [t('taken'), taken]]
    .map(([l, v]) => `<span class="stat">${l} <b>${v}</b></span>`).join('');
  $('result').hidden = false;
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  if (humanWon) { sfx('win'); buzz([0, 60, 50, 60, 50, 160]); confetti(); }
  else if (w === 'draw') sfx('hint');
  else { sfx('lose'); buzz([0, 200]); }
}

let confettiRAF = 0;
function confetti() {
  if (REDUCE) return;
  const cv = $('confetti'), dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = ['#ffe14a', '#ff3d9a', '#53d8ff', '#fff3d6', '#8b5cff'];
  const P = [];
  const burst = (x, y, n, vx0, vy0, spread) => {
    for (let k = 0; k < n; k++) P.push({x, y, vx:vx0 + rand(-spread, spread), vy:vy0 + rand(-spread, spread * .5), w:rand(7, 14), h:rand(5, 9),
      r:rand(0, 6), vr:rand(-.25, .25), c:cols[k % cols.length], s:k % 3, ph:rand(0, 6), delay:0});
  };
  burst(0, H * .8, 80, 9, -17, 5);
  burst(W, H * .8, 80, -9, -17, 5);
  const later = setTimeout(() => burst(W / 2, H * .35, 90, 0, -10, 9), 450);
  cancelAnimationFrame(confettiRAF);
  const t0 = performance.now();
  const frame = now => {
    g.clearRect(0, 0, W, H);
    for (const p of P) {
      p.vy = Math.min(p.vy + .32, 4.2); p.vx *= .985; p.ph += .08;
      p.x += p.vx + Math.sin(p.ph) * .8; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.cos(p.ph * 1.6));
      g.fillStyle = p.c; g.strokeStyle = '#0a0516'; g.lineWidth = 1.5;
      g.beginPath();
      if (p.s === 0) g.rect(-p.w / 2, -p.h / 2, p.w, p.h);
      else if (p.s === 1) g.arc(0, 0, p.h * .6, 0, 7);
      else { g.moveTo(0, -p.w / 2); g.lineTo(p.w / 2, p.w / 2); g.lineTo(-p.w / 2, p.w / 2); g.closePath(); }
      g.fill(); g.stroke(); g.restore();
    }
    if (now - t0 < 5200 && !$('result').hidden) confettiRAF = requestAnimationFrame(frame);
    else { g.clearRect(0, 0, W, H); clearTimeout(later); }
  };
  confettiRAF = requestAnimationFrame(frame);
}

// ---------- flow ----------
function clearBoardDOM() {
  pieceEls.forEach(el => el.remove()); pieceEls.clear();
  fxEl.innerHTML = '';
  tileRefs.forEach(r => { r.k = -1; r.sig = ''; r.el.classList.remove('tele'); });
}
function newGame(m) {
  gameId++; mode = m; G = E.initial(); hist = []; sel = -1; hintMove = null; busy = false;
  $('result').hidden = true;
  clearBoardDOM(); show('game'); renderAll(); save();
  // Pieces drop onto the board, row by row.
  pieceEls.forEach(el => {
    const i = +el.dataset.sq, row = i >> 3;
    el.animate([{transform:T(i) + ' translateY(-140%) scale(.6)', opacity:0}, {transform:T(i), opacity:1}],
      {duration:MS(420), delay:MS((row < 4 ? row : 7 - row) * 70 + (i & 7) * 18), easing:'cubic-bezier(.2,1.4,.4,1)', fill:'backwards'});
  });
}
function resume() {
  const s = store.get('ef-save', null);
  if (!s || !s.G || s.G.winner) return false;
  gameId++; G = s.G; hist = s.hist || []; mode = s.mode || 'ai'; sel = -1; hintMove = null; busy = false;
  clearBoardDOM(); show('game'); renderAll();
  if (mode === 'ai' && G.turn === 'b') botTurn();
  return true;
}
function show(name) {
  screen = name;
  for (const s of ['home', 'game', 'rules']) $('s-' + s).hidden = s !== name;
  if (name === 'home') refreshHome();
  if (name === 'game') requestAnimationFrame(sizeBoard);
}
function sizeBoard() {
  const w = $('board-wrap');
  const s = Math.floor(Math.min(w.clientWidth, w.clientHeight) - 14);
  if (s > 0) boardEl.style.setProperty('--bs', s + 'px');
}
new ResizeObserver(sizeBoard).observe($('board-wrap'));

$('b-bot').addEventListener('click', () => { sfx('tap'); newGame('ai'); });
$('b-duo').addEventListener('click', () => { sfx('tap'); newGame('duo'); });
$('b-cont').addEventListener('click', () => { sfx('tap'); resume(); });
$('b-rules').addEventListener('click', () => { sfx('tap'); rulesReturn = 'home'; show('rules'); renderRules(); });
$('g-rules').addEventListener('click', () => { sfx('tap'); rulesReturn = 'game'; show('rules'); renderRules(); });
$('r-back').addEventListener('click', () => { sfx('tap'); show(rulesReturn); });
$('g-home').addEventListener('click', () => { sfx('tap'); show('home'); });
$('a-undo').addEventListener('click', () => {
  if (busy || !hist.length) return;
  sfx('tap');
  do { G = hist.pop(); } while (mode === 'ai' && G.turn !== 'w' && hist.length);
  sel = -1; hintMove = null; fxEl.innerHTML = '';
  renderAll(); save();
});
$('a-hint').addEventListener('click', () => {
  if (busy || !humanTurn()) return;
  hintMove = E.pickMove(G, 2, 0); sel = hintMove.from;
  sfx('hint'); buzz(15); updateTiles(false);
});
$('a-restart').addEventListener('click', () => { sfx('tap'); $('confirm').hidden = false; });
$('c-no').addEventListener('click', () => { $('confirm').hidden = true; });
$('c-yes').addEventListener('click', () => { $('confirm').hidden = true; newGame(mode); });
$('r-rematch').addEventListener('click', () => { sfx('tap'); newGame(mode); });
$('r-home').addEventListener('click', () => { sfx('tap'); $('result').hidden = true; show('home'); });

$('diff-chips').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  prefs.diff = +b.dataset.d; savePrefs(); sfx('tap'); buzz(8); refreshHome();
});
$('lang-seg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  prefs.lang = b.dataset.lang; prefs.rulesLang = prefs.lang; savePrefs(); sfx('tap'); applyLang();
});
$('rl-seg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  prefs.rulesLang = b.dataset.rl; savePrefs(); sfx('tap'); renderRules();
});
$('t-sound').addEventListener('click', () => { prefs.sound = !prefs.sound; savePrefs(); sfx('tap'); refreshHome(); });
$('t-hap').addEventListener('click', () => { prefs.haptics = !prefs.haptics; savePrefs(); buzz(30); refreshHome(); });

function refreshHome() {
  document.querySelectorAll('#diff-chips button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.d === prefs.diff));
  document.querySelectorAll('#lang-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === prefs.lang));
  $('t-sound').setAttribute('aria-pressed', prefs.sound);
  $('t-hap').setAttribute('aria-pressed', prefs.haptics);
  const s = store.get('ef-save', null);
  $('b-cont').disabled = !(s && s.G && !s.G.winner && s.G.ply > 0);
}
function applyLang() {
  document.documentElement.lang = prefs.lang;
  document.body.classList.toggle('hi', prefs.lang === 'hi');
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  const items = t('ticker').map(s => `<span>${s}</span>`).join('');
  $('ticker').innerHTML = items + items;
  refreshHome();
  if (G) renderStatus();
  if (screen === 'rules') renderRules();
}

// ---------- rule book ----------
function miniTile(art) {
  const tone = {echo:'light', crack:'dark', hole:'light', king:'dark', pieces:'light', read:'dark', pro:'light', idea:'dark'}[art];
  let ice = '', ov = '';
  if (art === 'idea') { ice = crackSVG(19, 1); ov = pieceSVG('k', 'w'); }
  if (art === 'echo') ov = `<i class="ring"></i>${pieceSVG('n', 'w', 'ghost')}`;
  if (art === 'crack') ice = crackSVG(27, 2, 0);
  if (art === 'hole') ice = voidHTML(12);
  if (art === 'king') ov = pieceSVG('k', 'b');
  if (art === 'pieces') ov = pieceSVG('q', 'w');
  if (art === 'read') ov = '<i class="dot" style="width:34%;height:34%"></i>';
  if (art === 'pro') { ice = crackSVG(44, 2); ov = pieceSVG('n', 'b'); }
  return `<div class="t mini ${tone}"><div class="ice">${ice}</div><div class="ov">${ov}</div></div>`;
}
function renderRules() {
  document.querySelectorAll('#rl-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.rl === prefs.rulesLang));
  const langs = prefs.rulesLang === 'both' ? ['en', 'hi'] : [prefs.rulesLang];
  $('rule-list').innerHTML = RULEBOOK.map(sec => `<article class="rule">${miniTile(sec.art)}<div>${langs.map(l =>
    `<div class="rblock ${l}" lang="${l}">${langs.length > 1 ? `<span class="tag">${l === 'en' ? 'EN' : 'हिंदी'}</span>` : ''}<h3>${sec[l].h}</h3>${sec[l].p.map(p => `<p>${p}</p>`).join('')}</div>`).join('')}</div></article>`).join('');
  $('rule-list').scrollTop = 0;
}

// ---------- home logo loop: a tile cracks and falls, forever ----------
const logo = $('logo-tiles'), LOGO_ART = 27, logoTiles = [];
for (let k = 0; k < 9; k++) {
  const d = document.createElement('div');
  d.className = 't ' + (k % 2 ? 'dark' : 'light');
  d.innerHTML = '<div class="ice"></div><div class="ov"></div>';
  logo.appendChild(d); logoTiles.push(d);
}
logoTiles[2].querySelector('.ov').innerHTML = `<div class="pc" style="position:static;width:100%;height:100%">${pieceSVG('k', 'w')}</div>`;
logoTiles[6].querySelector('.ov').innerHTML = `<div class="pc" style="position:static;width:100%;height:100%">${pieceSVG('n', 'b')}</div>`;
let logoStep = 0;
setInterval(() => {
  if (screen !== 'home' || REDUCE) return;
  const c = logoTiles[4], ice = c.querySelector('.ice');
  logoStep = (logoStep + 1) % 5;
  if (logoStep === 1) ice.innerHTML = crackSVG(LOGO_ART, 1, 0);
  if (logoStep === 2) ice.innerHTML = crackSVG(LOGO_ART, 2, 1);
  if (logoStep === 3) {
    ice.innerHTML = voidHTML(LOGO_ART);
    const box = document.createElement('div'); box.style.cssText = 'position:absolute;inset:0;z-index:3'; c.appendChild(box);
    fallFX(box, LOGO_ART, 'dark'); setTimeout(() => box.remove(), 2000);
    const kn = logoTiles[6].querySelector('.pc');
    kn.animate([{transform:'none'}, {transform:'translateY(-30%) rotate(-12deg)'}, {transform:'none'}], {duration:500, easing:'cubic-bezier(.3,1.5,.5,1)'});
  }
  if (logoStep === 0) { ice.innerHTML = ''; c.animate([{opacity:0, transform:'scale(.6)'}, {opacity:1, transform:'none'}], {duration:400, easing:'cubic-bezier(.2,1.5,.4,1)'}); }
  if (logoStep === 1) logoTiles[2].querySelector('.pc').animate([{transform:'none'}, {transform:'translateY(-25%) scale(1.1)'}, {transform:'none'}], {duration:420, easing:'ease-out'});
}, 1100);

// ---------- Android hooks ----------
window.efBack = () => {
  if (!$('confirm').hidden) { $('confirm').hidden = true; return true; }
  if (!$('result').hidden) { $('result').hidden = true; show('home'); return true; }
  if (screen === 'rules') { show(rulesReturn); return true; }
  if (screen === 'game') { show('home'); return true; }
  return false;
};
window.efPause = () => { if (G) save(); };

applyLang();
show('home');

// Preview hook for screenshots during development: index.html#game, #rules-both, #win, add "hi" for Hindi.
const H = location.hash.slice(1);
if (H) {
  if (H.includes('hi')) { prefs.lang = 'hi'; applyLang(); }
  if (H.includes('game') || H.includes('win')) {
    newGame('ai');
    for (let k = 0; k < 26 && !G.winner; k++) { hist.push(G); G = E.settle(E.apply(G, E.pickMove(G, 1, 40))); }
    clearBoardDOM(); renderAll();
    if (H.includes('win')) { G = {...G, winner:'w', reason:'king'}; showResult(); }
  }
  if (H.includes('fall')) {
    newGame('duo'); G.cracks[52] = 2; G.cracks[11] = 2; renderAll();
    setTimeout(() => play(E.gen(G).find(m => m.from === 52 && m.to === 36), 'human'), 900);
    setTimeout(() => console.log('FALL_CHECK cracks=' + G.cracks[52] + ' fx=' + fxEl.children.length + ' winner=' + G.winner), 1500);
  }
  if (H.includes('rules')) { if (H.includes('both')) prefs.rulesLang = 'both'; show('rules'); renderRules(); }
}
})();

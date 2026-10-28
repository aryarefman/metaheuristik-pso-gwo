/* ------------------------------------------------------------------
   50_main.js — scene, timeline, camera, UI wiring
------------------------------------------------------------------- */
const $ = (s) => document.querySelector(s);
const isTouch = matchMedia('(pointer:coarse)').matches;
const CFG = { N: 12, T: 60, seed: 7, fn: 'ackley' };
const DUR = { eval: .9, plan: 1.5, move: 2.7 };          // seconds per stage at 1x  (~5.1 s per iteration)
const sim = { active: 'both', playing: false, speed: .8, clock: 0, tclock: 0, stage: 'eval', p: 0, done: false, stepOnce: false };
/* Guide mode (optional, off by default): pause at the start of every step so it can be read; Play otherwise runs continuously */
const guide = { on: false, waiting: false };
const ISLE_X = 7.6;

/* ---------- renderer / scene ---------- */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
const MAX_DPR = Math.min(devicePixelRatio, 2);                    // HD: render at the screen's real sharpness (up to 2x)
renderer.setPixelRatio(MAX_DPR);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, .1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .07; controls.minDistance = 7; controls.maxDistance = 48;
controls.maxPolarAngle = Math.PI * .49; controls.enablePan = false; controls.rotateSpeed = .6;

scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;   // soft studio reflections
scene.add(new THREE.HemisphereLight('#dcecff', '#e8d3b0', .7));
const sun = new THREE.DirectionalLight('#fff1d8', 2.7); sun.position.set(-7, 15, 11);
sun.castShadow = true; const sh = sun.shadow; sh.mapSize.set(isTouch ? 2048 : 4096, isTouch ? 2048 : 4096);   // crisp shadows
Object.assign(sh.camera, { left: -17, right: 17, top: 13, bottom: -13, near: 1, far: 50 }); sh.bias = -.0004; sh.normalBias = .03;
scene.add(sun, sun.target); Felt.setSun(sun.position);
const fill = new THREE.DirectionalLight('#bcd4ff', .5); fill.position.set(9, 5, -8); scene.add(fill);

/* ---------- world state ---------- */
let W = null;             // current world {obj, psoIsle, gwoIsle, pso, gwo, swarms, raft...}
const clouds = [];
const cloudLayer = new THREE.Group(); scene.add(cloudLayer);
(function makeClouds() {
  const spots = [[-18, -9, -3, .7], [-6, -11, 4, .8], [7, -10.5, -4, .75], [17, -9, 1, .7], [0, -13, -9, 1], [-13, -12.5, 7, .6], [13, -13, 6, .65], [-22, -3, -14, .9], [22, -3.5, -15, 1], [-10, 1.5, -22, 1.1], [9, 2.5, -24, 1.2], [1, -5.5, -19, 1.3], [-26, -9, -4, .8], [26, -9, -2, .8], [-15, 4, -20, .8], [15, 5, -21, .9]];
  spots.forEach(([x, y, z, s], i) => { const c = makeCloud(40 + i * 5, s); c.position.set(x, y, z); c.userData = { sp: .08 + (i % 4) * .03, x0: x }; cloudLayer.add(c); clouds.push(c); });
})();

function disposeTree(o) { o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && n.material.map && n.material.map.dispose) n.material.map.dispose(); }); }

function loadWorld(fnKey) {
  if (W) { scene.remove(W.root); disposeTree(W.root); }
  const obj = makeObjective(fnKey);
  const root = new THREE.Group(); scene.add(root);
  const hPSO = new THREE.Group(), hGWO = new THREE.Group(); hPSO.position.x = -ISLE_X; hGWO.position.x = ISLE_X; root.add(hPSO, hGWO);
  const psoIsle = buildIsland(obj, 'water', 21), gwoIsle = buildIsland(obj, 'dry', 77);
  hPSO.add(psoIsle.group); hGWO.add(gwoIsle.group);
  const pso = new PSO(obj, CFG.N, CFG.seed, CFG.T), gwo = new GWO(obj, CFG.N, CFG.seed, CFG.T);
  const swPSO = new Swarm('eagle', psoIsle, pso, hPSO), swGWO = new Swarm('wolf', gwoIsle, gwo, hGWO);
  swPSO.focus = 4; swGWO.focus = 6;
  // fisherman raft
  const raft = makeRaft(); raft.scale.setScalar(1.15); psoIsle.group.add(raft);
  const path = new RaftPath(psoIsle.hf);
  const wakes = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); m.renderOrder = 3; psoIsle.group.add(m); return { m, age: 9 }; });
  W = { obj, root, hPSO, hGWO, psoIsle, gwoIsle, pso, gwo, swPSO, swGWO, swarms: [swPSO, swGWO], raft, path, wakes, th: Math.random() * TAU, wakeT: 0, intro: 0 };
  resetSim();
  buildTags();
  refreshHUD(true);
}

function resetSim() {
  sim.stage = 'eval'; sim.p = 0; sim.done = false; sim.tclock = 0; sim.stepOnce = false;
  W.pso.reset(); W.gwo.reset();
  W.swarms.forEach(s => { s.agents.forEach((a, i) => { a.u = s.algo.x[i][0]; a.v = s.algo.x[i][1]; a.from = s.algo.x[i].slice(); a.y = 0; a.vx = a.vz = 0; a.dist = 0; }); s.resetTrails(); });
  W.pso.evaluate(); W.gwo.evaluate(); followAFollower();
  // follow an eagle far from the swarm best, so its three pulls are long and easy to see
  if (!W.swPSO.userFocus) { const g = W.pso.gb; let far = 0, fd = -1; W.pso.x.forEach((x, i) => { const d = Math.hypot(x[0] - g[0], x[1] - g[1]); if (d > fd) { fd = d; far = i; } }); W.swPSO.focus = far; }
  setPlayIcon();
}

/* ---------- timeline ---------- */
/* which swarms take part in the steps: 'both' (the demo), or only 'pso' / 'gwo' (video chapters about one algorithm:
   the other swarm stands still, so nothing moves that the narration is not talking about) */
const activeSwarms = () => W.swarms.filter(s => sim.active === 'both' || (sim.active === 'pso') === (s.kind === 'eagle'));
function nextStage() {
  const act = activeSwarms();
  if (sim.stage === 'eval') { sim.stage = 'plan'; sim.p = 0; act.forEach(s => s.algo.plan()); }
  else if (sim.stage === 'plan') { sim.stage = 'move'; sim.p = 0; act.forEach(s => s.agents.forEach((a, i) => { a.from = s.algo.x[i].slice(); })); }
  else {
    act.forEach(s => s.algo.commit()); W.pso.nxt = W.gwo.nxt = null;
    sim.stage = 'eval'; sim.p = 0;
    act.forEach(s => s.algo.evaluate()); followAFollower(); drawChart(); refreshHUD();
    if (Math.max(W.pso.iter, W.gwo.iter) >= CFG.T) { sim.done = true; sim.p = 1; sim.playing = false; setPlayIcon(); return; }
  }
  if (guide.on || sim.stepOnce) { sim.stepOnce = false; waitHere(); }
}
/** the narrator explains a follower's move, so by default follow a wolf that is not a leader */
function followAFollower() {
  const s = W.swGWO; if (s.userFocus) return;
  while (W.gwo.lead.includes(s.focus)) s.focus = (s.focus + 1) % s.N;
}
/** hold at the start of a step until Continue / play */
function waitHere() { sim.playing = false; guide.waiting = true; $('#narr').classList.add('wait'); setPlayIcon(); }
function resume() { guide.waiting = false; $('#narr').classList.remove('wait'); sim.playing = true; setPlayIcon(); }
function setGuide(on) {
  guide.on = on; const b = $('#btnGuide'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
  if (!on && guide.waiting) resume();
  narrKey = '';
}
function advance(dt) {
  if (!sim.playing || sim.done) return;
  let rem = dt * sim.speed; sim.tclock += rem;
  let guard = 0;
  while (rem > 0 && guard++ < 8) {
    const dur = DUR[sim.stage], left = (1 - sim.p) * dur;
    if (rem < left) { sim.p += rem / dur; rem = 0; }
    else { rem -= left; sim.p = 1; nextStage(); if (!sim.playing) break; }
  }
  refreshHUD();
}

/* ---------- camera ---------- */
let view = 'both', camTween = null;
// looking down at ~40°: the island tops (where the animals search) fill the screen, the strata walls stay visible below
const DIR = new THREE.Vector3(.24, .88, 1).normalize();
// top view (the video's 3D chapters): almost straight down, a little tilt keeps the animals readable as 3D
const DIR_TOP = new THREE.Vector3(.0, 1, .12).normalize();
function framing(v, top = false) {
  const aspect = camera.aspect, t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  if (top) {
    // island sits in the upper part of the screen, clear of the video captions at the bottom
    const half = v === 'both' ? 13.6 : 5.8, dist = Math.max(half / (t * aspect), 7.4 / t);
    const target = new THREE.Vector3(v === 'both' ? 0 : (v === 'pso' ? -ISLE_X : ISLE_X), .5, 1.9);
    return { target, pos: target.clone().add(DIR_TOP.clone().multiplyScalar(dist)) };
  }
  const halfW = v === 'both' ? 15.4 : 7.9, dist = Math.max(halfW / (t * aspect), (v === 'both' ? 7.6 : 6.6) / t);
  const tx = v === 'both' ? 0 : (v === 'pso' ? -ISLE_X : ISLE_X), target = new THREE.Vector3(tx, -1.1, .6);
  return { target, pos: target.clone().add(DIR.clone().multiplyScalar(dist)) };
}
function setView(v, instant, top = false) {
  view = v; document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  document.body.dataset.view = v;
  const f = framing(v, top);
  controls.maxDistance = Math.max(48, f.pos.distanceTo(f.target) * 1.15);   // narrow portrait screens need a farther camera
  if (instant) { camTween = null; camera.position.copy(f.pos); controls.target.copy(f.target); return; }
  camTween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: f.pos, t1: f.target };
}

/* ---------- HUD ---------- */
const fmtErr = (v) => { v = Math.max(0, v); return num(v < .0005 ? 0 : v, v < 10 ? 3 : 2); };
const dot = (c) => `<i class="dot" style="background:${c}"></i>`;

/* narrator: what happens in this step, in plain words, with the followed animals' numbers */
let narrKey = '';
function updateNarrator() {
  const { pso, gwo, obj, swPSO, swGWO } = W, st = sim.done ? 'done' : sim.stage;
  const key = [st, pso.iter, swPSO.focus, swGWO.focus, guide.on].join('|');
  if (key === narrKey) return; narrKey = key;
  const h = (v) => `<em>${fmtErr(v - obj.fmin)}</em>`;
  const round = Math.min(pso.iter + 1, CFG.T);
  $('#nround').textContent = sim.done ? t('nrDone', { T: CFG.T }) : t('nrRound', { r: round, T: CFG.T });
  const dots = { dotBlue: dot('#7fb2ff'), dotGreen: dot('#3fd987'), dotGold: dot('#ffc61a'), dotWhite: dot('#fff'), dotRed: dot('#c0392b') };
  const key2 = { eval: 'Eval', plan: 'Plan', move: 'Move', done: 'Done' }[st];
  const T = [t('pso' + key2, { ...dots, h: h(pso.best) }), t('gwo' + key2, { ...dots, h: h(gwo.best) })];
  const fp = swPSO.focus, fg = swGWO.focus, role = gwo.lead.indexOf(fg);
  let lp = t('livePSO', { h: h(pso.F[fp]), pb: h(pso.pbF[fp]), gb: h(pso.gbF) });
  let lg = t('liveGWO', { role: role >= 0 ? t('leader', { tag: LEAD_TAG[role] }) : t('follower'), h: h(gwo.F[fg]), a: h(gwo.F[gwo.lead[0]]), b: h(gwo.F[gwo.lead[1]]), d: h(gwo.F[gwo.lead[2]]) });
  if (st === 'plan' || st === 'move') {
    lp += t('livePSOw', { w: num(pso.w, 2) });
    lg += t('liveGWOa', { a: num(gwo.a, 2) });
  }
  if (st === 'done') lp = lg = t('doneCompare', { who: t(pso.best < gwo.best ? 'eagles' : 'wolves') });
  const fl = st === 'done' ? '' : '<i class="fl"></i>';        // blue dot = the followed animal (same blue as its glow)
  $('#nPSO').innerHTML = T[0]; $('#nGWO').innerHTML = T[1]; $('#lPSO').innerHTML = fl + lp; $('#lGWO').innerHTML = fl + lg;
}
function refreshHUD(force) {
  if (!W) return;
  const { pso, gwo, obj } = W;
  $('#psoBest').textContent = fmtErr(pso.best - obj.fmin); $('#gwoBest').textContent = fmtErr(gwo.best - obj.fmin);
  const it = (a) => sim.done ? CFG.T : Math.min(a.iter + 1, CFG.T);       // current round, same as the narrator
  $('#psoIter').textContent = it(pso) + ' / ' + CFG.T; $('#gwoIter').textContent = it(gwo) + ' / ' + CFG.T;
  $('#psoParam').textContent = 'w = ' + num(pso.w, 2); $('#gwoParam').textContent = 'a = ' + num(gwo.a, 2);
  const idx = sim.done ? 3 : ['eval', 'plan', 'move'].indexOf(sim.stage);
  document.querySelectorAll('#nsteps span').forEach((el, i) => { el.classList.toggle('on', i === idx); el.classList.toggle('done', i < idx); });
  updateNarrator();
  $('#bar').style.transform = `scaleX(${clamp((pso.iter + (sim.stage === 'move' ? sim.p : 0) * 0) / CFG.T, 0, 1)})`;
}

const chartCv = $('#chart'), cctx = chartCv.getContext('2d');
function drawChart() {
  const w = chartCv.width = 360 * devicePixelRatio, h = chartCv.height = 120 * devicePixelRatio, d = devicePixelRatio;
  cctx.clearRect(0, 0, w, h);
  const { pso, gwo, obj } = W, hist = [pso.bestHistory, gwo.bestHistory].map(a => a.map(v => Math.log10(Math.max(1e-4, v - obj.fmin + 1e-4))));
  const lo = -4, hi = Math.max(1, ...hist.flat());
  const X = (i) => 10 * d + i / CFG.T * (w - 20 * d), Y = (v) => 10 * d + (1 - (v - lo) / (hi - lo)) * (h - 22 * d);
  cctx.strokeStyle = 'rgba(40,50,60,.12)'; cctx.lineWidth = d;
  for (let k = lo; k <= Math.ceil(hi); k += 2) { cctx.beginPath(); cctx.moveTo(10 * d, Y(k)); cctx.lineTo(w - 10 * d, Y(k)); cctx.stroke(); }
  [['#2f7d6d', hist[0]], ['#c9612e', hist[1]]].forEach(([c, a]) => {
    cctx.strokeStyle = c; cctx.lineWidth = 2.4 * d; cctx.lineJoin = 'round'; cctx.beginPath();
    a.forEach((v, i) => i ? cctx.lineTo(X(i), Y(v)) : cctx.moveTo(X(i), Y(v))); cctx.stroke();
    if (a.length) { cctx.fillStyle = c; cctx.beginPath(); cctx.arc(X(a.length - 1), Y(a[a.length - 1]), 3.4 * d, 0, TAU); cctx.fill(); }
  });
}

/* floating α β δ / ★ tags */
const tagLayer = $('#tags'); let tagEls = [];
function buildTags() {
  tagLayer.innerHTML = ''; tagEls = []; noteEls = []; tagLayer.appendChild(leaderSvg); leaderSvg._s = '';
  for (let i = 0; i < 2 * CFG.N; i++) { const d = document.createElement('div'); d.className = 'tag'; tagLayer.appendChild(d); tagEls.push(d); }
}
const _p = new THREE.Vector3();
function updateTags() {
  let k = 0;
  const w = innerWidth, h = innerHeight;
  for (const s of W.swarms) for (const a of s.agents) {
    const el = tagEls[k++]; const isFocus = a.i === s.focus;
    let txt = '', cls = 'tag';
    if (s.kind === 'wolf' && a.lead >= 0) { txt = LEAD_TAG[a.lead]; cls += ' lead l' + a.lead; }
    else if (s.kind === 'eagle' && a.lead === 0) { txt = '★'; cls += ' lead l0'; }
    if (!txt) { if (el.dataset.on) { el.className = 'tag'; el.dataset.on = ''; el.style.opacity = 0; } continue; }   // role lost: hide the old tag
    a.rig.getWorldPosition(_p); _p.y += (s.kind === 'eagle' ? .62 : 1.05) * a.scl;
    const loc = s.group.worldToLocal(_p.clone());
    _p.project(camera);
    if (_p.z > 1 || hiddenByRock(s, loc)) { el.style.opacity = 0; continue; }
    el.style.opacity = 1; el.dataset.on = 1; el.className = cls; el.textContent = txt;
    el.style.transform = `translate(${(_p.x * .5 + .5) * w}px, ${(-_p.y * .5 + .5) * h}px) translate(-50%,-100%)`;
  }
}

/* is the island rock between the camera and this point? (march the sight line through the island's height map) */
const _cam = new THREE.Vector3();
function hiddenByRock(s, local) {
  _cam.copy(camera.position); s.group.worldToLocal(_cam);
  const hf = s.island.hf;
  for (let k = 1; k < 28; k++) {
    const f = k / 28, x = lerp(_cam.x, local.x, f), y = lerp(_cam.y, local.y, f), z = lerp(_cam.z, local.z, f);
    if (Math.abs(x) < HALF && Math.abs(z) < HALF && y > BASEY && y < hf.sample(x, z) - .05) return true;
  }
  return false;
}

/* labels attached to arrows, guesses, circle and goal (from Swarm.notes) */
let noteEls = [];
const leaderSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); leaderSvg.id = 'leaders';
function updateNotes() {
  const w = innerWidth, h = innerHeight, items = [];
  for (const s of W.swarms) {
    if ((view === 'pso' && s.kind === 'wolf') || (view === 'gwo' && s.kind === 'eagle')) continue;
    for (const n of s.notes) {
      if (view === 'both' && !n.cls && innerWidth < 1100) continue;          // keep the overview readable on small screens
      if (hiddenByRock(s, n.p)) continue;                       // never show a label through the island
      _p.copy(n.p); s.group.localToWorld(_p); _p.project(camera);
      if (_p.z > 1 || Math.abs(_p.x) > 1.05 || Math.abs(_p.y) > 1.05) continue;
      items.push({ n, x: (_p.x * .5 + .5) * w, y: (-_p.y * .5 + .5) * h, pri: n.cls === 'me' ? 0 : n.cls === 'goal' ? 2 : 1 });
    }
  }
  items.sort((a, b) => a.pri - b.pri);
  const placed = [], lines = []; let k = 0;
  // keep the followed animals uncovered: reserve a box around each one before placing labels
  for (const s of W.swarms) {
    if ((view === 'pso' && s.kind === 'wolf') || (view === 'gwo' && s.kind === 'eagle')) continue;
    const fa = s.agents[s.focus]; fa.rig.getWorldPosition(_p); _p.y += s.kind === 'eagle' ? .05 : .35; _p.project(camera);
    if (_p.z < 1) { const sz = clamp(70 / Math.max(.5, camera.position.distanceTo(controls.target) / 12), 28, 90); placed.push({ x: (_p.x * .5 + .5) * w, y: (-_p.y * .5 + .5) * h, w: sz * 1.3, h: sz, keep: true }); }
  }
  for (const it of items) {
    let el = noteEls[k];
    if (!el) { el = document.createElement('div'); tagLayer.appendChild(el); noteEls.push(el); }
    const html = (it.n.c ? `<i style="background:${it.n.c}"></i>` : '') + it.n.t;
    if (el._h !== html) { el.innerHTML = html; el._h = html; el._w = 0; }
    el.className = 'note ' + it.n.cls;
    if (!el._w) { el._w = el.offsetWidth; el._hh = el.offsetHeight; }
    const bw = el._w + 6, bh = el._hh + 6, gx = bw / 2 + 12, gy = bh / 2 + 12;
    // candidate centres around the point: above, below, right, left, then diagonals, then farther out
    const cand = [[0, -gy], [0, gy], [gx, 0], [-gx, 0], [gx, -gy], [-gx, -gy], [gx, gy], [-gx, gy], [0, -gy - bh], [0, gy + bh], [gx + 30, 0], [-gx - 30, 0]];
    const bottom = document.body.classList.contains('video') ? 250 : 4;   // keep labels clear of the video captions
    const free = (cx, cy) => cx - bw / 2 > 4 && cx + bw / 2 < w - 4 && cy - bh / 2 > 60 && cy + bh / 2 < h - bottom &&
      !placed.some(r => !(r.keep && it.n.cls === 'me') && Math.abs(r.x - cx) < (r.w + bw) / 2 && Math.abs(r.y - cy) < (r.h + bh) / 2);   // its own label may sit by it
    const spot = cand.find(([dx, dy]) => free(it.x + dx, it.y + dy));
    if (!spot) continue;
    const cx = it.x + spot[0], cy = it.y + spot[1];
    placed.push({ x: cx, y: cy, w: bw, h: bh }); k++;
    // pointer from the label edge to the exact point it describes
    const ex = clamp(it.x, cx - bw / 2 + 6, cx + bw / 2 - 6), ey = clamp(it.y, cy - bh / 2 + 3, cy + bh / 2 - 3);
    lines.push(`<line x1="${ex}" y1="${ey}" x2="${it.x}" y2="${it.y}"/><circle cx="${it.x}" cy="${it.y}" r="3" fill="${it.n.c || '#1f2d2c'}"/>`);
    el.style.opacity = 1;
    el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
  }
  for (; k < noteEls.length; k++) if (noteEls[k].style.opacity !== '0') noteEls[k].style.opacity = 0;
  const svg = lines.join('');
  if (leaderSvg._s !== svg) { leaderSvg.innerHTML = svg; leaderSvg._s = svg; }
}

/* click an animal to follow its numbers */
canvas.addEventListener('pointerup', (e) => {
  if (e.movedFar) return;
  const dx = e.clientX - (canvas._down?.x ?? e.clientX), dy = e.clientY - (canvas._down?.y ?? e.clientY);
  if (Math.hypot(dx, dy) > 6) return;
  let best = null;
  for (const s of W.swarms) s.agents.forEach(a => {
    a.rig.getWorldPosition(_p); _p.y += s.kind === 'eagle' ? .1 : .35; _p.project(camera);
    const d = Math.hypot((_p.x * .5 + .5) * innerWidth - e.clientX, (-_p.y * .5 + .5) * innerHeight - e.clientY);
    if (d < 46 && (!best || d < best.d)) best = { d, s, i: a.i };
  });
  if (best) { best.s.focus = best.i; best.s.userFocus = true; narrKey = ''; refreshHUD(); }
});
canvas.addEventListener('pointerdown', (e) => { canvas._down = { x: e.clientX, y: e.clientY }; });

/* ---------- UI wiring ---------- */
const ICON_PLAY = '<path d="M7 4.5l12.5 7.5L7 19.5z"/>', ICON_PAUSE = '<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>', ICON_REPLAY = '<path class="st" d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path class="st" d="M4.5 4.5v4.6h4.6"/>';   // line icon: drawn with stroke, never filled
function setPlayIcon() {
  $('#btnPlay svg').innerHTML = sim.done ? ICON_REPLAY : (sim.playing ? ICON_PAUSE : ICON_PLAY);
  $('#btnPlay').setAttribute('aria-label', t(sim.done ? 'ariaReplay' : (sim.playing ? 'ariaPause' : 'ariaPlay')));
}
$('#btnPlay').onclick = () => {
  if (sim.done) { resetSim(); drawChart(); refreshHUD(); guide.on ? waitHere() : resume(); return; }
  if (guide.waiting || !sim.playing) resume(); else { sim.playing = false; setPlayIcon(); }
};
$('#btnCont').onclick = () => resume();
$('#btnStep').onclick = () => { if (sim.done) return; sim.stepOnce = true; resume(); };       // play until the next step starts
$('#btnReset').onclick = () => { resetSim(); drawChart(); refreshHUD(); guide.on ? waitHere() : resume(); };
$('#btnGuide').onclick = () => { setGuide(!guide.on); refreshHUD(); };

/* introduction (shown on the first visit, reopen with the book button) */
const tour = { i: 0, el: $('#tour'), wasPlaying: true };          // first visit: closing the intro starts the demo
const slides = [...document.querySelectorAll('#tour .slide')], tdots = [...document.querySelectorAll('#tourDots i')];
function showSlide(i) {
  tour.i = clamp(i, 0, slides.length - 1);
  slides.forEach((s, k) => s.classList.toggle('on', k === tour.i)); tdots.forEach((d, k) => d.classList.toggle('on', k === tour.i));
  $('#tourBack').style.visibility = tour.i ? 'visible' : 'hidden';
  $('#tourNext').textContent = t(tour.i === slides.length - 1 ? 'start' : 'next');
}
function openTour() { tour.wasPlaying = sim.playing; sim.playing = false; setPlayIcon(); tour.el.classList.add('open'); showSlide(0); }
function closeTour() {
  tour.el.classList.remove('open');
  try { localStorage.setItem('skyopt.tour', '1'); } catch (e) {}
  if (sim.done) setPlayIcon(); else if (guide.on) waitHere(); else if (tour.wasPlaying) resume(); else setPlayIcon();
}
$('#tourNext').onclick = () => tour.i === slides.length - 1 ? closeTour() : showSlide(tour.i + 1);
$('#tourBack').onclick = () => showSlide(tour.i - 1);
$('#tourSkip').onclick = closeTour;
$('#btnTour').onclick = openTour;
const showSpeed = () => { $('#speed').value = sim.speed; $('#speedOut').textContent = num(sim.speed, 1) + '×'; };
$('#speed').oninput = (e) => { sim.speed = +e.target.value; showSpeed(); };
showSpeed();
document.querySelectorAll('#views button').forEach(b => b.onclick = () => setView(b.dataset.v));
$('#btnInfo').onclick = () => $('#sheet').classList.toggle('open');
document.querySelectorAll('#sheetTabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#sheetTabs button, #sheet .tab').forEach(el => el.classList.toggle('on', el.dataset.tab === b.dataset.tab));
  $('#sheet').scrollTop = 0;
});
$('#sheetClose').onclick = () => $('#sheet').classList.remove('open');
document.querySelectorAll('#fnPick button').forEach(b => b.onclick = () => {
  CFG.fn = b.dataset.f; document.querySelectorAll('#fnPick button').forEach(x => x.classList.toggle('on', x === b));
  loadWorld(CFG.fn); drawChart(); W.intro = 1;
  guide.on ? waitHere() : resume();
});
addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;                       // the speed slider owns its arrow keys
  if ((tag === 'BUTTON' || tag === 'A') && (e.code === 'Space' || e.key === 'Enter')) return;  // the browser already clicks a focused button
  if (tour.el.classList.contains('open')) { if (e.key === 'ArrowRight' || e.key === 'Enter') $('#tourNext').click(); else if (e.key === 'ArrowLeft') $('#tourBack').click(); else if (e.key === 'Escape') closeTour(); return; }
  if (e.code === 'Space') { e.preventDefault(); $('#btnPlay').click(); } else if (e.key === 'ArrowRight') $('#btnStep').click();
  else if (e.key === 'Enter' && guide.waiting) resume();
  else if (e.key === '1') setView('both'); else if (e.key === '2') setView('pso'); else if (e.key === '3') setView('gwo'); else if (e.key.toLowerCase() === 'r') $('#btnReset').click();
});

/* reframe = true only when the window itself changes size; quality changes must not move the user's camera */
function resize(reframe = true) {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  Felt.setViewport(h * renderer.getPixelRatio(), camera.fov);
  if (reframe && !camTween && W) setView(view, true);
}
addEventListener('resize', () => resize(true));

/* ---------- frame loop ---------- */
let last = performance.now(), fpsAcc = 0, fpsN = 0, quality = 1;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now; sim.clock += dt;
  if (!W) return;
  advance(dt);
  // intro: islands rise out of the clouds
  if (W.intro < 1) { W.intro = Math.min(1, W.intro + dt / 2.6); }
  const k = easeInOut(W.intro);
  W.hPSO.position.y = -7 * (1 - k) + Math.sin(sim.clock * .7) * .07; W.hGWO.position.y = -7 * (1 - k) + Math.sin(sim.clock * .7 + 2) * .07;
  W.hPSO.rotation.y = Math.sin(sim.clock * .21) * .018; W.hGWO.rotation.y = Math.sin(sim.clock * .21 + 1.3) * .018;
  W.swarms.forEach(s => s.update(dt, sim));
  // water + raft
  const wm = W.psoIsle.water.material.uniforms; wm.uT.value = sim.clock;
  W.th += dt * .13;
  const [rx, rz] = W.path.at(W.th), [nx, nz] = W.path.at(W.th + .06), r = W.raft, WLv = W.psoIsle.hf.WL;
  const yaw = Math.atan2(nx - rx, nz - rz); r.position.set(rx, WLv + .02 + Math.sin(sim.clock * 1.6) * .012, rz);
  r.rotation.y = dampAngle(r.rotation.y, yaw, 4, dt); r.rotation.z = Math.sin(sim.clock * 1.3) * .025; r.rotation.x = Math.sin(sim.clock * 1.1 + 1) * .02;
  r.userData.pole.rotation.x = .5 + Math.sin(sim.clock * 1.1) * .3; r.userData.birds.forEach((b, i) => b.rotation.x = Math.sin(sim.clock * 1.5 + i * 2) * .06);
  W.wakeT += dt; if (W.wakeT > .8) { W.wakeT = 0; const w = W.wakes.find(w => w.age > 2.4); if (w) { w.age = 0; w.m.position.set(rx, WLv + .012, rz); } }
  W.wakes.forEach(w => { w.age += dt; const t = w.age / 2.4; w.m.scale.setScalar(.12 + t * .75); w.m.material.opacity = t < 1 ? .5 * (1 - t) : 0; });
  clouds.forEach(c => { c.position.x += c.userData.sp * dt; if (c.position.x > 30) c.position.x = -30; });
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / 1.5); const e = easeInOut(camTween.t);
    camera.position.lerpVectors(camTween.p0, camTween.p1, e); controls.target.lerpVectors(camTween.t0, camTween.t1, e); if (camTween.t >= 1) camTween = null;
  }
  controls.update(); updateTags(); updateNotes();
  renderer.render(scene, camera);
  // adaptive pixel ratio
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 22 && quality > .7) { quality -= .1; renderer.setPixelRatio(MAX_DPR * quality); resize(false); } }
}

/* ---------- start ---------- */
resize();
// phones in portrait start on one island (both islands side by side would be too small to read)
const startView = innerWidth < 600 && innerHeight > innerWidth ? 'pso' : 'both';
loadWorld(CFG.fn); W.intro = 0; setView(startView, true);
camera.position.multiplyScalar(1.12); camTween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: framing(startView).pos, t1: framing(startView).target };
drawChart(); setPlayIcon();
{ let seen = false; try { seen = localStorage.getItem('skyopt.tour') === '1'; } catch (e) {}
  if (seen) { tour.el.classList.remove('open'); resume(); } else showSlide(0); }
function previewRig(kind) {   // dev helper: show one asset on a display disc
  if (W) W.root.visible = false; cloudLayer.visible = false;
  const g = new THREE.Group(), floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2), detail(new THREE.MeshStandardMaterial({ color: '#e9d9b9', roughness: 1 }), { scale: 8 }));
  floor.receiveShadow = true; g.add(floor);
  const rig = kind === 'eagle' ? makeEagle() : kind === 'wolf' ? makeWolf() : makeRaft(); if (kind === 'eagle') rig.position.y = .6; g.add(rig); scene.add(g); return rig;
}
window.__app = { previewRig, sim, guide, resume, closeTour, get W() { return W; }, setView, loadWorld, camera, controls, THREE };
requestAnimationFrame(frame);
requestAnimationFrame(() => document.body.classList.add('ready'));

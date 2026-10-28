/* ------------------------------------------------------------------
   60_video.js — narrated explainer "video": PSO and GWO in cloud computing
   A scripted sequence of chapters played over the live 3D scene: captions,
   voice-over (browser speech, if a voice exists for the language), animated
   diagrams of jobs and servers, and camera / simulation cues.
------------------------------------------------------------------- */
const VIDEO = [   // mode: 'still' | 'round' (3 beats = Measure, Decide, Move) | 'fast'; top: camera looks down on the island
  { key: 1, diagram: 'cloud', view: 'both', mode: 'still' },
  { key: 2, diagram: 'schedules', view: 'both', mode: 'still' },
  { key: 3, diagram: 'choices', view: 'both', mode: 'still' },
  { key: 4, view: 'both', mode: 'still', top: true, fresh: true },
  { key: 5, view: 'pso', mode: 'round', top: true },
  { key: 11, diagram: 'psoMath', view: 'pso', mode: 'still', top: true },
  { key: 6, diagram: 'mapEagle', side: true, view: 'pso', mode: 'round', top: true },
  { key: 7, view: 'gwo', mode: 'round', top: true },
  { key: 12, diagram: 'gwoMath', view: 'gwo', mode: 'still', top: true },
  { key: 8, diagram: 'mapWolf', side: true, view: 'gwo', mode: 'round', top: true },
  { key: 9, view: 'both', mode: 'fast', top: true },
  { key: 10, diagram: 'summary', view: 'both', mode: 'still' }
];
const JOB_COL = ['#2f7d6d', '#c9612e', '#e0a62a', '#5b7fd6', '#a05bc8', '#3fa9a7', '#d4596e', '#7a9a3a'];

/* ---------- diagrams (inline SVG, labels from i18n) ---------- */
const svgText = (x, y, s, o = '') => `<text x="${x}" y="${y}" ${o}>${s}</text>`;
function rack(x, y, label, load = 0, col = '#2f7d6d') {
  let g = `<g class="rack"><rect x="${x}" y="${y}" width="46" height="74" rx="6" fill="#34424a"/>`;
  for (let k = 0; k < 3; k++) g += `<rect x="${x + 6}" y="${y + 8 + k * 21}" width="34" height="14" rx="3" fill="#4d5d66"/><circle cx="${x + 34}" cy="${y + 15 + k * 21}" r="2.4" fill="${k < load ? col : '#7e8f97'}" class="led"/>`;
  return g + svgText(x + 23, y + 90, label, 'text-anchor="middle" class="sm"') + '</g>';
}
function diagram(kind) {
  if (kind === 'cloud') {
    let s = '<svg viewBox="0 0 640 250" class="vsvg">';
    for (let k = 0; k < 3; k++) s += `<g transform="translate(${38 + k * 34},${80 + (k % 2) * 26})"><circle cx="12" cy="10" r="9" fill="#1f2d2c"/><path d="M0 40c0-12 5-18 12-18s12 6 12 18z" fill="#1f2d2c"/></g>`;
    s += svgText(78, 170, t('vdUsers'), 'text-anchor="middle" class="lbl"');
    s += '<g class="flow">';
    for (let k = 0; k < 8; k++) s += `<rect x="${150 + k * 26}" y="${96 + (k % 2) * 14}" width="20" height="16" rx="4" fill="${JOB_COL[k]}"/>`;
    s += '</g>' + svgText(250, 170, t('vdJobs'), 'text-anchor="middle" class="lbl"');
    s += '<path d="M380 175c-40 0-48-56-6-64 4-42 64-52 82-16 22-26 74-12 74 26 40 2 44 54 2 54z" fill="#e6f1f6" stroke="#9cc3d6" stroke-width="2"/>';
    for (let k = 0; k < 4; k++) s += rack(392 + k * 50, 92, 'VM' + (k + 1), 1 + (k % 3));
    s += svgText(500, 222, t('vdServers'), 'text-anchor="middle" class="lbl"');
    return s + '</svg>';
  }
  if (kind === 'schedules' || kind === 'summary') {
    // two tidy charts on one baseline: bars = jobs stacked per server, dashed line = when the last server finishes
    const bad = [[0, 1, 2, 3, 4, 5], [6], [7, 2], [3]], good = [[0, 5, 3], [1, 6], [2, 7, 4], [3, 5]];
    const BASE = 236, COLW = 40, GAP = 14;
    const draw = (sets, x0, title, isBad) => {
      const col = isBad ? 'bad' : 'good', W2 = 4 * COLW + 3 * GAP;
      let s = svgText(x0 + W2 / 2, 26, title, `text-anchor="middle" class="ttl ${col}"`), top = BASE;
      const tops = [];
      sets.forEach((jobs, v) => {
        const x = x0 + v * (COLW + GAP); let y = BASE;
        jobs.forEach((j, n) => { const hh = 20 + (j % 3) * 4; y -= hh + 2; s += `<rect class="blk" style="animation-delay:${(v * 3 + n) * .08}s" x="${x}" y="${y}" width="${COLW}" height="${hh}" rx="4" fill="${JOB_COL[j]}"/>`; });
        top = Math.min(top, y); tops.push(y);
        s += svgText(x + COLW / 2, BASE + 18, 'VM' + (v + 1), 'text-anchor="middle" class="sm"');
        if (isBad && jobs.length === 1) s += svgText(x + COLW / 2, BASE + 34, t('vdIdle'), 'text-anchor="middle" class="sm muted"');   // under its VM name: never collides
      });
      // finish line + its label sitting just above it, left-aligned
      s += `<line x1="${x0 - 6}" x2="${x0 + W2 + 6}" y1="${top - 4}" y2="${top - 4}" class="mk ${col}"/>`;
      s += svgText(x0 - 6, top - 10, t('vdMakespan'), `class="sm ${col}"`);
      // "overloaded" tag beside the tall column, pointing at it
      if (isBad) {
        const ty = (tops[0] + BASE) / 2 - 20, tx = x0 + COLW + 10;
        s += `<g><path d="M${tx} ${ty + 10}l-6 -5v10z" fill="#c0392b"/><rect x="${tx}" y="${ty}" width="${t('vdOverloaded').length * 6.4 + 16}" height="20" rx="10" fill="#c0392b"/>`;
        s += svgText(tx + 8, ty + 14, t('vdOverloaded'), 'class="sm wht"') + '</g>';
      }
      return s + `<line x1="${x0 - 6}" x2="${x0 + W2 + 6}" y1="${BASE + 1}" y2="${BASE + 1}" stroke="#1f2d2c" stroke-width="2"/>`;
    };
    const body = kind === 'summary' ? draw(good, 190, t('vdGood'), false) : draw(bad, 44, t('vdBad'), true) + `<line x1="300" x2="300" y1="40" y2="250" stroke="rgba(31,45,44,.12)" stroke-width="2"/>` + draw(good, 350, t('vdGood'), false);
    return '<svg viewBox="0 0 600 280" class="vsvg">' + body + '</svg>';
  }
  if (kind === 'psoMath' || kind === 'gwoMath') {
    /* one grid for both cards: a formula box on the left, its meaning on the right, the shrinking parameter at the bottom */
    const EQX = 36, EQW = 300, TX = 360, ROW = 50;
    const row = (y, eq, col, text, opt = {}) => {
      const fill = col ? `fill="${col}" fill-opacity=".16" stroke="${col}"` : 'fill="#1f2d2c" fill-opacity=".05" stroke="#c9cfcd"';
      return `<g class="eqpart" style="animation-delay:${opt.delay || 0}s"><rect x="${EQX}" y="${y}" width="${EQW}" height="38" rx="9" ${fill} stroke-width="2"/>` +
        (opt.chip ? `<circle cx="${EQX + 22}" cy="${y + 19}" r="11" fill="${opt.chip}" stroke="#1f2d2c" stroke-width="1.2"/>` + svgText(EQX + 22, y + 24, opt.tag, 'text-anchor="middle" class="sm"') : '') +
        svgText(EQX + (opt.chip ? 44 : 16), y + 25, eq, 'class="eq sm2"') +
        (text ? svgText(TX, y + 24, text, 'class="lbl2"') : '') + '</g>';
    };
    const track = (y, from, to, frac, nowLabel, cols) => {
      const X0 = EQX, X1 = 604, xn = X0 + (X1 - X0) * clamp(frac, 0, 1);
      return `<defs><linearGradient id="trk${kind}" x1="0" x2="1"><stop offset="0" stop-color="${cols[0]}"/><stop offset="1" stop-color="${cols[1]}"/></linearGradient></defs>` +
        `<rect x="${X0}" y="${y}" width="${X1 - X0}" height="10" rx="5" fill="url(#trk${kind})" fill-opacity=".55"/>` +
        svgText(X0, y + 32, from, 'class="sm"') + svgText(X1, y + 32, to, 'text-anchor="end" class="sm"') +
        `<circle cx="${xn}" cy="${y + 5}" r="9" fill="#fff" stroke="#1f2d2c" stroke-width="3"/>` +
        `<g transform="translate(${clamp(xn, X0 + 60, X1 - 60)},${y - 14})"><rect x="-58" y="-20" width="116" height="24" rx="12" fill="#1f2d2c"/>` + svgText(0, -3, nowLabel, 'text-anchor="middle" class="sm wht"') + '</g>';
    };
    let s = '', y = 22;
    if (kind === 'psoMath') {
      s += svgText(EQX, y + 4, t('vdVelocity'), 'class="cap"'); y += 14;
      s += row(y, 'w · v', '#7fb2ff', t('vdMomentum'), { delay: 0 }); y += ROW;
      s += row(y, '+ c₁r₁ (pbest − x)', '#3fd987', t('vdMemory'), { delay: .3 }); y += ROW;
      s += row(y, '+ c₂r₂ (gbest − x)', '#ffc61a', t('vdSwarmPull'), { delay: .6 }); y += ROW + 8;
      s += row(y, 'x ← x + v', null, t('vdThenMove'), { delay: .9 }); y += ROW + 34;
      s += track(y, 'w = ' + num(.9, 1) + ' · ' + t('vdExplore'), 'w = ' + num(.4, 1) + ' · ' + t('vdExploit'), W.pso.iter / Math.max(1, CFG.T - 1), `${t('vdNow')}: w = ${num(W.pso.w, 2)}`, ['#7fb2ff', '#3fd987']);
    } else {
      s += row(y, 'A = 2a·r₁ − a', null, t('vdStepSize'), { delay: 0 }); y += ROW;
      s += row(y, 'C = 2·r₂', null, t('vdWeight'), { delay: .15 }); y += ROW;
      s += row(y, 'D = |C·X_leader − X|', '#c0392b', t('vdDist'), { delay: .3 }); y += ROW;
      const L = [['#ffd24a', 'α'], ['#e4eaf2', 'β'], ['#e0904a', 'δ']], y0 = y;
      L.forEach(([col, tag], k) => { s += row(y, `X${'₁₂₃'[k]} = X${tag} − A·D${tag}`, null, '', { chip: col, tag, delay: .45 + k * .15 }); y += 44; });
      s += `<path d="M${TX - 12} ${y0 + 6}q8 0 8 10v${(y - y0) / 2 - 26}q0 8 8 8q-8 0-8 8v${(y - y0) / 2 - 26}q0 10-8 10" fill="none" stroke="#9aa6a4" stroke-width="2"/>`;
      s += svgText(TX + 10, (y0 + y) / 2 + 2, t('vdPoint'), 'class="lbl2"'); y += 6;
      s += row(y, 'X ← (X₁ + X₂ + X₃) / 3', '#1f2d2c', t('vdAvg'), { delay: .95 }); y += ROW + 34;
      s += track(y, 'a = 2 · ' + t('vdExplore') + ' (|A| > 1)', 'a = 0 · ' + t('vdAttack') + ' (|A| < 1)', 1 - W.gwo.a / 2, `${t('vdNow')}: a = ${num(W.gwo.a, 2)}`, ['#5b7fd6', '#c0392b']);
    }
    return `<svg viewBox="0 0 640 ${y + 44}" class="vsvg">` + s + '</svg>';
  }
  if (kind === 'choices') {
    let s = '<svg viewBox="0 0 640 230" class="vsvg"><g class="grid">';
    for (let k = 0; k < 240; k++) s += `<rect x="${20 + (k % 40) * 15}" y="${150 + Math.floor(k / 40) * 12}" width="10" height="8" rx="2" fill="${JOB_COL[k % 8]}" style="animation-delay:${(k % 40) * .02 + Math.floor(k / 40) * .05}s"/>`;
    s += '</g>' + svgText(320, 70, '5<tspan dy="-26" font-size="34">20</tspan>', 'text-anchor="middle" class="big"');
    s += svgText(320, 106, t('vdTrillion'), 'text-anchor="middle" class="lbl"') + svgText(320, 132, t('vdChoices'), 'text-anchor="middle" class="sm muted"');
    return s + '</svg>';
  }
  if (kind === 'mapEagle' || kind === 'mapWolf') {
    // the followed animal's own position, turned into a job -> server assignment (illustration of the encoding)
    const sw = kind === 'mapEagle' ? W.swPSO : W.swGWO, a = sw.agents[sw.focus], algo = sw.algo;
    const u = algo.x[sw.focus][0], v = algo.x[sw.focus][1];
    let s = `<svg viewBox="0 0 320 300" class="vsvg"><image href="${ASSETS}mascots/${kind === 'mapEagle' ? 'eagle' : 'wolf'}.png" x="8" y="4" width="64" height="64"/>`;
    s += svgText(82, 32, t(kind === 'mapEagle' ? 'vdOneEagle' : 'vdOneWolf'), 'class="ttl"') + svgText(82, 52, t('vdFollowed'), 'class="sm muted"');
    for (let j = 0; j < 6; j++) {
      const vm = 1 + Math.floor(Math.abs(Math.sin((u * 7.13 + v * 3.7 + 1.3) * (j + 1)) * 43758.5453) % 1 * 4);
      const y = 86 + j * 28;
      s += `<rect x="20" y="${y}" width="56" height="20" rx="5" fill="${JOB_COL[j]}"/>` + svgText(48, y + 14, 'J' + (j + 1), 'text-anchor="middle" class="sm wht"');
      s += `<path d="M84 ${y + 10}h70" stroke="#9aa6a4" stroke-width="2" marker-end="url(#ah)"/>`;
      s += `<rect x="164" y="${y}" width="56" height="20" rx="5" fill="#34424a"/>` + svgText(192, y + 14, 'VM' + vm, 'text-anchor="middle" class="sm wht"');
    }
    s += '<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#9aa6a4"/></marker></defs>';
    s += svgText(20, 270, t('vdHeight'), 'class="sm"') + svgText(20, 292, `= ${fmtErr(algo.F[sw.focus] - W.obj.fmin)}`, 'class="ttl"');
    return s + '</svg>';
  }
  return '';
}

/* ---------- player ----------
   Each chapter is split into beats (one sentence each, "|" in i18n). The video drives the simulation:
   mode 'still' = scene paused; mode 'round' = beat 1/2/3 plays exactly the Measure / Decide / Move step
   while its sentence is spoken (step speed fitted to the sentence, next beat waits for both);
   mode 'fast' = a quick continuous run so the chart visibly drops. */
const STAGES = ['eval', 'plan', 'move'], STAGE_LABEL = { eval: 'stepMeasure', plan: 'stepDecide', move: 'stepMove' };
const vid = { i: 0, b: 0, playing: false, open: false, ended: false, voice: true, timer: 0, poll: 0, utter: null, token: 0 };
const vEl = $('#video');
/* most natural voice the browser offers: neural "Natural"/"Online" voices (Edge), then Google voices (Chrome), then the rest */
function voiceFor(lang) {
  if (!('speechSynthesis' in window)) return null;
  const want = lang === 'id' ? 'id' : 'en';
  const score = (v) => (/natural|neural/i.test(v.name) ? 40 : 0) + (/online/i.test(v.name) ? 20 : 0) + (/google/i.test(v.name) ? 15 : 0)
    + (v.localService ? 0 : 5) + (want === 'en' && /en[-_](us|gb)/i.test(v.lang) ? 3 : 0);
  return speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(want))
    .sort((a, b) => score(b) - score(a))[0] || null;
}
/* short phrases: Chrome silently stops utterances longer than ~15 s, so long sentences were cut off */
function phrases(text) {
  const out = [];
  for (const sen of text.match(/(?:[^.!?]|\.(?=\d))+[.!?]*/g) || [text]) {   // "0.9" is not a sentence end
    let s = sen.trim(); if (!s) continue;
    while (s.length > 140) { const cut = s.lastIndexOf(',', 140); if (cut < 40) break; out.push(s.slice(0, cut + 1)); s = s.slice(cut + 1).trim(); }
    out.push(s);
  }
  return out;
}
const beatsOf = (sc) => t('v' + sc.key).split('|').map(s => s.trim());
const estSec = (text) => Math.max(3, text.length * .066);
function vStop() {
  vid.token++; clearTimeout(vid.timer); clearInterval(vid.poll);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  vid.utter = null;
}
function vSetPlayIcon() {
  $('#vPlay svg').innerHTML = vid.playing ? ICON_PAUSE : (vid.ended ? ICON_REPLAY : ICON_PLAY);
  $('#vPlay').setAttribute('aria-label', t(vid.playing ? 'ariaPause' : 'ariaPlay'));
}
function vSegments(frac) {
  const seg = $('#vSeg');
  if (seg.children.length !== VIDEO.length) {
    seg.innerHTML = VIDEO.map((_, k) => `<button data-k="${k}" aria-label="${k + 1}"><i></i></button>`).join('');
    seg.querySelectorAll('button').forEach(b => b.onclick = () => { vid.playing = true; vGo(+b.dataset.k); });
  }
  [...seg.children].forEach((b, k) => { b.querySelector('i').style.width = (k < vid.i ? 100 : k > vid.i ? 0 : frac * 100) + '%'; });
}
function vCaption(beats) { $('#vCap').innerHTML = `<span class="cur">${beats[vid.b]}</span>`; }   // only the sentence being spoken
/** bring the simulation to the start of a round (Measure, nothing planned yet); positions may jump, used at chapter starts only */
function syncToRoundStart() {
  if (sim.done || Math.max(W.pso.iter, W.gwo.iter) > CFG.T - 6) { resetSim(); drawChart(); }
  let guard = 0;
  while ((sim.stage !== 'eval' || sim.p > 0) && guard++ < 4) { sim.stepOnce = false; sim.p = 1; nextStage(); }
  sim.p = 0; sim.playing = false; guide.waiting = false; $('#narr').classList.remove('wait'); refreshHUD();
}
/** open chapter k at its first beat */
function vGo(k) {
  vStop();
  vid.i = clamp(k, 0, VIDEO.length - 1); vid.b = 0; vid.ended = false;
  const sc = VIDEO[vid.i];
  $('#vTitle').textContent = t('v' + sc.key + 't'); $('#vCount').textContent = `${vid.i + 1} / ${VIDEO.length}`;
  const dg = $('#vDiag'); dg.className = 'vdiag' + (sc.diagram ? '' : ' hide') + (sc.side ? ' side' : '');
  dg.innerHTML = sc.diagram ? diagram(sc.diagram) : '';
  document.body.classList.toggle('vcenter', !!sc.diagram && !sc.side);   // a centred diagram hides the 3D labels behind it
  document.body.classList.toggle('vchart', sc.mode === 'fast');
  setView(sc.view, false, !!sc.top);
  sim.active = sc.view;                     // only the swarm being explained takes steps
  if (sc.fresh) { resetSim(); drawChart(); }
  if (sc.mode === 'round') syncToRoundStart(); else { sim.playing = false; setPlayIcon(); }
  vBeat();
}
/** play the current beat: sentence + (in 'round' chapters) the matching simulation step */
function vBeat() {
  vStop();
  const sc = VIDEO[vid.i], beats = beatsOf(sc), text = beats[vid.b], token = vid.token;
  vCaption(beats);
  const stage = sc.mode === 'round' ? STAGES[vid.b % 3] : null;
  $('#vStep').textContent = stage ? `${STAGES.indexOf(stage) + 1} · ${t(STAGE_LABEL[stage])}` : '';
  $('#vStep').classList.toggle('hide', !stage);
  vSegments(vid.b / beats.length);
  if (sc.diagram === 'mapEagle' || sc.diagram === 'mapWolf') $('#vDiag').innerHTML = diagram(sc.diagram);   // numbers of the current round
  vSetPlayIcon();
  if (!vid.playing) { sim.playing = false; setPlayIcon(); return; }
  const est = estSec(text);
  // simulation for this beat
  let simDone = true;
  if (stage) {
    if (sim.stage !== stage) syncToRoundStart();                  // safety: never narrate one step while showing another
    simDone = false;
    sim.speed = clamp(DUR[stage] / est, .1, 1.6);                   // the step lasts about as long as its sentence
    sim.stepOnce = true; resume();                                 // nextStage() pauses at the start of the next step
  } else if (sc.mode === 'fast') { sim.speed = 6; sim.stepOnce = false; resume(); }
  else { sim.playing = false; setPlayIcon(); }
  // narration for this beat
  let talkDone = false;
  const voice = vid.voice && voiceFor(LANG);
  if (voice) {
    // queue the phrases; the beat's narration is done when the last one ends (never cut by a timer while speaking)
    let started = false;
    const list = phrases(text);
    list.forEach((ph, n) => {
      const u = new SpeechSynthesisUtterance(speakable(ph)); u.voice = voice; u.lang = voice.lang; u.rate = 1; u.pitch = 1;
      u.onstart = () => { started = true; };
      if (n === list.length - 1) u.onend = () => { if (token === vid.token) talkDone = true; };
      u.onerror = (e) => { if (token === vid.token && e.error !== 'interrupted' && e.error !== 'canceled') talkDone = true; };
      speechSynthesis.speak(u);
    });
    // fallback only if the voice never starts at all (blocked or broken): then time the caption instead
    vid.timer = setTimeout(() => { if (!started && token === vid.token) { speechSynthesis.cancel(); vid.timer = setTimeout(() => { talkDone = true; }, est * 1000); } }, 4000);
  } else vid.timer = setTimeout(() => { talkDone = true; }, est * 1000);
  // move on when the sentence AND the step are both finished
  const t0 = performance.now();
  vid.poll = setInterval(() => {
    if (token !== vid.token) return clearInterval(vid.poll);
    if (!simDone && !sim.playing) simDone = true;
    vSegments((vid.b + Math.min(1, (performance.now() - t0) / 1000 / est)) / beats.length);
    if (!(talkDone && simDone)) return;
    clearInterval(vid.poll);
    setTimeout(() => {
      if (token !== vid.token || !vid.playing) return;
      if (vid.b < beats.length - 1) { vid.b++; vBeat(); }
      else if (vid.i < VIDEO.length - 1) vGo(vid.i + 1);
      else { vid.playing = false; vid.ended = true; sim.playing = false; setPlayIcon(); vSegments(1); vSetPlayIcon(); }
    }, 500);
  }, 100);
}
function vOpen() {
  if (tour.el.classList.contains('open')) closeTour();
  $('#sheet').classList.remove('open');
  setGuide(false);
  vid.open = true; vid.playing = true; vEl.classList.add('open'); vEl.setAttribute('aria-hidden', 'false'); document.body.classList.add('video');
  vSetVoiceBtn(); vGo(0);
}
function vClose() {
  vStop(); vid.open = false; vid.playing = false; sim.stepOnce = false;
  sim.active = 'both'; resetSim(); drawChart(); refreshHUD();      // back to the fair side-by-side demo, from round 1
  vEl.classList.remove('open'); vEl.setAttribute('aria-hidden', 'true'); document.body.classList.remove('video', 'vchart', 'vcenter');
  sim.speed = .8; showSpeed();
  setView(view); resume();
}
function vSetVoiceBtn() {
  const can = !!voiceFor(LANG), on = vid.voice && can, b = $('#vVoice');
  b.classList.toggle('on', on); b.textContent = t(on ? 'vVoiceOn' : 'vVoiceOff'); b.disabled = !can;
  b.title = can ? '' : 'No ' + (LANG === 'id' ? 'Indonesian' : 'English') + ' voice in this browser';
}
$('#btnVideo').onclick = vOpen;
$('#vClose').onclick = vClose;
$('#vNext').onclick = () => { vid.playing = true; vGo(vid.i + 1); };
$('#vPrev').onclick = () => { vid.playing = true; vGo(vid.i - 1); };
$('#vPlay').onclick = () => {
  if (vid.playing) { vid.playing = false; vStop(); sim.playing = false; setPlayIcon(); vSetPlayIcon(); return; }   // pause video and animation together
  vid.playing = true;
  if (vid.ended) vGo(0); else vBeat();                              // resume: repeat the current sentence, the step continues where it stopped
};
$('#vVoice').onclick = () => { vid.voice = !vid.voice; vSetVoiceBtn(); if (vid.playing) vBeat(); };
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { if (vid.open) vSetVoiceBtn(); };
// while the video is open, the keyboard drives the video (captured before the main shortcuts)
addEventListener('keydown', (e) => {
  if (!vid.open) return;
  const k = { Escape: '#vClose', ArrowRight: '#vNext', ArrowLeft: '#vPrev' }[e.key] || (e.code === 'Space' ? '#vPlay' : null);
  if (k) { e.preventDefault(); e.stopPropagation(); $(k).click(); }
}, true);
window.__app.video = { open: vOpen, close: vClose, go: vGo, state: vid };

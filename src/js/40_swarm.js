/* ------------------------------------------------------------------
   40_swarm.js — turns algorithm state into animal motion + overlays
   (dotted trails, target rings, update vectors, leader markers)
------------------------------------------------------------------- */
const wx = (u) => u * DOM;

/* thick, always-visible arrow: coloured core over a dark outline, readable on any background */
const ARROW_SHAFT = new THREE.CylinderGeometry(1, 1, 1, 10), ARROW_HEAD = new THREE.ConeGeometry(1, 1, 12);
class Arrow {
  constructor(parent) {
    this.g = new THREE.Group(); this.g.visible = false; this.g.renderOrder = 20;
    this.mat = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, depthTest: false, toneMapped: false });
    this.omat = new THREE.MeshBasicMaterial({ color: '#14201f', transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.oshaft = new THREE.Mesh(ARROW_SHAFT, this.omat); this.ohead = new THREE.Mesh(ARROW_HEAD, this.omat);
    this.shaft = new THREE.Mesh(ARROW_SHAFT, this.mat); this.head = new THREE.Mesh(ARROW_HEAD, this.mat);
    this.oshaft.renderOrder = this.ohead.renderOrder = 19;
    this.shaft.renderOrder = this.head.renderOrder = 20;
    this.g.add(this.oshaft, this.ohead, this.shaft, this.head); parent.add(this.g);
  }
  set(a, b, color, r = .022, opacity = 1, top = false) {
    this.oshaft.renderOrder = this.ohead.renderOrder = top ? 23 : 19;
    this.shaft.renderOrder = this.head.renderOrder = top ? 24 : 20;
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    if (len < .04 || opacity < .02) { this.g.visible = false; return; }
    const head = Math.min(len * .5, r * 6.5), o = Math.max(r * .7, .012);          // outline width
    this.g.visible = true; this.g.position.copy(a);
    this.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.shaft.scale.set(r, Math.max(.001, len - head), r); this.shaft.position.y = (len - head) / 2;
    this.head.scale.set(r * 2.7, head, r * 2.7); this.head.position.y = len - head / 2;
    this.oshaft.scale.set(r + o, Math.max(.001, len - head), r + o); this.oshaft.position.y = (len - head) / 2;
    const oh = head + o * 2.4; this.ohead.scale.set(r * 2.7 + o * 1.6, oh, r * 2.7 + o * 1.6); this.ohead.position.y = len - head + oh / 2 - o * .9;
    this.mat.color.set(color); this.mat.opacity = opacity; this.omat.opacity = Math.min(1, opacity * 1.1) * .9;
  }
  hide() { this.g.visible = false; }
}

const LEAD_COL = ['#ffd24a', '#e4eaf2', '#e0904a'];
const LEAD_TAG = ['α', 'β', 'δ'];

class Swarm {
  constructor(kind, island, algo, holder) {
    this.kind = kind; this.island = island; this.algo = algo; this.holder = holder; this.N = algo.N;
    this.group = new THREE.Group(); holder.add(this.group);
    this.agents = []; this.focus = 4; this.time = 0;
    const hf = island.hf;
    for (let i = 0; i < this.N; i++) {
      const rig = kind === 'eagle' ? makeEagle() : makeWolf();
      const s = kind === 'eagle' ? 1.3 : 1.25; rig.scale.setScalar(s);
      const a = { rig, s, i, u: algo.x[i][0], v: algo.x[i][1], from: algo.x[i].slice(), to: algo.x[i].slice(), yaw: Math.random() * TAU, vx: 0, vz: 0, yawRate: 0, y: 0, vy: 0, ph: Math.random() * TAU, dist: 0, amp: 0, lead: -1, scl: 1, trailLast: null, trail: [] };
      this.group.add(rig); this.agents.push(a);
    }
    // overlays
    this.arrows = Array.from({ length: 26 }, () => new Arrow(this.group));
    const dotGeo = new THREE.SphereGeometry(.04, 8, 6);
    this.TL = 28;
    this.dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), this.N * this.TL);
    this.dots.frustumCulled = false; this.dots.setColorAt(0, new THREE.Color('#fff')); this.group.add(this.dots);
    const ring = new THREE.TorusGeometry(.16, .018, 6, 24).rotateX(Math.PI / 2);
    this.rings = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ transparent: true, opacity: .85, toneMapped: false, depthWrite: false }), this.N);
    this.rings.setColorAt(0, new THREE.Color('#fff')); this.rings.frustumCulled = false; this.group.add(this.rings);
    const col = kind === 'eagle' ? '#17607a' : '#243b6b';
    this.baseCol = new THREE.Color(col);
    this.focusRing = new THREE.Mesh(new THREE.TorusGeometry(.34, .035, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: FOLLOW_COL, transparent: true, opacity: .95, toneMapped: false, depthWrite: false }));
    this.group.add(this.focusRing);
    // bobbing marker pin above the followed animal
    this.pin = new THREE.Group();
    const pinMat = new THREE.MeshBasicMaterial({ color: FOLLOW_COL, toneMapped: false });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.1, .24, 20).rotateX(Math.PI), pinMat); this.pin.add(cone);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })); cap.position.y = .13; this.pin.add(cap);
    const capIn = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 10), pinMat); capIn.position.set(0, .13, .045); this.pin.add(capIn);
    this.group.add(this.pin);
    if (kind === 'eagle') this.buildPSOMarks(); else this.buildGWOMarks();
    this._tmp = new THREE.Matrix4(); this._c = new THREE.Color(); this._v = new THREE.Vector3();
    this.tags = [];
    this.notes = [];                                  // labels for the HTML layer: { p (island-local), t, c, cls }
    this.buildGoal();
  }

  buildPSOMarks() {
    const g = new THREE.OctahedronGeometry(.07, 0);
    this.pbMarks = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#7dffb0', toneMapped: false }), this.N);
    this.pbMarks.frustumCulled = false; this.group.add(this.pbMarks);
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(.07, .16, 3.6, 20, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 } },
      vertexShader: 'varying float vY; void main(){ vY = position.y/3.6+.5; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying float vY; uniform float uT; void main(){ float a = (1.-vY)*(.3+.08*sin(uT*2.)) ; gl_FragColor = vec4(1.,.82,.35,a*.9); }'
    }));
    this.pillar.renderOrder = 5; this.group.add(this.pillar);
    this.gbRing = new THREE.Mesh(new THREE.TorusGeometry(.3, .025, 8, 36).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd24a', toneMapped: false, transparent: true, depthWrite: false }));
    this.group.add(this.gbRing);
  }
  buildGWOMarks() {
    this.encircle = new THREE.Mesh(new THREE.TorusGeometry(1, .02, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#c0392b', toneMapped: false, transparent: true, opacity: .9, depthWrite: false }));
    this.encircle.visible = false; this.group.add(this.encircle);
    this.xMarks = [0, 1, 2].map(k => { const m = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 10), new THREE.MeshBasicMaterial({ color: LEAD_COL[k], toneMapped: false, depthTest: false })); m.renderOrder = 21; m.visible = false; this.group.add(m); return m; });
    this.xNew = new THREE.Mesh(new THREE.TorusGeometry(.14, .03, 8, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff', toneMapped: false, depthTest: false }));
    this.xNew.renderOrder = 21; this.xNew.visible = false; this.group.add(this.xNew);
  }

  /** flag on the true lowest point of the landscape: the animals cannot see it, it is there for the viewer */
  buildGoal() {
    const hf = this.island.hf, g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .9, 8), new THREE.MeshStandardMaterial({ color: '#2a2f33', roughness: .5 }));
    pole.position.y = .45; pole.castShadow = true; g.add(pole);
    const cloth = new THREE.Shape(); cloth.moveTo(0, 0); cloth.lineTo(.34, -.1); cloth.lineTo(0, -.2);
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(cloth), new THREE.MeshStandardMaterial({ color: '#e0a62a', roughness: .6, side: THREE.DoubleSide }));
    flag.position.set(.018, .88, 0); flag.castShadow = true; g.add(flag); this.goalFlag = flag;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.22, .014, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1f2d2c', transparent: true, opacity: .55, depthWrite: false }));
    ring.position.y = .02; g.add(ring);
    g.position.set(hf.opt.x, this.ground(hf.opt.x, hf.opt.z), hf.opt.z);
    this.goal = g; this.group.add(g);
  }
  note(p, t, c, cls = '') { this.notes.push({ p: p.clone(), t, c, cls }); }

  /** world position (island-local) of an agent in the air / on the ground */
  ground(x, z) { const h = this.island.hf.sample(x, z); return this.kind === 'eagle' ? Math.max(h, this.island.hf.WL) : h; }
  P(u, v, lift = 0) { const x = wx(u), z = wx(v); return new THREE.Vector3(x, this.ground(x, z) + lift, z); }

  resetTrails() { this.agents.forEach(a => { a.trail = []; a.trailLast = null; }); }

  update(dt, sim) {
    const algo = this.algo, hf = this.island.hf, T = sim.clock, st = sim.stage, p = sim.p;
    this.time = T;
    const moving = st === 'move';
    const e = moving ? easeInOut(p) : 0;
    const leaders = this.kind === 'wolf' ? algo.lead : null;
    for (const a of this.agents) {
      const i = a.i, rig = a.rig, U = rig.userData;
      // logical position
      const pu = a.u, pv = a.v;
      if (moving && algo.nxt) { a.u = lerp(a.from[0], algo.nxt[i][0], e); a.v = lerp(a.from[1], algo.nxt[i][1], e); }
      else { a.u = algo.x[i][0]; a.v = algo.x[i][1]; a.from = algo.x[i].slice(); }
      const x = wx(a.u), z = wx(a.v);
      const ivx = (x - wx(pu)) / Math.max(dt, 1e-3), ivz = (z - wx(pv)) / Math.max(dt, 1e-3);
      a.vx = damp(a.vx, ivx, 8, dt); a.vz = damp(a.vz, ivz, 8, dt);
      const spd = Math.hypot(a.vx, a.vz) / Math.max(sim.speed, .05) * (sim.speed > 0 && !sim.playing ? 0 : 1);
      const realSpd = Math.hypot(a.vx, a.vz);
      // heading
      let targetYaw = a.yaw;
      if (realSpd > .06) targetYaw = Math.atan2(a.vx, a.vz);
      else if (algo.nxt && (st === 'plan')) { const dx = wx(algo.nxt[i][0]) - x, dz = wx(algo.nxt[i][1]) - z; if (Math.hypot(dx, dz) > .05) targetYaw = Math.atan2(dx, dz); }
      const before = a.yaw; a.yaw = dampAngle(a.yaw, targetYaw, 4.5, dt);
      let dyaw = ((a.yaw - before + Math.PI) % TAU + TAU) % TAU - Math.PI; a.yawRate = damp(a.yawRate, dyaw / Math.max(dt, 1e-3), 6, dt);
      const g0 = this.ground(x, z);
      rig.position.x = x; rig.position.z = z; rig.rotation.y = a.yaw;
      // leader scale / halo
      const followed = i === this.focus;
      if (a.followed === undefined) Felt.setFollowed(rig, false);   // every animal starts in the "other animals" group
      if (a.followed !== followed) { Felt.setFollowed(rig, followed); a.followed = followed; }   // the followed animal is drawn on top of the others
      const role = leaders ? leaders.indexOf(i) : (i === algo.gbIdx ? 0 : -1);
      a.lead = role;
      a.scl = damp(a.scl, role >= 0 ? 1.18 : 1, 4, dt);
      rig.scale.setScalar(a.s * a.scl);
      const halo = U.halo; halo.material.opacity = damp(halo.material.opacity, role >= 0 ? .95 : 0, 5, dt);
      if (role >= 0) halo.material.color.set(LEAD_COL[role]);
      halo.rotation.z += dt * 1.2;

      if (this.kind === 'eagle') this.animEagle(a, U, g0, T, dt, realSpd, p, moving);
      else this.animWolf(a, U, g0, T, dt, realSpd, hf);
      this.pushTrail(a, rig, sim.tclock);
    }
    this.updateTrails(sim.tclock);
    this.updateOverlays(sim);
  }

  animEagle(a, U, g0, T, dt, spd, p, moving) {
    const idle = Math.sin(T * 1.1 + a.ph);
    const arc = moving ? .55 * Math.sin(Math.PI * p) : 0;
    const yT = g0 + .95 + .09 * idle + arc;
    const prevY = a.y || yT; a.y = damp(prevY || yT, yT, 5, dt); a.vy = damp(a.vy, (a.y - prevY) / Math.max(dt, 1e-3), 6, dt);
    a.rig.position.y = a.y;
    const k = clamp(spd / 1.1, 0, 1);
    a.amp = damp(a.amp, .3 + .3 * k, 3, dt);
    a.ph += dt * (1.5 + 1.1 * k);
    const f = Math.sin(a.ph), f2 = Math.sin(a.ph - .9);
    for (const w of U.wings) {
      w.inner.rotation.z = w.sd * (.08 + a.amp * f);
      w.outer.rotation.z = w.sd * (-.05 + a.amp * 1.25 * f2);
      w.inner.rotation.y = w.sd * -.12 * f2; w.outer.rotation.y = w.sd * -.1 * f2;
    }
    U.body.position.y = .025 * Math.cos(a.ph);
    U.body.rotation.x = damp(U.body.rotation.x, clamp(-a.vy * .32, -.5, .5) + .08, 6, dt);
    U.body.rotation.z = damp(U.body.rotation.z, clamp(-a.yawRate * .22, -.6, .6), 5, dt);
    U.feet.forEach(ft => ft.rotation.x = damp(ft.rotation.x, -.2 - 1.0 * k, 3, dt));
    U.scarfTail.rotation.y = Math.sin(T * 4 + a.ph) * .28 + a.yawRate * .1; U.scarfTail.rotation.x = -.15 - .5 * k + Math.sin(T * 5 + a.ph) * .08;
    U.tail.rotation.x = -.12 + .15 * f; U.head.rotation.y = Math.sin(T * .8 + a.ph) * .22;
  }

  animWolf(a, U, g0, T, dt, spd, hf) {
    const x = a.rig.position.x, z = a.rig.position.z, fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const h1 = hf.sample(x + fx * .3, z + fz * .3), h0 = hf.sample(x - fx * .3, z - fz * .3);
    const hr = hf.sample(x + fz * .2, z - fx * .2), hl = hf.sample(x - fz * .2, z + fx * .2);
    const k = clamp(spd / .55, 0, 1);
    a.amp = damp(a.amp, k, 4, dt);
    a.dist += spd * dt; const ph = a.dist * TAU / .55;
    a.y = damp(a.y || g0, g0 + .02, 14, dt);
    a.rig.position.y = a.y + Math.abs(Math.sin(ph)) * .028 * a.amp;
    U.body.rotation.x = damp(U.body.rotation.x, -Math.atan2(h1 - h0, .6) * .85 + Math.sin(ph * 2) * .035 * a.amp, 8, dt);
    U.body.rotation.z = damp(U.body.rotation.z, Math.atan2(hr - hl, .4) * .5 - a.yawRate * .06, 6, dt);
    for (const L of U.legs) {
      const off = ((L.front ? 1 : 0) + (L.side > 0 ? 1 : 0)) % 2 ? Math.PI : 0;
      const sw = Math.sin(ph + off), swing = a.amp * .75 * sw;
      L.hip.rotation.x = -swing * (L.front ? 1 : .85);
      L.knee.rotation.x = a.amp * 1.0 * Math.max(0, Math.sin(ph + off + 1.3)) + (L.front ? 0 : .08);
    }
    U.tail.rotation.y = Math.sin(T * 2.2 + a.ph) * (.3 + .15 * (1 - a.amp)) - a.yawRate * .08;
    U.tail.rotation.x = .1 - .3 * a.amp + Math.sin(ph * 2) * .06 * a.amp;
    U.head.rotation.x = Math.sin(ph * 2 + .5) * .04 * a.amp + (a.amp < .1 ? Math.sin(T * 1.4 + a.ph) * .05 : 0);
    U.head.rotation.y = damp(U.head.rotation.y, clamp(-a.yawRate * .08, -.4, .4), 5, dt) + (a.amp < .1 ? Math.sin(T * .7 + a.ph) * .18 : 0);
    U.scarfTail.rotation.y = Math.sin(T * 5 + a.ph) * .22 + .2 * k; U.scarfTail.rotation.x = -.1 - .45 * k + Math.sin(T * 6 + a.ph) * .07;
  }

  pushTrail(a, rig, T) {
    const pos = rig.position, lift = this.kind === 'eagle' ? -.1 : .05;
    const px = pos.x, py = pos.y + lift, pz = pos.z;
    if (!a.trailLast || Math.hypot(px - a.trailLast[0], pz - a.trailLast[2]) > .13) {
      a.trail.push({ x: px, y: py, z: pz, t: T }); a.trailLast = [px, py, pz];
      if (a.trail.length > this.TL) a.trail.shift();
    }
  }
  updateTrails(T) {
    const m = this._tmp, c = this._c, LIFE = 26;
    let n = 0;
    for (const a of this.agents) {
      const col = a.lead >= 0 && this.kind === 'wolf' ? c.set(LEAD_COL[a.lead]) : (a.lead === 0 && this.kind === 'eagle' ? c.set('#ffc93a') : c.copy(this.baseCol));
      for (let k = 0; k < this.TL; k++) {
        const t = a.trail[k]; let s = 0;
        if (t) s = clamp(1 - (T - t.t) / LIFE, 0, 1) * (.5 + .5 * k / this.TL) * (a.lead >= 0 ? 1.35 : 1);
        m.makeScale(s, s, s); if (t) m.setPosition(t.x, t.y, t.z);
        this.dots.setMatrixAt(n, m); this.dots.setColorAt(n, col); n++;
      }
    }
    this.dots.instanceMatrix.needsUpdate = true; this.dots.instanceColor.needsUpdate = true;
  }

  updateOverlays(sim) {
    const algo = this.algo, st = sim.stage, p = sim.p, m = this._tmp, c = this._c;
    this.notes.length = 0;
    this.goalFlag.rotation.y = Math.sin(sim.clock * 2.2) * .25;
    // labels belong to one step each: Measure = best spots + goal, Decide = arrows / guesses, Move = only the followed animal
    if (st === 'eval' || sim.done) this.note(this.goal.position.clone().setY(this.goal.position.y + .9), t('noteGoal'), null, 'goal');
    { const fa0 = this.agents[this.focus]; this.note(fa0.rig.position.clone().setY(fa0.rig.position.y + (this.kind === 'eagle' ? .9 : 1.4)), t(this.kind === 'eagle' ? 'noteFollowEagle' : 'noteFollowWolf'), null, 'me'); }
    if (this.kind === 'eagle' && st === 'eval') {
      this.note(this.P(algo.pb[this.focus][0], algo.pb[this.focus][1], .2), t('noteItsBest'), '#3fd987');
      this.note(this.P(algo.gb[0], algo.gb[1], .1), t('noteSwarmMark'), '#ffc61a');
    }
    const labels = st === 'plan';
    const planning = (st === 'plan' || st === 'move') && algo.nxt;
    const fade = st === 'move' ? 1 - smooth(.05, .45, p) : 1;
    // target rings (where each animal is about to go)
    for (let i = 0; i < this.N; i++) {
      const showT = planning ? (st === 'plan' ? smooth(0, .4, p) : 1 - smooth(.55, 1, p)) : 0;
      const q = planning ? this.P(algo.nxt[i][0], algo.nxt[i][1], .06) : this.P(algo.x[i][0], algo.x[i][1], .06);
      const s = Math.max(.001, showT) * (i === this.focus ? 1.4 : 1);
      m.makeScale(s, s, s).setPosition(q); this.rings.setMatrixAt(i, m);
      this.rings.setColorAt(i, c.set(i === this.focus ? '#ffffff' : (this.kind === 'eagle' ? '#ffe9a8' : '#ffd6a0')));
    }
    this.rings.instanceMatrix.needsUpdate = true; this.rings.instanceColor.needsUpdate = true;
    const fa = this.agents[this.focus], fp = this.P(fa.u, fa.v, .02);
    this.focusRing.position.copy(fp).setY(fp.y + .05); this.focusRing.rotation.y += .01;
    this.focusRing.scale.setScalar((this.kind === 'eagle' ? .9 : .75) * (1 + .08 * Math.sin(sim.clock * 4)));
    this.focusRing.position.y = this.ground(fa.rig.position.x, fa.rig.position.z) + .04;
    this.focusRing.position.x = fa.rig.position.x; this.focusRing.position.z = fa.rig.position.z;
    const pinH = (this.kind === 'eagle' ? .62 : 1.12) * fa.scl + .08 * Math.sin(sim.clock * 3.2);
    this.pin.position.set(fa.rig.position.x, fa.rig.position.y + pinH, fa.rig.position.z); this.pin.rotation.y += .03;

    let ai = 0; const arrows = this.arrows; arrows.forEach(a => a.hide());
    if (this.kind === 'eagle') {
      // pbest markers
      for (let i = 0; i < this.N; i++) {
        const q = this.P(algo.pb[i][0], algo.pb[i][1], .18 + .03 * Math.sin(sim.clock * 2 + i));
        m.makeRotationY(sim.clock + i).setPosition(q); this.pbMarks.setMatrixAt(i, m);
      }
      this.pbMarks.instanceMatrix.needsUpdate = true;
      const gb = this.P(algo.gb[0], algo.gb[1], 0); this.pillar.position.set(gb.x, gb.y + 1.8, gb.z); this.pillar.material.uniforms.uT.value = sim.clock;
      this.gbRing.position.set(gb.x, gb.y + .05, gb.z); this.gbRing.scale.setScalar(1 + .12 * Math.sin(sim.clock * 3));
      if (planning) {
        // everyone: new velocity arrow (thin)
        const g = st === 'plan' ? smooth(.25, .9, p) : 1;
        for (let i = 0; i < this.N; i++) {
          if (i === this.focus) continue;
          const a = this.agents[i].rig.position.clone().add(new THREE.Vector3(0, .35, 0));
          const b = this.P(lerp(algo.x[i][0], algo.nxt[i][0], g), lerp(algo.x[i][1], algo.nxt[i][1], g), 0); b.y = a.y;
          arrows[ai++].set(a, b, '#ffffff', .016, .55 * fade);
        }
        // focus eagle: the three terms of v = w·v + c1r1(pbest − x) + c2r2(gbest − x), tip to tail (the chain),
        // and the eagle's REAL step x → x + v (white, after the speed limit / island edge), drawn from the eagle itself
        const f = this.focus, cp = algo.comps[f], base = this.agents[f].rig.position.clone(); base.y += .45;
        const mv = new THREE.Vector3((algo.nxt[f][0] - algo.x[f][0]) * DOM, 0, (algo.nxt[f][1] - algo.x[f][1]) * DOM);
        const raw = new THREE.Vector3((cp.inert[0] + cp.cog[0] + cp.soc[0]) * DOM, 0, (cp.inert[1] + cp.cog[1] + cp.soc[1]) * DOM);
        const dirRef = mv.lengthSq() > 1e-6 ? mv : raw;
        const side = new THREE.Vector3(-dirRef.z, 0, dirRef.x); if (side.lengthSq() > 1e-6) side.normalize().multiplyScalar(.16);
        const seg = (vec, color, t0, t1, from, label) => {
          const gg = smooth(t0, t1, st === 'plan' ? p : 1);
          const to = from.clone().add(new THREE.Vector3(vec[0] * DOM * gg, 0, vec[1] * DOM * gg));
          const full = Math.hypot(vec[0], vec[1]) * DOM;
          if (full < .14) { if (labels && gg > .35) this.note(from, label + ' ≈ 0', color); return to; }   // too short to see: say it, don't draw a stub
          arrows[ai++].set(from, to, color, .05, fade, true);
          if (labels && gg > .35 && from.distanceTo(to) > .12) this.note(from.clone().lerp(to, .5), label, color);
          return to;
        };
        const c0 = base.clone().add(side);                                   // the chain runs beside the real step
        let q = seg(cp.inert, '#7fb2ff', 0, .33, c0, t('noteMomentum'));
        q = seg(cp.cog, '#3fd987', .33, .66, q, t('noteOwnBest'));
        q = seg(cp.soc, '#ffc61a', .66, .99, q, t('noteSwarmBest'));
        const sumA = .9 * fade * smooth(.9, 1, st === 'plan' ? p : 1);
        const dest = base.clone().add(mv);
        arrows[ai++].set(base, dest, '#ffffff', .034, sumA, true);
        if (labels && sumA > .3) this.note(dest, t('noteSum'), '#ffffff');
        // when the speed limit or the island edge shortened the step, say so (the chain is the raw sum, the white arrow the real step)
        if (labels && sumA > .3 && raw.distanceTo(mv) > .06) {
          const atEdge = [0, 1].some(d => Math.abs(algo.nxt[f][d]) >= 1 - 1e-9 && Math.abs(algo.x[f][d] + clamp(cp.inert[d] + cp.cog[d] + cp.soc[d], -algo.vmax, algo.vmax)) > 1);
          this.note(q, t(atEdge ? 'noteEdge' : 'noteCapped'), '#9aa6a4');
        }
        this.debug = { from: base.clone(), to: dest.clone(), chainFrom: c0.clone(), chainTo: q.clone(), raw: raw.clone(), move: mv.clone() };
      }
    } else {
      const lp = algo.leadPos;
      // encircling ring around the leaders' centroid, radius shrinks with a
      const cx = (lp[0][0] + lp[1][0] + lp[2][0]) / 3, cz = (lp[0][1] + lp[1][1] + lp[2][1]) / 3;
      const ctr = this.P(cx, cz, .08); this.encircle.position.copy(ctr);
      const r = Math.max(.18, algo.a * DOM * .45); this.encircle.scale.setScalar(damp(this.encircle.scale.x, r, 3, .016));
      this.encircle.visible = true; this.encircle.material.opacity = .55;
      if (planning) {
        const fi = this.focus, comp = algo.comps[fi], wpos = this.agents[fi].rig.position.clone(); wpos.y += .35;
        const g = st === 'plan' ? smooth(0, .55, p) : 1, g2 = st === 'plan' ? smooth(.5, 1, p) : 1;
        for (let k = 0; k < 3; k++) {
          const L = this.P(lp[k][0], lp[k][1], .35);
          const tip = wpos.clone().lerp(L, g);
          arrows[ai++].set(wpos, tip, LEAD_COL[k], .04, fade, true);
          const EDGE = HALF / DOM - .02, gx = comp.X[k][0], gz = comp.X[k][1];        // the real guess, as far as the island block reaches
          const X = this.P(clamp(gx, -EDGE, EDGE), clamp(gz, -EDGE, EDGE), .3);
          if (labels && g2 > .5 && (Math.abs(gx) > EDGE || Math.abs(gz) > EDGE)) this.note(X, t('noteOffMap'), LEAD_COL[k]);
          this.xMarks[k].position.copy(X); this.xMarks[k].scale.setScalar(g2 * fade + .001); this.xMarks[k].visible = fade > .02;
          if (labels && g2 > .5) this.note(X, t('noteGuess', { k: LEAD_TAG[k] }), LEAD_COL[k]);
        }
        const nx = this.P(algo.nxt[fi][0], algo.nxt[fi][1], .3);
        const meanRaw = [0, 1].map(d => (comp.X[0][d] + comp.X[1][d] + comp.X[2][d]) / 3);
        if (labels && p > .8 && meanRaw.some(m => Math.abs(m) > 1)) this.note(nx, t('noteEdge'), '#9aa6a4');
        this.debug = { guesses: comp.X.map(g => g.slice()), mean: meanRaw, next: algo.nxt[fi].slice(), leaders: lp.map(l => l.slice()) };
        this.xNew.position.copy(nx); this.xNew.scale.setScalar(smooth(.8, 1, st === 'plan' ? p : 1) * fade + .001); this.xNew.visible = fade > .02 && (st === 'move' || p > .8);
        const gn = smooth(.8, 1, st === 'plan' ? p : 1) * fade;
        arrows[ai++].set(wpos, nx.clone().setY(wpos.y), '#ffffff', .04, gn, true);
        if (labels && this.xNew.visible) this.note(nx, t('noteMiddle'), '#ffffff');
        if (labels) this.note(this.encircle.position.clone().add(new THREE.Vector3(this.encircle.scale.x * .7071, 0, this.encircle.scale.x * .7071)), t('noteCircle', { a: num(algo.a, 2) }), '#c0392b');
        for (let i = 0; i < this.N; i++) {
          if (i === fi) continue;
          const a = this.agents[i].rig.position.clone(); a.y += .3;
          const b = this.P(lerp(algo.x[i][0], algo.nxt[i][0], g2), lerp(algo.x[i][1], algo.nxt[i][1], g2), .3);
          arrows[ai++].set(a, b, '#ffffff', .016, .55 * fade);
        }
      } else { this.xMarks.forEach(x => x.visible = false); this.xNew.visible = false; }
    }
  }
}

/* raft follows a loop inside the biggest flooded basin */
class RaftPath {
  constructor(hf) {
    this.hf = hf;
    let best = null;
    for (let cx = -3.6; cx <= 3.6; cx += .3) for (let cz = -3.2; cz <= 3.6; cz += .3) {
      if (hf.sample(cx, cz) > hf.WL - .2) continue;
      if (Math.hypot(cx - hf.islet.x, cz - hf.islet.z) < 1.5) continue;
      const R = this.radii(cx, cz), mean = R.reduce((s, v) => s + v, 0) / R.length, mn = Math.min(...R);
      const score = mean + mn * .8 - .08 * Math.hypot(cx - hf.opt.x, cz - hf.opt.z);
      if (!best || score > best.score) best = { cx, cz, R, score };
    }
    best = best || { cx: hf.opt.x, cz: hf.opt.z, R: new Array(64).fill(.3), score: 0 };
    this.cx = best.cx; this.cz = best.cz; this.R = best.R;
    for (let it = 0; it < 6; it++) this.R = this.R.map((v, i) => (this.R[(i + 63) % 64] + v * 2 + this.R[(i + 1) % 64]) / 4);
  }
  radii(cx, cz) {
    const out = [], hf = this.hf;
    for (let k = 0; k < 64; k++) {
      const a = k / 64 * TAU; let r = 0;
      while (r < 2.0) { const x = cx + Math.cos(a) * (r + .1), z = cz + Math.sin(a) * (r + .1); if (hf.sample(x, z) > hf.WL - .17 || Math.abs(x) > 4.3 || Math.abs(z) > 4.3) break; r += .05; }
      out.push(r);
    }
    return out;
  }
  at(th) {
    const f = ((th / TAU) % 1 + 1) % 1 * 64, i = Math.floor(f), t = f - i;
    const r = lerp(this.R[i % 64], this.R[(i + 1) % 64], t) * .7;
    return [this.cx + Math.cos(th) * r, this.cz + Math.sin(th) * r];
  }
}

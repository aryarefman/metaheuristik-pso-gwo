/* ------------------------------------------------------------------
   30_characters.js — needle-felt mascots (assets/mascots/*.png) + props
   Eagle and wolf are modelled on the mascot art: one smooth felted body
   per rig part (ellipsoids smooth-unioned in an SDF, meshed with surface
   nets), cloth-sheen material with a fibre bump, glossy eyes and a halo
   of stray fibres (crochet version: same shapes, yarn stitches, no fibres).
   Rigs: wings flap, legs trot, tail and scarf sway.
------------------------------------------------------------------- */
const _sph = new THREE.SphereGeometry(1, 20, 14);
const grp = (x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };
const plainMat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .9, ...o });

const FOLLOW_COL = '#1e90ff';          // colour of the followed animal's ring, pin and label (the animal keeps its own colours)
/* the followed animal is drawn in front of the other animals (never through terrain): it is drawn after the world
   (renderOrder 1) and marks its pixels in the stencil buffer; the other animals (renderOrder 2) skip marked pixels */
const FOLLOW_ORDER = 1, OTHER_ORDER = 2;

const Felt = (() => {
  const V3 = () => new THREE.Vector3();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = V3(), _s = V3();
  const _a = V3(), _b = V3(), _cc = V3(), _n = V3(), _col = new THREE.Color();

  /* ---------- shared materials ---------- */
  function feltTexture() {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 12000; i++) {
      const x = Math.random() * S, y = Math.random() * S, a = Math.random() * Math.PI, l = 3 + Math.random() * 12;
      const v = Math.random() < .5 ? 50 + Math.random() * 40 : 165 + Math.random() * 60;
      g.strokeStyle = `rgba(${v},${v},${v},${.15 + Math.random() * .3})`; g.lineWidth = .5 + Math.random();
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + .7) * l * .5, y + Math.sin(a + .7) * l * .5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); return t;
  }
  const fibre = feltTexture();
  const feltMat = (glow) => STYLE === 'crochet'
    ? yarnify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, ...glow }), { scale: 14, bump: 2.4, sheen: .22, fleck: .3 })   // amigurumi stitches
    : new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: .95, metalness: 0,
      sheen: .45, sheenRoughness: .55, sheenColor: new THREE.Color('#f3ebe0'),
      bumpMap: fibre, bumpScale: 1.4, envMapIntensity: .6, ...glow
    });
  const M = {
    felt: feltMat({}),
    gloss: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .15, clearcoat: 1, clearcoatRoughness: .05 }),
    fuzz: new THREE.ShaderMaterial({
      uniforms: { uSize: { value: .0075 }, uPx: { value: 600 }, uSun: { value: new THREE.Vector3(-.4, .8, .45).normalize() } },
      vertexShader: `
        attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float uSize, uPx; uniform vec3 uSun;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float px = uSize * length(modelMatrix[0].xyz) * uPx / -mv.z;
          vA = smoothstep(.8, 2.0, px);                    // fibres vanish when sub-pixel: no speckle from afar
          vec3 n = normalize(mat3(modelMatrix) * normal);
          vC = color * (.45 + .62 * max(dot(n, uSun), 0.) + .16 * n.y);
          gl_PointSize = max(px, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main() {
          vec2 d = gl_PointCoord - .5;
          if (dot(d, d) > .25 || vA < .5) discard;
          gl_FragColor = vec4(vC, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    })
  };

  /* ---------- smooth felted surface: ellipsoids smooth-unioned in an SDF, meshed with surface nets ---------- */
  function surface(blobs, cell, kS) {
    const B = blobs.map(b => {
      _e.set(...(b.r || [0, 0, 0]));
      const inv = new THREE.Matrix4().compose(_p.set(...(b.p || [0, 0, 0])), _q.setFromEuler(_e), _s.set(1, 1, 1)).invert().elements;
      const s = b.s || [1, 1, 1];
      return { inv, sx: s[0], sy: s[1], sz: s[2], col: new THREE.Color(b.c), p: b.p || [0, 0, 0], rmax: Math.max(...s), pri: (b.pri || 0) * cell };
    });
    const sdf = (x, y, z, out) => {
      let d = 1e9;
      for (let i = 0; i < B.length; i++) {
        const b = B[i], e = b.inv;
        const qx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / b.sx, qy = (e[1] * x + e[5] * y + e[9] * z + e[13]) / b.sy, qz = (e[2] * x + e[6] * y + e[10] * z + e[14]) / b.sz;
        const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz), k1 = Math.sqrt((qx / b.sx) ** 2 + (qy / b.sy) ** 2 + (qz / b.sz) ** 2) || 1e-6;
        const di = k0 * (k0 - 1) / k1;
        if (out) out[i] = di;
        const h = Math.max(kS - Math.abs(d - di), 0) / kS;
        d = Math.min(d, di) - h * h * kS * .25;
      }
      return d;
    };
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    B.forEach(b => { for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], b.p[a] - b.rmax - 3 * cell); hi[a] = Math.max(hi[a], b.p[a] + b.rmax + 3 * cell); } });
    const nx = Math.ceil((hi[0] - lo[0]) / cell) + 1, ny = Math.ceil((hi[1] - lo[1]) / cell) + 1, nz = Math.ceil((hi[2] - lo[2]) / cell) + 1;
    const G = new Float32Array(nx * ny * nz), gi = (i, j, k) => i + nx * (j + ny * k);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) G[gi(i, j, k)] = sdf(lo[0] + i * cell, lo[1] + j * cell, lo[2] + k * cell);
    // a vertex in every cell the surface crosses, at the mean of its edge crossings
    const CV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), ci = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
    const P = [], cv = new Float32Array(8);
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let neg = 0;
      for (let c = 0; c < 8; c++) { cv[c] = G[gi(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; if (cv[c] < 0) neg++; }
      if (neg === 0 || neg === 8) continue;
      let sx = 0, sy = 0, sz = 0, m = 0;
      for (const [a, b] of E) {
        if ((cv[a] < 0) === (cv[b] < 0)) continue;
        const t = cv[a] / (cv[a] - cv[b]);
        sx += (a & 1) + t * ((b & 1) - (a & 1)); sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1)); sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1)); m++;
      }
      CV[ci(i, j, k)] = P.length / 3;
      P.push(lo[0] + (i + sx / m) * cell, lo[1] + (j + sy / m) * cell, lo[2] + (k + sz / m) * cell);
    }
    // a quad for every grid edge the surface crosses, joining the four cells around that edge
    const I = [], quad = (a, b, c, d) => { if (a >= 0 && b >= 0 && c >= 0 && d >= 0) I.push(a, b, c, a, c, d); };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const in0 = G[gi(i, j, k)] < 0;
      if (in0 !== (G[gi(i + 1, j, k)] < 0)) quad(CV[ci(i, j - 1, k - 1)], CV[ci(i, j, k - 1)], CV[ci(i, j, k)], CV[ci(i, j - 1, k)]);
      if (in0 !== (G[gi(i, j + 1, k)] < 0)) quad(CV[ci(i - 1, j, k - 1)], CV[ci(i - 1, j, k)], CV[ci(i, j, k)], CV[ci(i, j, k - 1)]);
      if (in0 !== (G[gi(i, j, k + 1)] < 0)) quad(CV[ci(i - 1, j - 1, k)], CV[ci(i, j - 1, k)], CV[ci(i, j, k)], CV[ci(i - 1, j, k)]);
    }
    // normals from the SDF gradient, colour from the nearest blob (soft felt blend), spherical uv for the fibre bump
    const n = P.length / 3, N = new Float32Array(n * 3), C = new Float32Array(n * 3), U = new Float32Array(n * 2), ds = new Float32Array(B.length), hs = cell * .5;
    let mx = 0, my = 0, mz = 0; for (let v = 0; v < n; v++) { mx += P[v * 3]; my += P[v * 3 + 1]; mz += P[v * 3 + 2]; } mx /= n || 1; my /= n || 1; mz /= n || 1;
    for (let v = 0; v < n; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      _n.set(sdf(x + hs, y, z) - sdf(x - hs, y, z), sdf(x, y + hs, z) - sdf(x, y - hs, z), sdf(x, y, z + hs) - sdf(x, y, z - hs)).normalize();
      N[v * 3] = _n.x; N[v * 3 + 1] = _n.y; N[v * 3 + 2] = _n.z;
      sdf(x, y, z, ds);
      let dm = 1e9; for (let i = 0; i < B.length; i++) dm = Math.min(dm, ds[i] - B[i].pri);
      let r = 0, g = 0, bl = 0, wt = 0;
      for (let i = 0; i < B.length; i++) { const w = Math.exp(-(ds[i] - B[i].pri - dm) / (cell * .5)); r += B[i].col.r * w; g += B[i].col.g * w; bl += B[i].col.b * w; wt += w; }
      const grain = 1 + (Math.random() - .5) * .05;
      C[v * 3] = r / wt * grain; C[v * 3 + 1] = g / wt * grain; C[v * 3 + 2] = bl / wt * grain;
      U[v * 2] = Math.atan2(x - mx, z - mz) / Math.PI * 1.5; U[v * 2 + 1] = (y - my) * 4;
    }
    // orient every triangle along the outward gradient
    for (let t = 0; t < I.length; t += 3) {
      _a.fromArray(P, I[t] * 3); _b.fromArray(P, I[t + 1] * 3).sub(_a); _cc.fromArray(P, I[t + 2] * 3).sub(_a);
      _b.cross(_cc);
      _n.fromArray(N, I[t] * 3).add(_a.fromArray(N, I[t + 1] * 3)).add(_a.fromArray(N, I[t + 2] * 3));
      if (_b.dot(_n) < 0) { const tmp = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = tmp; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.setIndex(I);
    return geo;
  }

  /* hard pieces (cones, torus, small details) keep their own geometry */
  function placed(b) {
    const g = (b.geo || _sph).clone();
    _e.set(...(b.r || [0, 0, 0]));
    _m.compose(_p.set(...(b.p || [0, 0, 0])), _q.setFromEuler(_e), _s.set(...(b.s || [1, 1, 1])));
    g.applyMatrix4(_m);
    const col = new THREE.Color(b.c), cnt = g.attributes.position.count, C = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { C[i * 3] = col.r; C[i * 3 + 1] = col.g; C[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2));
    return g.index ? g : (g.setIndex([...Array(cnt).keys()]), g);
  }

  /* merge entries {geo, fuzz, k, vary} and grow stray fibres on the fuzzy ones */
  const FUZZ_DENSITY = 2600, FUZZ_LEN = .012;
  function combine(list) {
    if (!list.length) return null;
    const P = [], N = [], U = [], C = [], I = [], fP = [], fN = [], fC = [];
    for (const { geo, fuzz, k, vary } of list) {
      const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, col = geo.attributes.color, idx = geo.index.array, base = P.length / 3;
      for (let i = 0; i < pos.count; i++) {
        P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); N.push(nor.getX(i), nor.getY(i), nor.getZ(i));
        U.push(uv.getX(i), uv.getY(i)); C.push(col.getX(i), col.getY(i), col.getZ(i));
      }
      for (let i = 0; i < idx.length; i++) I.push(base + idx[i]);
      if (!fuzz) continue;
      const cum = []; let area = 0;
      for (let i = 0; i < idx.length; i += 3) {
        _a.fromBufferAttribute(pos, idx[i]); _b.fromBufferAttribute(pos, idx[i + 1]).sub(_a); _cc.fromBufferAttribute(pos, idx[i + 2]).sub(_a);
        area += _b.cross(_cc).length() * .5; cum.push(area);
      }
      const n = Math.min(24000, Math.round(area * FUZZ_DENSITY * k));
      for (let s = 0; s < n; s++) {
        const r = Math.random() * area; let l = 0, h = cum.length - 1;
        while (l < h) { const mid = (l + h) >> 1; if (cum[mid] < r) l = mid + 1; else h = mid; }
        const t = l * 3; let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const w = 1 - u - v, ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
        _n.set(0, 0, 0).addScaledVector(_a.fromBufferAttribute(nor, ia), w).addScaledVector(_b.fromBufferAttribute(nor, ib), u).addScaledVector(_cc.fromBufferAttribute(nor, ic), v).normalize();
        const out = FUZZ_LEN * (.1 + Math.random());
        fP.push(pos.getX(ia) * w + pos.getX(ib) * u + pos.getX(ic) * v + _n.x * out,
          pos.getY(ia) * w + pos.getY(ib) * u + pos.getY(ic) * v + _n.y * out,
          pos.getZ(ia) * w + pos.getZ(ib) * u + pos.getZ(ic) * v + _n.z * out);
        fN.push(_n.x, _n.y, _n.z);
        _col.setRGB(col.getX(ia) * w + col.getX(ib) * u + col.getX(ic) * v, col.getY(ia) * w + col.getY(ib) * u + col.getY(ic) * v, col.getZ(ia) * w + col.getZ(ib) * u + col.getZ(ic) * v)
          .offsetHSL(0, (Math.random() - .5) * .05, (Math.random() - .5) * vary);
        fC.push(_col.r, _col.g, _col.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.setIndex(I);
    let fz = null;
    if (fP.length) {
      fz = new THREE.BufferGeometry();
      fz.setAttribute('position', new THREE.Float32BufferAttribute(fP, 3)); fz.setAttribute('normal', new THREE.Float32BufferAttribute(fN, 3));
      fz.setAttribute('color', new THREE.Float32BufferAttribute(fC, 3));
    }
    return { geo, fz };
  }

  /* one rig part: soft felt blobs (smooth-unioned), hard felt pieces, glossy pieces */
  class Part {
    constructor(cell = .016, k = .05) { this.cell = cell; this.k = k; this.soft = []; this.hard = []; this.gloss = []; }
    add(b) { (b.gloss ? this.gloss : (b.geo || b.fuzz === false || b.hard) ? this.hard : this.soft).push(b); return this; }
    build(group) {
      const list = [];
      if (this.soft.length) list.push({ geo: surface(this.soft, this.cell, this.k), fuzz: true, k: 1, vary: .06 });
      for (const b of this.hard) list.push({ geo: placed(b), fuzz: b.fuzz !== false, k: b.k || 1, vary: b.vary ?? .06 });
      const felt = combine(list), gloss = combine(this.gloss.map(b => ({ geo: placed(b), fuzz: false })));
      if (felt) {
        const m = new THREE.Mesh(felt.geo, M.felt); m.castShadow = true; m.receiveShadow = true; group.add(m);
        if (felt.fz && STYLE !== 'crochet') { const f = new THREE.Points(felt.fz, M.fuzz); f.frustumCulled = false; group.add(f); }   // stray fibres: felt only
      }
      if (gloss) { const m = new THREE.Mesh(gloss.geo, M.gloss); m.castShadow = true; group.add(m); }
      return group;
    }
  }

  /* animated joint = named outer group (the rig rotates it) + inner group holding the rest pose */
  function joint(parent, name, p = [0, 0, 0], r = [0, 0, 0]) {
    const o = new THREE.Group(); o.name = name; o.position.set(...p); parent.add(o);
    const i = new THREE.Group(); i.rotation.set(...r); o.add(i); return i;
  }
  function eye(part, p, size, iris) {
    part.add({ p, s: [size, size, size * .8], c: iris, gloss: true });
    part.add({ p: [p[0] * 1.02, p[1], p[2] + size * .52], s: [size * .6, size * .6, size * .4], c: '#090605', gloss: true });
    part.add({ p: [p[0] + size * .3, p[1] + size * .34, p[2] + size * .78], s: [size * .2, size * .2, size * .1], c: '#ffffff', gloss: true });
  }
  const CONE = new THREE.ConeGeometry(1, 1, 24, 4), TORUS = new THREE.TorusGeometry(1, .34, 16, 40);
  const TEAL = '#3ea7a4', TEAL_D = '#2f8d8a', BUTTON = '#efe5d0';

  /* teal knitted scarf: ring around the neck + a loose flap with a cream button (own joint, it flutters) */
  function scarf(root, part, ringP, ringR, ringRot, flapP, flapRot, size) {
    part.add({ geo: TORUS, p: ringP, s: [ringR, ringR, ringR * 1.3], r: ringRot, c: TEAL, k: .7, vary: .07 });
    const flap = joint(root, 'scarf', flapP, flapRot), fp = new Part(0.022, .03);
    fp.add({ p: [0, 0, -size * .55], s: [size * .27, size * .075, size * .62], c: TEAL_D });
    fp.add({ p: [0, size * .08, -size * .85], s: [size * .13, size * .035, size * .13], c: BUTTON, hard: true, fuzz: false });
    for (let k = -2; k <= 2; k++) fp.add({ p: [k * size * .1, 0, -size * 1.18], s: [size * .035, size * .03, size * .1], c: TEAL, hard: true, k: .5 });
    fp.build(flap);
  }

  /* ============================== WOLF (wolf.png) ============================== */
  const W = { fur: '#7d7e86', saddle: '#5b5c64', cap: '#55565f', cream: '#efe6d6', leg: '#56575f', paw: '#3f4048', nose: '#4b302c', ear: '#4f5058', earIn: '#e7d7c4', iris: '#5e3a1f' };
  function buildWolf() {
    const C = W, root = new THREE.Group();
    const body = new Part(0.036, .07);
    body.add({ p: [0, .78, -.02], s: [.29, .29, .46], c: C.fur });
    body.add({ p: [0, .92, -.08], s: [.23, .17, .4], c: C.saddle, pri: 1 });
    body.add({ p: [0, .64, .06], s: [.2, .17, .4], c: C.cream, pri: 1 });
    body.add({ p: [0, .8, .36], s: [.27, .31, .24], c: C.fur });
    body.add({ p: [0, .8, .5], s: [.2, .27, .16], c: C.cream, r: [-.25, 0, 0], pri: 1 });            // fluffy bib
    body.add({ p: [0, .8, -.34], s: [.26, .28, .26], c: C.fur });
    body.add({ p: [0, 1.04, .56], s: [.19, .23, .2], c: C.fur, r: [-.7, 0, 0] });                     // neck
    body.add({ p: [0, .98, .66], s: [.16, .19, .14], c: C.cream, r: [-.7, 0, 0], pri: 1 });
    scarf(root, body, [0, 1.09, .6], .21, [-.85, 0, 0], [.15, 1.18, .5], [-.55, -.55, .25], .36);
    body.build(root);

    const head = joint(root, 'head', [0, 1.3, .76], [.12, 0, 0]), H = new Part(0.02, .05);
    H.add({ s: [.26, .24, .24], c: C.fur });
    H.add({ p: [0, .11, -.03], s: [.19, .12, .18], c: C.cap, pri: 1 });
    for (const sd of [-1, 1]) {
      H.add({ p: [sd * .12, -.07, .1], s: [.14, .13, .13], c: C.cream, pri: 1 });
      H.add({ p: [sd * .19, -.03, -.01], s: [.09, .12, .11], c: C.cream, r: [0, 0, sd * .5], pri: 1 });     // cheek ruff
      H.add({ p: [sd * .085, .1, .2], s: [.045, .018, .03], c: C.cream, r: [0, 0, sd * .2], hard: true, k: .4 });  // brow
      eye(H, [sd * .085, .04, .215], .056, C.iris);
      H.add({ geo: CONE, p: [sd * .14, .32, -.04], s: [.13, .3, .085], r: [-.1, 0, -sd * .24], c: C.ear });
      H.add({ geo: CONE, p: [sd * .135, .29, .01], s: [.08, .21, .035], r: [-.1, 0, -sd * .24], c: C.earIn, k: .5 });
    }
    H.add({ p: [0, -.07, .2], s: [.115, .095, .15], c: C.cream, pri: 1 });                    // muzzle
    H.add({ p: [0, -.015, .17], s: [.065, .05, .12], c: C.fur });                             // muzzle bridge
    H.add({ p: [0, -.035, .345], s: [.06, .045, .042], c: C.nose, gloss: true });
    H.add({ geo: TORUS, p: [0, -.11, .29], s: [.05, .032, .02], r: [0, 0, Math.PI], c: '#5b4239', fuzz: false });   // smile
    H.build(head);

    const legs = [[.15, .34], [-.15, .34], [.15, -.36], [-.15, -.36]].map(([x, z], i) => {
      const hip = joint(root, 'leg' + i, [x, .74, z]);
      new Part(0.023, .04).add({ p: [0, -.12, 0], s: [.1, .2, .11], c: i < 2 ? C.fur : C.saddle }).add({ p: [0, -.3, 0], s: [.075, .1, .08], c: C.leg }).build(hip);
      const knee = joint(hip, 'knee' + i, [0, -.34, 0]);
      new Part(0.02, .04).add({ p: [0, -.14, 0], s: [.068, .2, .076], c: C.leg })
        .add({ p: [0, -.355, .045], s: [.082, .05, .115], c: C.paw }).build(knee);
      return { name: 'leg' + i, knee: 'knee' + i, front: i < 2, side: x > 0 ? 1 : -1 };
    });

    const tail = joint(root, 'tail', [0, .92, -.56], [.55, 0, 0]);
    new Part(0.023, .05).add({ p: [0, 0, -.2], s: [.14, .14, .27], c: C.fur }).build(tail);
    const tip = joint(tail, 'tailTip', [0, 0, -.38], [-.3, 0, 0]);
    new Part(0.023, .06).add({ p: [0, 0, -.14], s: [.17, .17, .23], c: C.saddle }).add({ p: [0, 0, -.34], s: [.13, .13, .16], c: C.cream, pri: 1 }).build(tip);
    root.userData.legs = legs;
    return root;
  }

  /* ============================== EAGLE (eagle.png) ============================== */
  const E = { body: '#4c3328', dark: '#3a281f', fing: '#45302a', gold: '#d39a33', gold2: '#e7b650', white: '#f5f1e8', beak: '#edb636', beakD: '#c98f1f', brow: '#6a5a4c', iris: '#2a1810' };
  function buildEagle() {
    const C = E, root = new THREE.Group();
    const body = new Part(0.025, .05);
    body.add({ s: [.25, .24, .44], c: C.body });
    body.add({ p: [0, -.05, .14], s: [.22, .2, .3], c: C.body });
    for (let r = 0; r < 3; r++) {                                                    // golden scallop bib
      const n = r === 2 ? 4 : 5;
      for (let k = 0; k < n; k++) {
        const x = (k - (n - 1) / 2) * .075, y = .03 - r * .075, z = .37 - r * .035 - x * x * 1.6;
        body.add({ p: [x, y, z], s: [.05, .04, .03], r: [.5, x * 2, 0], c: r % 2 ? C.gold : C.gold2, pri: .5 });
      }
    }
    body.add({ p: [0, .13, .35], s: [.18, .17, .15], c: C.white, pri: 1 });           // white neck
    scarf(root, body, [0, .13, .37], .17, [.25, 0, 0], [-.11, .25, .3], [.5, .2, 0], .26);
    body.build(root);

    const head = joint(root, 'head', [0, .2, .46]), H = new Part(0.018, .045);
    H.add({ s: [.2, .19, .2], c: C.white });
    H.add({ p: [0, -.07, -.05], s: [.17, .13, .16], c: C.white });
    H.add({ p: [0, -.035, .17], s: [.08, .07, .1], c: C.beak, pri: 2 });               // beak base
    H.add({ geo: CONE, p: [0, -.04, .28], s: [.058, .16, .052], r: [Math.PI / 2, 0, 0], c: C.beak, vary: .05 });
    H.add({ geo: CONE, p: [0, -.09, .345], s: [.03, .075, .032], r: [Math.PI / 2 + 1.15, 0, 0], c: C.beakD, vary: .05 });
    H.add({ geo: TORUS, p: [0, -.075, .205], s: [.065, .032, .03], r: [0, 0, Math.PI + .1], c: '#9c6c1c', fuzz: false });
    for (const sd of [-1, 1]) {
      eye(H, [sd * .09, .035, .158], .034, C.iris);
      H.add({ p: [sd * .085, .085, .165], s: [.062, .018, .03], r: [0, 0, sd * .4], c: C.brow, hard: true, fuzz: false });
    }
    H.build(head);

    const tail = joint(root, 'tail', [0, .02, -.4]), T = new Part(0.02, .03);
    for (let k = -2; k <= 2; k++) T.add({ p: [k * .055, 0, -.17], s: [.055, .022, .2], r: [0, k * .17, 0], c: k % 2 ? C.dark : C.body });
    T.build(tail);

    for (const sd of [-1, 1]) {                                                      // yellow feet with dark talons
      const foot = joint(root, 'foot' + sd, [sd * .08, -.15, .02]), F = new Part(0.016, .02);
      F.add({ p: [0, -.06, 0], s: [.038, .075, .038], c: C.beak });
      for (const k of [-1, 0, 1]) {
        F.add({ p: [k * .025, -.13, .04], s: [.016, .016, .045], c: C.beak });
        F.add({ geo: CONE, p: [k * .025, -.14, .09], s: [.011, .035, .011], r: [Math.PI / 2 + .5, 0, 0], c: '#2b2420', fuzz: false });
      }
      F.build(foot);
    }

    for (const sd of [-1, 1]) {
      const inner = joint(root, 'wing' + sd, [sd * .2, .1, .04]), Wp = new Part(0.022, .03);
      Wp.add({ p: [sd * .25, 0, -.04], s: [.28, .06, .25], c: C.body });
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++)
        Wp.add({ p: [sd * (.08 + k * .11 + r * .025), .045 - r * .006, .13 - r * .08], s: [.068, .026, .055], r: [.25, sd * .1, 0], c: (r + k) % 2 ? C.gold : C.gold2, pri: .6 });
      for (let k = 0; k < 5; k++) Wp.add({ p: [sd * (.07 + k * .1), -.006, -.25], s: [.065, .024, .17], r: [0, sd * .05 * k, 0], c: C.dark, pri: .6 });
      Wp.build(inner);
      const outer = joint(inner, 'hand' + sd, [sd * .5, 0, -.03]), O = new Part(0.02, .025);
      O.add({ p: [sd * .1, 0, -.03], s: [.16, .055, .2], c: C.body });
      for (let k = 0; k < 3; k++) O.add({ p: [sd * (.02 + k * .08), .038, .08], s: [.06, .024, .05], c: k % 2 ? C.gold : C.gold2, pri: .6 });
      for (let j = 0; j < 5; j++) {                                                  // five rounded "finger" primaries
        const a = -.5 + j * .28, L = .22 - Math.abs(j - 2) * .015;
        O.add({ p: [sd * (.18 + L * .8 * Math.cos(a)), -.004, -.06 - L * .8 * Math.sin(a)], s: [L, .028, .075], r: [0, sd * a, 0], c: j % 2 ? C.dark : C.fing });
      }
      O.build(outer);
    }
    return root;
  }

  /* ---------- templates (built once) and rig-ready clones ---------- */
  let TPL = null;
  const tpl = () => TPL || (TPL = { wolf: buildWolf(), eagle: buildEagle() });
  /* the followed animal lives on its own render layer, drawn last (see the frame loop) */
  const animalMats = [M.felt, M.gloss, M.fuzz];
  for (const m of animalMats) Object.assign(m, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp });
  const followedMat = new Map(animalMats.map(m => {
    const c = m.clone();
    c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;   // keep yarn / grain patches
    if (m.uniforms) c.uniforms = m.uniforms;                                                     // fuzz shares its live uniforms
    Object.assign(c, { stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    return [m, c];
  }));
  const baseMat = new Map([...followedMat].map(([b, f]) => [f, b]));
  const setFollowed = (rig, on) => rig.traverse(o => {
    if (!o.material) return;
    const base = baseMat.get(o.material) || o.material;
    if (!followedMat.has(base)) return;
    o.material = on ? followedMat.get(base) : base; o.renderOrder = on ? FOLLOW_ORDER : OTHER_ORDER;
  });
  return {
    M, tpl, setFollowed,
    setViewport(heightPx, fovDeg) { M.fuzz.uniforms.uPx.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)); },
    setSun(dir) { M.fuzz.uniforms.uSun.value.copy(dir).normalize(); }
  };
})();

/* model units -> world: the felt models are built ~1.6 tall, the scene wants ~0.7 */
const FELT_SCALE = .45;

function feltHalo(r, y, z) {
  const halo = new THREE.Mesh(new THREE.TorusGeometry(r, .012, 8, 36), new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0, depthWrite: false }));
  halo.rotation.x = Math.PI / 2; halo.position.set(0, y, z); return halo;
}

/* ============================== EAGLE ============================== */
function makeEagle() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const model = Felt.tpl().eagle.clone(true); model.scale.setScalar(FELT_SCALE); body.add(model);
  const get = (n) => model.getObjectByName(n);
  const wings = [-1, 1].map(sd => ({ inner: get('wing' + sd), outer: get('hand' + sd), sd }));
  const halo = feltHalo(.14, .3, .21); body.add(halo);
  root.userData = { kind: 'eagle', body, head: get('head'), wings, feet: [get('foot-1'), get('foot1')], scarfTail: get('scarf'), tail: get('tail'), halo };
  return root;
}

/* ============================== WOLF ============================== */
function makeWolf() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const T = Felt.tpl().wolf, model = T.clone(true); model.scale.setScalar(FELT_SCALE); body.add(model);
  const get = (n) => model.getObjectByName(n);
  const legs = T.userData.legs.map(L => ({ hip: get(L.name), knee: get(L.knee), front: L.front, side: L.side }));
  const halo = feltHalo(.15, .82, .33); body.add(halo);
  root.userData = { kind: 'wolf', body, head: get('head'), legs, tail: get('tail'), scarfTail: get('scarf'), halo };
  return root;
}

/* ============================== RAFT + FISHERMAN ============================== */
function makeRaft() {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const bamboo = plainMat('#cdb85f'), bamboo2 = plainMat('#a9b857'), dark = plainMat('#4a3a22');
  for (let i = -3; i <= 3; i++) {
    const L = 1.0 + (i % 2) * .03, p = new THREE.Mesh(new THREE.CapsuleGeometry(.034, L, 6, 12), i % 2 ? bamboo : bamboo2);
    p.rotation.x = Math.PI / 2; p.position.set(i * .068, .03, 0); p.castShadow = true; rig.add(p);
    for (const z of [-.3, -.05, .2]) { const r = new THREE.Mesh(new THREE.TorusGeometry(.035, .009, 6, 14), plainMat('#8a7a3a')); r.position.set(i * .068, .03, z); r.rotation.y = Math.PI / 2; rig.add(r); }
    const tip = new THREE.Mesh(new THREE.CapsuleGeometry(.03, .1, 4, 8), p.material); tip.position.set(i * .068, .075, .56); tip.rotation.x = Math.PI / 2 - .5; rig.add(tip);
  }
  for (const z of [-.28, .12]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(.014, .5, 4, 8), dark); l.rotation.z = Math.PI / 2; l.position.set(0, .07, z); rig.add(l); }
  const man = grp(0, .06, -.18); rig.add(man);
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(.05, .09, .28, 18), plainMat('#46657a')); robe.position.y = .17; robe.castShadow = true; man.add(robe);
  const sash = new THREE.Mesh(new THREE.TorusGeometry(.066, .016, 8, 20), plainMat('#b34b32')); sash.rotation.x = Math.PI / 2; sash.position.y = .17; man.add(sash);
  const sh = new THREE.Mesh(_sph, plainMat('#46657a')); sh.scale.set(.08, .04, .05); sh.position.y = .3; man.add(sh);
  const head = new THREE.Mesh(_sph, plainMat('#e0b48a')); head.scale.setScalar(.042); head.position.y = .35; man.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(.13, .09, 28, 1, true), plainMat('#d8bd6a', { side: THREE.DoubleSide }));
  hat.position.y = .4; hat.castShadow = true; man.add(hat);
  const hatTop = new THREE.Mesh(_sph, plainMat('#b89a4a')); hatTop.scale.setScalar(.014); hatTop.position.y = .447; man.add(hatTop);
  const pole = grp(.07, .24, .03); man.add(pole);
  const shaft = new THREE.Mesh(new THREE.CapsuleGeometry(.013, 1.7, 4, 8), plainMat('#8a7436')); shaft.position.y = -.2; shaft.castShadow = true; pole.add(shaft);
  pole.rotation.x = .5;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(.016, .13, 4, 8), plainMat('#46657a')); armL.position.set(.045, .22, .05); armL.rotation.set(1.1, 0, -.4); man.add(armL);
  const armR = armL.clone(); armR.position.x = -.045; armR.rotation.z = .4; man.add(armR);
  const birds = [];
  for (const [x, z, ry] of [[.1, .3, .3], [-.12, .18, -.5]]) {
    const b = grp(x, .09, z); b.rotation.y = ry;
    const bm = plainMat('#1b1c22');
    const body = new THREE.Mesh(_sph, bm); body.scale.set(.034, .032, .06); b.add(body);
    const wing = new THREE.Mesh(_sph, plainMat('#2a2c34')); wing.scale.set(.036, .02, .05); wing.position.set(0, .008, -.01); b.add(wing);
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(.011, .06, 4, 8), bm); neck.position.set(0, .06, .035); neck.rotation.x = -.3; b.add(neck);
    const hd = new THREE.Mesh(_sph, bm); hd.scale.setScalar(.02); hd.position.set(0, .105, .05); b.add(hd);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(.008, .04, 8), plainMat('#e0a040')); beak.rotation.x = Math.PI / 2 + .3; beak.position.set(0, .1, .085); b.add(beak);
    const tl = new THREE.Mesh(_sph, bm); tl.scale.set(.016, .008, .04); tl.position.set(0, .0, -.07); b.add(tl);
    b.traverse(o => o.castShadow = true); rig.add(b); birds.push(b);
  }
  const lp = new THREE.Mesh(new THREE.CapsuleGeometry(.009, .4, 4, 8), dark); lp.position.set(.2, .26, .42); rig.add(lp);
  const lan = new THREE.Mesh(_sph, new THREE.MeshStandardMaterial({ color: '#ffb760', emissive: '#ff8a2a', emissiveIntensity: 1.4 })); lan.scale.set(.042, .052, .042); lan.position.set(.2, .46, .42); rig.add(lan);
  detailTree(g, { scale: 26, bump: 2.2, sheen: .2, fleck: .25 });
  g.userData = { rig, pole, birds, man };
  return g;
}

/* ============================== CLOUDS ============================== */
function makeCloud(seed, scale = 1) {
  const r = rng(seed), list = [];
  const n = 8 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    let g = new THREE.IcosahedronGeometry(1, 3); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
    const P = g.attributes.position;
    const rad = .7 + r() * .8, cx = (i / (n - 1) - .5) * 3.2 + (r() - .5) * .5, cy = (r() - .4) * .35 + Math.sin(i / (n - 1) * Math.PI) * .45, cz = (r() - .5) * 1.1;
    const cols = new Float32Array(P.count * 3);
    for (let k = 0; k < P.count; k++) {
      const m = 1 + (vnoise(P.getX(k) * 2 + i, P.getY(k) * 2 + P.getZ(k)) - .5) * .35;
      const y = P.getY(k) * rad * .72 + cy;
      P.setXYZ(k, P.getX(k) * rad * m + cx, y, P.getZ(k) * rad * m + cz);
      const t = clamp((y + .6) / 1.7, 0, 1);
      cols[k * 3] = lerp(.82, 1, t); cols[k * 3 + 1] = lerp(.87, 1, t); cols[k * 3 + 2] = lerp(.95, 1, t);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals(); list.push(g);
  }
  const mat = STYLE === 'crochet'
    ? yarnify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: .16 }), { scale: 4.2, bump: 2.0, sheen: .35, fleck: .1 })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: .22, envMapIntensity: .4 });
  const m = new THREE.Mesh(mergeGeometries(list), mat);
  m.scale.setScalar(scale); m.castShadow = false; return m;
}

/* ------------------------------------------------------------------
   20_island.js — floating diorama islands
   terrain heightfield = the objective function, strata cut-away walls,
   rocky underside, jade water (PSO island only), karst towers / mesas.
   Realistic PBR materials with procedural surface grain (05_surface.js).
------------------------------------------------------------------- */
const DOM = 4;            // world half-extent of the search domain (u,v in [-1,1] -> +-4)
const HALF = 5;           // island is 10 x 10
const NG = 200;           // terrain grid segments
const BASEY = -2.4;       // bottom of the strata block
const TOPY = 3.4;

const _c = (hex) => new THREE.Color(hex);
const mix3 = (a, b, t, out) => out.copy(a).lerp(b, clamp(t, 0, 1));

/* ---------- heightfield ---------- */
function buildHeightfield(obj, kind) {
  const W = NG + 1, H = new Float32Array(W * W);
  const gnorm = (u, v) => {
    const val = obj.f([clamp(u, -1, 1), clamp(v, -1, 1)]);
    return clamp((val - obj.fmin) / (obj.fmax - obj.fmin), 0, 1);
  };
  const off = kind === 'water' ? 11.3 : 47.9;
  const rim = (x, z) => {
    if (kind === 'water')
      return 1.15 * smooth(1.2, 4.9, -z) + .28 * smooth(3.9, 5, Math.abs(x));
    return .85 * smooth(3.7, 5, Math.max(Math.abs(x), Math.abs(z))) + .75 * smooth(1.2, 4.9, -z);
  };
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const x = -HALF + HALF * 2 * i / NG, z = -HALF + HALF * 2 * j / NG;
    let h = -.75 + 2.3 * Math.pow(gnorm(x / DOM, z / DOM), .62);
    h += rim(x, z) + (fbm(x * .55 + off, z * .55 + off) - .5) * .24;
    H[j * W + i] = h;
  }
  const hf = { W, H, kind };
  hf.sample = (x, z) => {
    const fx = clamp((x + HALF) / (2 * HALF) * NG, 0, NG - 1e-3), fz = clamp((z + HALF) / (2 * HALF) * NG, 0, NG - 1e-3);
    const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
    const h00 = H[j * W + i], h10 = H[j * W + i + 1], h01 = H[(j + 1) * W + i], h11 = H[(j + 1) * W + i + 1];
    return lerp(lerp(h00, h10, a), lerp(h01, h11, a), b);
  };
  // water level: flood the lowest ~24 % of the domain (PSO island)
  const dom = [];
  for (let j = 0; j < W; j += 2) for (let i = 0; i < W; i += 2) {
    const x = -HALF + HALF * 2 * i / NG, z = -HALF + HALF * 2 * j / NG;
    if (Math.abs(x) < DOM && Math.abs(z) < DOM) dom.push(H[j * W + i]);
  }
  dom.sort((a, b) => a - b);
  hf.WL = kind === 'water' ? dom[Math.floor(dom.length * .25)] : -99;
  // little islet for the pavilion
  hf.islet = null;
  if (kind === 'water') {
    const cx = -3.05, cz = 2.55, R = .62;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = -HALF + HALF * 2 * i / NG, z = -HALF + HALF * 2 * j / NG;
      const d = Math.hypot(x - cx, z - cz);
      if (d < R * 1.7) {
        const top = hf.WL + .2 + .06 * (fbm(x * 4, z * 4) - .5);
        const k = 1 - smooth(R * .75, R * 1.7, d);
        H[j * W + i] = Math.max(H[j * W + i], lerp(H[j * W + i], top, k) );
      }
    }
    hf.islet = { x: cx, z: cz, y: hf.WL + .2 };
  }
  // global optimum in world coordinates
  hf.opt = { x: obj.best[0] * DOM, z: obj.best[1] * DOM };
  return hf;
}

/* ---------- terrain mesh ---------- */
function terrainColor(hf, h, nrm, x, z, out) {
  const n = fbm(x * 2.2, z * 2.2), n2 = vnoise(x * 9, z * 9);
  if (hf.kind === 'water') {
    const d = h - hf.WL;
    const silt = _c('#6a6249'), wet = _c('#b5a273'), sand = _c('#d2bf8c'), g1 = _c('#86ab4c'), g2 = _c('#5f8a3a'), rock = _c('#948d7c'), moss = _c('#6f8a45');
    const t = new THREE.Color();
    mix3(silt, wet, smooth(-.7, -.05, d), t);
    mix3(t, sand, smooth(-.02, .1, d), t);
    mix3(t, g1, smooth(.1, .45, d + (n - .5) * .35), t);
    mix3(t, g2, smooth(.5, 1.4, d + (n - .5) * .6), t);
    mix3(t, moss, smooth(1.6, 2.4, d), t);
    mix3(t, rock, smooth(.82, .6, nrm) * .85 + smooth(2.2, 3.2, d) * .6, t);
    t.multiplyScalar(.93 + n2 * .14);
    out.copy(t);
  } else {
    const dust = _c('#efd9a6'), sand = _c('#e0b574'), terra = _c('#c8794a'), red = _c('#a5472f'), rock = _c('#8d4a38');
    const t = new THREE.Color();
    mix3(dust, sand, smooth(-.6, .3, h), t);
    mix3(t, terra, smooth(.2, 1.1, h + (n - .5) * .3), t);
    mix3(t, red, smooth(1.2, 2.4, h), t);
    mix3(t, rock, smooth(.84, .58, nrm) * .8, t);
    t.multiplyScalar((.95 + .06 * Math.sin(h * 24 + n * 3)) * (.94 + n2 * .12));
    out.copy(t);
  }
}

function buildTerrain(hf) {
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, NG, NG); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, W = hf.W;
  for (let k = 0; k < pos.count; k++) {
    const i = k % W, j = Math.floor(k / W);
    pos.setY(k, hf.H[j * W + i]);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    terrainColor(hf, pos.getY(k), nrm.getY(k), pos.getX(k), pos.getZ(k), c);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  // cheap ambient occlusion: valleys darker, ridges a touch lighter
  for (let k = 0; k < pos.count; k++) {
    const i = k % W, j = Math.floor(k / W), q = 4;
    const avg = (hf.H[j * W + clamp(i - q, 0, W - 1)] + hf.H[j * W + clamp(i + q, 0, W - 1)] + hf.H[clamp(j - q, 0, W - 1) * W + i] + hf.H[clamp(j + q, 0, W - 1) * W + i]) / 4;
    const cc = avg - hf.H[k], f = 1 - clamp(cc * 1.7, 0, .34) + clamp(-cc * 1.1, 0, .1);
    col[k * 3] *= f; col[k * 3 + 1] *= f; col[k * 3 + 2] *= f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 });
  const contour = (sh) => {            // soft contour lines make the landscape readable
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHy;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHy = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHy;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float q = vHy * 2.6; float w = fwidth(q);
        float l = 1.0 - smoothstep(0.0, max(w * 1.3, 0.025), abs(fract(q - 0.5) - 0.5));
        diffuseColor.rgb *= 1.0 - 0.1 * l; }`);
  };
  mat.onBeforeCompile = contour;
  detail(mat, { scale: 6, bump: 2.2, sheen: .18, fleck: .3 });
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = true;
  return m;
}

/* ---------- strata cut-away walls ---------- */
const STRATA = {
  water: [[.55, '#4d3b2a'], [.3, '#b98a4e'], [.5, '#ecdcb8'], [.34, '#c9a36d'], [.5, '#a9593c'], [.4, '#e9d8b6'], [.6, '#8f8b84'], [.45, '#6e5039'], [9, '#4a3a30']],
  dry: [[.5, '#b5603b'], [.3, '#e3b47c'], [.5, '#cf7a4a'], [.3, '#f0d6aa'], [.5, '#a64a32'], [.4, '#dca56b'], [.5, '#8f4630'], [.4, '#e8c490'], [9, '#6f3a2b']]
};
function makeStrataTexture(kind, seed) {
  const Wp = 2048, Hp = 1024, cv = document.createElement('canvas'); cv.width = Wp; cv.height = Hp;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(Wp, Hp), d = img.data, r = rng(seed);
  const bands = STRATA[kind].map(([t, c]) => [t, _c(c)]);
  const ANCHOR = .45;
  for (let py = 0; py < Hp; py++) {
    const y = TOPY - py / Hp * (TOPY - BASEY);
    for (let px = 0; px < Wp; px++) {
      const wob = (fbm(px * .0035, py * .012, 3) - .5) * .5 + Math.sin(px * .011 + seed) * .035;
      let depth = ANCHOR - y + wob, idx = 0, edge = 1;
      if (depth > 0) { let acc = 0; for (idx = 0; idx < bands.length; idx++) { if (depth < acc + bands[idx][0]) { edge = depth - acc; break; } acc += bands[idx][0]; } if (idx >= bands.length) idx = bands.length - 1; }
      const c = bands[Math.max(0, Math.min(idx, bands.length - 1))][1];
      const sp = (hash2(px, py) - .5) * .14 + (vnoise(px * .09, py * .09) - .5) * .12;
      let k = 1 + sp; if (edge < .018) k *= .72;      // dark seam between layers
      const o = (py * Wp + px) * 4;
      d[o] = clamp(Math.pow(c.r * k, 1 / 2.2) * 255, 0, 255);
      d[o + 1] = clamp(Math.pow(c.g * k, 1 / 2.2) * 255, 0, 255);
      d[o + 2] = clamp(Math.pow(c.b * k, 1 / 2.2) * 255, 0, 255); d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 1400; i++) {          // pebbles
    const x = r() * Wp, y = r() * Hp, s = 1.5 + r() * 4;
    ctx.fillStyle = r() < .5 ? 'rgba(255,245,225,.22)' : 'rgba(40,25,15,.2)';
    ctx.beginPath(); ctx.ellipse(x, y, s * 1.4, s, 0, 0, TAU); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; return tex;
}

/* which strata layer a wall point belongs to: the same map the wall texture is painted from,
   so the carved relief lines up with the coloured bands */
function strataAt(kind, seed, px, py, y) {
  const bands = STRATA[kind], ANCHOR = .45;
  const wob = (fbm(px * .0035, py * .012, 3) - .5) * .5 + Math.sin(px * .011 + seed) * .035;
  const depth = ANCHOR - y + wob;
  if (depth <= 0) return { idx: 0, edge: 1, thick: 2 };
  let acc = 0;
  for (let i = 0; i < bands.length; i++) { if (depth < acc + bands[i][0]) return { idx: i, edge: depth - acc, thick: bands[i][0] }; acc += bands[i][0]; }
  return { idx: bands.length - 1, edge: 1, thick: 9 };
}
const LAYER_HARD = [.2, -.7, .9, -.35, .75, -.85, .55, -.25, .1];   // hard layers stand out, soft ones erode back

function buildWalls(hf, kind, seed) {
  const S = 160, ROWS = 110, pos = [], uv = [], idx = [], wpos = [], wnor = [], wd = [], widx = [];
  const amp = STYLE === 'crochet' ? .6 : 1;
  const sides = [  // [function(s)->[x,z], outward normal]
    [(s) => [-HALF + 2 * HALF * s, HALF], [0, 0, 1]],
    [(s) => [HALF, HALF - 2 * HALF * s], [1, 0, 0]],
    [(s) => [HALF - 2 * HALF * s, -HALF], [0, 0, -1]],
    [(s) => [-HALF, -HALF + 2 * HALF * s], [-1, 0, 0]]];
  /* carved rock face: each layer sticks out or sinks in, grooves between layers, weathered blocks, fine grit */
  const relief = (si, s, y, top) => {
    const px = (si + s) / 4 * 2048, py = (TOPY - y) / (TOPY - BASEY) * 1024;
    const L = strataAt(kind, seed, px, py, y);
    const layer = LAYER_HARD[L.idx % LAYER_HARD.length] * .075;
    const seam = -.05 * (1 - smooth(0, .045, L.edge)) - .03 * (1 - smooth(0, .045, L.thick - L.edge));
    const erosion = (fbm(px * .011 + seed, py * .028, 4) - .5) * .16;
    const grit = (fbm(px * .07 + 3, py * .18, 2) - .5) * .045;
    const taper = smooth(0, .22, top - y) * smooth(0, .35, y - BASEY) * smooth(0, .012, s) * smooth(0, .012, 1 - s);
    return (layer + seam + erosion + grit + .05) * taper * amp;
  };
  sides.forEach(([fn, n], si) => {
    const base = pos.length / 3, wb = wpos.length / 3;
    for (let k = 0; k <= S; k++) {
      const s = k / S, [x, z] = fn(s), top = hf.sample(x, z), u = (si + s) / 4;
      for (let r = 0; r <= ROWS; r++) {                       // top -> bottom
        const y = lerp(top, BASEY, r / ROWS), d = relief(si, s, y, top);
        pos.push(x + n[0] * d, y, z + n[2] * d);
        uv.push(u, (y - BASEY) / (TOPY - BASEY));
      }
      const yt = Math.max(hf.WL, top);
      wpos.push(x, yt, z, x, top, z); wnor.push(...n, ...n); wd.push(hf.WL - yt, hf.WL - top);
    }
    for (let k = 0; k < S; k++) {
      for (let r = 0; r < ROWS; r++) {
        const a = base + k * (ROWS + 1) + r, b = a + 1, c = a + ROWS + 1, d = c + 1;
        // every side runs counter-clockwise seen from outside, so the same winding faces outward on all four
        idx.push(a, b, c, b, d, c);
      }
      const wa = wb + k * 2, wB = wa + 1, wc = wa + 2, wD = wa + 3;
      widx.push(wa, wB, wc, wB, wD, wc);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const mat = detail(new THREE.MeshStandardMaterial({ map: makeStrataTexture(kind, seed), roughness: 1 }), { scale: 6.5, bump: 2.0, sheen: .15, fleck: .2 });
  const walls = new THREE.Mesh(g, mat); walls.receiveShadow = true; walls.castShadow = true;   // ledges shade the layers below
  let water = null;
  if (kind === 'water') {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(wnor, 3));
    wg.setAttribute('aD', new THREE.Float32BufferAttribute(wd, 1)); wg.setIndex(widx);
    water = new THREE.Mesh(wg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'attribute float aD; varying float vD; void main(){ vD=aD; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying float vD; void main(){
        float k = 1.0 - exp(-max(vD,0.0)*1.5);
        vec3 col = mix(vec3(.50,.88,.78), vec3(.07,.46,.42), k);
        col = mix(col, vec3(.85,1.,.95), (1.0-smoothstep(0.0,.05,vD))*.5);
        gl_FragColor = vec4(col, mix(.38,.9,k)); }`
    }));
    water.renderOrder = 1;
  }
  return { walls, water };
}

/* ---------- rocky underside ---------- */
function buildUnderside(kind, seed) {
  const R = 36, M = 200, depth = 5.4, ring = [], cols = [], idx = [];
  const pts = [], c = new THREE.Color();
  const palW = ['#6e5039', '#8a6a4c', '#5b4636', '#9b8466'], palD = ['#7a3f2e', '#a35a3b', '#6b3428', '#b97a4e'];
  const pal = (kind === 'water' ? palW : palD).map(_c);
  for (let j = 0; j <= R; j++) {
    const t = j / R;
    for (let i = 0; i < M; i++) {
      const a = i / M * 4, side = Math.floor(a) % 4, f = a - Math.floor(a);
      let sq = [0, 0];
      if (side === 0) sq = [-1 + 2 * f, 1]; else if (side === 1) sq = [1, 1 - 2 * f]; else if (side === 2) sq = [1 - 2 * f, -1]; else sq = [-1, -1 + 2 * f];
      const ang = i / M * TAU, el = [Math.cos(ang) * .86, Math.sin(ang) * .86];
      const m = smooth(0, .35, t);
      let px = lerp(sq[0], el[0], m), pz = lerp(sq[1], el[1], m);
      const nz = fbm(px * 2.4 + seed, pz * 2.4 + t * 3, 4);
      const s = Math.pow(1 - Math.pow(t, 1.55), .8) * (1 + (nz - .5) * .45 * Math.sin(Math.min(1, t * 1.4) * Math.PI));
      const stal = Math.pow(fbm(px * 3.1 - seed, pz * 3.1, 3), 2.2) * 1.5 * t * (1 - t);
      const y = BASEY - depth * Math.pow(t, 1.05) * (1 + (nz - .5) * .3) - stal;
      pts.push(px * HALF * s, y, pz * HALF * s);
      const k = fbm(px * 3 + seed, y * 1.6, 3), band = .5 + .5 * Math.sin(y * 9 + nz * 5);
      c.copy(pal[Math.floor(k * 3.99)]).lerp(pal[(Math.floor(k * 3.99) + 1) % 4], band * .45).multiplyScalar(.78 + .3 * (1 - t * .6));
      cols.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < M; i++) {
    const a = j * M + i, b = j * M + (i + 1) % M, d = (j + 1) * M + i, e = (j + 1) * M + (i + 1) % M;
    idx.push(a, b, d, b, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, detail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { scale: 8, bump: 2.2, sheen: .15, fleck: .3 }));
  m.castShadow = true; return m;
}

/* ---------- water surface ---------- */
function buildWater(hf) {
  const W = 128, data = new Uint8Array(W * W);
  let hmin = 1e9, hmax = -1e9;
  for (const h of hf.H) { hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const h = hf.sample(-HALF + 2 * HALF * i / (W - 1), -HALF + 2 * HALF * j / (W - 1));
    data[j * W + i] = Math.round(clamp((h - hmin) / (hmax - hmin), 0, 1) * 255);
  }
  const tex = new THREE.DataTexture(data, W, W, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uH: { value: tex }, uT: { value: 0 }, uWL: { value: hf.WL }, uHmin: { value: hmin }, uHr: { value: hmax - hmin }, uSun: { value: new THREE.Vector3(-.5, .75, .55).normalize() } },
    vertexShader: `varying vec3 vW; varying vec2 vUv;
      void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; vUv = position.xz/10.+.5; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D uH; uniform float uT,uWL,uHmin,uHr; uniform vec3 uSun; varying vec3 vW; varying vec2 vUv;
      void main(){
        float hh = texture2D(uH,vUv).r*uHr+uHmin; float depth = uWL-hh;
        if(depth < -0.03) discard;
        vec2 p = vW.xz; float t = uT;
        vec2 g = vec2(cos(p.x*1.7+p.y*.9+t*.9), cos(p.x*.8-p.y*1.5-t*.7))*.03
               + vec2(cos(p.x*3.9-p.y*2.1+t*1.5), cos(p.x*2.7+p.y*3.8+t*1.2))*.016;
        vec3 N = normalize(vec3(-g.x,1.,-g.y)); vec3 V = normalize(cameraPosition - vW);
        float fr = .03 + .97*pow(1.-max(dot(N,V),0.),4.);
        float k = 1. - exp(-max(depth,0.)*1.5);
        vec3 col = mix(vec3(.55,.88,.78), vec3(.07,.44,.40), k);
        vec3 R = reflect(-V,N); vec3 sky = mix(vec3(.82,.91,.96), vec3(.48,.70,.92), clamp(R.y,0.,1.));
        col = mix(col, sky, fr*.7);
        col += pow(max(dot(R,normalize(uSun)),0.),140.)*vec3(1.,.95,.85)*.45;
        float c = smoothstep(.6,1., sin(p.x*9.+t)*sin(p.y*8.-t*1.3)*sin(p.x*5.-p.y*6.+t*.7)); col += c*.07*(1.-k);
        float edge = 1. - smoothstep(0., .07+.03*sin(p.x*7.+t*1.2+p.y*5.), depth);
        float glint = smoothstep(.93, .995, sin(p.x*3.+sin(p.y*2.+t*.3)*1.2+p.y*1.5+t*.2)); col = mix(col, vec3(.92,1.,.96), glint*.1*(1.-k*.5));
        col = mix(col, vec3(1.), edge*.7);
        float a = max(mix(.40,.92,k), edge*.9) * smoothstep(-.03,.012,depth);
        gl_FragColor = vec4(col,a); }`
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2).rotateX(-Math.PI / 2), mat);
  m.position.y = hf.WL; m.renderOrder = 2; return m;
}

/* ---------- karst towers, mesas, hoodoos ---------- */
function buildTower({ type, R, H, seed, base, pal }) {
  /* carved rock, not a painted lathe: an irregular outline (lumpy, non-circular cross-sections, staggered layers of
     random thickness, uneven tilted top) plus grooves and ledges; colour follows the carving (crevices darker) */
  const SIDE = 110, SEG = 104, CAP = type === 'karst' ? 0 : 14, span = H - base;
  const [stoneA, stoneB, stain, moss] = pal.map(_c);
  const lean = [(hash2(seed, 1) - .5) * .26, (hash2(seed, 2) - .5) * .26];
  const n3 = (x, y, z) => noise3(x, y, z) * .5 + noise3(x * 2.13 + 5, y * 2.13, z * 2.13) * .3 + noise3(x * 4.7, y * 4.7 + 3, z * 4.7) * .2;
  // sandstone layers of random thickness, each nudged sideways a little (staggered, eroded stack)
  const bounds = [base - 1]; while (bounds[bounds.length - 1] < H + 1) bounds.push(bounds[bounds.length - 1] + .1 + hash2(bounds.length, seed + 5) * .32);
  const layerAt = (y) => { let i = 1; while (i < bounds.length - 1 && bounds[i] <= y) i++; const lo = bounds[i - 1], hi = bounds[i]; return { i, f: (y - lo) / (hi - lo), th: hi - lo }; };
  const layerOff = (i) => (hash2(i, seed * 3 + 11) - .45) * .24;                     // hard layers jut out, soft ones erode back
  const shift = (i) => [(hash2(i, seed + 21) - .5) * .14 * R, (hash2(i, seed + 33) - .5) * .14 * R];
  const profile = (sy) => {
    if (type === 'karst') return R * Math.pow(Math.max(0, 1 - Math.pow(sy, 2.3)), .62) * (1 + .22 * Math.pow(1 - sy, 6)) + .02;
    if (type === 'mesa') return R * (1 - .16 * Math.pow(sy, 3));
    return R * (.56 + .34 * Math.pow(1 - sy, 1.4) + .52 * smooth(.76, .86, sy));      // hoodoo: thin column under a wide caprock
  };
  // big lumps around the outline: no two directions have the same radius
  const lobes = (a, y) => 1 + (n3(Math.cos(a) * 1.1 + seed, y * .3, Math.sin(a) * 1.1) - .5) * .75 + (n3(Math.cos(a) * 2.6 - seed, y * .9, Math.sin(a) * 2.6) - .5) * .3;
  const tilt = [(hash2(seed, 7) - .5) * .5, (hash2(seed, 8) - .5) * .5];             // the top is not level
  const pts = [], D = [], LY = [], idx = [];
  const lastR = new Float32Array(SEG), lastC = [0, 0];
  for (let j = 0; j <= SIDE; j++) {
    const sy = j / SIDE, y = base + span * sy, prof = profile(sy);
    let lx = lean[0] * sy * sy * H, lz = lean[1] * sy * sy * H;
    let L = null;
    if (type !== 'karst') { L = layerAt(y); const s0 = shift(L.i), s1 = shift(L.i + 1), k = smooth(.8, 1, L.f); lx += lerp(s0[0], s1[0], k); lz += lerp(s0[1], s1[1], k); }
    if (j === SIDE) { lastC[0] = lx; lastC[1] = lz; }
    for (let i = 0; i < SEG; i++) {
      const a = i / SEG * TAU, cx = Math.cos(a), sz = Math.sin(a);
      let d, ly = 0;
      if (type === 'karst') {
        const flute = -Math.pow(Math.abs(Math.sin(a * 7 + n3(cx * 1.5, y * .5, sz * 1.5) * 3 + seed)), .45) * .1;   // vertical karren grooves
        const Lk = y * 2.6 + n3(cx * 2, y, sz * 2) * .9 + seed, f = Lk - Math.floor(Lk);
        const ledge = (smooth(0, .14, f) - .55) * .12;                                                        // undercut bedding ledges
        const block = (n3(cx * 1.8 + seed, y * 1.3, sz * 1.8) - .5) * .4 + (n3(cx * 6, y * 5, sz * 6) - .5) * .12;
        d = flute + ledge + block; ly = f;
      } else {
        const o = lerp(layerOff(L.i), layerOff(L.i + 1), smooth(.82, 1, L.f));
        const groove = -.07 * (1 - smooth(0, .06 / L.th, L.f));
        const block = (n3(cx * 2.2 + seed, y * 1.6, sz * 2.2) - .5) * .3 + (n3(cx * 7, y * 6, sz * 7) - .5) * .1;
        const cap = type === 'hoodoo' ? smooth(.8, .86, sy) * .08 : 0;
        d = o + groove + block + cap; ly = L.i;
      }
      const r = Math.max(.012, prof * lobes(a, y) * (1 + d));
      if (j === SIDE) lastR[i] = r;
      pts.push(cx * r + lx, y, sz * r + lz); D.push(d); LY.push(ly);
    }
  }
  // rough, tilted rock top instead of a flat disc
  for (let k = 1; k <= CAP; k++) {
    const t = k / CAP;
    for (let i = 0; i < SEG; i++) {
      const a = i / SEG * TAU, cx = Math.cos(a), sz = Math.sin(a), r = lastR[i] * (1 - Math.pow(t, 1.3));
      const px = cx * r + lastC[0], pz = sz * r + lastC[1];
      const bump = (n3(px * 3 + seed, H * 2, pz * 3) - .5) * .22 * R;
      const y = H + R * .1 * (1 - (1 - t) * (1 - t)) + bump * t + (cx * tilt[0] + sz * tilt[1]) * r * (1 - t) * .5;
      pts.push(px, y, pz); D.push(bump / R); LY.push(-1);
    }
  }
  const ROWS = SIDE + CAP;
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < SEG; i++) {
    const a = j * SEG + i, b = (j + 1) * SEG + i, cc = (j + 1) * SEG + (i + 1) % SEG, d = j * SEG + (i + 1) % SEG;
    idx.push(a, cc, b, a, d, cc);               // outward winding
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setIndex(idx); g.computeVertexNormals();
  const nrm = g.attributes.normal, P = g.attributes.position, cols = [], c = new THREE.Color();
  const dust = stoneA.clone().lerp(_c('#f0d3a0'), .45);
  for (let k = 0; k < P.count; k++) {
    const x = P.getX(k), y = P.getY(k), z = P.getZ(k), ny = nrm.getY(k), d = D[k], n = n3(x * 2 + seed, y * 1.5, z * 2);
    const ao = .6 + .4 * smooth(-.2, .08, d);                                          // carved-in = darker
    if (type === 'karst') {
      c.copy(stoneA).lerp(stoneB, smooth(.3, .7, n));
      c.lerp(stain, smooth(.5, .8, vnoise(Math.atan2(z, x) * 6 + seed, y * .35)) * smooth(-.02, -.09, d) * .7);   // water streaks in the grooves
      c.lerp(moss, smooth(.42, .8, ny + (n - .5) * .6) * .9);                           // plants on ledges and the summit
    } else {
      const li = LY[k];
      if (li < 0) c.copy(dust).lerp(stoneA, n * .4);                                    // dusty top
      else c.copy(stoneA).lerp(stoneB, hash2(li, seed + 7) * .55 + (n - .5) * .3).lerp(moss, hash2(li, seed + 9) > .8 ? .3 : 0);   // close tones, a few pale bands
      c.lerp(stain, smooth(.55, .85, vnoise(Math.atan2(z, x) * 5 + seed, y * .5)) * .3);  // desert varnish streaks
      c.lerp(dust, smooth(.6, .9, ny) * .5);
    }
    c.multiplyScalar(ao * (.92 + n * .16));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, detail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }), { scale: 9, bump: 2.2, sheen: .16, fleck: .3 }));
  m.castShadow = true; m.receiveShadow = true; return m;
}

const TOWER_SLOTS = [   // x, z, radius, height  (rim band behind and beside the search domain)
  [-4.15, -4.15, .72, 3.7], [-2.5, -4.55, .5, 2.6], [-.4, -4.45, .62, 3.2], [1.7, -4.5, .5, 2.4], [3.55, -4.25, .66, 3.4],
  [4.45, -2.5, .5, 2.2], [-4.5, -2.2, .48, 2.1], [4.5, -.4, .38, 1.5], [-4.55, -.2, .36, 1.4], [4.5, 2.2, .3, 1.1]
];

function addScatter(group, hf, kind, seed) {
  const r = rng(seed);
  if (kind === 'water') {                           // grass tufts on the banks
    const g = new THREE.ConeGeometry(.022, .085, 5); g.translate(0, .042, 0);
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: '#7fa83f', roughness: 1 }), 360), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let n = 0;
    for (let t = 0; t < 4000 && n < 360; t++) {
      const x = (r() * 2 - 1) * 4.8, z = (r() * 2 - 1) * 4.8, y = hf.sample(x, z);
      if (y < hf.WL + .18 || y > hf.WL + 2.2) continue;
      e.set((r() - .5) * .4, r() * TAU, (r() - .5) * .4); q.setFromEuler(e);
      const s = .6 + r() * .8; m.compose(new THREE.Vector3(x, y - .01, z), q, new THREE.Vector3(s, s, s)); mesh.setMatrixAt(n++, m);
    }
    mesh.count = n; mesh.receiveShadow = true; detailTree(mesh, { scale: 50, bump: 2 }); group.add(mesh);
    // small wild flowers
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(.034, 10, 8), detail(new THREE.MeshStandardMaterial({ roughness: 1 }), { scale: 60, bump: 2 }), 150);
    const fc = ['#f4a3b8', '#fff3d6', '#f6d04a', '#c9a3e8'], mm = new THREE.Matrix4(); let fn = 0;
    for (let t = 0; t < 3000 && fn < 150; t++) {
      const x = (r() * 2 - 1) * 4.6, z = (r() * 2 - 1) * 4.6, y = hf.sample(x, z);
      if (y < hf.WL + .25 || y > hf.WL + 1.8) continue;
      mm.compose(new THREE.Vector3(x, y + .06, z), new THREE.Quaternion(), new THREE.Vector3(1, .7, 1)); fl.setMatrixAt(fn, mm); fl.setColorAt(fn, _c(fc[Math.floor(r() * 4)])); fn++;
    }
    fl.count = fn; group.add(fl);
  }
  // pebbles + boulders
  const geo = new THREE.IcosahedronGeometry(1, 1), P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) { const k = 1 + (vnoise(P.getX(i) * 3, P.getZ(i) * 3 + P.getY(i)) - .5) * .5; P.setXYZ(i, P.getX(i) * k, P.getY(i) * k * .75, P.getZ(i) * k); }
  geo.computeVertexNormals();
  const col = kind === 'water' ? ['#a39a86', '#8a8372', '#b3a890'] : ['#b5703f', '#9a5a3a', '#d09a62'];
  const count = kind === 'water' ? 70 : 170;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: .9 }), count), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let n = 0;
  for (let t = 0; t < 3000 && n < count; t++) {
    const x = (r() * 2 - 1) * 4.8, z = (r() * 2 - 1) * 4.8;
    if (hf.islet && Math.hypot(x - hf.islet.x, z - hf.islet.z) < .85) continue;
    const y = hf.sample(x, z); if (y < hf.WL + .05) continue;
    const big = r() < .12, s = big ? .16 + r() * .2 : .035 + r() * .07;
    e.set(r() * 3, r() * 6, r() * 3); q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y + s * .25, z), q, new THREE.Vector3(s, s, s)); mesh.setMatrixAt(n, m);
    mesh.setColorAt(n, _c(col[Math.floor(r() * 3)]).multiplyScalar(.85 + r() * .3)); n++;
  }
  mesh.count = n; mesh.castShadow = true; mesh.receiveShadow = true; detailTree(mesh, { scale: 24, bump: 2.2 }); group.add(mesh);
}

/* ---------- pavilion on the islet ---------- */
function buildPavilion() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#b8b3a6', roughness: .85 });
  const red = new THREE.MeshStandardMaterial({ color: '#b3342a', roughness: .55 });
  const gold = new THREE.MeshStandardMaterial({ color: '#e0b04a', roughness: .35, metalness: .5 });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(.62, .1, .62), stone); plinth.position.y = .05; g.add(plinth);
  const step = new THREE.Mesh(new THREE.BoxGeometry(.7, .04, .7), stone); step.position.y = .02; g.add(step);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(.027, .03, .4, 10), red); col.position.set(sx * .23, .3, sz * .23); col.castShadow = true; g.add(col);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(.58, .045, .58), red); beam.position.y = .52; g.add(beam);
  // hip roof with concave profile and lifted eaves
  const K = 9, S = 12, pts = [], idx = [], cols = [], a = .4, Hr = .3, base = .54;
  const tile = [_c('#3b4a52'), _c('#46575f')];
  for (let k = 0; k <= K; k++) {
    const t = k / K, size = a * (1 - t * .97);
    for (let side = 0; side < 4; side++) for (let s = 0; s < S; s++) {
      const f = s / S; let x, z;
      if (side === 0) { x = -size + 2 * size * f; z = size; } else if (side === 1) { x = size; z = size - 2 * size * f; }
      else if (side === 2) { x = size - 2 * size * f; z = -size; } else { x = -size; z = -size + 2 * size * f; }
      const cf = Math.pow(Math.abs(x * z) / (size * size + 1e-6), 3);
      const y = base + Hr * Math.pow(t, 1.55) + .16 * Math.pow(1 - t, 2.2) * cf + .02 * (1 - t);
      pts.push(x, y, z); const cc = tile[(s + k) % 2]; cols.push(cc.r, cc.g, cc.b);
    }
  }
  const per = 4 * S;
  for (let k = 0; k < K; k++) for (let i = 0; i < per; i++) {
    const A = k * per + i, B = (k + 1) * per + i, C = (k + 1) * per + (i + 1) % per, D = k * per + (i + 1) % per;
    idx.push(A, C, B, A, D, C);
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  rg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); rg.setIndex(idx); rg.computeVertexNormals();
  const roof = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, side: THREE.DoubleSide })); roof.castShadow = true; g.add(roof);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(.03, 10, 8), gold); fin.position.y = base + Hr + .03; g.add(fin);
  const lan = new THREE.Mesh(new THREE.SphereGeometry(.04, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffb256', emissive: '#ff9a2e', emissiveIntensity: 1.2 }));
  lan.position.y = .42; g.add(lan);
  detailTree(g, { scale: 26, bump: 2.2, sheen: .2 });
  return g;
}

/* ---------- assemble one island ---------- */
function buildIsland(obj, kind, seed) {
  const group = new THREE.Group(), hf = buildHeightfield(obj, kind);
  const terrain = buildTerrain(hf); group.add(terrain);
  const { walls, water: sideWater } = buildWalls(hf, kind, seed); group.add(walls); if (sideWater) group.add(sideWater);
  group.add(buildUnderside(kind, seed));
  // sewn stitches along the top edge of the cut-away (crochet version only)
  if (STYLE === 'crochet') { const geo = new THREE.CapsuleGeometry(.013, .075, 3, 6).rotateZ(Math.PI / 2), N = 4 * 44;
    const st = new THREE.InstancedMesh(geo, detail(new THREE.MeshStandardMaterial({ color: '#f4ead2', roughness: 1 }), { scale: 70, bump: 2 }), N), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(); let n = 0;
    for (let side = 0; side < 4; side++) for (let k = 0; k < 44; k++) {
      const s = (k + .5) / 44, a = [[-HALF + 2 * HALF * s, HALF, 0, 1], [HALF, HALF - 2 * HALF * s, 1, 0], [HALF - 2 * HALF * s, -HALF, 0, -1], [-HALF, -HALF + 2 * HALF * s, -1, 0]][side];
      const x = side % 2 ? a[0] : a[0], z = a[1], y = hf.sample(x, z) - .14;
      qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side % 2 ? Math.PI / 2 : 0);
      m4.compose(new THREE.Vector3(x + a[2] * .012, y, z + a[3] * .012), qq, new THREE.Vector3(1, 1, 1)); st.setMatrixAt(n++, m4);
    }
    st.castShadow = false; group.add(st); }
  let water = null;
  if (kind === 'water') { water = buildWater(hf); group.add(water); }
  addScatter(group, hf, kind, seed + 5);
  const pal = kind === 'water' ? ['#d9d3c0', '#b9b29c', '#8a7a5c', '#6f9b45'] : ['#d9915a', '#bf6c44', '#8a3f2a', '#c9a057'];
  const types = kind === 'water' ? ['karst'] : ['mesa', 'hoodoo', 'mesa', 'hoodoo'];
  TOWER_SLOTS.forEach(([x, z, R, H], i) => {
    if (kind === 'dry') { const mirror = (i % 3 === 0) ? 1 : 0; R *= mirror ? 1.15 : .8; }
    const y = hf.sample(x, z);
    const t = buildTower({ type: types[i % types.length], R, H: H + y * .3, seed: seed + i * 7, base: y - .6, pal });
    t.position.set(x, 0, z); group.add(t);
  });
  let pavilion = null;
  if (kind === 'water') { pavilion = buildPavilion(); pavilion.position.set(hf.islet.x, hf.islet.y, hf.islet.z); pavilion.scale.setScalar(1.05); group.add(pavilion); }
  return { group, hf, water, kind };
}

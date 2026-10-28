/* ------------------------------------------------------------------
   10_algorithms.js — the REAL PSO and GWO update rules (pure, no THREE)
   Search space is the square [-1,1]^2, so the island top maps 1:1.
   Every animal movement on screen comes from these two classes.
------------------------------------------------------------------- */
const FUNCS = {
  ackley: {
    name: 'Ackley', R: 4.2, shift: [.3, -.24],
    f: (x, y) => -20 * Math.exp(-.2 * Math.sqrt((x * x + y * y) / 2)) - Math.exp((Math.cos(TAU * x) + Math.cos(TAU * y)) / 2) + 20 + Math.E
  },
  sphere: { name: 'Sphere', R: 3, shift: [-.25, .3], f: (x, y) => x * x + y * y },
  rastrigin: {
    name: 'Rastrigin', R: 2.4, shift: [.28, .2],
    f: (x, y) => 20 + x * x - 10 * Math.cos(TAU * x) + y * y - 10 * Math.cos(TAU * y)
  },
  himmelblau: { name: 'Himmelblau', R: 5, shift: [0, 0], f: (x, y) => (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2 }
};

/** Objective on the normalised square: returns raw f value. */
function makeObjective(key) {
  const F = FUNCS[key];
  const f = (p) => F.f((p[0] - F.shift[0]) * F.R, (p[1] - F.shift[1]) * F.R);
  let fmin = Infinity, fmax = -Infinity, best = [0, 0];
  const M = 161;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const p = [-1 + 2 * i / (M - 1), -1 + 2 * j / (M - 1)], v = f(p);
    if (v < fmin) { fmin = v; best = p; }
    if (v > fmax) fmax = v;
  }
  return { key, name: F.name, f, fmin, fmax, best };
}

class PSO {
  constructor(obj, N, seed, T) {
    this.obj = obj; this.N = N; this.T = T; this.seed = seed;
    this.c1 = 1.6; this.c2 = 1.6; this.vmax = .32;
    this.reset();
  }
  get w() { return 0.9 - 0.5 * Math.min(1, this.iter / this.T); }    // inertia decays 0.9 -> 0.4
  reset() {
    const r = rng(this.seed);
    this.iter = 0;
    this.x = []; this.v = [];
    for (let i = 0; i < this.N; i++) this.x.push([r() * 2 - 1, r() * 2 - 1]);
    for (let i = 0; i < this.N; i++) this.v.push([(r() - .5) * .16, (r() - .5) * .16]);
    this.rand = rng(this.seed * 7 + 13);
    this.F = this.x.map(this.obj.f);
    this.pb = this.x.map(p => p.slice()); this.pbF = this.F.slice();
    this.gb = [0, 0]; this.gbF = Infinity; this.gbIdx = 0;
    this.bestHistory = []; this.nxt = null; this.nv = null; this.comps = null;
  }
  /** phase 1: evaluate fitness, update personal and global bests */
  evaluate() {
    for (let i = 0; i < this.N; i++) {
      this.F[i] = this.obj.f(this.x[i]);
      if (this.F[i] < this.pbF[i]) { this.pbF[i] = this.F[i]; this.pb[i] = this.x[i].slice(); }
      if (this.pbF[i] < this.gbF) { this.gbF = this.pbF[i]; this.gb = this.pb[i].slice(); }
    }
    let k = 0; for (let i = 1; i < this.N; i++) if (this.F[i] < this.F[k]) k = i;
    this.gbIdx = k;                                  // eagle currently closest to the best known spot
    this.bestHistory.push(this.gbF);
  }
  /** phase 2: v' = w v + c1 r1 (pbest - x) + c2 r2 (gbest - x);  x' = x + v' */
  plan() {
    const w = this.w; this.nxt = []; this.nv = []; this.comps = [];
    for (let i = 0; i < this.N; i++) {
      const inert = [0, 0], cog = [0, 0], soc = [0, 0], nv = [0, 0], nx = [0, 0];
      for (let d = 0; d < 2; d++) {
        const r1 = this.rand(), r2 = this.rand();
        inert[d] = w * this.v[i][d];
        cog[d] = this.c1 * r1 * (this.pb[i][d] - this.x[i][d]);
        soc[d] = this.c2 * r2 * (this.gb[d] - this.x[i][d]);
        nv[d] = clamp(inert[d] + cog[d] + soc[d], -this.vmax, this.vmax);
        nx[d] = this.x[i][d] + nv[d];
        if (nx[d] > 1) { nx[d] = 1; nv[d] *= -.3; } else if (nx[d] < -1) { nx[d] = -1; nv[d] *= -.3; }
      }
      this.nxt.push(nx); this.nv.push(nv); this.comps.push({ inert, cog, soc, nv });
    }
  }
  commit() { this.x = this.nxt; this.v = this.nv; this.iter++; }
  get best() { return this.gbF; }
}

class GWO {
  constructor(obj, N, seed, T) { this.obj = obj; this.N = N; this.T = T; this.seed = seed; this.reset(); }
  get a() { return 2 * (1 - Math.min(1, this.iter / this.T)); }       // a decays 2 -> 0
  reset() {
    const r = rng(this.seed);                         // same start positions as PSO = fair comparison
    this.iter = 0; this.x = [];
    for (let i = 0; i < this.N; i++) this.x.push([r() * 2 - 1, r() * 2 - 1]);
    this.rand = rng(this.seed * 11 + 5);
    this.F = this.x.map(this.obj.f);
    this.lead = [0, 1, 2]; this.bestF = Infinity; this.bestHistory = []; this.nxt = null; this.comps = null;
  }
  /** phase 1: rank the pack, the three best wolves become alpha, beta, delta */
  evaluate() {
    for (let i = 0; i < this.N; i++) this.F[i] = this.obj.f(this.x[i]);
    const order = [...Array(this.N).keys()].sort((p, q) => this.F[p] - this.F[q]);
    this.lead = order.slice(0, 3);
    this.leadPos = this.lead.map(i => this.x[i].slice());
    this.bestF = Math.min(this.bestF, this.F[order[0]]);
    this.bestHistory.push(this.bestF);
  }
  /** phase 2: X_k = Xleader - A*|C*Xleader - X|,  X(t+1) = (X1+X2+X3)/3 */
  plan() {
    const a = this.a; this.nxt = []; this.comps = [];
    for (let i = 0; i < this.N; i++) {
      const X = [[0, 0], [0, 0], [0, 0]], A = [], C = [], nx = [0, 0];
      for (let k = 0; k < 3; k++) {
        const L = this.leadPos[k]; A.push([0, 0]); C.push([0, 0]);
        for (let d = 0; d < 2; d++) {
          const r1 = this.rand(), r2 = this.rand();
          A[k][d] = 2 * a * r1 - a; C[k][d] = 2 * r2;
          const D = Math.abs(C[k][d] * L[d] - this.x[i][d]);
          X[k][d] = L[d] - A[k][d] * D;
        }
      }
      for (let d = 0; d < 2; d++) nx[d] = clamp((X[0][d] + X[1][d] + X[2][d]) / 3, -1, 1);
      this.nxt.push(nx); this.comps.push({ X, A, C });
    }
  }
  commit() { this.x = this.nxt; this.iter++; }
  get best() { return this.bestF; }
}

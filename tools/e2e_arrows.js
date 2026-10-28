/* Checks that every drawn arrow, guess dot and ring equals the PSO / GWO formulas (run by tools/e2e_test.py at the end of a Decide step). Returns a list of mismatches. */
(() => {
  const A = __app, W = A.W, DOM = 4, errs = [], close = (a, b, tol = 2e-3) => Math.abs(a - b) < tol;
  // ---------- PSO: formula terms, real step, every eagle's arrow ----------
  { const s = W.swPSO, al = s.algo, f = s.focus, c = al.comps[f], x = al.x[f], d = s.debug;
    for (let k = 0; k < 2; k++) {
      if (!close(c.inert[k], al.w * al.v[f][k], 1e-9)) errs.push('pso inertia != w*v');
      const rc = (al.pb[f][k] - x[k]) ? c.cog[k] / (al.c1 * (al.pb[f][k] - x[k])) : 0; if (rc < -1e-9 || rc > 1 + 1e-9) errs.push('pso cognitive r1 out of [0,1]');
      const rs = (al.gb[k] - x[k]) ? c.soc[k] / (al.c2 * (al.gb[k] - x[k])) : 0; if (rs < -1e-9 || rs > 1 + 1e-9) errs.push('pso social r2 out of [0,1]');
      const v = Math.max(-al.vmax, Math.min(al.vmax, c.inert[k] + c.cog[k] + c.soc[k])); let nx = x[k] + v; nx = Math.max(-1, Math.min(1, nx));
      if (!close(nx, al.nxt[f][k], 1e-9)) errs.push('pso next position != x + clamp(v)');
    }
    // drawn: white arrow from the eagle to its real next spot; chain = raw sum
    if (!close(d.from.x, x[0] * DOM) || !close(d.from.z, x[1] * DOM)) errs.push('pso white arrow does not start at the eagle');
    if (!close(d.to.x, al.nxt[f][0] * DOM) || !close(d.to.z, al.nxt[f][1] * DOM)) errs.push('pso white arrow does not end at the real next spot');
    const ch = d.chainTo.clone().sub(d.chainFrom);
    if (!close(ch.x, (c.inert[0] + c.cog[0] + c.soc[0]) * DOM) || !close(ch.z, (c.inert[1] + c.cog[1] + c.soc[1]) * DOM)) errs.push('pso chain != w·v + c1r1(pbest−x) + c2r2(gbest−x)');
  }
  // other animals' thin arrows end where they really go
  for (const s of W.swarms) {
    const al = s.algo, ends = [];
    for (const ar of s.arrows) if (ar.g.visible && ar.shaft.renderOrder === 20) {
      const len = ar.shaft.scale.y + ar.head.scale.y, e = new A.THREE.Vector3(0, len, 0).applyQuaternion(ar.g.quaternion).add(ar.g.position); ends.push(e);
    }
    for (let i = 0; i < s.N; i++) { if (i === s.focus) continue;
      const tx = al.nxt[i][0] * DOM, tz = al.nxt[i][1] * DOM;
      if (Math.hypot(al.nxt[i][0] - al.x[i][0], al.nxt[i][1] - al.x[i][1]) * DOM < .05) continue;   // too small to draw an arrow at all
      if (!ends.some(e => Math.hypot(e.x - tx, e.z - tz) < .02)) errs.push(`${s.kind} ${i}: arrow does not end at its next position`);
    }
  }
  // ---------- GWO: guesses, average, drawn dots and ring ----------
  { const s = W.swGWO, al = s.algo, f = s.focus, c = al.comps[f], d = s.debug, x = al.x[f], EDGE = 5 / 4 - .02;
    for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) {
      const L = al.leadPos[k][j], g = L - c.A[k][j] * Math.abs(c.C[k][j] * L - x[j]);
      if (!close(g, c.X[k][j], 1e-9)) errs.push('gwo guess != X_leader − A·|C·X_leader − X|');
      if (Math.abs(c.A[k][j]) > al.a + 1e-9 || c.C[k][j] < 0 || c.C[k][j] > 2) errs.push('gwo A or C out of range');
      const mark = s.xMarks[k].position; const want = Math.max(-EDGE, Math.min(EDGE, c.X[k][j])) * DOM;
      if (!close(j ? mark.z : mark.x, want)) errs.push('gwo guess dot not drawn at the guess');
    }
    for (let j = 0; j < 2; j++) {
      const m = (c.X[0][j] + c.X[1][j] + c.X[2][j]) / 3;
      if (!close(Math.max(-1, Math.min(1, m)), al.nxt[f][j], 1e-9)) errs.push('gwo next != (X1+X2+X3)/3');
      if (!close(j ? s.xNew.position.z : s.xNew.position.x, al.nxt[f][j] * DOM)) errs.push('gwo white ring not at the next position');
    }
    for (let k = 0; k < 3; k++) if (s.arrows[k].g.visible) {   // guide arrows point at the leaders
      const ar = s.arrows[k], len = ar.shaft.scale.y + ar.head.scale.y, e = new A.THREE.Vector3(0, len, 0).applyQuaternion(ar.g.quaternion).add(ar.g.position);
      if (Math.hypot(e.x - al.leadPos[k][0] * DOM, e.z - al.leadPos[k][1] * DOM) > .02) errs.push('gwo guide arrow does not reach its leader');
    }
  }
  return errs;
})()

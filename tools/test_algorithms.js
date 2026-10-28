/* Headless check that the real PSO and GWO (src/js/10_algorithms.js) converge on every landscape.
   Run: node tools/test_algorithms.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = ['00_util.js', '10_algorithms.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8')).join('\n');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src + '\nthis.out = { FUNCS, makeObjective, PSO, GWO };', ctx);
const { FUNCS, makeObjective, PSO, GWO } = ctx.out;
const N = 12, T = 60, seeds = [7, 11, 23, 42, 99];
let fail = 0;
for (const key of Object.keys(FUNCS)) {
  const obj = makeObjective(key), span = obj.fmax - obj.fmin, row = [];
  for (const [name, Algo] of [['PSO', PSO], ['GWO', GWO]]) {
    const errs = seeds.map(seed => {
      const a = new Algo(obj, N, seed, T); a.evaluate();
      const start = a.best - obj.fmin;
      for (let t = 0; t < T; t++) { a.plan(); a.commit(); a.evaluate(); }
      const end = a.best - obj.fmin;
      if (!(end <= start)) fail++;                       // best-so-far never gets worse
      return end;
    });
    const med = errs.slice().sort((p, q) => p - q)[2], ok = med < span * 0.02;
    if (!ok) fail++;
    row.push(`${name} median error ${med.toExponential(2)} ${ok ? 'ok' : 'FAIL'}`);
  }
  console.log(obj.name.padEnd(11), row.join('   '));
}
console.log(fail ? `${fail} check(s) failed` : 'all checks passed');
process.exit(fail ? 1 : 0);

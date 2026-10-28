/* ------------------------------------------------------------------
   00_util.js — math helpers, seeded RNG, value noise
------------------------------------------------------------------- */
const TAU = Math.PI * 2;

/* UI text: I18N comes from src/i18n.json (chosen language), {name} is filled from vars */
const t = (key, vars = {}) => (I18N[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
/* numbers on screen in the page language: Indonesian writes decimals with a comma (3,837), English with a point (3.837) */
const num = (v, digits) => { const s = (+v).toFixed(digits); return LANG === 'id' ? s.replace('.', ',') : s; };
/* text for the voice: decimals spelled out, so "0.9" / "0,9" is read "zero point nine" / "nol koma sembilan" */
const DIGIT_WORDS = { en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'], id: ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'] };
function speakable(text) {
  const D = DIGIT_WORDS[LANG] || DIGIT_WORDS.en, word = (ds) => [...ds].map(c => D[+c]).join(' ');
  return text
    .replace(/(\d+)[.,](\d+)/g, (m, a, b) => `${word(a)} ${LANG === 'id' ? 'koma' : 'point'} ${word(b)}`)
    .replace(/\b([A-Za-z])(\d)\b/g, (m, l, d) => `${l} ${D[+d]}`);          // r1 -> "r one" / "r satu", X2 -> "X two"
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
const dampAngle = (cur, target, lambda, dt) => {
  let d = ((target - cur + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return cur + d * (1 - Math.exp(-lambda * dt));
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
function fbm(x, y, o = 4) {
  let a = .5, f = 1, s = 0;
  for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= .5; }
  return s;
}
const noise3 = (x, y, z) => (vnoise(x + z * 1.7, y + z * .9) + vnoise(y * 1.3 - z, x * .7 + z * 2.1)) / 2;

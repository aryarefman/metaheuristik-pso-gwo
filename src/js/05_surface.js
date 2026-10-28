/* ------------------------------------------------------------------
   05_surface.js — surface look for terrain, rock, wood, cloth
   realistic version: tri-planar grain (below); crochet version: yarnify() from 05_yarn.js
   detail(): tri-planar fractal grain that tints the albedo and perturbs
   the normal (grit, pores, weathering), fading out where it would alias.
   `scale` = grain features per world unit of the mesh.
------------------------------------------------------------------- */
const DETAIL_GLSL = `
// sin()-free hash: sin of large numbers loses precision on GPUs and turns the grain into square blocks
float dHash(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float dNoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(dHash(i), dHash(i + vec3(1, 0, 0)), f.x), mix(dHash(i + vec3(0, 1, 0)), dHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(dHash(i + vec3(0, 0, 1)), dHash(i + vec3(1, 0, 1)), f.x), mix(dHash(i + vec3(0, 1, 1)), dHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// anti-aliased fbm: each octave fades out once its features shrink below ~half a pixel (fw = pixel footprint in noise units),
// otherwise the 2x2-pixel derivative blocks turn sub-pixel noise into visible squares
float dFbm(vec3 p, float fw){
  float s = 0., a = .5, f = 1.;
  for (int i = 0; i < 5; i++) { s += a * mix(.5, dNoise(p), 1. - smoothstep(.18, .45, fw * f)); p = p * 2.07 + 1.3; f *= 2.07; a *= .5; }
  return s;
}
`;
const DETAIL_VERT = `
vWn = objectNormal;
vec4 wpq = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  wpq = instanceMatrix * wpq;
#endif
vWp = wpq.xyz;
`;

/** Patch a MeshStandard/Physical material with procedural surface grain. */
function detail(mat, o = {}) {
  if (STYLE === 'crochet') return yarnify(mat, o);
  const S = (o.scale ?? 12).toFixed(2), B = ((o.bump ?? 2) * .1).toFixed(3), T = (o.fleck ?? .25).toFixed(2);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + DETAIL_VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;\n' + DETAIL_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dFw = length(fwidth(vWp)) * ${S};
        float dLarge = dFbm(vWp * ${S} * .14, dFw * .14);       // broad weathering / soil patches
        float dHt = dFbm(vWp * ${S}, dFw);                       // fine grit, only the octaves that resolve
        diffuseColor.rgb *= 1.0 - ${T} * .5 + ${T} * (dLarge * .75 + dHt * .25);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 vp = -vViewPosition; vec3 dpx = dFdx(vp), dpy = dFdy(vp);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
          vec3 gr = sign(det) * (dFdx(dHt) * r1 + dFdy(dHt) * r2);
          normal = normalize(abs(det) * normal - ${B} * gr); }`);
  };
  mat.customProgramCacheKey = () => `detail${S}${B}${T}${prev ? 'p' : ''}${mat.vertexColors ? 'v' : ''}${mat.map ? 'm' : ''}`;
  mat.userData.detail = true; mat.needsUpdate = true;
  return mat;
}

/** Add grain to every standard material below `root` (keeps each material's own roughness). */
function detailTree(root, o = {}) {
  if (STYLE === 'crochet') return yarnifyTree(root, o);
  const seen = new Set();
  root.traverse((n) => {
    const m = n.material; if (!m || seen.has(m) || m.userData.detail || m.isShaderMaterial || m.isMeshBasicMaterial) return;
    if (!(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) return;
    seen.add(m); detail(m, o);
  });
  return root;
}

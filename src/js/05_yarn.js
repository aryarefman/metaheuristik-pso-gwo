/* ------------------------------------------------------------------
   05_yarn.js — crochet version only (STYLE === 'crochet'): amigurumi look for every asset
   yarnify(): procedural crochet V-stitches (tri-planar), per-stitch yarn
   tint, dark grooves between stitches and a soft fuzzy rim.
   `scale` = stitches per world unit of the mesh.
------------------------------------------------------------------- */
const YARN_GLSL = `
float yh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
// one crochet "V" stitch: two leaning bean-shaped legs per cell, every other row shifted by half a stitch
float stitch(vec2 p, out float tint){
  float row = floor(p.y);
  vec2 f = vec2(fract(p.x + .5 * mod(row, 2.)), fract(p.y)) - .5;
  vec2 cell = vec2(floor(p.x + .5 * mod(row, 2.)), row);
  tint = yh(vec3(cell, 4.));
  vec2 a = f - vec2(-.2, .02), b = f - vec2(.2, .02);
  float ca = cos(.5), sa = sin(.5);
  vec2 ra = vec2(ca * a.x - sa * a.y, sa * a.x + ca * a.y);
  vec2 rb = vec2(ca * b.x + sa * b.y, -sa * b.x + ca * b.y);
  float la = exp(-(ra.x * ra.x / .014 + ra.y * ra.y / .12));
  float lb = exp(-(rb.x * rb.x / .014 + rb.y * rb.y / .12));
  float twist = .06 * sin((f.x + f.y * 1.6) * 38.);
  return clamp(max(la, lb) + twist * max(la, lb), 0., 1.);
}
float stitchTri(vec3 p, vec3 n, float S, out float tint){
  vec3 w = pow(abs(n), vec3(4.)); w /= (w.x + w.y + w.z + 1e-5);
  float t1, t2, t3;
  float h = w.x * stitch(vec2(p.z, p.y) * S, t1) + w.z * stitch(vec2(p.x, p.y) * S, t2) + w.y * stitch(vec2(p.x, p.z) * S, t3);
  tint = w.x * t1 + w.z * t2 + w.y * t3;
  return h;
}
`;
const YARN_VERT = `
vWn = objectNormal;
vec4 wpq = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  wpq = instanceMatrix * wpq;
#endif
vWp = wpq.xyz;
`;

/** Patch a MeshStandard/Physical material so it reads as crocheted yarn. */
function yarnify(mat, o = {}) {
  const S = (o.scale ?? 12).toFixed(2), B = (o.bump ?? 2.2).toFixed(2), SH = (o.sheen ?? .2).toFixed(2), FL = (o.fleck ?? .28).toFixed(2);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + YARN_VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;\n' + YARN_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float yT; float yHt = stitchTri(vWp, normalize(vWn), ${S}, yT);
        float yFade = 1.0 - smoothstep(.28, .8, length(fwidth(vWp)) * ${S});
        yHt = mix(.5, yHt, yFade);
        diffuseColor.rgb *= (1.0 - ${FL} * .5 + ${FL} * mix(.5, yT, yFade)) * (.8 + .34 * yHt);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 vp = -vViewPosition; vec3 dpx = dFdx(vp), dpy = dFdy(vp);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
          vec3 gr = sign(det) * (dFdx(yHt) * r1 + dFdy(yHt) * r2);
          normal = normalize(abs(det) * normal - ${B} * gr); }`)
      .replace('#include <opaque_fragment>', `
        { float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
          outgoingLight += diffuseColor.rgb * rim * ${SH}; }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `yarn${S}${B}${SH}${FL}${prev ? 'p' : ''}${mat.vertexColors ? 'v' : ''}${mat.map ? 'm' : ''}`;
  mat.userData.yarn = true; mat.needsUpdate = true;
  return mat;
}

/** Crochet every standard material below `root`. */
function yarnifyTree(root, o = {}) {
  const seen = new Set();
  root.traverse((n) => {
    const m = n.material; if (!m || seen.has(m) || m.userData.yarn || m.isShaderMaterial || m.isMeshBasicMaterial) return;
    if (!(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) return;
    seen.add(m); yarnify(m, o); m.roughness = 1;
    if (m.isMeshPhysicalMaterial) m.clearcoat = 0;
  });
  return root;
}

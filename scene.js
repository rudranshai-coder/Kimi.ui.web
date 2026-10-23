import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* =============================================================================
   VELVETY — a scroll-driven 3D watch with a pointer-following light splash.
   The scene is a pure function of (scrollProgress, pointer, simT).
============================================================================= */

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- deterministic RNG (for particles) ---------- */
function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261023);

/* ---------- renderer / scene / camera ---------- */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* ---------- velvet dome with the light-splash shader ---------- */
const splashUniforms = {
  uTime:      { value: 0 },
  uPointer:   { value: new THREE.Vector3(0, 0, 1) },  // world dir of pointer
  uGlow:      { value: 0.0 },                          // pointer light energy
  uRipple:    { value: 0.0 },                          // scroll-splash energy
  uRipplePh:  { value: 0.0 },                          // ripple phase (advances with scroll)
  uProgress:  { value: 0.0 },
};

const dome = new THREE.Mesh(
  new THREE.SphereGeometry(60, 64, 48),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: splashUniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform float uTime, uGlow, uRipple, uRipplePh, uProgress;
      uniform vec3 uPointer;

      float hash(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0;
        return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float noise(vec3 x){
        vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)),f.x),
                       mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)),f.x),
                       mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)),f.x),f.y),f.z); }

      void main() {
        vec3 d = normalize(vDir);

        /* velvet ground: deep oxblood falling into night */
        vec3 night = vec3(0.070, 0.040, 0.062);
        vec3 wine  = vec3(0.228, 0.086, 0.133);
        float h = smoothstep(-0.85, 0.65, d.y);
        vec3 col = mix(wine, night, h);

        /* velvet nap: slow fibrous sheen */
        float nap = noise(d*9.0 + vec3(0.0, uTime*0.03, 0.0));
        nap += 0.5 * noise(d*23.0 - vec3(uTime*0.02));
        col *= 0.92 + 0.16 * nap;

        /* gold dust haze near the horizon */
        col += vec3(0.20, 0.14, 0.06) * pow(1.0 - abs(d.y), 5.0) * 0.5;

        /* ——— the pointer splash: light that follows your hand ——— */
        float pd = distance(d, normalize(uPointer));
        float glow = exp(-pd*pd*7.0) * uGlow;
        col += vec3(1.0, 0.80, 0.46) * glow * 0.5;
        col += vec3(0.9, 0.55, 0.28) * exp(-pd*pd*2.6) * uGlow * 0.10;

        /* ——— scroll ripple: rings of light splashing outward ——— */
        float r = exp(-pd*1.1) * sin(pd*26.0 - uRipplePh) * uRipple;
        col += vec3(1.0, 0.78, 0.42) * max(r, 0.0) * 0.55;

        /* gentle vignette to hold the watch in the dark */
        col *= 1.0 - 0.35 * pow(abs(d.y), 2.0);

        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
scene.add(dome);

/* ---------- materials ---------- */
const gold = new THREE.MeshPhysicalMaterial({
  color: 0xd9b26a, metalness: 1.0, roughness: 0.24,
  clearcoat: 0.6, clearcoatRoughness: 0.25,
});
const goldBrushed = new THREE.MeshPhysicalMaterial({
  color: 0xc39a52, metalness: 1.0, roughness: 0.42,
});
const dialMat = new THREE.MeshPhysicalMaterial({
  color: 0x1c0d16, metalness: 0.4, roughness: 0.32,
  clearcoat: 1.0, clearcoatRoughness: 0.12,
});
const velvetMat = new THREE.MeshStandardMaterial({
  color: 0x4a1424, roughness: 0.96, metalness: 0.0,
});
const inkMat = new THREE.MeshStandardMaterial({ color: 0xf2e7dc, roughness: 0.4, metalness: 0.2 });

/* ---------- the watch (procedural, no external assets) ---------- */
const watch = new THREE.Group();
scene.add(watch);

/* case: lathe profile, axis Z (face toward +Z) */
{
  const pts = [];
  const R = 1.45;
  pts.push(new THREE.Vector2(0.001, -0.40));
  pts.push(new THREE.Vector2(R*0.45, -0.385));
  pts.push(new THREE.Vector2(R*0.75, -0.345));
  pts.push(new THREE.Vector2(R*0.92, -0.26));
  pts.push(new THREE.Vector2(R*0.99, -0.20));
  pts.push(new THREE.Vector2(R*1.00,  0.00));
  pts.push(new THREE.Vector2(R*0.97,  0.20));
  pts.push(new THREE.Vector2(R*0.88,  0.30));
  pts.push(new THREE.Vector2(R*0.72,  0.34));
  const caseGeo = new THREE.LatheGeometry(pts, 96);
  const caseMesh = new THREE.Mesh(caseGeo, goldBrushed);
  caseMesh.rotation.x = Math.PI / 2;
  watch.add(caseMesh);
}

/* bezel */
{
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.10, 32, 128), gold);
  bezel.position.z = 0.26;
  watch.add(bezel);
}

/* dial */
const dial = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.28, 0.06, 96), dialMat);
dial.rotation.x = Math.PI / 2;
dial.position.z = 0.24;
watch.add(dial);

/* inner minute ring */
{
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.012, 12, 128), inkMat);
  ring.position.z = 0.275;
  watch.add(ring);
}

/* hour markers */
{
  const mk = new THREE.BoxGeometry(0.05, 0.20, 0.05);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.Mesh(mk, i % 3 === 0 ? gold : inkMat);
    m.position.set(Math.sin(a) * 1.02, Math.cos(a) * 1.02, 0.28);
    m.rotation.z = -a;
    watch.add(m);
  }
}

/* hands — pivoted groups so sample(t) can set real time */
function makeHand(len, wid, mat, z) {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.BoxGeometry(wid, len, 0.03), mat);
  h.position.y = len / 2 - 0.12;
  g.add(h);
  g.position.z = z;
  watch.add(g);
  return g;
}
const hourHand   = makeHand(0.62, 0.075, gold, 0.30);
const minuteHand = makeHand(0.98, 0.055, gold, 0.32);
const secondHand = makeHand(1.08, 0.020, new THREE.MeshStandardMaterial({ color: 0xb03a4e, roughness: 0.35 }), 0.34);
{
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 32), gold);
  pin.rotation.x = Math.PI / 2; pin.position.z = 0.34;
  watch.add(pin);
}

/* case-back medallion */
{
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.035, 16, 96), gold);
  ringB.position.z = -0.40;
  watch.add(ringB);
  const med = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.05, 48), dialMat);
  med.rotation.x = Math.PI / 2; med.position.z = -0.41;
  watch.add(med);
  const medRim = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.028, 12, 64), gold);
  medRim.position.z = -0.415;
  watch.add(medRim);
}

/* crown */
{
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.18, 24), goldBrushed);
  crown.rotation.z = Math.PI / 2;
  crown.position.set(1.62, 0, 0.02);
  watch.add(crown);
}

/* strap: velvet loop behind the case */
{
  const curve = new THREE.CatmullRomCurve3(
    Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * 1.15, Math.sin(a) * 2.05, -0.42 - 0.18 * Math.cos(a));
    }), true);
  const strap = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.30, 24, true), velvetMat);
  strap.scale.z = 0.55;
  watch.add(strap);
  /* gold keepers */
  for (const sy of [1, -1]) {
    const k = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 16, 48), gold);
    k.position.set(0, sy * 1.62, -0.42);
    k.rotation.y = Math.PI / 2;
    k.scale.set(1, 1, 0.6);
    watch.add(k);
  }
}

/* lugs */
for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
  const lug = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.30), goldBrushed);
  lug.position.set(sx * 0.72, sy * 1.46, -0.05);
  lug.rotation.z = sx * sy * -0.18;
  watch.add(lug);
}

/* ---------- lights ---------- */
scene.add(new THREE.AmbientLight(0x402028, 0.6));
const hemi = new THREE.HemisphereLight(0x8a6a4a, 0x1a0c12, 0.5);
scene.add(hemi);

/* pointer splash light — follows cursor/touch */
const splashLight = new THREE.SpotLight(0xffd9a0, 0, 40, Math.PI / 5, 0.55, 1.2);
scene.add(splashLight, splashLight.target);

/* fixed rim light from behind for the gold edge */
const rim = new THREE.DirectionalLight(0xffe6bd, 1.6);
rim.position.set(-6, 5, -8);
scene.add(rim);

const fill = new THREE.DirectionalLight(0x6a3a4a, 0.7);
fill.position.set(5, -3, 6);
scene.add(fill);

/* ---------- gold dust particles ---------- */
const P_COUNT = reduceMotion ? 120 : 420;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(P_COUNT * 3);
const pSeed = new Float32Array(P_COUNT);
for (let i = 0; i < P_COUNT; i++) {
  const a = rand() * Math.PI * 2;
  const r = 2.5 + rand() * 12;
  pPos[i*3]   = Math.cos(a) * r;
  pPos[i*3+1] = (rand() - 0.5) * 14;
  pPos[i*3+2] = Math.sin(a) * r;
  pSeed[i] = rand();
}
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('aSeed', new THREE.BufferAttribute(pSeed, 1));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: splashUniforms.uTime, uBoost: { value: 0 } },
  vertexShader: /* glsl */`
    attribute float aSeed;
    uniform float uTime, uBoost;
    varying float vA;
    void main(){
      vec3 p = position;
      p.y = mod(p.y + uTime * (0.12 + aSeed*0.25) * (1.0 + uBoost*3.0) + aSeed*14.0, 14.0) - 7.0;
      p.x += sin(uTime*0.4 + aSeed*40.0) * 0.25;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = (0.7 + aSeed*1.1) * (60.0 / -mv.z) * (1.0 + uBoost*0.5);
      vA = 0.10 + 0.30*aSeed + uBoost*0.25;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    varying float vA;
    void main(){
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.05, d) * vA;
      gl_FragColor = vec4(vec3(1.0, 0.82, 0.5) * a, a);
    }`,
});
scene.add(new THREE.Points(pGeo, pMat));

/* ---------- input: scroll / pointer / touch ---------- */
const space = document.getElementById('scroll-space');
let scrollP = 0;          // smoothed scroll progress 0..1
let scrollVel = 0;        // smoothed scroll velocity (drives ripple splash)
const pointer = new THREE.Vector2(0, 0.15);    // NDC
const pointerTarget = new THREE.Vector2(0, 0.15);
let pointerSpeed = 0;

function readScroll() {
  const max = space.offsetHeight - innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
}
let lastRaw = readScroll();

function onPointer(x, y) {
  const nx = (x / innerWidth) * 2 - 1;
  const ny = -(y / innerHeight) * 2 + 1;
  pointerSpeed = Math.min(1, pointerSpeed + Math.hypot(nx - pointerTarget.x, ny - pointerTarget.y) * 2.2);
  pointerTarget.set(nx, ny);
}
addEventListener('pointermove', e => onPointer(e.clientX, e.clientY), { passive: true });
addEventListener('touchmove', e => {
  if (e.touches[0]) onPointer(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

/* ---------- DOM panels ---------- */
const panels = [...document.querySelectorAll('section.panel')].map(el => ({
  el, from: +el.dataset.from, to: +el.dataset.to,
}));
const bar = document.getElementById('bar');
const hint = document.getElementById('hint');
const poster = document.getElementById('poster');

function layoutPanels(p) {
  for (const s of panels) {
    const span = s.to - s.from;
    const local = (p - s.from) / span;                 // 0..1 inside the panel's window
    const fade = 0.22;
    let o = 0;
    if (local > 0 && (local < 1 || s.to >= 1)) {
      o = Math.min(1, local / fade, s.to >= 1 ? 1 : (1 - local) / fade);
    }
    if (s.from === 0 && local <= 0) o = 1 - Math.min(1, -local / fade * 0.5);
    s.el.style.opacity = o.toFixed(3);
    s.el.style.transform = `translateY(${((1 - o) * 36).toFixed(1)}px)`;
    s.el.classList.toggle('on', o > 0.5);
  }
  bar.style.height = `${(p * 100).toFixed(1)}%`;
  hint.style.opacity = p > 0.015 ? '0' : '1';
}

/* ---------- time model (deterministic for screenshots) ---------- */
const STEP = 1 / 60;
let simT = 0, paused = false;

/* the watch keeps real time: 10:10:30 at t=0, second hand sweeps */
function sample(t) {
  const sec = 30 + t;
  const min = 10 + sec / 60;
  const hr  = 10 + min / 60;
  secondHand.rotation.z = -(sec / 60) * Math.PI * 2;
  minuteHand.rotation.z = -(min / 60) * Math.PI * 2;
  hourHand.rotation.z   = -(hr / 12) * Math.PI * 2;
}

/* ---------- per-frame scene assembly ---------- */
const ease = x => x * x * (3 - 2 * x);
const lerp = (a, b, x) => a + (b - a) * x;

const raycaster = new THREE.Raycaster();
const domeHit = new THREE.Vector3();
const pointerDir = new THREE.Vector3(0, 0, 1);

function updateFrame(dt) {
  /* smooth scroll + velocity */
  const raw = readScroll();
  const dv = raw - lastRaw; lastRaw = raw;
  scrollVel = lerp(scrollVel, Math.min(1, Math.abs(dv) * 90), 0.08);
  scrollP = lerp(scrollP, raw, reduceMotion ? 1 : 0.09);

  /* smooth pointer */
  pointer.lerp(pointerTarget, 0.12);
  pointerSpeed = Math.max(0, pointerSpeed - dt * 1.4);

  /* pointer direction in world → dome shader + splash light */
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 58), domeHit);
  if (domeHit) pointerDir.copy(domeHit).normalize();

  const idleGlow = 0.10 + 0.03 * Math.sin(simT * 0.8);          // soft breathing
  const glow = idleGlow + pointerSpeed * 1.1 + scrollVel * 0.4;

  splashUniforms.uPointer.value.copy(pointerDir);
  splashUniforms.uGlow.value = lerp(splashUniforms.uGlow.value, glow, 0.1);
  splashUniforms.uRipple.value = lerp(splashUniforms.uRipple.value, Math.min(1, scrollVel * 1.6), 0.12);
  splashUniforms.uRipplePh.value += dt * (2 + scrollVel * 26);
  splashUniforms.uProgress.value = scrollP;
  splashUniforms.uTime.value = simT;
  pMat.uniforms.uBoost.value = Math.min(1, scrollVel * 1.4 + pointerSpeed * 0.5);

  /* spotlight aimed from the pointer direction onto the watch */
  splashLight.intensity = 6 + glow * 24;
  splashLight.position.copy(pointerDir).multiplyScalar(11);
  splashLight.target.position.set(0, 0, 0);
  splashLight.target.updateMatrixWorld();

  /* ——— scroll choreography ——— */
  const p = scrollP;
  const amp = reduceMotion ? 0.15 : 1;
  const e1 = ease(Math.min(1, p / 0.5));           // first half: orbit in
  const e2 = ease(Math.max(0, (p - 0.5) / 0.5));   // second half: pull back & rise

  const angle = (lerp(-0.85, 2.6, e1) - 2.6 * e2) * amp;   // sweep around, return to the front
  let radius = lerp(10.5, 7.4, e1) + e2 * 3.4;
  radius *= Math.min(1.9, Math.max(1, 1.15 / camera.aspect)); // pull back on narrow screens
  const height = lerp(1.6, -0.9, e1) + e2 * 3.0;
  camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
  /* keep the watch opposite the active text panel */
  const sstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const win = (a, b, f = 0.05) => sstep((p - a) / f) * (1 - sstep((p - b) / f));
  const lookX = 1.6 * win(0.18, 0.40) - 1.6 * win(0.44, 0.64) + 1.5 * win(0.68, 0.86) - 1.5 * win(0.90, 1.0, 0.07);
  camera.lookAt(lookX, lerp(0.2, -0.1, p), 0);

  /* watch: slow presentation spin + finale tilt */
  watch.rotation.y = lerp(-0.4, Math.PI * 2.0, ease(p)) * amp + Math.sin(simT * 0.25) * 0.05;
  watch.rotation.x = lerp(0.12, -0.55, e2) * amp + Math.sin(simT * 0.5) * 0.02;
  watch.rotation.z = lerp(0, 0.35, e1) * (1 - e2) * amp;
  const s = 1 + e2 * 0.12;
  watch.scale.setScalar(s);

  /* dome turns almost imperceptibly, like fabric settling */
  dome.rotation.y = simT * 0.008;

  layoutPanels(p);
}

/* ---------- main loop ---------- */
const clock = new THREE.Clock();
let acc = 0, firstFrame = true;

function draw() { renderer.render(scene, camera); }

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!paused) {
    acc += dt;
    while (acc >= STEP) { acc -= STEP; simT += STEP; }
    sample(simT);
    updateFrame(dt);
  }
  draw();
  if (firstFrame) {
    firstFrame = false;
    poster.style.opacity = '0';
    setTimeout(() => poster.remove(), 1400);
    window.__SCENE_READY__ = true;
  }
});

/* nav: anchors map to scroll-choreography positions */
const NAV_POS = { '#top': 0, '#craft': 0.29, '#movement': 0.54, '#reserve': 1 };
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = NAV_POS[a.getAttribute('href')];
    if (target === undefined) return;
    e.preventDefault();
    const max = space.offsetHeight - innerHeight;
    scrollTo({ top: target * max, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
});

/* screenshot/self-check hooks */
window.__seek = (t) => {
  const v = Number(t);
  paused = true; acc = 0;
  simT = Number.isFinite(v) && v > 0 ? v : 0;
  sample(simT);
  updateFrame(STEP);
  draw();
};
window.__play = () => { paused = false; clock.getDelta(); };

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (paused) draw();
});

sample(simT);
const T_PARAM = new URLSearchParams(location.search).get('t');
if (T_PARAM !== null) window.__seek(T_PARAM);

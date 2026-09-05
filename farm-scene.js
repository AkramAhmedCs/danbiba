/* ===========================================================================
   THE FARM — a WebGL diorama
   ---------------------------------------------------------------------------
   Everything here is built from three.js primitives at runtime. No model
   files, no image textures. The GPU rasterises this geometry every frame you
   look at it, from whatever angle you drag it to.

   It is a diorama, deliberately: you inspect it from outside, the way you'd
   walk around a table model in a site office. It is not a walkthrough and it
   is not a photograph of Danbiba's land — a stylised model can't be mistaken
   for a survey.

   Two things carry the detail rather than raw polygon count:

     THE LAND is one continuous displaced mesh, painted per vertex. Fields are
     regions of colour with soft, noisy borders, not slabs stacked on slabs —
     which is what stopped the first pass reading as a pile of boxes.

     THE MOTION is real. Crops bend in a wind computed in the vertex shader,
     so thousands of plants sway for no CPU cost and still cost one draw call.
     The tractor drives the track, the windmill turns, the pond ripples,
     tree canopies lean and birds circle.

   Tunables live in CONFIG. Everything below CONFIG reads from it.
   =========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ===========================================================================
   CONFIG
   =========================================================================== */

export const CONFIG = {

  plot: {
    size:      34,     /* one side of the planted ground, in world units */
    segments:  200,    /* how finely the land is subdivided              */
    segSmall:  120,    /* a phone GPU is not an RTX: 29k triangles, not 80k */
    thickness: 1.7,    /* the slab's cut edge                            */
    relief:    0.9,    /* how far the ground rolls, peak to trough       */
    apron:     12,     /* land beyond the plot, x plot size              */
    apronSeg:  120,
    apronSegSmall: 70
  },

  /* --- palette --------------------------------------------------------
     Keyed to danbiba.css. --sc-canvas #0F0D0B, --sc-accent #E2694E
     (laterite), --sc-ink #F4EFE6. A low warm sun rather than blue daylight,
     because blue over a charcoal page reads as a hole in the page. */
  color: {
    zenith:  0x221A15,
    horizon: 0x8E6547,
    fog:     0x8E6547,

    earth:  0x2E241B,   /* the slab's cut side           */
    apron:  0x4A3A2A,   /* land beyond the plot          */
    grass:  0x55632F,   /* between the fields            */
    grass2: 0x63713A,   /* the lighter grass, mottled in */

    field:  [ 0x5C6B33, 0x74833E, 0x47572C, 0x86743F ],
    fallow: [ 0x6B5436, 0x7A6242 ],
    track:  0x8A6A45,   /* laterite dirt */
    rut:    0x74563A,

    cropA: 0x7C9345,    /* instanced crop colour, low  */
    cropB: 0xB6C169,    /* instanced crop colour, high */
    cropC: 0x8F7F3C,    /* the ripe field              */

    hedge:   0x4A6333,
    water:   0x2C4348,
    waterHi: 0x5E8288,

    barn:     0x9E4430,
    barnDark: 0x7E3626,
    barnTrim: 0xE8DCC8,
    roof:     0x36302A,
    roofDark: 0x2A2521,
    doorway:  0x1A1512,
    plinth:   0x50463C,

    silo:    0xC3B7A4,
    siloCap: 0x6E5C49,
    tank:    0x8C9490,

    fence:  0x8A7357,
    trunk:  0x4A3728,
    canopy: [ 0x405C2E, 0x4E6D37, 0x35502A, 0x59763E ],
    hay:    0xB99A63,
    bird:   0x241C16,

    tractor:     0xE2694E,   /* the site accent, on the thing that moves */
    tractorDark: 0x2A211A,
    metal:       0x9A9086
  },

  /* --- what grows where -----------------------------------------------
     Regions, not rectangles: the border is a rectangle's distance field
     pushed around by noise, so no field has a straight machined edge. */
  fields: [
    { x:  -8.0, z:  -8.0, w: 14, d: 12, crop: 'grain',  tone: 0, edge: 1.5 },
    { x:  11.5, z:  -8.0, w:  9, d: 12, crop: 'grain',  tone: 1, edge: 1.2 },
    { x: -11.0, z:  11.0, w: 10, d:  7, crop: null,     tone: 0, edge: 1.4 },
    { x:  11.5, z:   8.0, w:  9, d: 12, crop: 'legume', tone: 2, edge: 1.3 },
    { x:  -3.0, z:  13.5, w:  6, d:  5, crop: null,     tone: 1, edge: 1.1 },
    { x:  -1.5, z:  -4.5, w:  7, d:  5, crop: 'ripe',   tone: 3, edge: 1.0 }
  ],

  track: { x: 4.5, width: 3.2, spurZ: 4.6, spurToX: -3.4 },

  crops: {
    rowGap:   0.52,
    plantGap: 0.34,
    height:   0.92,
    max:      2600,   /* desktop cap */
    maxSmall: 900,
    wind:     0.20
  },

  hedge: { gap: 0.62, height: 0.8, max: 900, maxSmall: 320 },
  fence: { inset: 1.15, postGap: 2.1, height: 0.95 },

  trees: [
    { x: -15.4, z:  14.8, s: 1.6, kind: 'round' },
    { x:  -8.4, z:  16.2, s: 1.2, kind: 'cone'  },
    { x:  15.4, z:  15.2, s: 1.4, kind: 'round' },
    { x:  16.4, z:  -0.6, s: 1.7, kind: 'round' },
    { x: -16.2, z:  -2.4, s: 1.3, kind: 'cone'  },
    { x: -15.2, z: -14.6, s: 1.5, kind: 'round' },
    { x:   0.4, z: -15.8, s: 1.1, kind: 'cone'  },
    { x:  15.2, z: -15.2, s: 1.3, kind: 'round' },
    { x:  -1.2, z:   9.6, s: 1.0, kind: 'round' },
    { x: -11.6, z:  -0.4, s: 1.2, kind: 'round' },
    { x:   8.6, z:  15.6, s: 1.1, kind: 'cone'  },
    { x: -16.4, z:   6.4, s: 1.4, kind: 'round' }
  ],

  pond:     { x: -14.2, z: 0.6, r: 3.0, depth: 0.85 },
  barn:     { x: -6.5, z: 4.2, rot: -0.16, w: 6.4, h: 3.4, d: 4.6 },
  silo:     { x: -1.4, z: 5.6, r: 1.15, h: 5.2 },
  tank:     { x:  1.6, z: 6.6, r: 0.85, h: 1.5, legs: 1.6 },
  windmill: { x: -3.4, z: 8.6, h: 5.6, blades: 14 },
  bales: [
    { x: -9.4, z: 2.2 }, { x: -8.2, z: 1.9 }, { x: -8.8, z: 3.0 },
    { x: -8.8, z: 2.55, up: true },
    { x: -3.4, z: 1.0 }, { x: -2.3, z: 0.7 }, { x:  0.6, z: 1.4 }
  ],

  /* --- the things that move ------------------------------------------- */
  motionScene: {
    tractorSpeed: 1.15,   /* world units a second along the track */
    windmillRpm:  5.5,
    birds:      6,
    birdRadius: 27,
    birdHeight: 16,
    rippleAmp:  0.045
  },

  /* --- camera ---------------------------------------------------------
     A diorama seen from outside. It cannot drop under the ground plane,
     cannot get inside the barn, and cannot retreat to orbit. */
  camera: {
    fov:       36,
    start:     { x: -22.1, y: 10.7, z: -22.1 },   /* azimuth 225, on the yard */
    target:    { x: 0, y: 1.2, z: 0 },
    minDist:   13,
    maxDist:   72,
    minPolar:  0.20,
    maxPolar:  Math.PI / 2 - 0.13,
    panLimit:  9.5,
    panLimitY: { min: 0, max: 4 }
  },

  motion: {
    damping:      0.055,
    autoRotate:   0.32,
    idleResumeMs: 3800,
    keyStep:      0.10
  },

  quality: {
    dprCap:         2,
    shadowMap:      2048,
    shadowMapSmall: 1024,
    smallScreen:    760
  }
};

/* ===========================================================================
   NOISE — one deterministic field, shared by the land, the field borders and
   the scatter, so everything agrees about where the ground is.
   =========================================================================== */

function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi),     b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, oct) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < (oct || 4); i++) { s += amp * noise2(x * f, y * f); amp *= 0.5; f *= 2; }
  return s;
}

/* distance to a rectangle: negative inside, positive outside */
function rectSDF(x, z, f) {
  const dx = Math.abs(x - f.x) - f.w / 2;
  const dz = Math.abs(z - f.z) - f.d / 2;
  const ox = Math.max(dx, 0), oz = Math.max(dz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(dx, dz), 0);
}
/* distance to a line segment, for the track and its spur */
function segSDF(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz)));
  return Math.hypot(wx - vx * t, wz - vz * t);
}
const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* the land's height at any point. Every object is placed with it, so nothing
   floats and nothing sinks. */
function heightAt(x, z) {
  const P = CONFIG.plot;
  let h = (fbm(x * 0.052 + 11, z * 0.052 + 7) - 0.48) * P.relief
        + (fbm(x * 0.17 + 3, z * 0.17 + 19) - 0.5) * 0.16;
  /* the pond sits in a bowl it dug itself */
  const D = CONFIG.pond;
  h -= D.depth * smooth(D.r * 1.25, D.r * 0.15, Math.hypot(x - D.x, z - D.z));
  /* the track is graded flatter, the way a used track is */
  const T = CONFIG.track;
  const dt = Math.min(
    segSDF(x, z, T.x, -P.size, T.x, P.size),
    segSDF(x, z, T.x, T.spurZ, T.spurToX, T.spurZ));
  h *= 1 - 0.55 * smooth(T.width * 1.1, T.width * 0.35, dt);
  return h;
}

/* the country beyond the plot: flat where it meets the plot, gently rolling
   further out. Shared by the apron mesh and everything standing on it. */
function apronHeightAt(x, z) {
  const P = CONFIG.plot;
  /* Almost flat, and it stays that way. Its whole job is to give the fog
     something to close over so the plot has no visible rim; it is not more
     farm, and nothing stands on it. */
  const rise = smooth(P.size * 1.4, P.size * 5.0, Math.max(Math.abs(x), Math.abs(z)));
  return (fbm(x * 0.021 + 31, z * 0.021 + 3) - 0.5) * 0.9 * rise - 0.9;
}

/* how much of a given field covers this point, 0 to 1, with a noisy border */
function fieldWeight(x, z, f) {
  const n = (fbm(x * 0.22 + f.x, z * 0.22 + f.z, 3) - 0.5) * 1.9;
  return smooth(f.edge, -f.edge, rectSDF(x, z, f) + n);
}
function trackWeight(x, z) {
  const T = CONFIG.track, P = CONFIG.plot;
  const d = Math.min(
    segSDF(x, z, T.x, -P.size, T.x, P.size),
    segSDF(x, z, T.x, T.spurZ, T.spurToX, T.spurZ));
  const n = (fbm(x * 0.3 + 41, z * 0.3 + 13, 3) - 0.5) * 0.85;
  return smooth(T.width * 0.62, T.width * 0.24, d + n);
}

/* ===========================================================================
   WIND — one shader patch, shared by every plant. Thousands of crops sway for
   the cost of nothing: the CPU never touches an instance matrix.
   =========================================================================== */

const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

function makeWindy(material, strength, key) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float ph = ip.x * 0.42 + ip.z * 0.31;
          float h  = max(transformed.y, 0.0);
          /* two frequencies plus a slow travelling gust, so the field ripples
             across instead of every plant nodding in unison */
          float gust = sin(uTime * 0.55 + ip.x * 0.11 + ip.z * 0.07) * 0.5 + 0.75;
          float sway = sin(uTime * 1.6 + ph) * 0.62 + sin(uTime * 2.9 + ph * 1.7) * 0.38;
          float amp  = ${strength.toFixed(4)} * uWind * gust * h * h;
          transformed.x += sway * amp;
          transformed.z += sway * amp * 0.45;
        }`);
  };
  /* without this three reuses one compiled program across materials with the
     same signature, and only the first one gets the wind */
  material.customProgramCacheKey = () => 'windy-' + key;
  return material;
}

/* the shadow has to bend with the plant, or a swaying field is cast onto
   stencilled stripes that never move */
function windyDepth(strength, key) {
  return makeWindy(
    new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }),
    strength, key + '-depth');
}

/* ===========================================================================
   MOUNT
   =========================================================================== */

export function mountFarmScene(container, options) {
  const opts   = options || {};
  const small  = window.matchMedia('(max-width: ' + CONFIG.quality.smallScreen + 'px)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({
    antialias: !small, alpha: false, powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.quality.dprCap));
  renderer.outputColorSpace    = THREE.SRGBColorSpace;
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled   = true;
  renderer.shadowMap.type      = THREE.PCFSoftShadowMap;

  const canvas = renderer.domElement;
  canvas.className = 'farm__canvas';
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label',
    'Interactive three-dimensional model of a farm: rolling fields of crops moving ' +
    'in the wind, a barn, a grain silo, a windmill, a pond, a dirt track and a ' +
    'tractor driving along it. Drag to turn it, or use the arrow keys once it has focus.');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(CONFIG.color.fog, 52, 82);

  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.5, 400);
  /* the plate takes most of a phone screen, so the farm is read through a
     narrow band: close the camera in until it still reads there */
  const startScale = small ? 0.85 : 1;
  camera.position.set(CONFIG.camera.start.x * startScale,
                      CONFIG.camera.start.y * startScale,
                      CONFIG.camera.start.z * startScale);

  const bin = { geometries: new Set(), materials: new Set() };
  const keep = (o) => {
    if (o.geometry) bin.geometries.add(o.geometry);
    if (o.material) [].concat(o.material).forEach(m => bin.materials.add(m));
    return o;
  };

  buildSky(scene, bin);
  buildLights(scene, small);

  const farm = new THREE.Group();
  farm.name = 'farm';
  scene.add(farm);

  /* everything the frame loop moves registers itself here */
  const moving = {};

  const groups = {
    land:     buildLand(keep, small),
    water:    buildPond(keep, moving),
    crops:    buildCrops(keep, small),
    hedges:   buildHedges(keep, small),
    fences:   buildFences(keep),
    trees:    buildTrees(keep, moving),
    barn:     buildBarn(keep),
    silo:     buildSilo(keep),
    tank:     buildWaterTank(keep),
    windmill: buildWindmill(keep, moving),
    bales:    buildBales(keep),
    tractor:  buildTractor(keep, moving),
    birds:    buildBirds(keep, moving)
  };
  Object.keys(groups).forEach(k => { groups[k].name = k; farm.add(groups[k]); });

  /* --- controls -------------------------------------------------------- */
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping      = true;
  controls.dampingFactor      = CONFIG.motion.damping;
  controls.screenSpacePanning = false;
  controls.minDistance   = CONFIG.camera.minDist;
  controls.maxDistance   = CONFIG.camera.maxDist;
  controls.minPolarAngle = CONFIG.camera.minPolar;
  controls.maxPolarAngle = CONFIG.camera.maxPolar;
  controls.rotateSpeed   = 0.7;
  controls.panSpeed      = 0.6;
  controls.zoomSpeed     = 0.8;
  controls.autoRotate      = !reduce;
  controls.autoRotateSpeed = CONFIG.motion.autoRotate;
  controls.target.set(CONFIG.camera.target.x, CONFIG.camera.target.y, CONFIG.camera.target.z);

  /* The wheel belongs to the page until the visitor has deliberately gone
     into the scene. OrbitControls' wheel handler returns before it calls
     preventDefault when enableZoom is false, so the page scrolls normally. */
  controls.enableZoom = false;

  /* Same argument for one finger on a touch screen: a full-height hero that
     eats an upward swipe is a trap. Setting touches.ONE to a value matching
     no case falls through to STATE.NONE. */
  if (coarse) controls.touches.ONE = null;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

  controls.update();
  canvas.style.touchAction = coarse ? 'pan-y' : 'none';

  const panLim = CONFIG.camera.panLimit;
  const clampTarget = () => {
    const t = controls.target;
    t.x = Math.max(-panLim, Math.min(panLim, t.x));
    t.z = Math.max(-panLim, Math.min(panLim, t.z));
    t.y = Math.max(CONFIG.camera.panLimitY.min,
          Math.min(CONFIG.camera.panLimitY.max, t.y));
  };

  /* --- activation: the scroll contract --------------------------------- */
  let activated = false, pointerInside = false;
  const setActivated = (on) => {
    if (activated === on) return;
    activated = on;
    container.classList.toggle('is-live', on);
    if (coarse) {
      controls.touches.ONE = on ? THREE.TOUCH.ROTATE : null;
      canvas.style.touchAction = on ? 'none' : 'pan-y';
    }
    controls.enableZoom = on && (coarse || pointerInside);
    if (!on) canvas.blur();
    if (opts.onActivate) opts.onActivate(on);
  };

  const onEnter = () => { pointerInside = true;  if (activated && !coarse) controls.enableZoom = true; };
  const onLeave = () => { pointerInside = false; if (!coarse) controls.enableZoom = false; };
  const onDown  = () => { setActivated(true); container.classList.add('has-touched'); };
  const onFocus = () => { setActivated(true); container.classList.add('has-touched'); };
  const onKey   = (e) => {
    const s = CONFIG.motion.keyStep;
    if (e.key === 'Escape')          { setActivated(false); return; }
    if (e.key === 'ArrowLeft')       orbitBy(-s, 0);
    else if (e.key === 'ArrowRight') orbitBy(s, 0);
    else if (e.key === 'ArrowUp')    orbitBy(0, -s);
    else if (e.key === 'ArrowDown')  orbitBy(0, s);
    else if (e.key === '+' || e.key === '=') dollyBy(0.92);
    else if (e.key === '-' || e.key === '_') dollyBy(1.08);
    else return;
    e.preventDefault();
    nudgeIdle();
    dirty = true;
  };

  canvas.addEventListener('pointerenter', onEnter);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown',  onDown);
  canvas.addEventListener('focus',        onFocus);
  canvas.addEventListener('keydown',      onKey);

  /* OrbitControls binds arrows to panning, which is the wrong verb here, so
     the camera is moved on its own sphere instead — clamped by the same
     limits the mouse obeys. */
  const _sph = new THREE.Spherical();
  const _off = new THREE.Vector3();
  function orbitBy(dTheta, dPhi) {
    _off.copy(camera.position).sub(controls.target);
    _sph.setFromVector3(_off);
    _sph.theta += dTheta;
    _sph.phi = Math.max(CONFIG.camera.minPolar,
               Math.min(CONFIG.camera.maxPolar, _sph.phi + dPhi));
    _off.setFromSpherical(_sph);
    camera.position.copy(controls.target).add(_off);
    camera.lookAt(controls.target);
  }
  function dollyBy(f) {
    _off.copy(camera.position).sub(controls.target);
    const r = Math.max(CONFIG.camera.minDist,
              Math.min(CONFIG.camera.maxDist, _off.length() * f));
    camera.position.copy(controls.target).add(_off.setLength(r));
  }

  let idleTimer = 0;
  function nudgeIdle() {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
    if (reduce) return;
    idleTimer = setTimeout(() => { controls.autoRotate = true; dirty = true; start(); },
                           CONFIG.motion.idleResumeMs);
  }
  controls.addEventListener('start', nudgeIdle);
  controls.addEventListener('end',   nudgeIdle);
  /* the clamp rides the change event, not just the render loop, so it holds
     even when something drives the controls directly */
  controls.addEventListener('change', () => { clampTarget(); dirty = true; start(); });
  canvas.addEventListener('wheel', nudgeIdle, { passive: true });

  /* --- state the loop and resize share --------------------------------- */
  let raf = 0, dirty = true, visible = true, running = false;
  const animate = !reduce;          /* the scene is alive unless asked not to be */
  windUniforms.uWind.value = animate ? 1 : 0;

  /* --- size: measured from the container, not the window ---------------- */
  let w = 0, h = 0;
  function resize() {
    const r = container.getBoundingClientRect();
    const nw = Math.max(1, Math.round(r.width));
    const nh = Math.max(1, Math.round(r.height));
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /* --- loop ------------------------------------------------------------- */
  let frameMs = 0, frames = 0, acc = 0, clock = 0, last = performance.now();

  function frame() {
    raf = 0;
    if (!visible) { running = false; return; }

    const now = performance.now();
    /* a tab that was away must not teleport the tractor across the farm */
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (animate) {
      clock += dt;
      windUniforms.uTime.value = clock;
      tick(moving, clock, dt);
      dirty = true;
    }

    const camMoved = controls.update();
    if (camMoved) clampTarget();

    if (camMoved || dirty) {
      dirty = false;
      renderer.render(scene, camera);
      acc += performance.now() - now;
      if (++frames >= 30) { frameMs = acc / frames; frames = 0; acc = 0; }
    }

    if (animate || camMoved || controls.autoRotate) raf = requestAnimationFrame(frame);
    else running = false;           /* reduced motion, and nobody touching it */
  }
  function start() {
    if (running || !visible) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  /* Off screen: stop entirely. A hero canvas that keeps drawing while you
     read page four is a bug, and this one animates, so it matters more. */
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) { dirty = true; start(); }
    else if (raf) { cancelAnimationFrame(raf); raf = 0; running = false; }
  }, { threshold: 0.01 });
  io.observe(container);

  const onVis = () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; running = false; }
    else { dirty = true; start(); }
  };
  document.addEventListener('visibilitychange', onVis);

  /* Place everything once, even when nothing will animate: the birds have no
     instance matrices until tick() writes them, so a reduced-motion visitor
     would otherwise get the whole flock stacked at the origin. */
  tick(moving, 0, 0);

  renderer.render(scene, camera);
  container.classList.add('is-ready');
  start();

  /* --- dispose ---------------------------------------------------------- */
  function dispose() {
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(idleTimer);
    io.disconnect();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('pointerenter', onEnter);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerdown',  onDown);
    canvas.removeEventListener('focus',        onFocus);
    canvas.removeEventListener('keydown',      onKey);
    controls.dispose();
    scene.traverse((o) => {
      keep(o);
      /* the swaying shadows have their own materials, and they leak too */
      if (o.customDepthMaterial) bin.materials.add(o.customDepthMaterial);
    });
    bin.geometries.forEach(g => g.dispose());
    bin.materials.forEach(m => {
      Object.keys(m).forEach(k => { const v = m[k]; if (v && v.isTexture) v.dispose(); });
      m.dispose();
    });
    bin.geometries.clear();
    bin.materials.clear();
    renderer.dispose();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  return {
    dispose,
    release: () => setActivated(false),
    scene, camera, controls, renderer,
    stats: () => ({
      frameMs: +frameMs.toFixed(2),
      calls:      renderer.info.render.calls,
      triangles:  renderer.info.render.triangles,
      programs:   renderer.info.programs ? renderer.info.programs.length : 0,
      geometries: renderer.info.memory.geometries,
      textures:   renderer.info.memory.textures,
      running, visible, activated, animate,
      autoRotate: controls.autoRotate,
      zoom: controls.enableZoom
    }),
    home: () => {
      camera.position.set(CONFIG.camera.start.x * startScale,
                          CONFIG.camera.start.y * startScale,
                          CONFIG.camera.start.z * startScale);
      controls.target.set(CONFIG.camera.target.x, CONFIG.camera.target.y, CONFIG.camera.target.z);
      controls.update();
      dirty = true;
      renderer.render(scene, camera);
    },
    look: (theta, phi, dist) => {
      const s = new THREE.Spherical(dist, phi, theta);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
      camera.lookAt(controls.target);
      controls.update();
      dirty = true;
      renderer.render(scene, camera);
    },
    /* the harness freezes the clock to take comparable screenshots */
    setClock: (t) => { clock = t; windUniforms.uTime.value = t; tick(moving, t, 0); dirty = true; }
  };
}

/* ===========================================================================
   THE FRAME: everything that moves
   =========================================================================== */

const _v = new THREE.Vector3();
const _d = new THREE.Object3D();

function tick(m, t, dt) {
  const M = CONFIG.motionScene;

  /* the tractor works its way up and down the track */
  if (m.tractor) {
    const T = CONFIG.track, span = CONFIG.plot.size * 0.92;
    const cycle = (span * 2) / M.tractorSpeed;
    const p = (t % cycle) / cycle;
    const going = p < 0.5;
    const z = going ? -span / 2 + (p * 2) * span : span / 2 - ((p - 0.5) * 2) * span;
    const x = T.x + Math.sin(z * 0.14) * 0.5;
    const y = heightAt(x, z);
    m.tractor.g.position.set(x, y, z);
    /* the model faces +z, so this is a real heading now, not a guess */
    m.tractor.g.rotation.y = going ? 0 : Math.PI;
    /* the nose follows the camber, so it isn't a box sliding over hills */
    const ahead = heightAt(x, z + (going ? 1.4 : -1.4));
    m.tractor.g.rotation.x = Math.atan2(y - ahead, 1.4) * (going ? 1 : -1);
    /* derived from the clock, not integrated from dt: a dropped frame then
       costs nothing, and the same t always gives the same picture */
    m.tractor.wheels.forEach((wl, i) => {
      wl.rotation.z = -(M.tractorSpeed * t) / (i < 2 ? 0.62 : 0.36);
    });
  }

  if (m.windmill) m.windmill.rotation.z = t * (M.windmillRpm / 60) * Math.PI * 2;

  /* the canopies lean, out of phase with each other */
  if (m.canopies) {
    const { mesh, base } = m.canopies;
    for (let i = 0; i < base.length; i++) {
      const b = base[i];
      /* Amplitude the eye can actually catch. At a tenth of this the canopies
         were moving four hundredths of a unit — alive to a test, invisible to
         a reader, which is the wrong kind of true. */
      const s = Math.sin(t * 0.9 + b.ph) * 0.14 + Math.sin(t * 1.7 + b.ph * 1.6) * 0.07;
      _d.position.set(b.x + s * 0.6, b.y, b.z + s * 0.32);
      _d.rotation.set(b.rx + s * 0.45, b.ry, b.rz + s * 0.55);
      _d.scale.set(b.sx, b.sy, b.sz);
      _d.updateMatrix();
      mesh.setMatrixAt(i, _d.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /* birds circle, and flap */
  if (m.birds) {
    const { mesh, seeds } = m.birds;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const a = t * s.speed + s.phase;
      _d.position.set(Math.cos(a) * s.r,
                      s.y + Math.sin(t * 0.7 + s.phase) * 0.9,
                      Math.sin(a) * s.r);
      _d.rotation.set(Math.sin(t * 9 + s.phase) * 0.5, -a + Math.PI / 2, 0);
      _d.scale.setScalar(s.s);
      _d.updateMatrix();
      mesh.setMatrixAt(i, _d.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /* the pond is not a mirror; it is a surface with a little chop on it */
  if (m.water) {
    const { geo, base } = m.water;
    const pos = geo.attributes.position;
    const amp = CONFIG.motionScene.rippleAmp;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 2], y = base[i * 2 + 1];
      pos.setZ(i, Math.sin(x * 1.5 + t * 1.6) * amp
                + Math.sin(y * 1.9 - t * 1.15) * amp * 0.8);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
}

/* ===========================================================================
   SKY AND LIGHT
   =========================================================================== */

function buildSky(scene, bin) {
  const geo = new THREE.SphereGeometry(200, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top:    { value: new THREE.Color(CONFIG.color.zenith) },
      bottom: { value: new THREE.Color(CONFIG.color.horizon) }
    },
    vertexShader: `
      varying float vH;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vH = normalize(wp.xyz).y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; varying float vH;
      void main() {
        /* the whole fall sits in the first 20 degrees, because that is all of
           the dome a diorama camera ever has in frame */
        float t = smoothstep(-0.015, 0.17, vH);
        gl_FragColor = vec4(mix(bottom, top, t), 1.0);
      }`
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  scene.add(sky);
  bin.geometries.add(geo);
  bin.materials.add(mat);
}

function buildLights(scene, small) {
  const hemi = new THREE.HemisphereLight(0xD8C3A6, 0x463828, 1.45);
  hemi.name = 'skyBounce';
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xFFEBD2, 2.7);
  sun.name = 'sun';
  sun.position.set(-30, 27, 9);
  sun.castShadow = true;
  const m = small ? CONFIG.quality.shadowMapSmall : CONFIG.quality.shadowMap;
  sun.shadow.mapSize.set(m, m);
  /* the frustum is drawn tight around the plot: a loose one spends its
     resolution on empty haze and the shadows go to mush */
  const half = CONFIG.plot.size * 0.72;
  sun.shadow.camera.left = -half; sun.shadow.camera.right  = half;
  sun.shadow.camera.top  =  half; sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 6;     sun.shadow.camera.far    = 100;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.022;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 0, 0);

  /* a cold, shadowless fill from behind so the dark sides don't go flat */
  const fill = new THREE.DirectionalLight(0xA8BDD2, 0.62);
  fill.name = 'fill';
  fill.position.set(22, 13, 20);
  scene.add(fill);

  return sun;
}

const std = (color, rough, metal) => new THREE.MeshStandardMaterial({
  color,
  roughness: rough === undefined ? 0.92 : rough,
  metalness: metal === undefined ? 0 : metal
});

/* ===========================================================================
   THE LAND
   One displaced, vertex-painted mesh. Fields are regions of colour with noisy
   borders; nothing here is a slab stacked on another slab, which is what made
   the first pass read as a pile of boxes.
   =========================================================================== */

function buildLand(keep, small) {
  const g = new THREE.Group();
  const P = CONFIG.plot;
  const C = CONFIG.color;

  const seg = small ? P.segSmall : P.segments;
  const geo = new THREE.PlaneGeometry(P.size, P.size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));

    /* grass, mottled, so even the unplanted ground is not one flat green */
    c.set(C.grass).lerp(tmp.set(C.grass2), fbm(x * 0.19 + 5, z * 0.19 + 23, 3));

    /* each field lays its colour over whatever is already there */
    for (const f of CONFIG.fields) {
      const wgt = fieldWeight(x, z, f);
      if (wgt <= 0.001) continue;
      const pal = f.crop ? C.field : C.fallow;
      tmp.set(pal[f.tone % pal.length]);
      /* tone variation within the field: patches, not flat paint */
      const v = fbm(x * 0.55 + f.z, z * 0.55 + f.x, 2) - 0.5;
      tmp.offsetHSL(0, v * 0.06, v * 0.07);
      c.lerp(tmp, wgt);
    }

    /* the track, and a pair of darker ruts down it */
    const tw = trackWeight(x, z);
    if (tw > 0.001) {
      const rut = Math.exp(-Math.pow((Math.abs(x - CONFIG.track.x) - 0.85) * 3.4, 2));
      tmp.set(C.track).lerp(new THREE.Color(C.rut), rut * 0.85);
      c.lerp(tmp, tw);
    }

    /* the pond bed goes dark before the water even gets there */
    const D = CONFIG.pond;
    const pw = smooth(D.r * 1.15, D.r * 0.5, Math.hypot(x - D.x, z - D.z));
    if (pw > 0.001) c.lerp(tmp.set(0x3B3227), pw);

    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const land = keep(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.97, metalness: 0
  })));
  land.receiveShadow = true;
  land.castShadow = true;
  land.name = 'land';
  g.add(land);

  /* the cut edge, so the plot reads as a lifted block of country */
  const skirt = keep(new THREE.Mesh(
    new THREE.BoxGeometry(P.size, P.thickness, P.size), std(C.earth, 1)));
  skirt.position.y = -P.thickness / 2 - 0.35;
  skirt.castShadow = true; skirt.receiveShadow = true;
  skirt.name = 'skirt';
  g.add(skirt);

  /* the country beyond: rolling, and hazed out long before its edge */
  const aSeg = small ? P.apronSegSmall : P.apronSeg;
  const aGeo = new THREE.PlaneGeometry(P.size * P.apron, P.size * P.apron, aSeg, aSeg);
  aGeo.rotateX(-Math.PI / 2);
  const aPos = aGeo.attributes.position;
  const aCol = new Float32Array(aPos.count * 3);
  for (let i = 0; i < aPos.count; i++) {
    const x = aPos.getX(i), z = aPos.getZ(i);
    /* flat where it meets the plot, hillier the further out it goes */
    /* Distant country, not a berm. It starts further out and rises a third
       as far, so it reads as land receding rather than as a bank thrown up
       around the plot. */
    aPos.setY(i, apronHeightAt(x, z));
    /* and it is grazing country, so grass leads and the bare earth mottles it */
    c.set(C.grass).lerp(tmp.set(C.apron), 0.35 + fbm(x * 0.045, z * 0.045, 3) * 0.5);
    aCol[i * 3] = c.r; aCol[i * 3 + 1] = c.g; aCol[i * 3 + 2] = c.b;
  }
  aGeo.setAttribute('color', new THREE.BufferAttribute(aCol, 3));
  aGeo.computeVertexNormals();
  const apron = keep(new THREE.Mesh(aGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0
  })));
  apron.name = 'apron';
  g.add(apron);

  return g;
}

function buildPond(keep, moving) {
  const g = new THREE.Group();
  const D = CONFIG.pond;
  const geo = new THREE.CircleGeometry(D.r * 0.92, 64);
  /* the ripple is written into z BEFORE the mesh is rotated flat, so the
     rest positions have to be remembered */
  const pos = geo.attributes.position;
  const base = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { base[i * 2] = pos.getX(i); base[i * 2 + 1] = pos.getY(i); }

  const water = keep(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: CONFIG.color.water, roughness: 0.22, metalness: 0.25,
    emissive: new THREE.Color(CONFIG.color.waterHi), emissiveIntensity: 0.06
  })));
  water.rotation.x = -Math.PI / 2;
  water.position.set(D.x, heightAt(D.x, D.z) + D.depth * 0.42, D.z);
  water.receiveShadow = true;
  water.name = 'pond';
  g.add(water);

  moving.water = { geo, base };
  return g;
}

/* ===========================================================================
   CROPS — thousands of plants, three draw calls, and they move
   =========================================================================== */

function buildCrops(keep, small) {
  const g = new THREE.Group();
  const C = CONFIG.crops;
  const cap = small ? C.maxSmall : C.max;

  const pools = { grain: [], legume: [], ripe: [] };
  for (const f of CONFIG.fields) {
    if (!f.crop) continue;
    const x0 = f.x - f.w / 2 - 0.4, x1 = f.x + f.w / 2 + 0.4;
    const z0 = f.z - f.d / 2 - 0.4, z1 = f.z + f.d / 2 + 0.4;
    /* rows run with the field and jitter along their length, so the planting
       reads as drilled rather than as a lattice */
    for (let x = x0; x <= x1; x += C.rowGap) {
      for (let z = z0; z <= z1; z += C.plantGap) {
        const jx = x + (Math.random() - 0.5) * 0.13;
        const jz = z + (Math.random() - 0.5) * 0.2;
        if (fieldWeight(jx, jz, f) < 0.62) continue;   /* respect the soft border */
        if (trackWeight(jx, jz) > 0.25) continue;      /* nothing grows on the track */
        pools[f.crop].push([jx, jz]);
      }
    }
  }

  const total = pools.grain.length + pools.legume.length + pools.ripe.length;
  const keepRate = total > cap ? cap / total : 1;

  const dummy = new THREE.Object3D();
  const cA = new THREE.Color(CONFIG.color.cropA);
  const cB = new THREE.Color(CONFIG.color.cropB);
  const cR = new THREE.Color(CONFIG.color.cropC);
  const col = new THREE.Color();

  const sow = (name, spots, geo, lo, hi, strength, hMul) => {
    const used = spots.filter(() => Math.random() < keepRate);
    if (!used.length) return;
    const mesh = keep(new THREE.InstancedMesh(
      geo, makeWindy(std(0xFFFFFF, 0.86), strength, name), used.length));
    mesh.customDepthMaterial = windyDepth(strength, name);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    used.forEach((p, i) => {
      dummy.position.set(p[0], heightAt(p[0], p[1]) - 0.02, p[1]);
      dummy.rotation.set((Math.random() - 0.5) * 0.13, Math.random() * Math.PI,
                         (Math.random() - 0.5) * 0.13);
      dummy.scale.set(0.85 + Math.random() * 0.3,
                      (0.74 + Math.random() * 0.6) * hMul,
                      0.85 + Math.random() * 0.3);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col.copy(lo).lerp(hi, Math.random()));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    g.add(mesh);
  };

  /* grain: a slim tapered stalk */
  const grain = new THREE.CylinderGeometry(0.012, 0.032, C.height, 5);
  grain.translate(0, C.height / 2, 0);
  sow('cropGrain', pools.grain, grain, cA, cB, C.wind, 1);

  /* legumes: low and bushy, a different silhouette entirely */
  const legume = new THREE.IcosahedronGeometry(0.15, 0);
  legume.scale(1, 1.5, 1);
  legume.translate(0, 0.2, 0);
  sow('cropLegume', pools.legume, legume, cA, cB, C.wind * 0.5, 1.5);

  /* the ripe field: heavier heads, drier colour, more give in the wind */
  const ripe = new THREE.ConeGeometry(0.05, C.height * 1.15, 5);
  ripe.translate(0, C.height * 0.575, 0);
  sow('cropRipe', pools.ripe, ripe, cR, cB, C.wind * 1.25, 1);

  return g;
}

/* hedgerows: what a real field boundary looks like from the air, and the
   single thing that most stops the plot reading as coloured rectangles */
function buildHedges(keep, small) {
  const g = new THREE.Group();
  const H = CONFIG.hedge;
  const cap = small ? H.maxSmall : H.max;
  const spots = [];

  for (const f of CONFIG.fields) {
    const per = 2 * (f.w + f.d);
    const n = Math.floor(per / H.gap);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * per;
      let x, z;
      if (t < f.w)                { x = f.x - f.w / 2 + t;               z = f.z - f.d / 2; }
      else if (t < f.w + f.d)     { x = f.x + f.w / 2;                   z = f.z - f.d / 2 + (t - f.w); }
      else if (t < 2 * f.w + f.d) { x = f.x + f.w / 2 - (t - f.w - f.d); z = f.z + f.d / 2; }
      else                        { x = f.x - f.w / 2;                   z = f.z + f.d / 2 - (t - 2 * f.w - f.d); }
      x += (Math.random() - 0.5) * 0.5;
      z += (Math.random() - 0.5) * 0.5;
      if (trackWeight(x, z) > 0.2) continue;    /* the track cuts the hedge */
      spots.push([x, z]);
    }
  }
  const step = spots.length > cap ? spots.length / cap : 1;
  const used = [];
  for (let i = 0; i < spots.length; i += step) used.push(spots[i | 0]);
  if (!used.length) return g;

  const mesh = keep(new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.42, 0),
    makeWindy(std(CONFIG.color.hedge, 0.95), 0.05, 'hedge'),
    used.length));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'hedgerow';
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  const a = new THREE.Color(CONFIG.color.hedge);
  const b = new THREE.Color(CONFIG.color.canopy[1]);
  used.forEach((p, i) => {
    d.position.set(p[0], heightAt(p[0], p[1]) + H.height * 0.32, p[1]);
    d.rotation.set(Math.random(), Math.random(), Math.random());
    d.scale.set(0.8 + Math.random() * 0.7, 0.7 + Math.random() * 0.8, 0.8 + Math.random() * 0.7);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    /* biased toward the lighter canopy green: at close range a dark hedge
       reads as a heap of rocks, not as foliage */
    mesh.setColorAt(i, c.copy(a).lerp(b, 0.25 + Math.random() * 0.7));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  g.add(mesh);
  return g;
}

/* ===========================================================================
   FENCES — posts and rails, two draw calls for the whole perimeter
   =========================================================================== */

function buildFences(keep) {
  const g = new THREE.Group();
  const F = CONFIG.fence;
  const half = CONFIG.plot.size / 2 - F.inset;

  const posts = [];
  const side = half * 2;
  const n = Math.max(2, Math.round(side / F.postGap));
  const gap = side / n;
  for (let i = 0; i < n; i++) {
    const t = -half + i * gap;
    posts.push([t, -half], [half, t], [-t, half], [-half, -t]);
  }

  const pg = new THREE.CylinderGeometry(0.055, 0.075, F.height, 6);
  pg.translate(0, F.height / 2, 0);
  const pMesh = keep(new THREE.InstancedMesh(pg, std(CONFIG.color.fence, 0.95), posts.length));
  pMesh.castShadow = true;
  pMesh.name = 'fencePosts';
  const d = new THREE.Object3D();
  posts.forEach((p, i) => {
    d.position.set(p[0], heightAt(p[0], p[1]) - 0.05, p[1]);
    d.rotation.set((Math.random() - 0.5) * 0.07, Math.random(), (Math.random() - 0.5) * 0.07);
    d.scale.set(1, 0.9 + Math.random() * 0.2, 1);
    d.updateMatrix();
    pMesh.setMatrixAt(i, d.matrix);
  });
  pMesh.instanceMatrix.needsUpdate = true;
  g.add(pMesh);

  /* rails run post to post over the ground, so they tilt with it rather than
     floating level above a hill */
  const rails = [];
  for (let i = 0; i < posts.length; i += 4) {
    const nx = (i + 4) % posts.length;
    for (let s = 0; s < 4; s++) {
      const A = posts[i + s], B = posts[nx + s];
      if (!A || !B) continue;
      if (Math.hypot(B[0] - A[0], B[1] - A[1]) > F.postGap * 1.6) continue;
      rails.push([A, B]);
    }
  }
  const rMesh = keep(new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.06, 0.05), std(CONFIG.color.fence, 0.95), rails.length * 2));
  rMesh.castShadow = true;
  rMesh.name = 'fenceRails';
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  let k = 0;
  rails.forEach((r) => {
    [0.66, 0.33].forEach((yf) => {
      A.set(r[0][0], heightAt(r[0][0], r[0][1]) + F.height * yf - 0.05, r[0][1]);
      B.set(r[1][0], heightAt(r[1][0], r[1][1]) + F.height * yf - 0.05, r[1][1]);
      _v.copy(B).sub(A);
      d.position.copy(A).addScaledVector(_v, 0.5);
      d.scale.set(_v.length(), 1, 1);
      d.rotation.set(0, Math.atan2(-_v.z, _v.x), Math.asin(_v.y / _v.length()));
      d.updateMatrix();
      rMesh.setMatrixAt(k++, d.matrix);
    });
  });
  rMesh.count = k;
  rMesh.instanceMatrix.needsUpdate = true;
  g.add(rMesh);

  return g;
}

/* ===========================================================================
   TREES — three lobes to a canopy, so they read as foliage rather than dice
   =========================================================================== */

function buildTrees(keep, moving) {
  const g = new THREE.Group();
  const T = CONFIG.trees;
  const d = new THREE.Object3D();
  const c = new THREE.Color();

  const tg = new THREE.CylinderGeometry(0.15, 0.28, 1.9, 9);
  tg.translate(0, 0.95, 0);
  const trunks = keep(new THREE.InstancedMesh(tg, std(CONFIG.color.trunk, 0.98), T.length));
  trunks.castShadow = true; trunks.receiveShadow = true;
  trunks.name = 'treeTrunks';

  const round = T.filter(t => t.kind === 'round');
  const cone  = T.filter(t => t.kind === 'cone');

  /* detail 1 instead of 0: 80 faces instead of 20, which is the difference
     between a ball of leaves and a twenty-sided die */
  const LOBES = 3;
  const canopies = keep(new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1), std(0xFFFFFF, 0.95),
    Math.max(1, round.length * LOBES)));
  canopies.castShadow = true; canopies.receiveShadow = true;
  canopies.name = 'treeCanopies';

  /* conifers: three stacked tiers, not one cone */
  const TIERS = 3;
  const cones = keep(new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1.5, 12), std(0xFFFFFF, 0.95),
    Math.max(1, cone.length * TIERS)));
  cones.castShadow = true; cones.receiveShadow = true;
  cones.name = 'treeCones';

  T.forEach((t, i) => {
    d.position.set(t.x, heightAt(t.x, t.z) - 0.1, t.z);
    d.rotation.set(0, Math.random() * Math.PI, 0);
    d.scale.set(t.s, t.s, t.s);
    d.updateMatrix();
    trunks.setMatrixAt(i, d.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;

  /* the canopies are the only tree part that moves, so their rest state is
     remembered and the frame loop leans them from it */
  const base = [];
  round.forEach((t, i) => {
    const y0 = heightAt(t.x, t.z) - 0.1;
    for (let l = 0; l < LOBES; l++) {
      base.push({
        x: t.x + (Math.random() - 0.5) * 0.9 * t.s,
        y: y0 + (1.75 + (l === 0 ? 0 : (Math.random() - 0.2) * 0.7)) * t.s,
        z: t.z + (Math.random() - 0.5) * 0.9 * t.s,
        rx: Math.random(), ry: Math.random(), rz: Math.random(),
        sx: (1.05 - l * 0.16) * t.s, sy: (0.9 - l * 0.13) * t.s, sz: (1.05 - l * 0.16) * t.s,
        ph: Math.random() * Math.PI * 2
      });
      canopies.setColorAt(base.length - 1,
        c.set(CONFIG.color.canopy[(i + l) % CONFIG.color.canopy.length]));
    }
  });
  base.forEach((b, i) => {
    d.position.set(b.x, b.y, b.z);
    d.rotation.set(b.rx, b.ry, b.rz);
    d.scale.set(b.sx, b.sy, b.sz);
    d.updateMatrix();
    canopies.setMatrixAt(i, d.matrix);
  });
  canopies.count = base.length;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  moving.canopies = { mesh: canopies, base };

  let ci = 0;
  cone.forEach((t, i) => {
    const y0 = heightAt(t.x, t.z) - 0.1;
    for (let k = 0; k < TIERS; k++) {
      const f = 1 - k * 0.26;
      d.position.set(t.x, y0 + (0.8 + k * 0.85) * t.s, t.z);
      d.rotation.set(0, Math.random() * Math.PI, 0);
      d.scale.set(0.95 * f * t.s, 1.05 * t.s, 0.95 * f * t.s);
      d.updateMatrix();
      cones.setMatrixAt(ci, d.matrix);
      cones.setColorAt(ci, c.set(CONFIG.color.canopy[(i + k) % CONFIG.color.canopy.length]));
      ci++;
    }
  });
  cones.count = ci;
  cones.instanceMatrix.needsUpdate = true;
  if (cones.instanceColor) cones.instanceColor.needsUpdate = true;

  g.add(trunks, canopies, cones);
  return g;
}

/* ===========================================================================
   THE BARN — a plinth, boarded walls, a gable, a ridge and a cupola
   =========================================================================== */

function buildBarn(keep) {
  const B = CONFIG.barn;
  const C = CONFIG.color;
  const g = new THREE.Group();
  g.position.set(B.x, heightAt(B.x, B.z) - 0.1, B.z);
  g.rotation.y = B.rot;

  const add = (geo, mat, x, y, z, name) => {
    const m = keep(new THREE.Mesh(geo, mat));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    m.name = name;
    g.add(m);
    return m;
  };

  /* the plinth: a building on rolling ground needs a foot, or it looks dropped */
  add(new THREE.BoxGeometry(B.w + 0.5, 0.42, B.d + 0.5), std(C.plinth, 0.98),
      0, 0.21, 0, 'barnPlinth');
  add(new THREE.BoxGeometry(B.w, B.h, B.d), std(C.barn, 0.9), 0, B.h / 2 + 0.4, 0, 'barnBody');

  /* vertical boarding, one instanced draw for all four walls */
  const bat = new THREE.BoxGeometry(0.07, B.h * 0.94, 0.05);
  const batM = keep(new THREE.InstancedMesh(bat, std(C.barnDark, 0.94), 40));
  batM.castShadow = true;
  batM.name = 'barnBoards';
  const d = new THREE.Object3D();
  let bi = 0;
  for (let i = 0; i < 10; i++) {
    const t = -B.w / 2 + (i + 0.5) * (B.w / 10);
    [1, -1].forEach((s) => {
      d.position.set(t, B.h / 2 + 0.4, s * (B.d / 2 + 0.026));
      d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
      d.updateMatrix(); batM.setMatrixAt(bi++, d.matrix);
    });
  }
  for (let i = 0; i < 8; i++) {
    const t = -B.d / 2 + (i + 0.5) * (B.d / 8);
    [1, -1].forEach((s) => {
      d.position.set(s * (B.w / 2 + 0.026), B.h / 2 + 0.4, t);
      d.rotation.set(0, Math.PI / 2, 0); d.scale.set(1, 1, 1);
      d.updateMatrix(); batM.setMatrixAt(bi++, d.matrix);
    });
  }
  batM.count = bi;
  batM.instanceMatrix.needsUpdate = true;
  g.add(batM);

  /* A gable extruded from its own triangular profile. A three-sided cylinder
     also makes a prism, but its radius controls the pitch and the overhang at
     once, which put a roof on this barn half again too big. */
  const rise = B.h * 0.6, eave = B.d * 0.6, ridgeLen = B.w * 1.07;
  const profile = new THREE.Shape();
  profile.moveTo(-eave, 0); profile.lineTo(eave, 0); profile.lineTo(0, rise);
  profile.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(profile, { depth: ridgeLen, bevelEnabled: false });
  roofGeo.translate(0, 0, -ridgeLen / 2);
  roofGeo.rotateY(Math.PI / 2);
  add(roofGeo, std(C.roof, 0.85), 0, B.h + 0.4, 0, 'barnRoof');

  /* ridge cap and eaves: the lines that read as a built roof */
  add(new THREE.BoxGeometry(ridgeLen + 0.1, 0.14, 0.2), std(C.roofDark, 0.8),
      0, B.h + rise + 0.44, 0, 'barnRidge');
  [1, -1].forEach(s => add(new THREE.BoxGeometry(ridgeLen + 0.1, 0.1, 0.16),
      std(C.roofDark, 0.8), 0, B.h + 0.44, s * eave * 0.96, 'barnEave'));

  /* a cupola, the one detail that makes a shed read as a barn */
  add(new THREE.BoxGeometry(0.8, 0.7, 0.8), std(C.barnTrim, 0.9),
      B.w * 0.22, B.h + rise + 0.75, 0, 'cupola');
  add(new THREE.ConeGeometry(0.72, 0.55, 4), std(C.roofDark, 0.8),
      B.w * 0.22, B.h + rise + 1.38, 0, 'cupolaRoof');

  /* doorway: a recess, not a decal */
  const doorH = B.h * 0.64, doorW = 1.6;
  add(new THREE.BoxGeometry(doorW + 0.26, doorH + 0.22, 0.09), std(C.barnTrim, 0.9),
      0, doorH / 2 + 0.44, B.d / 2 + 0.03, 'barnDoorFrame');
  add(new THREE.BoxGeometry(doorW, doorH, 0.14), std(C.doorway, 1),
      0, doorH / 2 + 0.42, B.d / 2 - 0.05, 'barnDoorway');
  [-1, 1].forEach(s => add(new THREE.BoxGeometry(0.09, doorH * 0.96, 0.05),
      std(C.barnTrim, 0.9), s * doorW * 0.36, doorH / 2 + 0.42, B.d / 2 + 0.02, 'barnDoorBrace'));

  [-1, 1].forEach((side) => {
    [-1, 1].forEach((o) => {
      add(new THREE.BoxGeometry(0.12, 0.72, 0.92), std(C.doorway, 1),
          side * (B.w / 2 + 0.01), B.h * 0.64 + 0.4, o * B.d * 0.25, 'barnWindow');
      add(new THREE.BoxGeometry(0.07, 0.88, 1.08), std(C.barnTrim, 0.9),
          side * (B.w / 2 + 0.04), B.h * 0.64 + 0.4, o * B.d * 0.25, 'barnWindowFrame');
    });
  });

  /* a lean-to on the back, because a working barn always has one */
  const lean = new THREE.Shape();
  lean.moveTo(0, 0); lean.lineTo(1.9, 0); lean.lineTo(1.9, 1.05); lean.lineTo(0, 1.75);
  lean.closePath();
  const leanGeo = new THREE.ExtrudeGeometry(lean, { depth: B.w * 0.5, bevelEnabled: false });
  leanGeo.rotateY(Math.PI / 2);
  const lt = add(leanGeo, std(C.roof, 0.9), B.w * 0.25, 0.4, -B.d / 2 - 1.9, 'barnLeanTo');
  lt.rotation.y = Math.PI;

  return g;
}

/* ===========================================================================
   SILO, TANK, WINDMILL
   =========================================================================== */

function buildSilo(keep) {
  const S = CONFIG.silo;
  const C = CONFIG.color;
  const g = new THREE.Group();
  g.position.set(S.x, heightAt(S.x, S.z) - 0.1, S.z);

  const add = (geo, mat, y, name) => {
    const m = keep(new THREE.Mesh(geo, mat));
    m.position.y = y;
    m.castShadow = true; m.receiveShadow = true;
    m.name = name;
    g.add(m);
    return m;
  };

  add(new THREE.CylinderGeometry(S.r * 1.14, S.r * 1.2, 0.4, 32), std(C.plinth, 0.98),
      0.2, 'siloFoot');
  add(new THREE.CylinderGeometry(S.r, S.r, S.h, 32), std(C.silo, 0.62, 0.22),
      S.h / 2 + 0.35, 'siloBody');

  /* a domed cap turned on a lathe reads better than a cone at this size */
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.cos(a) * S.r * 1.1, Math.sin(a) * S.r * 0.95));
  }
  add(new THREE.LatheGeometry(pts, 32), std(C.siloCap, 0.7, 0.2), S.h + 0.35, 'siloCap');
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), std(C.metal, 0.5, 0.5),
      S.h + S.r * 0.95 + 0.55, 'siloVent');

  /* six corrugation bands, so the cylinder has a scale to read against */
  const d = new THREE.Object3D();
  const bands = keep(new THREE.InstancedMesh(
    new THREE.CylinderGeometry(S.r * 1.025, S.r * 1.025, 0.08, 32),
    std(C.siloCap, 0.7, 0.2), 6));
  bands.castShadow = true;
  bands.name = 'siloBands';
  for (let i = 0; i < 6; i++) {
    d.position.set(0, 0.5 + (i + 0.5) * (S.h / 6), 0);
    d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
    d.updateMatrix(); bands.setMatrixAt(i, d.matrix);
  }
  bands.instanceMatrix.needsUpdate = true;
  g.add(bands);

  /* a ladder up the side */
  const n = Math.floor(S.h / 0.34);
  const rungs = keep(new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.34, 0.035, 0.035), std(C.metal, 0.6, 0.4), n + 2));
  rungs.castShadow = true;
  rungs.name = 'siloLadder';
  for (let i = 0; i < n; i++) {
    d.position.set(0, 0.7 + i * 0.34, S.r + 0.06);
    d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
    d.updateMatrix(); rungs.setMatrixAt(i, d.matrix);
  }
  [-0.15, 0.15].forEach((o, i) => {
    d.position.set(o, 0.7 + (n * 0.34) / 2, S.r + 0.06);
    d.rotation.set(0, 0, Math.PI / 2);
    d.scale.set(n, 1, 1);
    d.updateMatrix(); rungs.setMatrixAt(n + i, d.matrix);
  });
  rungs.count = n + 2;
  rungs.instanceMatrix.needsUpdate = true;
  g.add(rungs);

  return g;
}

function buildWaterTank(keep) {
  const T = CONFIG.tank;
  const g = new THREE.Group();
  g.position.set(T.x, heightAt(T.x, T.z) - 0.1, T.z);

  const drum = keep(new THREE.Mesh(
    new THREE.CylinderGeometry(T.r, T.r, T.h, 24), std(CONFIG.color.tank, 0.55, 0.35)));
  drum.position.y = T.legs + T.h / 2;
  drum.castShadow = true; drum.receiveShadow = true;
  drum.name = 'tankDrum';
  g.add(drum);

  const lid = keep(new THREE.Mesh(
    new THREE.SphereGeometry(T.r * 1.02, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    std(CONFIG.color.siloCap, 0.7, 0.2)));
  lid.position.y = T.legs + T.h;
  lid.castShadow = true;
  lid.name = 'tankLid';
  g.add(lid);

  const legGeo = new THREE.CylinderGeometry(0.045, 0.055, T.legs, 6);
  legGeo.translate(0, T.legs / 2, 0);
  const legs = keep(new THREE.InstancedMesh(legGeo, std(CONFIG.color.metal, 0.65, 0.45), 8));
  legs.castShadow = true;
  legs.name = 'tankLegs';
  const d = new THREE.Object3D();
  let i = 0;
  const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  corner.forEach((p) => {
    d.position.set(p[0] * T.r * 0.62, 0, p[1] * T.r * 0.62);
    d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
    d.updateMatrix(); legs.setMatrixAt(i++, d.matrix);
  });
  /* cross-bracing, which is what stops it reading as a drum on sticks */
  corner.forEach((a, k) => {
    const b = corner[(k + 1) % 4];
    const ax = a[0] * T.r * 0.62, az = a[1] * T.r * 0.62;
    const bx = b[0] * T.r * 0.62, bz = b[1] * T.r * 0.62;
    d.position.set((ax + bx) / 2, T.legs * 0.45, (az + bz) / 2);
    d.rotation.set(0, -Math.atan2(bz - az, bx - ax), Math.PI / 2);
    d.scale.set(0.6, Math.hypot(bx - ax, bz - az) / T.legs, 0.6);
    d.updateMatrix(); legs.setMatrixAt(i++, d.matrix);
  });
  legs.count = i;
  legs.instanceMatrix.needsUpdate = true;
  g.add(legs);

  return g;
}

function buildWindmill(keep, moving) {
  const W = CONFIG.windmill;
  const C = CONFIG.color;
  const g = new THREE.Group();
  g.position.set(W.x, heightAt(W.x, W.z) - 0.1, W.z);

  const steel = std(C.metal, 0.55, 0.5);
  const d = new THREE.Object3D();

  /* a tapering lattice tower: four legs and their bracing rings */
  const legGeo = new THREE.BoxGeometry(0.07, 1, 0.07);
  legGeo.translate(0, 0.5, 0);
  const parts = keep(new THREE.InstancedMesh(legGeo, steel, 20));
  parts.castShadow = true;
  parts.name = 'windmillTower';
  const foot = 0.85, top = 0.24;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  let i = 0;
  corners.forEach((c) => {
    const ax = c[0] * foot, az = c[1] * foot;
    const bx = c[0] * top,  bz = c[1] * top;
    d.position.set(ax, 0, az);
    d.lookAt(bx, W.h, bz);
    d.rotateX(Math.PI / 2);
    d.scale.set(1, Math.hypot(bx - ax, W.h, bz - az), 1);
    d.updateMatrix(); parts.setMatrixAt(i++, d.matrix);
  });
  for (let r = 1; r <= 4; r++) {
    const f = r / 5;
    const s = foot + (top - foot) * f;
    for (let c = 0; c < 4; c++) {
      const a = corners[c], b = corners[(c + 1) % 4];
      const ax = a[0] * s, az = a[1] * s, bx = b[0] * s, bz = b[1] * s;
      d.position.set((ax + bx) / 2, W.h * f, (az + bz) / 2);
      d.rotation.set(0, -Math.atan2(bz - az, bx - ax), Math.PI / 2);
      d.scale.set(0.7, Math.hypot(bx - ax, bz - az), 0.7);
      d.updateMatrix(); parts.setMatrixAt(i++, d.matrix);
    }
  }
  parts.count = i;
  parts.instanceMatrix.needsUpdate = true;
  g.add(parts);

  /* the rotor, which is where the eye actually goes */
  const rotor = new THREE.Group();
  rotor.position.set(0, W.h + 0.1, 0.32);
  rotor.name = 'windmillRotor';
  const hub = keep(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 12), steel));
  hub.rotation.x = Math.PI / 2;
  hub.castShadow = true;
  rotor.add(hub);

  const bladeGeo = new THREE.BoxGeometry(0.9, 0.24, 0.02);
  bladeGeo.translate(0.55, 0, 0);
  const blades = keep(new THREE.InstancedMesh(bladeGeo, std(C.barnTrim, 0.7, 0.2), W.blades));
  blades.castShadow = true;
  blades.name = 'windmillBlades';
  for (let b = 0; b < W.blades; b++) {
    d.position.set(0, 0, 0);
    d.rotation.set(0.32, 0, (b / W.blades) * Math.PI * 2);
    d.scale.set(1, 1, 1);
    d.updateMatrix(); blades.setMatrixAt(b, d.matrix);
  }
  blades.instanceMatrix.needsUpdate = true;
  rotor.add(blades);
  g.add(rotor);

  /* the tail vane */
  const vane = keep(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.03), std(C.tractor, 0.7)));
  vane.position.set(0, W.h + 0.1, -1.0);
  vane.rotation.y = Math.PI / 2;
  vane.castShadow = true;
  vane.name = 'windmillVane';
  g.add(vane);

  moving.windmill = rotor;
  return g;
}

/* ===========================================================================
   HAY AND THE TRACTOR
   =========================================================================== */

function buildBales(keep) {
  const g = new THREE.Group();
  const mesh = keep(new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.55, 0.55, 1.0, 16),
    std(CONFIG.color.hay, 0.99), CONFIG.bales.length));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'hayBales';
  const d = new THREE.Object3D();
  CONFIG.bales.forEach((b, i) => {
    const y = heightAt(b.x, b.z) - 0.1;
    /* one stacked on the two below it: a stack reads as work in progress */
    d.position.set(b.x, y + (b.up ? 1.55 : 0.56), b.z);
    d.rotation.set(0, Math.random() * Math.PI, Math.PI / 2);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  g.add(mesh);
  return g;
}

function buildTractor(keep, moving) {
  /* it has no home of its own any more: the frame loop drives it along the
     track, and this is only where it stands before the first tick */
  const g = new THREE.Group();
  g.position.set(CONFIG.track.x, heightAt(CONFIG.track.x, -4), -4);

  /* The body is assembled nose-along-+x because that is the easy way to
     write it, but the track runs along z. This inner turn makes the model
     face +z once and for all, so the outer group carries heading and pitch
     and nothing has to remember the offset. */
  const body = new THREE.Group();
  body.rotation.y = -Math.PI / 2;
  body.name = 'tractorBody';
  g.add(body);

  const paint = std(CONFIG.color.tractor, 0.5, 0.12);
  const dark  = std(CONFIG.color.tractorDark, 0.85);
  const metal = std(CONFIG.color.metal, 0.45, 0.55);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9FB6C2, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.55
  });

  const add = (geo, mat, x, y, z, name) => {
    const m = keep(new THREE.Mesh(geo, mat));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    m.name = name;
    body.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(1.15, 0.5, 0.82), paint, 0.34, 0.86, 0, 'bonnet');
  add(new THREE.BoxGeometry(1.0, 0.2, 0.7), paint, 0.34, 1.16, 0, 'bonnetTop');
  add(new THREE.BoxGeometry(0.2, 0.2, 0.86), dark, 0.92, 0.86, 0, 'grille');
  [-1, 1].forEach(s => add(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 10), metal,
      0.9, 1.05, s * 0.3, 'headlamp'));

  /* the cab: posts and glass, not a solid block */
  add(new THREE.BoxGeometry(0.9, 0.6, 0.96), paint, -0.5, 0.78, 0, 'cabBase');
  const d = new THREE.Object3D();
  const post = new THREE.BoxGeometry(0.07, 0.72, 0.07);
  post.translate(0, 0.36, 0);
  const posts = keep(new THREE.InstancedMesh(post, dark, 4));
  posts.castShadow = true;
  posts.name = 'cabPosts';
  [[-0.88, -0.42], [-0.88, 0.42], [-0.12, -0.42], [-0.12, 0.42]].forEach((p, i) => {
    d.position.set(p[0], 1.08, p[1]);
    d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
    d.updateMatrix(); posts.setMatrixAt(i, d.matrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  body.add(posts);
  add(new THREE.BoxGeometry(0.86, 0.7, 0.9), glass, -0.5, 1.44, 0, 'cabGlass');
  add(new THREE.BoxGeometry(1.0, 0.07, 1.02), dark, -0.5, 1.83, 0, 'cabRoof');
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.72, 10), metal, 0.02, 1.5, 0.32, 'exhaust');

  const wheels = [];
  const wheel = (r, wdt, x, z, n) => {
    const w = new THREE.Group();
    w.position.set(x, r, z);
    w.name = n;
    const tyre = keep(new THREE.Mesh(new THREE.CylinderGeometry(r, r, wdt, 18), dark));
    tyre.rotation.x = Math.PI / 2;
    tyre.castShadow = true;
    w.add(tyre);
    const hub = keep(new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.42, r * 0.42, wdt + 0.03, 12), metal));
    hub.rotation.x = Math.PI / 2;
    w.add(hub);
    /* lugs, so a spinning wheel actually reads as spinning */
    const lugs = keep(new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.06, r * 2.02, wdt + 0.04), dark, 5));
    for (let i = 0; i < 5; i++) {
      d.position.set(0, 0, 0);
      d.rotation.set(0, 0, (i / 5) * Math.PI);
      d.scale.set(1, 1, 1);
      d.updateMatrix(); lugs.setMatrixAt(i, d.matrix);
    }
    lugs.instanceMatrix.needsUpdate = true;
    w.add(lugs);
    body.add(w);
    wheels.push(w);
  };
  wheel(0.62, 0.34, -0.6,  0.58, 'wheelRL');
  wheel(0.62, 0.34, -0.6, -0.58, 'wheelRR');
  wheel(0.36, 0.26,  0.66,  0.5, 'wheelFL');
  wheel(0.36, 0.26,  0.66, -0.5, 'wheelFR');

  moving.tractor = { g, wheels };
  return g;
}

/* ===========================================================================
   BIRDS
   =========================================================================== */

function buildBirds(keep, moving) {
  const g = new THREE.Group();
  const n = CONFIG.motionScene.birds;

  /* two triangles in a shallow V: cheaper than anything else that still
     reads as a bird at this distance */
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,   -0.5, 0.16, -0.28,   -0.5, 0.16, 0.28,
    0, 0, 0,    0.5, 0.16, 0.28,     0.5, 0.16, -0.28
  ], 3));
  geo.computeVertexNormals();

  const mesh = keep(new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({
    color: CONFIG.color.bird, roughness: 1, side: THREE.DoubleSide }), n));
  mesh.frustumCulled = false;
  mesh.name = 'birds';
  g.add(mesh);

  const seeds = [];
  for (let i = 0; i < n; i++) {
    seeds.push({
      r: CONFIG.motionScene.birdRadius * (0.7 + Math.random() * 0.7),
      y: CONFIG.motionScene.birdHeight * (0.75 + Math.random() * 0.6),
      speed: 0.16 + Math.random() * 0.12,
      phase: Math.random() * Math.PI * 2,
      s: 0.34 + Math.random() * 0.28
    });
  }
  moving.birds = { mesh, seeds };
  return g;
}

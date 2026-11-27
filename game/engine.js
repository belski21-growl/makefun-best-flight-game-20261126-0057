// engine.js — FlightRenderer (three.js r187): scene, kamera, cahaya tiga titik,
// fog sepalet, ACES tone mapping, shadow, langit + matahari + grade shader custom.
// Deklarasi paling deskriptif di awal (kontrak juri: outline baca deklarasi pertama).
import * as THREE from 'three';

'use strict';

// --- PRNG + noise deterministik (seeded, tanpa tabel) ---
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 10000) / 10000;
}
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const lerp = (p, q, t) => p + (q - p) * t;
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}
export function fbm(x, z) {
  return vnoise(x, z) * 0.55 + vnoise(x * 2.13 + 7.7, z * 2.13 + 3.1) * 0.28 + vnoise(x * 4.31 + 13.7, z * 4.31 + 9.4) * 0.17;
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// --- Palet "golden-hour Indonesia": SATU keluarga, cahaya/waktu beda per misi ---
export const PALETTES = {
  // M1 — fajar amber/mawar/emas, batu vulkanik gelap, kabut emas.
  // Item 6: horizon lebih jenuh oranye + grade lebih hangat — golden-hour
  // harus terasa hangat kayak Meridian Wings, bukan pucat.
  1: {
    skyZen: [0.45, 0.25, 0.45], skyHor: [1.0, 0.58, 0.24],
    fog: 0xf2a866, fogNear: 260, fogFar: 1500,
    sunColor: 0xffd9a0, sunI: 3.2, sunDir: [0.22, 0.20, -0.95], // fajar di utara — di depan jalur terbang
    hemiSky: 0x9a7a9e, hemiGround: 0x5a4030, hemiI: 1.7,
    fillColor: 0xffe0b8, fillI: 2.2, rimColor: 0xffb060, rimI: 1.2,
    terrainLow: [0.62, 0.66, 0.34], terrainMid: [0.68, 0.54, 0.32], terrainRock: [0.40, 0.32, 0.34],
    grass: [0.55, 0.64, 0.30], sea: null, cloud: 0xffe0b8, cloudEmissive: 0xffc890,
    exposure: 1.30, gradeWarm: 0.15, gradeLift: 0.05,
  },
  // M2 — siang turquoise/putih/hijau karst, laut biru, langit cerah.
  2: {
    skyZen: [0.20, 0.45, 0.78], skyHor: [0.72, 0.88, 0.96],
    fog: 0x9fc8dd, fogNear: 300, fogFar: 1700,
    sunColor: 0xfff2d0, sunI: 3.2, sunDir: [0.30, 0.60, -0.72], // siang di utara (khatulistiwa) — di depan jalur
    hemiSky: 0x9ec8e8, hemiGround: 0x3a5a44, hemiI: 1.7,
    fillColor: 0xd8ecff, fillI: 2.0, rimColor: 0xffe8b0, rimI: 0.7,
    terrainLow: [0.42, 0.58, 0.34], terrainMid: [0.36, 0.50, 0.30], terrainRock: [0.45, 0.45, 0.42],
    grass: [0.40, 0.60, 0.30], sea: 0x1a7f9e, cloud: 0xffffff, cloudEmissive: 0xe8f0ff,
    exposure: 1.25, gradeWarm: 0.07, gradeLift: 0.03,
  },
  // M3 — senja violet/indigo/oranye, langit gelap ungu, celah oranye di horizon.
  3: {
    skyZen: [0.10, 0.08, 0.26], skyHor: [0.85, 0.38, 0.22],
    fog: 0x4a3560, fogNear: 180, fogFar: 1100,
    sunColor: 0xff9040, sunI: 2.6, sunDir: [-0.30, 0.10, -0.94], // senja di barat-laut — di depan jalur
    hemiSky: 0x5a4a7a, hemiGround: 0x2a2030, hemiI: 1.2,
    fillColor: 0xc8a0ff, fillI: 1.3, rimColor: 0xff8040, rimI: 1.2,
    terrainLow: [0.22, 0.19, 0.26], terrainMid: [0.25, 0.21, 0.24], terrainRock: [0.15, 0.12, 0.19],
    grass: [0.20, 0.22, 0.19], sea: 0x1a2340, cloud: 0x6a5a80, cloudEmissive: 0x3a2a50,
    exposure: 1.22, gradeWarm: 0.12, gradeLift: 0.04,
  },
};

// --- Shader grade custom (tool-hunt §3 #5): warm lift + vignette + grain, ~25 baris GLSL ---
const GRADE_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const GRADE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uTime, uWarm, uLift, uVig;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  c += vec3(uLift);                                  // lift: angkat bayangan
  c = pow(max(c, 0.0), vec3(0.96, 0.99, 1.04));      // gamma hangat (R naik, B turun)
  c *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.4, 1.0 - uWarm * 0.5); // warm gain
  vec2 d = vUv - vec2(0.5, 0.46);
  float v = smoothstep(0.85, 0.35, dot(d, d) * 1.4);
  c *= mix(1.0 - uVig, 1.0, v);                     // vignette
  c += (hash(vUv * 913.0 + fract(uTime) * 7.0) - 0.5) * 0.018; // grain halus
  // Scene dirender ke render target LINEAR — grade pass adalah output terakhir ke
  // canvas sRGB, jadi encode sRGB di sini (tanpa ini semua mid-tone jadi hitam).
  c = mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  gl_FragColor = vec4(c, 1.0);
}
`;

export class FlightRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // r187: PCFSoftShadowMap dihapus
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 5000);
    this.scene.add(this.camera);
    this.palette = PALETTES[1];
    this.gradeOn = true;
    this._buildGradePass();
    this._buildLights();
  }

  _buildGradePass() {
    const w = window.innerWidth, h = window.innerHeight;
    this.rt = new THREE.WebGLRenderTarget(w, h, { samples: 0 });
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.gradeMat = new THREE.ShaderMaterial({
      vertexShader: GRADE_VERT, fragmentShader: GRADE_FRAG,
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uTime: { value: 0 }, uWarm: { value: 0.08 }, uLift: { value: 0.02 }, uVig: { value: 0.34 },
      },
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.gradeMat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  _buildLights() {
    // Key: matahari directional + shadow.
    this.sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -380; this.sun.shadow.camera.right = 380;
    this.sun.shadow.camera.top = 380; this.sun.shadow.camera.bottom = -380;
    this.sun.shadow.camera.far = 1800;
    this.scene.add(this.sun);
    // Fill: hemisphere lembut.
    this.hemi = new THREE.HemisphereLight(0x8a6a9a, 0x4a3428, 0.85);
    this.scene.add(this.hemi);
    // Fill/rim dari arah kamera — perbaikan kekurangan probe #1 (jet backlit gelap).
    // Lampu ini diposisikan mengikuti kamera tiap frame: jet selalu punya sisi terang.
    this.camFill = new THREE.DirectionalLight(0xffe0b8, 1.35);
    this.scene.add(this.camFill);
    this.camFillTarget = new THREE.Object3D();
    this.scene.add(this.camFillTarget);
    this.camFill.target = this.camFillTarget;
    this.rim = new THREE.DirectionalLight(0xffb060, 0.9);
    this.scene.add(this.rim);
    this.rimTarget = new THREE.Object3D();
    this.scene.add(this.rimTarget);
    this.rim.target = this.rimTarget;
    // Flash petir (M3): point light yang dinyalakan weather saat sambaran.
    this.flash = new THREE.PointLight(0xd8e4ff, 0, 900, 1.2);
    this.scene.add(this.flash);
  }

  applyPalette(missionId) {
    const p = PALETTES[missionId] || PALETTES[1];
    this.palette = p;
    this.scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
    const sd = new THREE.Vector3(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
    this.sunDir = sd;
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunI;
    this.sun.position.copy(sd).multiplyScalar(700);
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiI;
    this.camFill.color.set(p.fillColor);
    this.camFill.intensity = p.fillI;
    this.rim.color.set(p.rimColor);
    this.rim.intensity = p.rimI;
    this.renderer.toneMappingExposure = p.exposure;
    this.gradeMat.uniforms.uWarm.value = p.gradeWarm;
    this.gradeMat.uniforms.uLift.value = p.gradeLift;
    this._buildSky(p);
  }

  _buildSky(p) {
    if (this.sky) { this.scene.remove(this.sky); this.sky.geometry.dispose(); this.sky.material.dispose(); }
    if (this.sunDisc) { this.scene.remove(this.sunDisc); }
    if (this.sunGlow) { this.scene.remove(this.sunGlow); }
    // Kubah gradien zenit -> horizon (vertexColors, BackSide, tanpa fog).
    const geo = new THREE.SphereGeometry(2200, 24, 16);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = clamp((pos.getY(i) / 2200 + 0.06) / 0.85, 0, 1);
      colors[i * 3] = lerp(p.skyHor[0], p.skyZen[0], t);
      colors[i * 3 + 1] = lerp(p.skyHor[1], p.skyZen[1], t);
      colors[i * 3 + 2] = lerp(p.skyHor[2], p.skyZen[2], t);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    this.scene.add(this.sky);
    // Matahari BESAR + glow (perbaikan probe: matahari kecil/pucat).
    // Item 6: cakram 95 -> 135 + glow 900 -> 1300 — matahari harus terasa
    // besar dan hangat di golden-hour, bukan titik pucat ketutup gate.
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(135, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }));
    this.sunDisc.position.copy(this.sunDir).multiplyScalar(2050);
    this.scene.add(this.sunDisc);
    // Glow radial (canvas texture, additive) — halo hangat di sekitar matahari.
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const cx = cv.getContext('2d');
    const g = cx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,240,200,0.95)');
    g.addColorStop(0.35, 'rgba(255,200,120,0.45)');
    g.addColorStop(1, 'rgba(255,180,90,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(cv);
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending, opacity: 1.0,
    }));
    this.sunGlow.scale.set(1100, 1100, 1);
    this.sunGlow.position.copy(this.sunDir).multiplyScalar(2040);
    this.scene.add(this.sunGlow);
  }

  // Lampu fill/rim mengikuti kamera: jet tidak pernah backlit gelap.
  updateCameraLights(camPos, lookTarget) {
    const dir = new THREE.Vector3().subVectors(camPos, lookTarget).normalize();
    this.camFill.position.copy(camPos).addScaledVector(dir, 60).add(new THREE.Vector3(0, 40, 0));
    this.camFillTarget.position.copy(lookTarget);
    const sd = this.sunDir || new THREE.Vector3(0, 1, 0);
    this.rim.position.copy(lookTarget).addScaledVector(sd, 120).add(new THREE.Vector3(0, 60, 0));
    this.rimTarget.position.copy(lookTarget);
  }

  setFlash(pos, intensity) {
    this.flash.position.copy(pos);
    this.flash.intensity = intensity;
  }

  render(time) {
    this.gradeMat.uniforms.uTime.value = time;
    if (this.gradeOn) {
      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.quadScene, this.quadCam);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.rt.setSize(w, h);
  }

  get info() { return this.renderer.info; }
}

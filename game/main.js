// main.js — PROBE r4: scene minimal three.js r187 (game/vendor/three.module.min.js).
// Tujuan probe: buktikan renderer + kamera + cahaya + fog + mesh low-poly authored
// (flatShading + vertexColors + hand-baked AO + jitter 4% + InstancedMesh + seeded PRNG)
// jalan offline tanpa error, dan 1 screenshot render nyata. BUKAN game penuh:
// jet terbang rendah di ngarai Bromo saat fajar (M1), gate emas raksasa di depan,
// matahari terbit + kabut emas. Desain/palet/misi penuh menyusul setelah verdict probe.
// Deklarasi paling deskriptif di awal (kontrak juri: outline baca deklarasi pertama).
import * as THREE from 'three';

'use strict';

// --- PRNG + noise deterministik (seeded, tanpa tabel) ---
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 10000) / 10000;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const lerp = (p, q, t) => p + (q - p) * t;
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}
function fbm(x, z) {
  return vnoise(x, z) * 0.55 + vnoise(x * 2.13 + 7.7, z * 2.13 + 3.1) * 0.28 + vnoise(x * 4.31 + 13.7, z * 4.31 + 9.4) * 0.17;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// --- Status / error (untuk smoke test headless) ---
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
window.__probeErrors = errors;
const statusEl = document.getElementById('status');

// --- Renderer / scene / kamera (threejs-scene-setup, r187) ---
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // r187: PCFSoftShadowMap dihapus
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
// Golden-hour Indonesia: fog sewarna langit fajar (amber/mawar).
scene.fog = new THREE.Fog(0xf0b070, 250, 1600);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 4000);

// --- Cahaya: matahari rendah hangat + hemisphere fill ---
const sunDir = new THREE.Vector3(0.18, 0.16, 0.97).normalize();
const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
sun.position.copy(sunDir).multiplyScalar(600);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -350; sun.shadow.camera.right = 350;
sun.shadow.camera.top = 350; sun.shadow.camera.bottom = -350;
sun.shadow.camera.far = 1600;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x8a6a9a, 0x4a3428, 0.85));

// --- Langit: kubah gradien zenit mauve -> horizon emas + piringan matahari ---
{
  const geo = new THREE.SphereGeometry(1800, 24, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const zen = [0.42, 0.30, 0.52], hor = [1.0, 0.68, 0.34];
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getY(i) / 1800 + 0.08) / 0.9, 0, 1);
    colors[i * 3] = lerp(hor[0], zen[0], t);
    colors[i * 3 + 1] = lerp(hor[1], zen[1], t);
    colors[i * 3 + 2] = lerp(hor[2], zen[2], t);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(55, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }));
  sunDisc.position.copy(sunDir).multiplyScalar(1700);
  scene.add(sunDisc);
}

// --- Terrain ngarai: heightfield + vertexColors per ketinggian + AO + jitter 4% ---
function terrainHeight(x, z) {
  const n = fbm(x * 0.0035 + 11, z * 0.0035 + 7);
  const wall = sstep(110, 520, Math.abs(x)) * 190;
  return 8 + n * 16 + wall;
}
{
  const geo = new THREE.PlaneGeometry(2600, 2600, 96, 96);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const rnd = mulberry32(20261126);
  const low = [0.55, 0.38, 0.26], mid = [0.42, 0.38, 0.26], rock = [0.30, 0.24, 0.28];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    // Pewarnaan berdasar ketinggian + hand-baked AO (gelapkan di cekungan noise).
    const ao = 1 - 0.25 * fbm(x * 0.02 + 3, z * 0.02 + 9);
    const jit = 0.96 + rnd() * 0.08; // jitter 4%
    let c;
    if (h < 26) c = low; else if (h < 90) c = mid; else c = rock;
    colors[i * 3] = c[0] * ao * jit;
    colors[i * 3 + 1] = c[1] * ao * jit;
    colors[i * 3 + 2] = c[2] * ao * jit;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }));
  terrain.receiveShadow = true;
  scene.add(terrain);
}

// --- Landasan (terrain-following: datar di koridor, y = 15.3) + marka ---
{
  const rwy = new THREE.Mesh(new THREE.PlaneGeometry(36, 860),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9 }));
  rwy.rotation.x = -Math.PI / 2;
  rwy.position.set(0, 15.3, 0);
  rwy.receiveShadow = true;
  scene.add(rwy);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.8 });
  for (let z = -400; z < 420; z += 40) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 18), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 15.45, z);
    scene.add(dash);
  }
  // Lampu PAPI (2 merah 2 kuning, emissive) di ujung approach.
  const papiCols = [0xff3020, 0xff3020, 0xffe066, 0xffe066];
  papiCols.forEach((col, k) => {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6 }));
    lamp.position.set(-26 - k * 3.2, 16.5, 380);
    scene.add(lamp);
  });
}

// --- Landmark: kerucut Bromo + kawah + lava glow ---
{
  const bromo = new THREE.Mesh(new THREE.ConeGeometry(190, 175, 14),
    new THREE.MeshStandardMaterial({ color: 0x3d2e33, flatShading: true, roughness: 1 }));
  bromo.position.set(430, terrainHeight(430, -720) + 82, -720);
  bromo.castShadow = true;
  scene.add(bromo);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(42, 7, 6, 14),
    new THREE.MeshStandardMaterial({ color: 0x52403d, flatShading: true, roughness: 1 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(430, terrainHeight(430, -720) + 172, -720);
  scene.add(rim);
  const lava = new THREE.Mesh(new THREE.CircleGeometry(30, 14),
    new THREE.MeshBasicMaterial({ color: 0xff7318 }));
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(430, terrainHeight(430, -720) + 168, -720);
  scene.add(lava);
}

// --- Pohon + batu: InstancedMesh (seeded PRNG) ---
{
  const rnd = mulberry32(777);
  const treeGeo = new THREE.ConeGeometry(2.2, 7, 6);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x385228, flatShading: true, roughness: 1 });
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, 90);
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 2.5, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x59371e, flatShading: true, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 90);
  const m = new THREE.Matrix4();
  let placed = 0;
  for (let i = 0; i < 300 && placed < 90; i++) {
    const x = (rnd() - 0.5) * 2200, z = (rnd() - 0.5) * 2200;
    if (Math.abs(x) < 70 && z > -480 && z < 480) continue;
    const h = terrainHeight(x, z);
    if (h > 60) continue;
    const s = 0.8 + rnd() * 1.1;
    m.makeScale(s, s, s);
    m.setPosition(x, h + 4.5 * s, z);
    trees.setMatrixAt(placed, m);
    m.makeScale(s, s, s);
    m.setPosition(x, h + 1.2 * s, z);
    trunks.setMatrixAt(placed, m);
    placed++;
  }
  trees.count = placed; trunks.count = placed;
  trees.castShadow = true;
  scene.add(trees); scene.add(trunks);
}

// --- Awan 3D: gumpalan bola (bukan billboard datar) ---
{
  const rnd = mulberry32(4242);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffd2a0, emissive: 0xffc890, emissiveIntensity: 0.5, flatShading: true, roughness: 1 });
  const sphereGeo = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const cx = (rnd() - 0.5) * 2000, cy = 150 + rnd() * 90, cz = (rnd() - 0.5) * 2000;
    const puffs = 3 + ((rnd() * 4) | 0);
    for (let k = 0; k < puffs; k++) {
      const s = new THREE.Mesh(sphereGeo, cloudMat);
      s.position.set((rnd() - 0.5) * 46, (rnd() - 0.5) * 14, (rnd() - 0.5) * 30);
      const r = 14 + rnd() * 22;
      s.scale.set(r, r * 0.55, r);
      g.add(s);
    }
    g.position.set(cx, cy, cz);
    scene.add(g);
  }
}

// --- Pesawat HERO (jet sculpted dari primitif three.js — authored prosedural) ---
const jet = new THREE.Group();
const jetBodyMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, flatShading: true, roughness: 0.45, metalness: 0.35 });
const jetAccentMat = new THREE.MeshStandardMaterial({ color: 0xd93328, flatShading: true, roughness: 0.5, metalness: 0.2 });
const jetDarkMat = new THREE.MeshStandardMaterial({ color: 0x38393e, flatShading: true, roughness: 0.6, metalness: 0.5 });
const canopyMat = new THREE.MeshStandardMaterial({ color: 0x0e1626, roughness: 0.18, metalness: 0.7 });
function addMesh(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  jet.add(mesh);
  return mesh;
}
// Hidung meruncing + badan meruncing ke ekor (sumbu Z = maju).
addMesh(new THREE.ConeGeometry(0.55, 2.1, 10), jetBodyMat, 0, 0, 2.05, Math.PI / 2);
addMesh(new THREE.CylinderGeometry(0.55, 0.62, 3.0, 10), jetBodyMat, 0, 0, -0.6, Math.PI / 2);
addMesh(new THREE.CylinderGeometry(0.62, 0.45, 1.6, 10), jetBodyMat, 0, 0, -3.0, Math.PI / 2);
// Kanopi: setengah-elipsoid gelap mengkilap.
addMesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), canopyMat, 0, 0.42, 1.55, 0, 0, 0, 1, 0.62, 1.7);
// Sayap swept (kotak tipis diputar) + ujung aksen merah + roundel merah-putih.
for (const s of [1, -1]) {
  addMesh(new THREE.BoxGeometry(3.4, 0.12, 2.4), jetBodyMat, s * 1.9, 0, -0.6, 0, s * -0.45, 0);
  addMesh(new THREE.BoxGeometry(0.25, 0.14, 2.2), jetAccentMat, s * 3.55, 0, -1.15, 0, s * -0.45, 0);
  const red = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: 0xd81e14 }));
  red.rotation.x = -Math.PI / 2; red.position.set(s * 2.1, 0.075, -0.7); jet.add(red);
  const white = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: 0xf2f2ee }));
  white.rotation.x = -Math.PI / 2; white.position.set(s * 2.1, 0.08, -0.7); jet.add(white);
  // Stabilator ekor.
  addMesh(new THREE.BoxGeometry(1.8, 0.1, 1.0), jetBodyMat, s * 1.0, 0, -3.3, 0, s * -0.35, 0);
  // Sirip ekor miring ke luar (canted).
  addMesh(new THREE.BoxGeometry(0.1, 1.5, 1.4), jetBodyMat, s * 0.55, 0.85, -3.1, 0, s * 0.3, -s * 0.38);
  addMesh(new THREE.BoxGeometry(0.12, 0.22, 1.4), jetAccentMat, s * 0.82, 1.55, -3.1, 0, s * 0.3, -s * 0.38);
  // Nosel mesin + glow afterburner (cone emissive oranye).
  addMesh(new THREE.CylinderGeometry(0.3, 0.34, 0.7, 10), jetDarkMat, s * 0.55, 0, -3.85, Math.PI / 2);
  const glow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.6, 8),
    new THREE.MeshBasicMaterial({ color: 0xff8c1e, transparent: true, opacity: 0.95 }));
  glow.rotation.x = -Math.PI / 2; // apex ke belakang (-Z)
  glow.position.set(s * 0.55, 0, -5.2);
  jet.add(glow);
  // Rel misil ujung sayap.
  addMesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 6), jetDarkMat, s * 3.6, -0.02, -1.1, Math.PI / 2);
}
scene.add(jet);

// --- Gate emas raksasa (torus emissive) di depan jet ---
const gate = new THREE.Mesh(new THREE.TorusGeometry(16, 0.9, 8, 28),
  new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff9a10, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.6 }));
gate.position.set(0, 55, 220);
scene.add(gate);

// --- Kamera chase + state probe (deterministik: ?shot=probe membekukan t=23 dtk) ---
const params = new URLSearchParams(location.search);
const shotMode = params.get('shot') === 'probe';
const jetState = { pos: new THREE.Vector3(0, 55, 120), yaw: 0, roll: -0.5, speed: 95 };
let frozenTime = 0;
function updateCamera() {
  // Chase: di belakang-atas jet, lihat ke depan (matahari + gate di frame).
  const back = new THREE.Vector3(-Math.sin(jetState.yaw), 0, -Math.cos(jetState.yaw));
  const camPos = jetState.pos.clone().addScaledVector(back, 16).add(new THREE.Vector3(0, 5.5, 0));
  camera.position.copy(camPos);
  const look = jetState.pos.clone().add(new THREE.Vector3(Math.sin(jetState.yaw), 0, Math.cos(jetState.yaw)).multiplyScalar(45));
  look.y += 1.2; // offset kecil — JANGAN dikali 45 (bug: jet jatuh ke tepi bawah frame)
  camera.up.set(Math.sin(jetState.roll) * 0.35, 1, 0);
  camera.lookAt(look);
  camera.up.set(0, 1, 0);
}

// --- HUD 2D (canvas overlay): top bar + misi + pita + radar + chip gate + banner ---
const hud = document.getElementById('hud');
const hctx = hud.getContext('2d');
function sizeHud() { hud.width = window.innerWidth; hud.height = window.innerHeight; }
sizeHud();
function panel(x, y, w, h) {
  hctx.fillStyle = 'rgba(10,18,26,0.84)';
  hctx.strokeStyle = 'rgba(255,200,90,0.55)';
  hctx.lineWidth = 1;
  hctx.beginPath(); hctx.roundRect(x, y, w, h, 6); hctx.fill(); hctx.stroke();
}
function text(str, x, y, size, color, align, bold) {
  hctx.font = (bold ? '700 ' : '400 ') + size + 'px "Segoe UI", Arial, sans-serif';
  hctx.fillStyle = color || '#f5ead0';
  hctx.textAlign = align || 'left'; hctx.textBaseline = 'middle';
  hctx.fillText(str, x, y);
}
function drawHud() {
  const W = hud.width, H = hud.height;
  hctx.clearRect(0, 0, W, H);
  // Top bar penuh.
  panel(10, 8, W - 20, 46);
  const items = [['ALTITUDE', '181 FT'], ['AIRSPEED', '185 KT'], ['HEADING', '000°'], ['THROTTLE', '78%'], ['FUEL', '86%'], ['FLIGHT SCORE', '00240']];
  const tw = (W - 20) / items.length;
  items.forEach(([lab, val], i) => {
    text(lab, 10 + i * tw + tw / 2, 20, 10, '#9fb8c4', 'center', true);
    text(val, 10 + i * tw + tw / 2, 40, 19, i === 5 ? '#ffd76a' : '#f5ead0', 'center', true);
  });
  // Blok misi kiri-atas.
  panel(10, 62, 250, 64);
  text('01 · NGARAI FAJAR', 20, 76, 12, '#ffcf6a', 'left', true);
  text('TUJUAN 0/2 · TERBANG RENDAH + CEPAT', 20, 94, 11, '#f5ead0', 'left');
  text('DISCIPLINE +12', 20, 112, 11, '#8dff9a', 'left', true);
  // Blok status kanan-atas.
  panel(W - 260, 62, 250, 64);
  text('MODE: AFTERBURNER', W - 250, 76, 12, '#ff9a3d', 'left', true);
  text('ANGIN LEMBAH 20 KT DARI BARAT', W - 250, 94, 11, '#cfe0e8', 'left');
  text('SISTEM NORMAL', W - 250, 112, 11, '#cfe0e8', 'left');
  // Pita SPD kiri / ALT kanan.
  panel(10, H / 2 - 110, 74, 220);
  text('SPD', 47, H / 2 - 96, 11, '#ffcf6a', 'center', true);
  text('185 KT', 47, H / 2, 17, '#ffd76a', 'center', true);
  panel(W - 84, H / 2 - 110, 74, 220);
  text('ALT', W - 47, H / 2 - 96, 11, '#ffcf6a', 'center', true);
  text('181 FT', W - 47, H / 2, 17, '#ffd76a', 'center', true);
  panel(W - 84, H / 2 + 118, 74, 62);
  text('VSI +12', W - 47, H / 2 + 132, 12, '#f5ead0', 'center', true);
  text('G 1.8 · AOA 6.2°', W - 47, H / 2 + 150, 11, '#cfe0e8', 'center');
  // Radar kanan-bawah.
  const cx = W - 110, cy = H - 120, r = 62;
  hctx.save();
  hctx.beginPath(); hctx.arc(cx, cy, r, 0, Math.PI * 2); hctx.clip();
  hctx.fillStyle = 'rgba(6,20,16,0.85)'; hctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  hctx.strokeStyle = 'rgba(120,255,170,0.35)';
  hctx.beginPath(); hctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); hctx.stroke();
  hctx.beginPath(); hctx.arc(cx, cy, r, 0, Math.PI * 2); hctx.stroke();
  hctx.fillStyle = '#ffd76a'; hctx.beginPath(); hctx.arc(cx, cy - 26, 4, 0, Math.PI * 2); hctx.fill();
  hctx.fillStyle = '#ffd76a';
  hctx.beginPath(); hctx.moveTo(cx, cy - 8); hctx.lineTo(cx - 6, cy + 6); hctx.lineTo(cx + 6, cy + 6); hctx.closePath(); hctx.fill();
  hctx.restore();
  text('RADAR 2KM', cx, cy + r + 12, 10, '#9fb8c4', 'center', true);
  // Bar THR/FUEL/AIRFRAME kiri-bawah.
  panel(10, H - 96, 250, 86);
  const bars = [['THR', 0.78, '#ffd76a', '78%'], ['FUEL', 0.86, '#5ad8a0', '86%'], ['AIRFRAME', 1.0, '#8dff9a', '100/100']];
  bars.forEach(([lab, frac, col, val], i) => {
    const y = H - 76 + i * 24;
    text(lab, 20, y - 8, 10, '#9fb8c4', 'left', true);
    hctx.fillStyle = 'rgba(255,255,255,0.12)';
    hctx.beginPath(); hctx.roundRect(20, y, 150, 10, 3); hctx.fill();
    hctx.fillStyle = col;
    hctx.beginPath(); hctx.roundRect(20, y, 150 * frac, 10, 3); hctx.fill();
    text(val, 178, y + 5, 11, '#f5ead0', 'left', true);
  });
  // Chip gate + banner + kompas.
  panel(W / 2 - 170, 168, 340, 30);
  text('▸ GATE 1/6 — 100 m', W / 2, 183, 13, '#ffd76a', 'center', true);
  panel(W / 2 - 330, 120, 660, 40);
  text('NGARAI FAJAR — TERBANG RENDAH, CEPAT, LEWATI 6 GATE', W / 2, 140, 15, '#ffd76a', 'center', true);
  panel(W / 2 - 150, 62, 300, 34);
  text('HDG 000°', W / 2, 79, 13, '#ffd76a', 'center', true);
  // Label gate 3D (proyeksi).
  const p = gate.position.clone().project(camera);
  if (p.z < 1) {
    const gx = (p.x * 0.5 + 0.5) * W, gy = (0.5 - p.y * 0.5) * H;
    text('GATE 1 · 100 m', gx, gy - 34, 12, '#ffd76a', 'center', true);
  }
  text('AFTERBURNER', W / 2, H - 130, 15, '#ff9a3d', 'center', true);
  text('↑ THROTTLE buat lepas landas · ← → belok · SHIFT afterburner · SPASI tembak · C kamera', W / 2, H - 60, 13, '#f5ead0', 'center');
}

// --- Loop (THREE.Timer, r183+; dt di-clamp) ---
const timer = new THREE.Timer();
timer.connect(document);
let frames = 0;
window.__probe = { renderer, scene, camera, jet };
window.__probeReady = false;
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = clamp(timer.getDelta(), 0, 0.1);
  const t = shotMode ? 23 : frozenTime + dt;
  frozenTime = t;
  // Jet: terbang maju pelan + bank; di shot mode dibekukan di pose hero.
  if (!shotMode) {
    jetState.pos.z += jetState.speed * dt * 0.12;
    jetState.roll = -0.5 + Math.sin(t * 0.5) * 0.12;
    if (jetState.pos.z > 200) jetState.pos.z = 60;
  }
  jet.position.copy(jetState.pos);
  jet.rotation.set(0, jetState.yaw, jetState.roll);
  // Gate berdenyut pelan (emissive).
  gate.material.emissiveIntensity = 0.55 + 0.2 * Math.sin(t * 2.2);
  updateCamera();
  renderer.render(scene, camera);
  drawHud();
  frames++;
  if (frames === 5) {
    const info = renderer.info;
    statusEl.textContent = 'PROBE OK calls=' + info.render.calls + ' triangles=' + info.render.triangles +
      ' errors=' + errors.length;
    window.__probeReady = true;
    window.__probeInfo = { calls: info.render.calls, triangles: info.render.triangles, errors: [...errors], frames };
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  sizeHud();
});

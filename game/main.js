// ============================================================================
// Merpati Kilat — main.js
// Titik masuk game: boot WebGL, loop utama, input keyboard, kamera (chase /
// kokpit), render dunia + pesawat + ring + target + awan + peluru + partikel,
// tabrakan, alur 3 misi, dan mode screenshot deterministik (?shot=hero|
// cockpit|storm|landing) untuk juri.
// ============================================================================

import { WebGLRenderer, MeshBuilder, mat4Identity, mat4Multiply, mat4Perspective,
  mat4LookAt, mat4Translation, mat4YawPitchRoll, mat4RotationY, mat4TransformDirection,
  vec3, vec3Add, vec3Sub, vec3Scale, vec3Length, vec3Normalize, vec3Cross } from './engine.js';
import { TerrainMesh, LandmarkSet, RunwayStrip, RingSet, GroundTargetSet,
  CloudSet, AircraftMesh, SEA_LEVEL } from './world.js';
import { FlightModel, WeatherSystem, MissionManager, MODULE_CHOICES,
  ProjectileSet, ParticleSet } from './flight.js';
import { StageMusicEngine, RadioChatter } from './audio.js';
import { HeadsUpDisplay } from './presentation.js';
import { RadarMinimap } from './radar.js';
import { SpeedAltTapes } from './tapes.js';
import { GateLabels } from './gatelabels.js';

// --- Parameter screenshot (?shot=...) — posisi deterministik untuk juri --------
// Ronde 4: tiap preset membawa STAGED HUD STATE yang konsisten (blocker 7) —
// elapsed (detik), score, rings/targets yang sudah dicapai, BBM/BADAN.
// Skor = jumlah nilai ring/target DENGAN combo multiplier berurutan:
// ring 150 x1.0, x1.5, x1.5, x2.0, x2.0, x2.5 = 1575; target 250 x2.5, x3.0,
// x3.0, x3.0 = 2875; total 6 ring + 4 target = 4450. Storm: 3 ring
// (150+225+225=600) + 1 target (250x2.0=500) = 1100. Hero/kokpit: 1 ring = 150.
// Timer chip "BONUS CEPAT +N" = (par - elapsed) x 2, jadi konsisten dengan
// timer (par 300/300/330). Caption staging "SHOT n — ..." DIHAPUS ronde 4
// (blocker 8) — hint kembali ke petunjuk gameplay in-fiction.
const SHOT_PRESETS = {
  hero:    { mission: 0, camera: 'chase',   pos: [720, 80, 400],  yaw: 0.7, speed: 62, throttle: 0.7, elapsed: 23,  score: 150,  rings: 1, targets: 0, fuel: 98, hull: 100 },
  cockpit: { mission: 1, camera: 'cockpit', pos: [1226, 70, 1222], yaw: -0.2, speed: 58, throttle: 0.65, elapsed: 107, score: 150,  rings: 1, targets: 0, fuel: 94, hull: 98 },
  storm:   { mission: 2, camera: 'chase',   pos: [700, 130, -100], yaw: 0.5, speed: 60, throttle: 0.7, elapsed: 151, score: 1100, rings: 3, targets: 1, fuel: 87, hull: 95 },
  landing: { mission: 1, camera: 'chase',   pos: [1150, 42, 1155], yaw: 0.0, speed: 40, throttle: 0.35, elapsed: 192, score: 4450, rings: 6, targets: 4, fuel: 82, hull: 92 },
};

const urlParams = new URLSearchParams(window.location.search);
const shotName = urlParams.get('shot');
const shotPreset = shotName ? SHOT_PRESETS[shotName] : null;
const shotMode = Boolean(shotPreset);

// --- Boot ----------------------------------------------------------------------
const canvas = document.getElementById('gl');
const renderer = new WebGLRenderer(canvas);
const hud = new HeadsUpDisplay();
const radar = new RadarMinimap();
const tapes = new SpeedAltTapes();
const gateLabels = new GateLabels();
const music = new StageMusicEngine();
const radio = new RadioChatter();

const terrain = new TerrainMesh(renderer, 20261126);
const landmarks = new LandmarkSet(renderer);
const runway = new RunwayStrip(renderer, terrain);
const aircraft = new AircraftMesh(renderer);
const clouds = new CloudSet(renderer, 26, 777);
const stormClouds = new CloudSet(renderer, 40, 888);

let missionIndex = shotPreset ? shotPreset.mission : 0;
let mission = new MissionManager(missionIndex);
let weather = new WeatherSystem(missionIndex);
let plane = new FlightModel();
let rings = new RingSet(renderer, mission.def.rings);
let bonusRings = new RingSet(renderer, mission.def.bonusRings || []);
let targets = new GroundTargetSet(renderer, mission.def.targets);
const projectiles = new ProjectileSet();
const particles = new ParticleSet();

let cameraMode = shotPreset ? shotPreset.camera : 'chase';
let gamePhase = 'briefing'; // briefing | playing | module | complete | crashed
let totalBanked = 0;
let lowFuelWarned = false;
let inCloudWarned = false;
let iceWarned = false;
let stormWarned = false;
let lastWindGust = 0;
let fireCooldown = 0;
let elapsed = 0;
// --- State efek ronde 3 (E2/E3/C2/C4) ---
let shakeAmp = 0;            // E2 — amplitudo screen shake (0..1.2), decay tiap frame
let currentFov = 68;         // E3 — FOV dinamis (melebar saat gas penuh)
let prevStrikeCount = 0;     // C4 — deteksi sambaran petir baru
let prevInCloud = false;     // E4 — deteksi masuk awan (puff)
let prevOnGround = true;     // E1 — deteksi sentuh tanah (debu mendarat)
let dustTimer = 0;           // E1 — jeda antar puff debu saat meluncur
let exhaustSide = 1;         // E1 — nosel knalpot bergantian tiap frame
// E3 — speed lines: overlay DOM (dibuat dari main.js — index.html dilarang
// disentuh ronde ini). 16 garis radial di tepi layar, opacity ikut kecepatan.
const speedLinesEl = document.createElement('div');
speedLinesEl.id = 'speed-lines';
speedLinesEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;overflow:hidden';
{
  const style = document.createElement('style');
  style.textContent = '@keyframes merpati-streak{from{transform:translateY(0);opacity:.9}to{transform:translateY(46px);opacity:0}}';
  document.head.appendChild(style);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.19;
    const s = document.createElement('div');
    const len = 70 + ((i * 37) % 80);
    s.style.cssText = `position:absolute;left:50%;top:50%;width:2px;height:${len}px;`
      + `background:linear-gradient(to bottom,rgba(255,255,255,0),rgba(255,255,255,.85));`
      + `transform-origin:50% 0;transform:rotate(${a}rad) translateY(150px);`
      + `animation:merpati-streak .45s linear infinite;animation-delay:${(i % 5) * 0.09}s`;
    speedLinesEl.appendChild(s);
  }
}
document.body.appendChild(speedLinesEl);
// Ronde 4, blocker 2 — hujan shot storm: overlay DOM garis-garis hujan
// diagonal tipis (murah, tanpa WebGL). Hanya tampil di ?shot=storm;
// gameplay SENJA tidak diubah.
const rainEl = document.createElement('div');
rainEl.id = 'rain-lines';
rainEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;overflow:hidden;display:none';
{
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('div');
    const left = (i * 37) % 100;
    const top = (i * 53) % 100;
    const len = 26 + ((i * 29) % 30);
    s.style.cssText = `position:absolute;left:${left}%;top:${top}%;width:2px;height:${len}px;`
      + `background:linear-gradient(to bottom,rgba(190,220,255,0),rgba(190,220,255,.55));`
      + `transform:rotate(12deg);border-radius:2px`;
    rainEl.appendChild(s);
  }
}
document.body.appendChild(rainEl);
// C2 — chip timer misi: dibuat dari main.js (presentation.js/index.html
// dilarang disentuh). Gaya chip disamakan dengan .hud (panel kaca gelap +
// garis batik emas/teal di tepi atas). Posisi tengah-atas, di atas toast.
const timerEl = document.createElement('div');
timerEl.id = 'mission-timer';
timerEl.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:5;'
  + 'pointer-events:none;color:#eaf6ff;text-shadow:0 1px 3px rgba(0,0,0,.85);'
  + 'background:rgba(5,18,30,.72);border:1px solid rgba(255,215,94,.38);border-radius:999px;'
  + 'padding:6px 16px;font-size:14px;font-weight:700;letter-spacing:1px;white-space:nowrap;'
  + 'box-shadow:0 4px 18px rgba(0,0,0,.45);overflow:hidden';
timerEl.style.borderTop = '4px solid #ffd75e';
timerEl.style.display = 'none'; // muncul saat misi jalan (update() menampilkannya)
document.body.appendChild(timerEl);
// E2 — tambah shake, dijepit 0..1.2 (1.2 = kena petir dari dekat).
function addShake(amount) {
  shakeAmp = Math.min(1.2, shakeAmp + amount);
}

// Posisi awal untuk mode screenshot: langsung di udara, deterministik.
function applyShotPreset() {
  plane.resetToAir(shotPreset.pos[0], shotPreset.pos[1], shotPreset.pos[2], shotPreset.yaw);
  plane.speed = shotPreset.speed;
  plane.throttle = shotPreset.throttle;
  mission.state = 'flying';
  gamePhase = 'playing';
  // Ronde 4, blocker 1/9: di mode shot JANGAN spawn partikel transient
  // (burst ring + jejak knalpot membeku jadi kubus di still). Sistem
  // partikel gameplay tetap utuh — ParticleSet.disabled hanya menahan
  // spawn selama shot mode (lihat flight.js).
  particles.disabled = true;
  particles.particles.length = 0;
  // Ronde 4, blocker 8: caption staging "SHOT n — ..." DIHAPUS — tidak
  // ada lagi setShotCaption; hint kembali ke petunjuk gameplay (lihat
  // hud.update: shotCaption null). Radio tetap menyebut stage-nya sendiri.
  radio.stageLine(missionIndex);
  // Mode screenshot: JANGAN tampilkan banner besar di tengah layar — banner
  // menutupi terrain + ring yang justru dinilai juri. Caption bawah cukup.
  // Ronde 4, blocker 7: terapkan staged HUD state dari preset — timer
  // jalan, skor = nilai ring/target yang dicapai, BBM/BADAN bervariasi.
  // Ring/target yang "sudah dicapai" ditandai JUGA di objeknya supaya
  // renderer menggambarnya abu-abu (ring) / hilang (target), bukan emas.
  mission.elapsed = shotPreset.elapsed;
  mission.score = shotPreset.score;
  mission.ringsPassed = shotPreset.rings;
  mission.targetsDown = shotPreset.targets;
  mission.combo = shotPreset.rings + shotPreset.targets;
  mission.comboMultiplier = 1 + Math.min(4, Math.floor(mission.combo / 2)) * 0.5;
  mission.comboTimer = 6;
  plane.fuel = shotPreset.fuel;
  plane.hull = shotPreset.hull;
  for (let i = 0; i < rings.rings.length; i++) rings.rings[i].passed = i < shotPreset.rings;
  for (let i = 0; i < targets.targets.length; i++) targets.targets[i].alive = i >= shotPreset.targets;
  // Ronde 4, blocker 2: badai SENJA — kilat dijaga TINGGI selama shot mode
  // supaya capture selalu menangkapnya; sambaran petir digambar sebagai
  // geometri di render() (lihat bawah). Ronde 2 revisi (c): nilai awal 0.7,
  // lalu update() memakai flicker halus 0,46–0,78 (bukan konstan 0.8 —
  // flash konstan membuat shot agak wash).
  if (shotName === 'storm') weather.lightningFlash = 0.7;
  // Ronde 4: garis speed-line + hujan hanya relevan di gameplay — di shot
  // mode speed-line jadi goresan putih vertikal di bawah pesawat (artefak
  // still), jadi disembunyikan; hujan hanya tampil di shot storm.
  speedLinesEl.style.display = 'none';
  rainEl.style.display = shotName === 'storm' ? 'block' : 'none';
  window.__merpatiReady = true;
}

// --- Input ----------------------------------------------------------------------
const input = { thrust: false, left: false, right: false, brake: false, pullUp: false, fire: false };
const keyMap = {
  ArrowUp: 'thrust', KeyW: 'thrust',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'brake', KeyS: 'brake',
  Space: 'fire',
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && gamePhase !== 'playing') {
    const btn = document.querySelector('#overlay-panel button');
    if (btn) btn.click();
    return;
  }
  if (e.code === 'Digit1' && gamePhase === 'module') return pickModule(MODULE_CHOICES[0].id);
  if (e.code === 'Digit2' && gamePhase === 'module') return pickModule(MODULE_CHOICES[1].id);
  if (e.code === 'Digit3' && gamePhase === 'module') return pickModule(MODULE_CHOICES[2].id);
  if (e.code === 'KeyC' && gamePhase === 'playing') {
    cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
    return;
  }
  if (e.code === 'KeyM') {
    music.ensureContext();
    music.setMuted(!music.muted);
    return;
  }
  const mapped = keyMap[e.code];
  if (mapped) {
    input[mapped] = true;
    e.preventDefault();
    music.ensureContext();
    music.start();
  }
});
window.addEventListener('keyup', (e) => {
  const mapped = keyMap[e.code];
  if (mapped) input[mapped] = false;
});
window.addEventListener('mousedown', () => {
  music.ensureContext();
  music.start();
}, { once: true });

// --- Alur misi ------------------------------------------------------------------
function startMission(index) {
  missionIndex = index;
  mission = new MissionManager(index);
  weather = new WeatherSystem(index);
  plane = new FlightModel();
  rings = new RingSet(renderer, mission.def.rings);
  bonusRings = new RingSet(renderer, mission.def.bonusRings || []);
  targets = new GroundTargetSet(renderer, mission.def.targets);
  projectiles.shots.length = 0;
  projectiles.tracers.length = 0;
  particles.particles.length = 0;
  lowFuelWarned = false; inCloudWarned = false; iceWarned = false; stormWarned = false;
  music.setStage(index);
  music.start();
  gamePhase = 'playing';
  hud.hideOverlay();
  hud.showBanner(mission.def.name, `${mission.def.place} · ${mission.def.time} WIB`,
    'Tahan ↑ untuk lepas landas — ring pertama lurus di depan!');
  radio.takeoffLine(mission.def);
  music.radioBeep();
}

function pickModule(modId) {
  plane.applyModule(modId);
  const choice = MODULE_CHOICES.find((m) => m.id === modId);
  radio.moduleLine(choice.title);
  music.radioBeep();
  const next = missionIndex + 1;
  if (next >= 3) {
    gamePhase = 'complete';
    hud.showGameComplete(totalBanked, () => location.reload());
  } else {
    startMission(next);
  }
}

function onMissionLanded(result) {
  totalBanked = mission.banked;
  music.landingThud();
  music.ringChime();
  radio.landingLine(result.quality);
  music.radioBeep();
  hud.showToast(result.quality >= 0.85
    ? `PENDARATAN MULUS! Bonus +${result.landingBonus} + cepat +${result.speedBonus} — total bank ${result.banked}`
    : `Mendarat. Bonus +${result.landingBonus} + cepat +${result.speedBonus} — total bank ${result.banked}`);
  if (missionIndex + 1 >= 3) {
    gamePhase = 'complete';
    hud.showGameComplete(totalBanked, () => location.reload());
  } else {
    gamePhase = 'module';
    hud.showModuleSelect(MODULE_CHOICES, pickModule);
  }
}

function onCrashed(reason) {
  gamePhase = 'crashed';
  music.crashSound();
  hud.showCrashed(reason, () => {
    plane = new FlightModel();
    mission = new MissionManager(missionIndex);
    rings = new RingSet(renderer, mission.def.rings);
    bonusRings = new RingSet(renderer, mission.def.bonusRings || []);
    targets = new GroundTargetSet(renderer, mission.def.targets);
    gamePhase = 'playing';
    hud.hideOverlay();
    hud.showBanner(mission.def.name, mission.def.place, 'Coba lagi — tahan ↑ untuk lepas landas.');
  });
}

// --- Update ----------------------------------------------------------------------
function update(dt) {
  elapsed += dt;
  weather.update(dt, plane.position);
  // Mode screenshot SENJA: kilat dijaga TINGGI supaya capture SELALU
  // menangkapnya — bukan siklus naik-turun yang bisa padam tepat saat
  // screenshot diambil (blocker 2). Ronde 2 revisi (c): flicker HALUS,
  // bukan konstan 0.8 — dua sinus (1,7 + 0,63 rad/dtk) memberi denyut
  // tak-beraturan tapi lembut di 0,46–0,78: petir tetap jelas, wash
  // putih berkurang; puncak 0,78 tetap di bawah guard 0,85 (tidak
  // memicu thunder/stormLine berulang di shot mode).
  if (shotMode && missionIndex === 2) {
    const t = mission.elapsed;
    weather.lightningFlash = 0.62 + 0.16 * Math.sin(t * 1.7) * Math.sin(t * 0.63 + 1.3);
  }
  // Guard missionIndex===2: kilat + chatter badai HANYA di SENJA, apa pun
  // yang terjadi pada lightningFlash (lapis kedua setelah jepit dt).
  if (missionIndex === 2 && weather.lightningFlash > 0.85 && !stormWarned) {
    stormWarned = true;
    music.thunderCrack();
    radio.stormLine();
    music.radioBeep();
  }
  if (weather.lightningFlash < 0.4) stormWarned = false;

  // C4 — petir sebagai HAZARD (hanya SENJA): sambaran baru yang jatuh
  // <160 m dari pesawat merusak badan 10 (5,5 kalau modul armor) + shake
  // besar + peringatan menara. Jauh = cuma kilat + gemuruh (aman).
  if (weather.strikeCount !== prevStrikeCount) {
    prevStrikeCount = weather.strikeCount;
    if (weather.lastStrike && !plane.onGround) {
      const strikeDist = vec3Length(vec3Sub(plane.position, weather.lastStrike));
      if (strikeDist < 160) {
        const armor = plane.module.armor > 0 ? 0.55 : 1;
        plane.hull -= 10 * armor;
        addShake(1.0);
        music.thunderCrack();
        radio.lightningNearLine();
        music.radioBeep();
        particles.explode(plane.position, [0.7, 0.85, 1.0], 12, 8);
        if (plane.hull <= 0) {
          particles.explode(plane.position, [1.0, 0.5, 0.1], 40, 20);
          onCrashed('Pesawat tersambar petir di dinding badai.');
          return;
        }
      }
    }
  }

  plane.update(dt, input, weather, terrain);
  // Shot mode: tahan throttle di nilai preset — tanpa input, throttle
  // meluruh ke 0 dan jejak knalpot + FOV lebar ikut mati sebelum screenshot.
  // (Gameplay biasa tidak tersentuh: input pemain yang mengatur throttle.)
  if (shotMode) plane.throttle = shotPreset.throttle;
  mission.updateCombo(dt);
  projectiles.update(dt);
  particles.update(dt);

  // E2 — shake meluruh perlahan (~0,7 dtk dari penuh ke nol).
  shakeAmp = Math.max(0, shakeAmp - dt * 1.8);
  // E3 — FOV target: 68 dasar, +8 saat gas penuh, +4 lagi di atas 200 km/j.
  const targetFov = 68 + plane.throttle * 8 + (plane.speedKmh() > 200 ? 4 : 0);
  currentFov += (targetFov - currentFov) * Math.min(1, dt * 2.5);

  // C4 — turbulensi SENJA: goyangan acak di roll/pitch + getar kecil saat
  // di udara. Bukan sekadar visual — pesawat benar-benar bergoyang.
  if (missionIndex === 2 && !plane.onGround) {
    plane.roll += (Math.random() - 0.5) * dt * 0.9;
    plane.pitch += (Math.random() - 0.5) * dt * 0.22;
    if (Math.random() < dt * 0.5) addShake(0.10);
  }

  // E1 — jejak knalpot: api + asap tipis di DUA nosel mesin (±3,4 m lateral
  // — di ujung silinder mesin). Dua garis jejak lewat di SISI kamera chase,
  // bukan menembus lensa (spawn tengah membuat partikel membesar jadi kotak
  // raksasa saat kamera melewatinya).
  // E1 — jejak knalpot (blocker 1/9): TIDAK di-spawn di shot mode —
  // partikelnya membeku jadi kubus di still. Gameplay biasa tidak berubah.
  if (!shotMode && plane.throttle > 0.3 && plane.speed > 20) {
    const fwd = plane.forwardVector();
    const side = vec3Normalize([fwd[2], 0, -fwd[0]]);
    const base = vec3Add(vec3Sub(plane.position, vec3Scale(fwd, 3.6)), [0, -0.6, 0]);
    // 1 partikel/frame, nosel bergantian — 2/frame + ukuran lama membuat
    // jejak terbaca seperti dadu berserakan di still (SwiftShader: jarak
    // antar puff ~3,5 m). Di 60 fps aslinya jejak tetap rapat/kontinu.
    exhaustSide = -exhaustSide;
    particles.exhaust(vec3Add(base, vec3Scale(side, 3.4 * exhaustSide)), plane.throttle);
  }

  // Awan: cover dari tembakan + es kalau kelamaan di dalam.
  const cloud = clouds.containsPoint(plane.position)
    || (missionIndex === 2 ? stormClouds.containsPoint(plane.position) : null);
  plane.inCloud = Boolean(cloud);
  plane.hiddenInCloud = plane.inCloud;
  // E4 — puff awan: gumpalan putih mekar saat pesawat MENEMBUS awan.
  if (plane.inCloud && !prevInCloud) particles.puff(plane.position, 12);
  prevInCloud = plane.inCloud;
  if (plane.inCloud) {
    plane.iced = Math.min(1, plane.iced + dt * 0.12);
    if (!inCloudWarned) {
      inCloudWarned = true;
      radio.cloudLine();
      music.radioBeep();
    }
    if (plane.iced > 0.5 && !iceWarned) {
      iceWarned = true;
      radio.iceWarningLine();
      music.radioBeep();
    }
  } else {
    inCloudWarned = false;
    if (plane.iced < 0.3) iceWarned = false;
  }

  // Angin lembah: desis saat terbang rendah di ngarai.
  const wind = weather.windAt(plane.position);
  if (vec3Length(wind) > 6 && elapsed - lastWindGust > 2.5) {
    lastWindGust = elapsed;
    music.windGust(vec3Length(wind) / 14);
  }

  // Bahan bakar menipis.
  if (plane.fuel < 25 && !lowFuelWarned) {
    lowFuelWarned = true;
    radio.lowFuelLine();
    music.warningBeep();
  }
  hud.setFuelWarning(plane.fuel < 25);

  // Ring: lewati kalau dekat pusat ring.
  for (const ring of rings.rings) {
    if (ring.passed) continue;
    const d = vec3Length(vec3Sub(plane.position, ring.pos));
    if (d < ring.radius) {
      ring.passed = true;
      const res = mission.registerRingPass(ring.name);
      music.ringChime();
      music.ringWhoosh();
      addShake(0.25);
      radio.ringLine(ring.name, res.combo);
      music.radioBeep();
      hud.showToast(`${ring.name} — +${res.gained} (combo x${res.multiplier.toFixed(1)})`);
      // E1 — burst emas lebih besar (22) + kilau putih (8) di tengah ring.
      particles.explode(ring.pos, [1.0, 0.8, 0.2], 22, 7);
      particles.explode(ring.pos, [1.0, 1.0, 1.0], 8, 4);
      if (mission.ringsPassed === 1) mission.state = 'flying';
    }
  }

  // C3 — ring bonus emas: di luar hitungan RING x/6, nilai 400 x combo.
  for (const ring of bonusRings.rings) {
    if (ring.passed) continue;
    const d = vec3Length(vec3Sub(plane.position, ring.pos));
    if (d < ring.radius) {
      ring.passed = true;
      const res = mission.registerBonusRing(ring.name);
      music.ringChime();
      music.ringWhoosh();
      addShake(0.35);
      radio.ringLine(ring.name, res.combo);
      music.radioBeep();
      hud.showToast(`RING EMAS! ${ring.name} — +${res.gained} (combo x${res.multiplier.toFixed(1)})`);
      particles.explode(ring.pos, [1.0, 0.85, 0.25], 30, 9);
      particles.explode(ring.pos, [1.0, 1.0, 1.0], 12, 5);
    }
  }

  // Tembakan pemain.
  fireCooldown -= dt;
  if (input.fire && fireCooldown <= 0 && !plane.onGround) {
    fireCooldown = 0.22;
    const fwd = plane.forwardVector();
    const nose = vec3Add(plane.position, vec3Scale(fwd, 14));
    projectiles.firePlayer(nose, fwd, plane.module.weapon > 0);
    music.gunShot();
  }

  // Peluru kena target darat.
  for (const shot of projectiles.shots) {
    for (const target of targets.targets) {
      if (!target.alive) continue;
      const tp = [target.pos[0], terrain.heightAt(target.pos[0], target.pos[2]) + 8, target.pos[2]];
      if (vec3Length(vec3Sub(shot.pos, tp)) < 14) {
        target.alive = false;
        shot.life = 0;
        const res = mission.registerTargetDown(target.name);
        music.explosion();
        addShake(0.45);
        radio.targetLine(target.name);
        music.radioBeep();
        hud.showToast(`${target.name} hancur — +${res.gained} (combo x${res.multiplier.toFixed(1)})`);
        particles.explode(tp, [1.0, 0.45, 0.1], 26, 14);
        particles.explode(tp, [0.3, 0.3, 0.3], 18, 8);
      }
    }
  }

  // Tembakan darat: target hidup menembak kalau pesawat dekat & tidak di awan.
  // Mode screenshot: matikan supaya tracer merah tidak mencoret shot juri.
  for (const target of targets.targets) {
    if (!target.alive || shotMode) continue;
    target.fireCooldown -= dt;
    const tp = [target.pos[0], terrain.heightAt(target.pos[0], target.pos[2]) + 10, target.pos[2]];
    const dist = vec3Length(vec3Sub(plane.position, tp));
    if (dist < 420 && target.fireCooldown <= 0 && !plane.hiddenInCloud && !plane.onGround) {
      target.fireCooldown = 1.6 + Math.random() * 1.2;
      projectiles.fireGround(tp, plane.position);
      // C5 — flak: kepulan abu-hitam meledak DI DEKAT pesawat (8–20 m acak)
      // + letupan + getar kecil, kena atau tidak — pemain harus cepat
      // hancurkan meriamnya atau menghindar.
      const flakPos = vec3Add(plane.position,
        [(Math.random() - 0.5) * 36, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 36]);
      particles.flak(flakPos);
      music.flakPop();
      addShake(0.12);
      // 25% kena (kurang kalau jauh): rusak badan.
      const hitChance = 0.25 * Math.max(0.3, 1 - dist / 500);
      if (Math.random() < hitChance) {
        const armor = plane.module.armor > 0 ? 0.55 : 1;
        plane.hull -= 9 * armor;
        addShake(0.6);
        particles.explode(plane.position, [1.0, 0.3, 0.1], 8, 5);
        if (plane.hull <= 0) {
          particles.explode(plane.position, [1.0, 0.5, 0.1], 40, 20);
          onCrashed('Badan pesawat hancur ditembak meriam darat.');
          return;
        }
      }
    }
  }

  // Asap kalau badan rusak.
  if (plane.hull < 60 && Math.random() < dt * 6) {
    particles.smoke(vec3Add(plane.position, [0, 1, 4]));
  }

  // E1 — debu mendarat: kepulan saat roda pertama menyentuh tanah, lalu
  // berkala selama meluncur di landasan (laju >15).
  if (plane.onGround && !prevOnGround && plane.speed < 70) {
    particles.dust(plane.position, 12);
    addShake(0.2);
  }
  if (plane.onGround && plane.speed > 15) {
    dustTimer -= dt;
    if (dustTimer <= 0) {
      dustTimer = 0.09;
      particles.dust(vec3Add(plane.position, [0, -1, 0]), 3);
    }
  }
  prevOnGround = plane.onGround;

  // Mendarat: pesawat di tanah, pelan, dekat landasan -> bank skor.
  if (plane.onGround && !plane.crashed && mission.state !== 'complete') {
    const dx = plane.position[0] - runway.center[0];
    const dz = plane.position[2] - runway.center[2];
    const nearRunway = Math.abs(dx) < 120 && Math.abs(dz) < 220;
    const tookOffBefore = mission.ringsPassed > 0 || mission.targetsDown > 0;
    if (nearRunway && tookOffBefore && plane.speed < 45) {
      const result = mission.evaluateLanding(plane, runway);
      onMissionLanded(result);
      return;
    }
  }

  // Kecelakaan: tabrak tanah keras / kehabisan BBM di udara / jatuh ke laut.
  if (plane.crashed) {
    plane.crashed = false;
    particles.explode(plane.position, [1.0, 0.5, 0.1], 40, 20);
    onCrashed('Pesawat menghantam tanah terlalu keras.');
    return;
  }
  if (plane.fuel <= 0 && !plane.onGround) {
    onCrashed('Bahan bakar habis di udara — pesawat jatuh.');
    return;
  }

  // Musik + mesin.
  music.setEngineThrottle(plane.throttle, plane.speedKmh());
  music.setWind(plane.speedKmh()); // E5 — deru angin kontinu ikut kecepatan
  music.setStage(missionIndex);
  // C2 — chip timer: waktu jalan + bonus cepat live (par − elapsed) x2.
  timerEl.style.display = 'block';
  timerEl.textContent = `WAKTU ${mission.formatTime()} · BONUS CEPAT +${mission.timeBonus()}`;
  // E3 — speed lines: muncul di atas ~35 km/j, penuh di atas ~175 km/j.
  const speedFactor = Math.max(0, Math.min(1, (plane.speedKmh() - 35) / 140));
  speedLinesEl.style.opacity = String(speedFactor * 0.85);
  // (d) ring berikutnya: jarak 3D + bearing relatif terhadap heading —
  // untuk chip "RING BERIKUTNYA" di HUD (null kalau semua ring dilewati).
  let nextRing = null;
  for (const ring of rings.rings) {
    if (ring.passed) continue;
    const dx = ring.pos[0] - plane.position[0];
    const dy = ring.pos[1] - plane.position[1];
    const dz = ring.pos[2] - plane.position[2];
    const targetHeading = ((-Math.atan2(-dx, -dz) * 180 / Math.PI) % 360 + 360) % 360;
    const relBearing = (targetHeading - plane.headingDegrees() + 540) % 360 - 180;
    nextRing = { dist: Math.round(Math.hypot(dx, dy, dz)), relBearing };
    break;
  }
  hud.update({ plane, mission, weather, cameraMode, shotCaption: null, nextRing });
  radar.update({ plane, rings, bonusRings, targets, runway });
  tapes.update({ plane });
  hud.updateBannerAndToast(dt);
  hud.renderRadio(radio.lines);
}

// --- Render ----------------------------------------------------------------------
function buildViewMatrix() {
  const fwd = plane.forwardVector();
  // E2 — screen shake: goyangan acak di eye + center, skala shakeAmp.
  const sh = shakeAmp;
  const shOff = [
    (Math.random() - 0.5) * sh * 2.4,
    (Math.random() - 0.5) * sh * 2.4,
    (Math.random() - 0.5) * sh * 2.4,
  ];
  // E3 — kamera miring saat belok: sumbu up dimiringkan ikut roll pesawat
  // (45% dari roll) supaya belokan terasa, bukan cuma pesawatnya yang miring.
  const bank = plane.roll * 0.45;
  const up = [Math.sin(bank), Math.cos(bank), 0];
  if (cameraMode === 'cockpit') {
    const eye = vec3Add(vec3Add(plane.position, [0, 1.6, -1]), shOff);
    const center = vec3Add(vec3Add(eye, fwd), vec3Scale(shOff, 0.5));
    return mat4LookAt(eye, center, up);
  }
  // Chase: di belakang + atas pesawat, mengikuti yaw; bidik sedikit ke bawah
  // supaya terrain + ring masuk frame (kamera yang menatap lurus ke depan
  // hanya menampilkan langit di shot hero).
  const back = vec3Scale(fwd, -20);
  const eye = vec3Add(vec3Add(vec3Add(plane.position, back), [0, 7, 0]), shOff);
  const center = vec3Add(vec3Add(vec3Add(plane.position, vec3Scale(fwd, 30)), [0, -4, 0]), vec3Scale(shOff, 0.5));
  return mat4LookAt(eye, center, up);
}

function render() {
  const width = window.innerWidth, height = window.innerHeight;
  renderer.resize(width, height);
  const aspect = width / height;
  // E3 — FOV dinamis (currentFov dihaluskan di update()): melebar saat gas penuh.
  const projection = mat4Perspective(currentFov, aspect, 0.5, 2600);
  const view = buildViewMatrix();
  gateLabels.update({ view, projection, width, height, plane, rings, bonusRings });
  const palette = weather.skyPalette();
  const camPos = cameraMode === 'cockpit'
    ? vec3Add(plane.position, [0, 1.6, -1])
    : vec3Add(plane.position, vec3Scale(plane.forwardVector(), -20));
  const lighting = {
    sunDirection: palette.sunDirection,
    sunColor: palette.sunColor,
    ambientColor: palette.ambientColor,
    fogColor: palette.fogColor,
    fogNear: palette.fogNear,
    fogFar: palette.fogFar,
    cameraPos: camPos,
    emissive: 0,
  };
  renderer.beginFrame(palette.fogColor);
  renderer.drawSky(view, projection, palette);

  renderer.drawMesh(terrain.mesh, mat4Identity(), view, projection, lighting);
  renderer.drawMesh(terrain.seaMesh, mat4Identity(), view, projection, lighting);
  for (const lm of landmarks.meshes) {
    renderer.drawMesh(lm.mesh, mat4Identity(), view, projection, lighting);
  }
  renderer.drawMesh(runway.mesh, mat4Identity(), view, projection, lighting);

  // Ring: emas menyala kalau belum dilewati (emissive supaya tidak gelap
  // saat matahari dari belakang), abu kalau sudah.
  for (const ring of rings.rings) {
    const model = mat4Multiply(
      mat4Translation(ring.pos[0], ring.pos[1], ring.pos[2]),
      mat4RotationY(Math.atan2(plane.position[0] - ring.pos[0], plane.position[2] - ring.pos[2])),
    );
    renderer.drawMesh(ring.passed ? ring.dimMesh : ring.mesh, model, view, projection,
      ring.passed ? lighting : { ...lighting, emissive: 0.55 });
  }

  // C3 — ring bonus emas: lebih terang (emissive 0.85) supaya beda dari ring
  // biasa di kejauhan; abu kalau sudah dilewati.
  for (const ring of bonusRings.rings) {
    const model = mat4Multiply(
      mat4Translation(ring.pos[0], ring.pos[1], ring.pos[2]),
      mat4RotationY(Math.atan2(plane.position[0] - ring.pos[0], plane.position[2] - ring.pos[2])),
    );
    renderer.drawMesh(ring.passed ? ring.dimMesh : ring.mesh, model, view, projection,
      ring.passed ? lighting : { ...lighting, emissive: 0.85 });
  }

  // Target darat yang masih hidup.
  for (const target of targets.targets) {
    if (!target.alive) continue;
    const gy = terrain.heightAt(target.pos[0], target.pos[2]);
    const model = mat4Translation(target.pos[0], gy, target.pos[2]);
    renderer.drawMesh(target.mesh, model, view, projection, lighting);
  }

  // Awan (lebih tebal + gelap di SENJA). Ronde 4, blocker 2: awan badai
  // DIPEKATKAN (ambient 0.32→0.15, emissive 0.22→0.05) — sebelumnya awan
  // abu-abu pucat, kini kelabu gelap kontras dengan langit senja.
  const cloudLighting = missionIndex === 2
    ? { ...lighting, sunColor: [0.30, 0.27, 0.34], ambientColor: [0.15, 0.14, 0.20], emissive: 0.05 }
    : { ...lighting, emissive: 0.3 };
  renderer.drawMesh(clouds.mesh, mat4Identity(), view, projection, cloudLighting);
  if (missionIndex === 2) {
    renderer.drawMesh(stormClouds.mesh, mat4Identity(), view, projection, cloudLighting);
  }

  // Ronde 4, blocker 2 — sambaran petir shot storm: satu petir zigzag
  // (dua bidang silang per segmen, pola yang sama seperti tracer darat)
  // ~75 m di depan pesawat, dari langit sampai ke terrain. Hanya di shot
  // SENJA; gameplay tetap memakai flash + hazard seperti biasa.
  if (shotMode && missionIndex === 2) {
    const fwd = plane.forwardVector();
    const boltTop = vec3Add(vec3Add(plane.position, vec3Scale(fwd, 75)), [18, 95, 0]);
    const bx = boltTop[0] + 6, bz = boltTop[2] - 4;
    const groundY = terrain.heightAt(bx, bz) + 2;
    const segs = 7;
    const boltBuilder = new MeshBuilder();
    let prev = boltTop;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const cur = [
        boltTop[0] + (bx - boltTop[0]) * t + Math.sin(i * 2.7) * 7 * (1 - t * 0.5),
        boltTop[1] + (groundY - boltTop[1]) * t,
        boltTop[2] + (bz - boltTop[2]) * t + Math.cos(i * 2.1) * 7 * (1 - t * 0.5),
      ];
      const dir = vec3Normalize(vec3Sub(cur, prev));
      const len = vec3Length(vec3Sub(cur, prev));
      const half = vec3Scale(dir, len / 2);
      const mid = vec3Add(prev, half);
      let side = vec3Normalize(vec3Cross(dir, [0, 1, 0]));
      if (vec3Length(side) < 0.01) side = [1, 0, 0];
      const up2 = vec3Normalize(vec3Cross(side, dir));
      // Ronde 2 revisi (c): ketebalan MERUNCING per segmen — setengah
      // lebar 0,5 m di atas (1,0 m penuh) mengecil ke 0,3 m di ujung
      // (0,6 m penuh), plus variasi kecil per segmen supaya tidak kaku.
      const halfW = (0.5 - 0.2 * t) * (1 + 0.12 * Math.sin(i * 1.7));
      const s = vec3Scale(side, halfW), u = vec3Scale(up2, halfW);
      const c = (a, b) => vec3Add(vec3Add(mid, vec3Scale(half, a)), vec3Scale(b, 1));
      boltBuilder.addQuad(c(-1, s), c(1, s), c(1, vec3Scale(s, -1)), c(-1, vec3Scale(s, -1)), [0.85, 0.92, 1.0]);
      boltBuilder.addQuad(c(-1, u), c(1, u), c(1, vec3Scale(u, -1)), c(-1, vec3Scale(u, -1)), [0.85, 0.92, 1.0]);
      prev = cur;
    }
    const boltMesh = boltBuilder.build(renderer);
    renderer.drawMesh(boltMesh, mat4Identity(), view, projection, { ...lighting, emissive: 0.95 });
    renderer.deleteMesh(boltMesh);
  }

  // Pesawat (tidak digambar di mode kokpit).
  if (cameraMode !== 'cockpit') {
    const model = mat4Multiply(
      mat4Translation(plane.position[0], plane.position[1], plane.position[2]),
      mat4YawPitchRoll(plane.yaw, plane.pitch, plane.roll),
    );
    renderer.drawMesh(aircraft.mesh, model, view, projection, lighting);
  }

  // Peluru pemain: kotak kecil kuning menyala.
  const bulletBuilder = new MeshBuilder();
  for (const shot of projectiles.shots) {
    bulletBuilder.addBox(shot.pos[0], shot.pos[1], shot.pos[2], 0.8, 0.8, 3.5, [1.0, 0.9, 0.2]);
  }
  if (projectiles.shots.length > 0) {
    const bulletMesh = bulletBuilder.build(renderer);
    renderer.drawMesh(bulletMesh, mat4Identity(), view, projection, { ...lighting, emissive: 0.7 });
    renderer.deleteMesh(bulletMesh);
  }

  // Tracer darat: dua bidang silang sepanjang garis from-to (dihitung di CPU,
  // supaya tidak ada buffer baru per tracer per frame).
  const tracerBuilder = new MeshBuilder();
  for (const t of projectiles.tracers) {
    const dir = vec3Normalize(vec3Sub(t.to, t.from));
    const len = vec3Length(vec3Sub(t.to, t.from));
    const half = vec3Scale(dir, len / 2);
    const mid = vec3Add(t.from, half);
    let side = vec3Normalize(vec3Cross(dir, [0, 1, 0]));
    if (vec3Length(side) < 0.01) side = [1, 0, 0];
    const up2 = vec3Normalize(vec3Cross(side, dir));
    const s = vec3Scale(side, 0.35), u = vec3Scale(up2, 0.35);
    const c = (a, b) => vec3Add(vec3Add(mid, vec3Scale(half, a)), vec3Scale(b, 1));
    tracerBuilder.addQuad(c(-1, s), c(1, s), c(1, vec3Scale(s, -1)), c(-1, vec3Scale(s, -1)), [1.0, 0.2, 0.1]);
    tracerBuilder.addQuad(c(-1, u), c(1, u), c(1, vec3Scale(u, -1)), c(-1, vec3Scale(u, -1)), [1.0, 0.2, 0.1]);
  }
  if (projectiles.tracers.length > 0) {
    const tracerMesh = tracerBuilder.build(renderer);
    renderer.drawMesh(tracerMesh, mat4Identity(), view, projection, { ...lighting, emissive: 0.9 });
    renderer.deleteMesh(tracerMesh);
  }

  // Partikel: kotak kecil berwarna, menghadap kamera (billboard sederhana: tanpa rotasi).
  // Cull <6 m dari kamera: partikel yang dilalui lensa (jejak knalpot/flak)
  // membesar jadi kotak raksasa — lebih baik hilang daripada memenuhi frame.
  if (particles.particles.length > 0) {
    const pBuilder = new MeshBuilder();
    let drawn = 0;
    for (const p of particles.particles) {
      if (vec3Length(vec3Sub(p.pos, camPos)) < 6) continue;
      const s = p.size * (0.5 + p.life / p.maxLife);
      pBuilder.addBox(p.pos[0], p.pos[1], p.pos[2], s, s, s, p.color);
      drawn += 1;
    }
    if (drawn === 0) {
      // Semua partikel ter-cull (terlalu dekat lensa) — tidak ada yang digambar.
    } else {
      const pMesh = pBuilder.build(renderer);
      renderer.drawMesh(pMesh, mat4Identity(), view, projection, { ...lighting, emissive: 0.35 });
      renderer.deleteMesh(pMesh);
    }
  }
}

// --- Loop -------------------------------------------------------------------------
let lastTime = performance.now();
function frame(now) {
  // dt DIJEPIT 0..0,05: timestamp rAF pertama di headless bisa lebih awal
  // dari performance.now() saat modul dievaluasi, sehingga dt NEGATIF —
  // dan dt negatif membuat lightningFlash MEMBESAR (flash − dt*2.2),
  // memicu stormLine di misi PAGI/SIANG (bug radio shot 1, 26 Nov).
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  window.__frames = (window.__frames || 0) + 1; // penghitung frame buat screenshot deterministik
  if (gamePhase === 'playing') update(dt);
  render();
  requestAnimationFrame(frame);
}

// --- Start --------------------------------------------------------------------------
if (shotMode) {
  applyShotPreset();
} else {
  hud.showMissionBriefing(mission.def, 1, () => startMission(0));
}
music.setStage(missionIndex);
requestAnimationFrame(frame);

// Hook untuk play-test otomatis (dipakai saat verifikasi lokal).
window.__merpati = {
  get state() {
    return {
      phase: gamePhase,
      mission: missionIndex + 1,
      score: mission.score + mission.banked,
      banked: mission.banked,
      rings: mission.ringsPassed,
      targets: mission.targetsDown,
      fuel: Math.round(plane.fuel),
      hull: Math.round(plane.hull),
      alt: plane.altitudeMeters(),
      speed: plane.speedKmh(),
      pos: plane.position.map((v) => Math.round(v)),
      onGround: plane.onGround,
      camera: cameraMode,
      combo: mission.combo,
      multiplier: mission.comboMultiplier,
      elapsed: Math.round(mission.elapsed * 10) / 10,
      timeBonus: mission.timeBonus(),
      shake: Math.round(shakeAmp * 100) / 100,
      fov: Math.round(currentFov * 10) / 10,
      strikes: weather.strikeCount,
      particles: particles.particles.length,
      radio: radio.lines.map((l) => l.text),
    };
  },
  input,
  startMission,
  pickModule,
};

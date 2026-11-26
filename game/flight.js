// ============================================================================
// Merpati Kilat — flight.js
// Fisika terbang arcade ala Luftrausers (thrust-or-fall), cuaca sebagai
// mekanik (awan = cover + es, petir = HUD kedip, angin lembah), dan
// MissionManager: 3 misi PAGI/SIANG/SENJA dengan ring, target darat, modul
// antar misi, dan bank skor lewat mendarat.
// ============================================================================

import { vec3Add, vec3Sub, vec3Scale, mat4YawPitchRoll, mat4TransformDirection } from './engine.js';
import { WORLD_HALF, SEA_LEVEL } from './world.js';

// --- FlightModel ---------------------------------------------------------------
export class FlightModel {
  constructor() {
    this.resetToRunway();
    this.speed = 0;               // m/s maju
    this.throttle = 0;            // 0..1
    this.fuel = 100;              // persen
    this.hull = 100;              // persen integritas badan
    this.onGround = true;
    this.iced = 0;                // 0..1 akumulasi es di sayap
    this.inCloud = false;
    this.hiddenInCloud = false;
    // Modul terpasang (dipilih antar misi).
    this.module = { engine: 0, armor: 0, weapon: 0 };
    this.maxSpeed = 95;
    this.accel = 26;
    this.turnRate = 1.35;         // rad/detik
    this.climbRate = 0.9;
  }

  resetToRunway() {
    // Start dingin di ujung landasan pulau, menghadap utara (-Z).
    this.position = [1150, 8, 1100];
    this.yaw = 0;                 // 0 = menghadap -Z
    this.pitch = 0;
    this.roll = 0;
    this.verticalSpeed = 0;
    this.speed = 0;
    this.throttle = 0;
    this.onGround = true;
  }

  resetToAir(x, y, z, yaw) {
    this.position = [x, y, z];
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.verticalSpeed = 0;
    this.speed = 55;
    this.throttle = 0.7;
    this.onGround = false;
  }

  forwardVector() {
    const m = mat4YawPitchRoll(this.yaw, this.pitch, 0);
    return mat4TransformDirection(m, [0, 0, -1]);
  }

  applyModule(modId) {
    if (modId === 'engine') {
      this.module.engine += 1;
      this.maxSpeed += 22; this.accel += 7;
    } else if (modId === 'armor') {
      this.module.armor += 1;
      this.hull = Math.min(100, this.hull + 40);
    } else if (modId === 'weapon') {
      this.module.weapon += 1;
    }
  }

  update(dt, input, weather, terrain) {
    const icePenalty = 1 - this.iced * 0.45;
    // --- Input: panah (thrust-or-fall) ---
    if (input.thrust) {
      this.throttle = Math.min(1, this.throttle + dt * 1.4);
    } else {
      this.throttle = Math.max(0, this.throttle - dt * 0.9);
    }
    if (input.brake) this.throttle = Math.max(0, this.throttle - dt * 2.2);
    if (input.left) {
      this.yaw += this.turnRate * dt * icePenalty;
      this.roll = Math.max(-0.9, this.roll - dt * 2.4);
    } else if (input.right) {
      this.yaw -= this.turnRate * dt * icePenalty;
      this.roll = Math.min(0.9, this.roll + dt * 2.4);
    } else {
      this.roll *= Math.max(0, 1 - dt * 3);
    }
    // Pitch otomatis: naik kalau cepat + gas, turun kalau lambat (thrust-or-fall).
    const targetPitch = this.onGround ? 0 : (this.speed > 34 ? -0.16 : 0.30);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 1.6);
    if (input.pullUp) this.pitch = Math.max(-0.5, this.pitch - dt * 0.5);

    // --- Dorongan + gravitasi ---
    const engineForce = this.accel * this.throttle * icePenalty;
    this.speed += engineForce * dt;
    this.speed -= this.speed * 0.10 * dt;                    // hambatan udara
    if (!this.onGround && this.throttle < 0.25) {
      this.speed -= 9 * dt;                                  // jatuh pelan tanpa gas
    }
    this.speed = Math.max(0, Math.min(this.maxSpeed, this.speed));
    const fwd = this.forwardVector();
    const wind = weather.windAt(this.position);
    const vx = fwd[0] * this.speed + wind[0];
    const vz = fwd[2] * this.speed + wind[2];
    this.verticalSpeed = fwd[1] * this.speed;
    if (!this.onGround) this.verticalSpeed -= (1 - this.throttle) * 6 * dt;
    this.position = vec3Add(this.position, [vx * dt, this.verticalSpeed * dt, vz * dt]);

    // --- Batas dunia: pantulkan halus di tepi ---
    if (Math.abs(this.position[0]) > WORLD_HALF - 40) {
      this.position[0] = Math.sign(this.position[0]) * (WORLD_HALF - 40);
      this.yaw += Math.PI * 0.5;
    }
    if (Math.abs(this.position[2]) > WORLD_HALF - 40) {
      this.position[2] = Math.sign(this.position[2]) * (WORLD_HALF - 40);
      this.yaw += Math.PI * 0.5;
    }
    if (this.position[1] > 520) { this.position[1] = 520; this.verticalSpeed = 0; }

    // --- Tanah / laut ---
    const ground = terrain.heightAt(this.position[0], this.position[2]);
    const floorY = Math.max(ground, SEA_LEVEL + 0.5);
    if (this.position[1] <= floorY + 1.2) {
      this.position[1] = floorY + 1.2;
      if (this.verticalSpeed < -14 || this.speed > 70) {
        this.hull -= 34;                 // mendarat kasar / tabrak tanah
        this.crashed = true;
      } else if (!this.onGround && this.speed < 45) {
        this.onGround = true;             // menyentuh tanah dengan lembut
      }
      this.verticalSpeed = 0;
      // Rolling resistance kecil di darat (dulu 26/dtk — menetralkan mesin
      // sehingga pesawat tidak pernah bisa lepas landas).
      if (this.onGround) this.speed = Math.max(0, this.speed - 4 * dt);
    } else if (this.position[1] > floorY + 4) {
      this.onGround = false;
    }
    // Lepas landas: cukup cepat di landasan -> terbang.
    if (this.onGround && this.speed > 38 && this.throttle > 0.55) {
      this.onGround = false;
      this.verticalSpeed = 6;
    }

    // --- Bahan bakar ---
    this.fuel -= (0.22 + this.throttle * 0.75) * dt;
    if (this.fuel <= 0) {
      this.fuel = 0;
      this.throttle = Math.max(0, this.throttle - dt);
    }
    // --- Es: pulih pelan di luar awan ---
    if (!this.inCloud) this.iced = Math.max(0, this.iced - dt * 0.05);
    return this;
  }

  speedKmh() { return Math.round(this.speed * 3.6); }
  altitudeMeters() { return Math.max(0, Math.round(this.position[1])); }
  headingDegrees() {
    let deg = (-this.yaw * 180 / Math.PI) % 360;
    if (deg < 0) deg += 360;
    return Math.round(deg);
  }
}

// --- WeatherSystem ---------------------------------------------------------------
export class WeatherSystem {
  constructor(missionIndex) {
    this.missionIndex = missionIndex;
    this.time = 0;
    this.lightningTimer = 4 + Math.random() * 5;
    this.lightningFlash = 0;       // 0..1, untuk HUD kedip + flash layar
    this.strikeCount = 0;          // C4 — naik tiap sambaran baru (main.js
    this.lastStrike = null;        //   pakai ini untuk deteksi + hazard petir)
    this.valleyWindStrength = missionIndex === 0 ? 14 : missionIndex === 2 ? 9 : 4;
    this.cloudCeiling = [170, 210, 150][missionIndex];
  }

  update(dt, planePos) {
    this.time += dt;
    // Petir hanya di SENJA (misi 3): sambaran acak tiap 4-9 detik.
    if (this.missionIndex === 2) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 4 + Math.random() * 5;
        this.lightningFlash = 1;
        this.strikeCount += 1;
        this.lastStrike = [planePos[0] + (Math.random() - 0.5) * 300,
          planePos[1] + 60, planePos[2] + (Math.random() - 0.5) * 300];
      }
    }
    this.lightningFlash = Math.max(0, this.lightningFlash - dt * 2.2);
  }

  // Angin lembah: dorong kuat saat terbang rendah di ngarai (z ~ 180).
  windAt(pos) {
    const lowFlight = Math.max(0, 1 - Math.max(0, pos[1] - 40) / 90);
    const inCanyon = Math.max(0, 1 - Math.abs(pos[2] - 180) / 260);
    const gust = Math.sin(this.time * 0.7 + pos[0] * 0.01) * 0.5 + 0.5;
    const strength = this.valleyWindStrength * lowFlight * inCanyon * (0.5 + gust);
    return [strength, 0, strength * 0.35];
  }

  windDescription() {
    const s = this.valleyWindStrength;
    if (s > 12) return 'ANGIN lembah kencang — awas dorongan!';
    if (s > 6) return 'ANGIN lembah sedang';
    return 'ANGIN tenang';
  }

  // Palet langit + matahari per misi.
  skyPalette() {
    if (this.missionIndex === 0) { // PAGI — matahari terbit di timur
      return {
        topColor: [0.22, 0.42, 0.72], horizonColor: [1.0, 0.62, 0.32],
        sunColor: [1.0, 0.72, 0.35], sunDirection: [0.75, 0.22, -0.35],
        sunGlow: 0.55, ambientColor: [0.42, 0.40, 0.42],
        fogColor: [0.98, 0.66, 0.42], fogNear: 320, fogFar: 1900,
      };
    }
    if (this.missionIndex === 1) { // SIANG — matahari tinggi, langit biru
      return {
        topColor: [0.15, 0.45, 0.85], horizonColor: [0.72, 0.86, 0.96],
        sunColor: [1.0, 0.95, 0.80], sunDirection: [0.25, 0.9, -0.2],
        sunGlow: 0.22, ambientColor: [0.55, 0.55, 0.55],
        fogColor: [0.75, 0.86, 0.95], fogNear: 420, fogFar: 2100,
      };
    }
    // SENJA — dinding badai, langit jingga gelap + petir
    return {
      topColor: [0.12, 0.14, 0.30], horizonColor: [0.85, 0.38, 0.18],
      sunColor: [1.0, 0.45, 0.15], sunDirection: [-0.7, 0.10, 0.3],
      sunGlow: 0.35, ambientColor: [0.30, 0.28, 0.34],
      fogColor: [0.55, 0.32, 0.24], fogNear: 180, fogFar: 1000,
    };
  }
}

// --- MissionManager ----------------------------------------------------------------
export const MISSION_DEFS = [
  {
    name: 'MISI 1 — PAGI', place: 'Ngarai Bromo', time: '05:40',
    briefing: 'Lepas landas dari landasan pulau, susuri ngarai saat matahari terbit. Lewati 6 ring, hancurkan 4 target darat, lalu mendarat untuk bank skor.',
    rings: [
      { pos: [1150, 55, 700], radius: 22, name: 'Ring 1 — Lepas landas' },
      { pos: [900, 70, 420], radius: 22, name: 'Ring 2 — Mulut ngarai' },
      { pos: [500, 80, 200], radius: 20, name: 'Ring 3 — Ngarai' },
      { pos: [0, 90, 180], radius: 20, name: 'Ring 4 — Jantung ngarai' },
      { pos: [-500, 85, 160], radius: 20, name: 'Ring 5 — Tikungan' },
      { pos: [-850, 110, -250], radius: 22, name: 'Ring 6 — Kaki Bromo' },
    ],
    targets: [
      { pos: [700, 0, 300], name: 'Pos meriam 1' },
      { pos: [200, 0, 260], name: 'Pos meriam 2' },
      { pos: [-300, 0, 220], name: 'Pos meriam 3' },
      { pos: [-700, 0, -100], name: 'Pos meriam 4' },
    ],
    // C3 — ring bonus emas: 1 per misi, lebih sulit dijangkau (tinggi +
    // jauh dari jalur utama), nilai 400 (bukan 150). TIDAK dihitung di
    // RING x/6 — ekstra, bukan syarat misi.
    bonusRings: [
      { pos: [-200, 165, -350], radius: 14, name: 'Ring Emas — Puncak Bromo', color: [1.0, 0.9, 0.35] },
    ],
  },
  {
    name: 'MISI 2 — SIANG', place: 'Kepulauan Raja Ampat', time: '12:10',
    briefing: 'Siang cerah di atas laut biru Raja Ampat. Ring mengelilingi pulau karst dan Monas di kejauhan. Hancurkan pos pantai, lalu kembali mendarat.',
    rings: [
      { pos: [1150, 60, 700], radius: 22, name: 'Ring 1 — Lepas landas' },
      { pos: [1250, 80, 1050], radius: 22, name: 'Ring 2 — Pulau karst' },
      { pos: [1450, 90, 900], radius: 20, name: 'Ring 3 — Laguna' },
      { pos: [1100, 100, 1350], radius: 20, name: 'Ring 4 — Ujung pulau' },
      { pos: [400, 110, 900], radius: 22, name: 'Ring 5 — Laut lepas' },
      { pos: [-350, 120, -700], radius: 24, name: 'Ring 6 — Monas' },
    ],
    targets: [
      { pos: [1300, 0, 1150], name: 'Pos pantai 1' },
      { pos: [1000, 0, 1300], name: 'Pos pantai 2' },
      { pos: [600, 0, 700], name: 'Pos pantai 3' },
      { pos: [-350, 0, -880], name: 'Pos kota 4' },
    ],
    bonusRings: [
      { pos: [800, 175, 1500], radius: 14, name: 'Ring Emas — Menara Karst', color: [1.0, 0.9, 0.35] },
    ],
  },
  {
    name: 'MISI 3 — SENJA', place: 'Dinding Badai Borobudur', time: '17:50',
    briefing: 'Senja. Dinding badai menutup langit, petir menyambar. Terbang rendah di bawah awan, lewati ring di sekitar Borobudur, hancurkan pos terakhir, mendarat sebelum badai menelan landasan.',
    rings: [
      { pos: [1150, 55, 700], radius: 22, name: 'Ring 1 — Lepas landas' },
      { pos: [900, 65, 500], radius: 20, name: 'Ring 2 — Masuk badai' },
      { pos: [700, 75, -100], radius: 20, name: 'Ring 3 — Candi jauh' },
      { pos: [620, 85, -500], radius: 22, name: 'Ring 4 — Borobudur' },
      { pos: [200, 80, -700], radius: 20, name: 'Ring 5 — Dataran' },
      { pos: [-300, 90, -600], radius: 22, name: 'Ring 6 — Ujung badai' },
    ],
    targets: [
      { pos: [800, 0, 200], name: 'Pos badai 1' },
      { pos: [620, 0, -520], name: 'Pos badai 2' },
      { pos: [300, 0, -650], name: 'Pos badai 3' },
      { pos: [-100, 0, -500], name: 'Pos badai 4' },
    ],
    bonusRings: [
      { pos: [450, 160, -850], radius: 14, name: 'Ring Emas — Mata Badai', color: [1.0, 0.9, 0.35] },
    ],
  },
];

export const MODULE_CHOICES = [
  { id: 'engine', title: 'MESIN KILAT', desc: 'Top speed +22, akselerasi lebih galak. Buat yang suka ngebut di ngarai.' },
  { id: 'armor', title: 'BADAN BAJA', desc: 'Pulihkan 40% integritas badan + tahan tembakan darat lebih lama.' },
  { id: 'weapon', title: 'MERIAM GANDA', desc: 'Tembakan dua peluru sekaligus — target darat hancur dua kali lebih cepat.' },
];

export class MissionManager {
  constructor(missionIndex) {
    this.index = missionIndex;
    this.def = MISSION_DEFS[missionIndex];
    this.ringsPassed = 0;
    this.targetsDown = 0;
    this.score = 0;          // skor misi berjalan (belum di-bank)
    this.banked = 0;         // skor yang sudah diamankan lewat mendarat
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;
    // C2 — timer misi: bonus besar kalau selesai cepat. Par per misi
    // (detik); tiap detik di bawah par = +2 poin saat mendarat.
    this.elapsed = 0;
    this.parTime = [300, 300, 330][missionIndex];
    this.state = 'takeoff';  // takeoff | flying | landing | complete | crashed
    this.landed = false;
    this.landingQuality = 0; // 0..1
  }

  ringScore(base) {
    return base * this.comboMultiplier;
  }

  // base default 150 (ring biasa); ring bonus emas (C3) memanggil dengan 400.
  registerRingPass(ringName, base = 150) {
    this.ringsPassed += 1;
    this.combo += 1;
    this.comboTimer = 6;
    this.comboMultiplier = 1 + Math.min(4, Math.floor(this.combo / 2)) * 0.5;
    const gained = this.ringScore(base);
    this.score += gained;
    return { gained, ringName, combo: this.combo, multiplier: this.comboMultiplier };
  }

  // C3 — ring bonus emas: combo + skor naik, tapi TIDAK menambah
  // ringsPassed (bukan syarat misi — ekstra murni).
  registerBonusRing(ringName) {
    this.combo += 1;
    this.comboTimer = 6;
    this.comboMultiplier = 1 + Math.min(4, Math.floor(this.combo / 2)) * 0.5;
    const gained = this.ringScore(400);
    this.score += gained;
    return { gained, ringName, combo: this.combo, multiplier: this.comboMultiplier };
  }

  registerTargetDown(targetName) {
    this.targetsDown += 1;
    this.combo += 1;
    this.comboTimer = 6;
    this.comboMultiplier = 1 + Math.min(4, Math.floor(this.combo / 2)) * 0.5;
    const gained = this.ringScore(250);
    this.score += gained;
    return { gained, targetName, combo: this.combo, multiplier: this.comboMultiplier };
  }

  updateCombo(dt) {
    // C2 — timer misi jalan selama misi belum selesai.
    if (this.state !== 'complete') this.elapsed += dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboMultiplier = 1;
      }
    }
  }

  // C2 — bonus kecepatan: +2 poin per detik di bawah par. 0 kalau lewat par.
  timeBonus() {
    return Math.max(0, Math.round((this.parTime - this.elapsed) * 2));
  }

  formatTime() {
    const s = Math.floor(this.elapsed);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  // Penilaian mendarat: kecepatan rendah + di atas landasan + lurus = bonus.
  evaluateLanding(plane, runway) {
    const dx = plane.position[0] - runway.center[0];
    const dz = plane.position[2] - runway.center[2];
    const lateral = Math.abs(dx);
    const along = Math.abs(dz);
    const onStrip = lateral < runway.width / 2 + 6 && along < runway.length / 2 + 10;
    const speedOk = plane.speed < 45;
    const headingOk = Math.abs(Math.sin(plane.yaw)) < 0.35;
    let quality = 0;
    if (onStrip && speedOk) quality = 0.6;
    if (onStrip && speedOk && headingOk) quality = 0.85;
    if (onStrip && speedOk && headingOk && plane.speed < 28) quality = 1.0;
    if (!onStrip) quality = 0.15; // mendarat darurat di luar landasan
    this.landingQuality = quality;
    const landingBonus = Math.round(this.score * (0.25 + quality * 0.75));
    // C2 — bonus kecepatan ditambahkan ke bonus mendarat.
    const speedBonus = this.timeBonus();
    const total = this.score + landingBonus + speedBonus;
    this.banked += total;
    this.score = 0;
    this.landed = true;
    this.state = 'complete';
    return { quality, landingBonus, speedBonus, total, banked: this.banked, onStrip };
  }

  get objectiveText() {
    if (this.state === 'takeoff') return '↑ tahan gas — lepas landas, ring pertama di depan!';
    if (this.state === 'complete') return 'MISI SELESAI — skor sudah di-bank!';
    const left = this.def.rings.length - this.ringsPassed;
    const tLeft = this.def.targets.length - this.targetsDown;
    if (left > 0) return `Lewati ring (${left} lagi), lalu hancurkan target darat.`;
    if (tLeft > 0) return `Semua ring dilewati! Hancurkan ${tLeft} target darat, lalu mendarat.`;
    return 'Semua target hancur! Kembali ke landasan pulau dan mendarat untuk BANK skor.';
  }

  get progressText() {
    return `RING ${this.ringsPassed}/${this.def.rings.length} · TARGET ${this.targetsDown}/${this.def.targets.length}`;
  }
}

// --- Tracer / peluru sederhana ---------------------------------------------------
export class ProjectileSet {
  constructor() {
    this.shots = [];   // peluru pemain: {pos, vel, life}
    this.tracers = []; // tembakan darat: {from, to, life}
  }

  firePlayer(pos, dir, doubleShot) {
    const speed = 320;
    this.shots.push({ pos: [...pos], vel: vec3Scale(dir, speed), life: 2.2 });
    if (doubleShot) {
      const side = [dir[2], 0, -dir[0]];
      const off = vec3Scale(side, 1.6);
      this.shots.push({ pos: vec3Add(pos, off), vel: vec3Scale(dir, speed), life: 2.2 });
      this.shots.push({ pos: vec3Sub(pos, off), vel: vec3Scale(dir, speed), life: 2.2 });
    }
  }

  fireGround(from, to) {
    this.tracers.push({ from: [...from], to: [...to], life: 0.35 });
  }

  update(dt) {
    for (const s of this.shots) {
      s.pos = vec3Add(s.pos, vec3Scale(s.vel, dt));
      s.life -= dt;
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
  }
}

// --- ParticleSet (ledakan, asap, percikan) ----------------------------------------
export class ParticleSet {
  constructor() {
    this.particles = []; // {pos, vel, life, maxLife, color, size}
    // Ronde 4, blocker 1/9: shot mode mematikan spawn partikel transient
    // (burst + knalpot membeku jadi kubus di still). main.js menyetel
    // disabled=true di applyShotPreset; gameplay biasa tidak tersentuh.
    this.disabled = false;
  }

  explode(pos, color, count, power, sizeScale = 1) {
    if (this.disabled) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = (2 + Math.random() * power);
      this.particles.push({
        pos: [...pos],
        vel: [Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 4, Math.sin(a) * Math.cos(b) * sp],
        life: 0.7 + Math.random() * 0.8, maxLife: 1.5,
        color, size: (1.5 + Math.random() * 2.5) * sizeScale,
      });
    }
  }

  smoke(pos) {
    if (this.disabled) return;
    this.particles.push({
      pos: [...pos], vel: [0, 1.2, 0], life: 1.4, maxLife: 1.4,
      color: [0.55, 0.55, 0.58], size: 3.5,
    });
  }

  // E1 — jejak knalpot mesin: percikan api kecil + asap tipis di nosel.
  // Ukuran KECIL + umur PENDEK (ronde 3): kamera chase terbang melewati
  // jejak (partikel statis di dunia) — partikel besar/berumur panjang
  // membesar jadi kotak raksasa saat mendekati lensa. Spawn di dua nosel
  // (main.js) supaya jejak lewat di SISI kamera, bukan menembusnya.
  exhaust(pos, throttle) {
    if (this.disabled) return;
    const hot = Math.random() < 0.6;
    this.particles.push({
      pos: [...pos],
      vel: [(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2],
      life: 0.2 + Math.random() * 0.08, maxLife: 0.28,
      color: hot ? [1.0, 0.62 + throttle * 0.2, 0.12] : [0.5, 0.5, 0.52],
      size: hot ? 0.4 + Math.random() * 0.3 : 0.5 + Math.random() * 0.4,
    });
  }

  // E1/E4 — puff awan: gumpalan putih besar saat pesawat menembus awan.
  puff(pos, count = 10) {
    if (this.disabled) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 4;
      this.particles.push({
        pos: [pos[0] + (Math.random() - 0.5) * 6, pos[1] + (Math.random() - 0.5) * 4, pos[2] + (Math.random() - 0.5) * 6],
        vel: [Math.cos(a) * sp, (Math.random() - 0.5) * 2, Math.sin(a) * sp],
        life: 0.9 + Math.random() * 0.7, maxLife: 1.6,
        color: [0.95, 0.96, 1.0], size: 4 + Math.random() * 4,
      });
    }
  }

  // E1 — debu/asap mendarat: gumpalan coklat-abu saat roda menyentuh tanah
  // atau meluncur di landasan.
  dust(pos, count = 6) {
    if (this.disabled) return;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        pos: [pos[0] + (Math.random() - 0.5) * 4, pos[1] + 0.5, pos[2] + (Math.random() - 0.5) * 4],
        vel: [(Math.random() - 0.5) * 6, 1 + Math.random() * 2, (Math.random() - 0.5) * 6],
        life: 0.7 + Math.random() * 0.6, maxLife: 1.3,
        color: [0.62, 0.58, 0.48], size: 2.5 + Math.random() * 2.5,
      });
    }
  }

  // C5 — kepulan flak: ledakan kecil abu-hitam di dekat pesawat saat
  // meriam darat menembak (kena atau nyaris kena).
  flak(pos) {
    if (this.disabled) return;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      this.particles.push({
        pos: [...pos],
        vel: [Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - 0.5) * sp],
        life: 0.4 + Math.random() * 0.4, maxLife: 0.8,
        color: Math.random() < 0.4 ? [1.0, 0.55, 0.15] : [0.25, 0.22, 0.20],
        size: 1.5 + Math.random() * 2,
      });
    }
  }

  update(dt) {
    for (const p of this.particles) {
      p.pos = vec3Add(p.pos, vec3Scale(p.vel, dt));
      p.vel[1] -= 2 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}

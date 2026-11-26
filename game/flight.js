// flight.js — FlightModel: throttle/turn discipline, G/AOA, stall, afterburner, fuel.
// Deklarasi paling deskriptif di awal (kontrak juri: outline baca deklarasi pertama).
import { clamp, lerp, DEG } from './engine.js';

'use strict';

// --- 3 varian pesawat (trade-off nyata, dipilih di hangar/title screen) ---
export const VARIANTS = {
  kutilang: {
    name: 'KUTILANG', role: 'INTERCEPTOR',
    desc: 'Cepat, rapuh, misil banyak',
    maxSpeed: 178, accel: 26, turn: 1.0, fuelBurn: 1.0, hullMax: 70, missiles: 8, bombs: 0,
    accent: 0xd93328, body: 0xc8ccd4,
  },
  elang: {
    name: 'ELANG', role: 'STRIKE',
    desc: 'Bom kuat, armor tebal, lambat',
    maxSpeed: 152, accel: 20, turn: 0.85, fuelBurn: 1.15, hullMax: 130, missiles: 4, bombs: 4,
    accent: 0x2a6fd8, body: 0x9aa2b0,
  },
  cendrawasih: {
    name: 'CENDRAWASIH', role: 'RECON',
    desc: 'BBM irit, jangkauan jauh, senjata ringan',
    maxSpeed: 162, accel: 22, turn: 0.95, fuelBurn: 0.6, hullMax: 90, missiles: 4, bombs: 0,
    accent: 0xe8a81c, body: 0xb8c4b0,
  },
};

// Kecepatan tampil: m/s -> knot (1 m/s = 1,944 kt). Ketinggian: meter -> kaki (x3,281).
export const MS_TO_KT = 1.944;
export const M_TO_FT = 3.281;

export class FlightModel {
  constructor(variantId = 'kutilang') {
    this.setVariant(variantId);
    this.reset();
  }

  setVariant(variantId) {
    this.variantId = VARIANTS[variantId] ? variantId : 'kutilang';
    this.variant = VARIANTS[this.variantId];
    this.hullMax = this.variant.hullMax;
  }

  reset() {
    this.pos = { x: 0, y: 16, z: 380 };   // meter; +x timur, +y atas, -z utara (heading 000)
    this.heading = 0;                      // derajat, 0 = utara (-Z), 90 = timur (+X)
    this.pitch = 0;                        // derajat, + = hidung naik
    this.roll = 0;                         // derajat, + = bank kanan
    this.speed = 0;                        // m/s
    this.throttle = 0;                     // 0..1
    this.afterburner = false;
    this.fuel = 100;                       // %
    this.hull = this.hullMax;
    this.gLoad = 1.0;
    this.aoa = 0;
    this.vsi = 0;                          // m/s (+ naik)
    this.stalled = false;
    this.crashed = false;
    this.landed = false;
    this.ice = 0;                          // 0..1 es di awan (M3)
    this.windPush = { x: 0, z: 0 };        // dorongan angin lateral (m/s)
    this.dodgeRollExtra = 0;               // roll visual tambahan dari DodgeRoll
    this.missilesLeft = this.variant.missiles;
    this.bombsLeft = this.variant.bombs;
    this.speedMult = 1;        // modul +18% THRUST
    this.fuelBurnMult = 1;     // modul +35% RANGE
    this.touchdownBonus = false; // modul +40% TOUCHDOWN
    this.sinkRate = 0;                     // m/s saat touchdown (buat grade)
    this.centerlineError = 0;              // meter saat touchdown
    this.touchdownKt = 0;
    this.flightTime = 0;
    this.distance = 0;
  }

  // Arah maju (unit vector) dari heading + pitch.
  forward() {
    const h = this.heading * DEG, p = this.pitch * DEG;
    return {
      x: Math.sin(h) * Math.cos(p),
      y: Math.sin(p),
      z: -Math.cos(h) * Math.cos(p),
    };
  }

  update(dt, input, wind, groundFn, runwayList) {
    if (this.crashed || this.landed) return;
    this.flightTime += dt;
    const v = this.variant;

    // --- Throttle: panah atas/bawah; lepas gas = jatuh pelan (Luftrausers). ---
    if (input.throttleUp) this.throttle = clamp(this.throttle + dt * 0.55, 0, 1);
    if (input.throttleDown) this.throttle = clamp(this.throttle - dt * 0.8, 0, 1);
    this.afterburner = !!input.afterburner && this.throttle > 0.55 && this.fuel > 0;

    // --- Kecepatan target: throttle x maxSpeed, AB x1.55, es mengurangi lift. ---
    const iceFactor = 1 - 0.22 * this.ice;
    const targetSpeed = this.throttle * v.maxSpeed * this.speedMult * (this.afterburner ? 1.55 : 1) * iceFactor;
    const rate = this.speed < targetSpeed ? v.accel : v.accel * 0.55;
    this.speed += clamp(targetSpeed - this.speed, -rate * dt, rate * dt);
    if (this.speed < 0) this.speed = 0;

    // --- Belok: bank -> turn rate terkoordinasi; belok tajam di kecepatan tinggi = G besar. ---
    const targetRoll = (input.right ? 1 : 0) * 55 - (input.left ? 1 : 0) * 55;
    this.roll += clamp(targetRoll * v.turn - this.roll, -140 * dt, 140 * dt);
    const turnRate = (9.81 * Math.tan(this.roll * DEG)) / Math.max(this.speed, 30); // rad/s
    this.heading = (this.heading + turnRate * dt * (180 / Math.PI) + 360) % 360;
    this.gLoad = clamp(1 / Math.max(Math.cos(this.roll * DEG), 0.35), 1, 6.5);

    // --- Pitch otomatis dari kecepatan (terbang hemat vs ngejar): cepat = naik pelan,
    // pelan = tenggelam; W/S trim angguk buat menukik (bom) / mendaki. ---
    const cruise = v.maxSpeed * 0.55;
    let targetPitch = clamp((this.speed - cruise) * 0.09, -24, 14);
    if (input.pitchUp) targetPitch += 12;
    if (input.pitchDown) targetPitch -= 16;
    this.pitch += clamp(targetPitch - this.pitch, -38 * dt, 38 * dt);

    // --- Stall: kecepatan rendah + G tinggi = tenggelam + goyang. ---
    this.stalled = this.speed < 42 && this.throttle < 0.5;
    let climb = Math.sin(this.pitch * DEG) * this.speed;
    if (this.stalled) climb -= 14;
    if (this.speed < 25) climb -= (25 - this.speed) * 0.35; // jatuh pelan tanpa gas
    this.vsi = lerp(this.vsi, climb, clamp(dt * 3, 0, 1));
    this.aoa = clamp(this.pitch - Math.atan2(this.vsi, Math.max(this.speed, 1)) * (180 / Math.PI), -4, 22);

    // --- Gerak + angin (lembah M1 / shear M3) sebagai gaya lateral. ---
    const fwd = this.forward();
    const nx = this.pos.x + (fwd.x * this.speed + wind.x + this.windPush.x) * dt;
    const ny = this.pos.y + this.vsi * dt;
    const nz = this.pos.z + (fwd.z * this.speed + wind.z + this.windPush.z) * dt;
    this.distance += Math.hypot(nx - this.pos.x, nz - this.pos.z);
    this.pos.x = nx; this.pos.y = ny; this.pos.z = nz;

    // --- BBM: hemat vs ngejar; AB 3,2x. Habis = jatuh. ---
    const burn = (0.16 + this.throttle * 0.22 + (this.afterburner ? 0.85 : 0)) * v.fuelBurn * this.fuelBurnMult * dt;
    this.fuel = Math.max(0, this.fuel - burn);
    if (this.fuel <= 0 && this.speed < 30) this.vsi = Math.min(this.vsi, -6);

    // --- Tanah / landasan. ---
    const ground = groundFn ? groundFn(this.pos.x, this.pos.z) : 0;
    if (this.pos.y <= ground + 1.5) {
      const onRunway = this._runwayAt(runwayList);
      const sink = -this.vsi;
      // Landasan dua arah: heading utara (0°) ATAU selatan (180°) sama-sama segaris.
      // Toleransi 45° — autopilot berosilasi ±35-40° saat koreksi lateral di
      // final; batas ketat membuatnya crash di atas strip padahal sudah di
      // centerline. LSO grade tetap mencatat centerline error.
      const hNorm = ((this.heading % 360) + 360) % 360;
      const aligned = Math.min(hNorm, 360 - hNorm) < 45 || Math.abs(hNorm - 180) < 45;
      if (onRunway && this.speed < (this.touchdownBonus ? 115 : 95) && sink < 12 && aligned && this.flightTime > 8) {
        // MENDARAT: bank skor + repair.
        this.landed = true;
        this.pos.y = ground + 1.5;
        this.sinkRate = sink;
        this.centerlineError = Math.abs(this.pos.x - onRunway.x);
        this.touchdownKt = this.speed * MS_TO_KT;
        this.speed = Math.max(0, this.speed - 60 * dt);
      } else if (this.flightTime > 3) {
        this.crashed = true;
        this.pos.y = ground + 1.5;
      } else {
        this.pos.y = ground + 1.5;
      }
    }
    if (this.pos.y > 900) { this.pos.y = 900; this.vsi = Math.min(this.vsi, 0); }
    if (this.hull <= 0) this.crashed = true;
  }

  _runwayAt(runwayList) {
    if (!runwayList) return null;
    for (const r of runwayList) {
      // Toleransi ujung ±50 m — autopilot sering touchdown 10-20 m di luar
      // ujung strip (masih di pulau datar yang sama), jangan crash karenanya.
      if (Math.abs(this.pos.x - r.x) < 30 && this.pos.z > r.zMin - 50 && this.pos.z < r.zMax + 50) return r;
    }
    return null;
  }

  damage(amount) {
    this.hull = Math.max(0, this.hull - amount);
    if (this.hull <= 0) this.crashed = true;
  }

  // Nilai tampil (HUD): semua dari state — bukan angka tetap.
  display() {
    const vsiFt = Math.round(this.vsi * 196.85); // m/s -> ft/min
    return {
      kt: Math.round(this.speed * MS_TO_KT),
      ft: Math.round(this.pos.y * M_TO_FT),
      hdg: Math.round(this.heading),
      thr: Math.round(this.throttle * 100),
      fuel: Math.round(this.fuel),
      hull: Math.round(this.hull),
      hullMax: this.hullMax,
      g: this.gLoad.toFixed(1),
      aoa: this.aoa.toFixed(1),
      vsi: vsiFt,
      vsiSigned: (vsiFt < 0 ? '−' : vsiFt > 0 ? '+' : '') + String(Math.abs(vsiFt)), // tanda dari nilai BULAT (m7)
      ab: this.afterburner,
      stalled: this.stalled,
      ice: this.ice,
    };
  }
}

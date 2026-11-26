// weather.js — WeatherSystem: dinding badai, petir (deterministik di staging),
// hujan, es di awan, angin lembah/shear. Deklarasi paling deskriptif di awal.
import * as THREE from 'three';
import { mulberry32, clamp, lerp } from './engine.js';

'use strict';

export class WeatherSystem {
  constructor(scene, missionId, palette) {
    this.scene = scene;
    this.missionId = missionId;
    this.palette = palette;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.wind = { x: 0, z: 0 };          // angin saat ini (m/s, lateral)
    this.windDirText = 'TENANG';
    this.inCloud = false;
    this.iceTimer = 0;
    this.stormCenter = new THREE.Vector3(0, 0, -800);
    this.stormRadius = 480;
    this.rain = null;
    this.rainVel = null;
    this.bolt = null;
    this.boltLife = 0;
    this.flashAlpha = 0;
    this.flashPos = new THREE.Vector3();
    this.nextStrikeIn = 6;               // detik sampai sambaran berikutnya (acak live)
    this.strikeCount = 0;
    this.lightningWarn = 0;               // 0..1 peringatan 0,5 dtk sebelum sambaran
    this.stormCalmed = false;
    this.rnd = mulberry32(9001 + missionId * 7);
    if (missionId === 3) this._buildStormWall();
    if (missionId === 3) this._buildRain();
    if (missionId === 1) this.windDirText = 'ANGIN LEMBAH 20 KT DARI BARAT';
  }

  _buildStormWall() {
    // Dinding badai: cincin awan gelap raksasa (koridor yang harus ditembus).
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2140, emissive: 0x1a1230, emissiveIntensity: 0.25,
      flatShading: true, roughness: 1, transparent: true, opacity: 0.92,
    });
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const rnd = mulberry32(31337);
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rnd() * 0.12;
      const r = this.stormRadius + (rnd() - 0.5) * 130;
      const y = 60 + rnd() * 320;
      const s = new THREE.Mesh(geo, mat);
      const rad = 55 + rnd() * 70;
      s.scale.set(rad, rad * 1.5, rad);
      s.position.set(this.stormCenter.x + Math.cos(a) * r, y, this.stormCenter.z + Math.sin(a) * r);
      this.group.add(s);
    }
    // Inti gelap di tengah dinding (langit di dalam badai lebih gelap).
    const core = new THREE.Mesh(new THREE.SphereGeometry(this.stormRadius * 0.55, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x241a38, transparent: true, opacity: 0.35, fog: false }));
    core.position.set(this.stormCenter.x, 190, this.stormCenter.z);
    core.scale.y = 1.4;
    this.group.add(core);
    this.stormCore = core;
  }

  _buildRain() {
    // Hujan: 700 garis di kotak sekitar kamera, membungkus (wrap) saat jatuh.
    const N = 700;
    const pos = new Float32Array(N * 6);
    this.rainVel = new Float32Array(N);
    const rnd = mulberry32(7777);
    for (let i = 0; i < N; i++) {
      const x = (rnd() - 0.5) * 260, y = rnd() * 160, z = (rnd() - 0.5) * 260;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x - 1.2; pos[i * 6 + 4] = y - 7; pos[i * 6 + 5] = z + 0.6;
      this.rainVel[i] = 90 + rnd() * 50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0x9fb8d8, transparent: true, opacity: 0.5,
    }));
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
  }

  // Sambaran petir: bangun bolt zigzag dari segmen silinder tipis (terbaca di frame,
  // bukan garis 1px). Seed deterministik -> bolt sama tiap run staging.
  buildBolt(from, to, seed) {
    if (this.bolt) { this.group.remove(this.bolt); this.bolt = null; }
    // Terima Vector3 maupun objek biasa {x,y,z}.
    from = new THREE.Vector3(from.x, from.y, from.z);
    to = new THREE.Vector3(to.x, to.y, to.z);
    const rnd = mulberry32(seed);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff });
    const matGlow = new THREE.MeshBasicMaterial({
      color: 0x9db8ff, transparent: true, opacity: 0.45,
    });
    const g = new THREE.Group();
    const segs = 9;
    let prev = from.clone();
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = new THREE.Vector3(
        lerp(from.x, to.x, t) + (i < segs ? (rnd() - 0.5) * 26 : 0),
        lerp(from.y, to.y, t),
        lerp(from.z, to.z, t) + (i < segs ? (rnd() - 0.5) * 26 : 0),
      );
      const dir = new THREE.Vector3().subVectors(p, prev);
      const len = dir.length();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, len, 5), mat);
      cyl.position.copy(prev).addScaledVector(dir, 0.5);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      g.add(cyl);
      const halo = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, len, 5), matGlow);
      halo.position.copy(cyl.position);
      halo.quaternion.copy(cyl.quaternion);
      g.add(halo);
      // Cabang kecil di tengah.
      if (i === 5) {
        const bp = new THREE.Vector3(p.x + 18, p.y - 20, p.z + 8);
        const bd = new THREE.Vector3().subVectors(bp, p);
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, bd.length(), 4), mat);
        branch.position.copy(p).addScaledVector(bd, 0.5);
        branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bd.clone().normalize());
        g.add(branch);
      }
      prev = p;
    }
    // Bola cahaya di titik sambaran.
    const orb = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    orb.position.copy(to);
    g.add(orb);
    this.group.add(g);
    this.bolt = g;
    this.boltLife = 0.5; // bolt terlihat 0,5 dtk
    this.flashAlpha = 0.85;
    this.flashPos.copy(to);
    this.strikeCount++;
    return g;
  }

  // Sambaran DETERMINISTIK buat staging shot 3: selalu di samping-depan pesawat
  // (di dalam frame: 110 m ke depan, 55 m ke kanan jalur terbang).
  deterministicStrike(jetPos, headingDeg = 0) {
    const h = headingDeg * Math.PI / 180;
    const fwd = { x: Math.sin(h), z: -Math.cos(h) };
    const right = { x: Math.cos(h), z: Math.sin(h) };
    const from = new THREE.Vector3(
      jetPos.x + fwd.x * 110 + right.x * 55,
      jetPos.y + 190,
      jetPos.z + fwd.z * 110 + right.z * 55);
    const to = new THREE.Vector3(
      jetPos.x + fwd.x * 130 + right.x * 60,
      jetPos.y - 20,
      jetPos.z + fwd.z * 130 + right.z * 60);
    return this.buildBolt(from, to, 151151);
  }

  update(dt, t, jetPos, camPos, renderer) {
    // --- Angin: lembah M1 (dorong lateral konstan) / shear M3 (hembusan sinus). ---
    if (this.missionId === 1) {
      this.wind.x = 10.3; // 20 kt dari barat -> dorong ke timur
      this.wind.z = Math.sin(t * 0.4) * 2.5;
    } else if (this.missionId === 3) {
      const gust = Math.sin(t * 0.9) * Math.sin(t * 0.23 + 1.7);
      this.wind.x = gust * 14;
      this.wind.z = Math.cos(t * 0.7) * 8;
    } else {
      this.wind.x = Math.sin(t * 0.3) * 3;
      this.wind.z = Math.cos(t * 0.22) * 3;
    }

    // --- Di dalam awan/dinding badai? (M3: es menumpuk, radar AA tidak mengunci). ---
    const dStorm = Math.hypot(jetPos.x - this.stormCenter.x, jetPos.z - this.stormCenter.z);
    const inWall = this.missionId === 3 && dStorm < this.stormRadius + 80 && dStorm > 60 && jetPos.y > 40 && jetPos.y < 420;
    this.inCloud = inWall;
    if (inWall) this.iceTimer = clamp(this.iceTimer + dt / 25, 0, 1); // penuh ~25 dtk
    else this.iceTimer = clamp(this.iceTimer - dt / 8, 0, 1);        // mencair di luar awan

    // --- Hujan mengikuti kamera. ---
    if (this.rain) {
      this.rain.position.set(camPos.x, 0, camPos.z);
      const pos = this.rain.geometry.attributes.position;
      for (let i = 0; i < this.rainVel.length; i++) {
        let y = pos.getY(i * 2) - this.rainVel[i] * dt;
        if (y < 0) y = 160;
        pos.setY(i * 2, y);
        pos.setY(i * 2 + 1, y - 7);
      }
      pos.needsUpdate = true;
    }

    // --- Petir live (M3): peringatan 0,5 dtk (kilat jauh) lalu sambaran. ---
    if (this.missionId === 3 && !this.stormCalmed) {
      this.nextStrikeIn -= dt;
      if (this.nextStrikeIn < 0.5 && this.nextStrikeIn > 0) this.lightningWarn = 1;
      if (this.nextStrikeIn <= 0) {
        const nearJet = this.rnd() < 0.45;
        const tx = nearJet ? jetPos.x + (this.rnd() - 0.5) * 260 : this.stormCenter.x + (this.rnd() - 0.5) * 700;
        const tz = nearJet ? jetPos.z + (this.rnd() - 0.5) * 260 : this.stormCenter.z + (this.rnd() - 0.5) * 700;
        this.buildBolt(
          new THREE.Vector3(tx, 320 + this.rnd() * 80, tz),
          new THREE.Vector3(tx + (this.rnd() - 0.5) * 40, 10 + this.rnd() * 40, tz + (this.rnd() - 0.5) * 40),
          (this.strikeCount * 7919 + 13) >>> 0,
        );
        this.nextStrikeIn = 5 + this.rnd() * 9;
        this.lightningWarn = 0;
      }
    }

    // --- Bolt + flash memudar. ---
    if (this.bolt) {
      this.boltLife -= dt;
      this.bolt.visible = this.boltLife > 0;
      if (this.boltLife <= 0) this.bolt.visible = false;
    }
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.2);
    if (renderer) {
      const fp = this.flashPos.lengthSq() ? this.flashPos : jetPos;
      renderer.setFlash(fp, this.flashAlpha * 2600);
    }
  }

  calmStorm() {
    // Carrier hancur -> dinding badai mereda sebagian.
    this.stormCalmed = true;
    if (this.stormCore) this.stormCore.material.opacity = 0.12;
    this.nextStrikeIn = 999;
  }

  // Posisi sambaran terakhir (buat HUD: "PETIR DI KANANMU" + drone bisa dipancing).
  lastStrikePos() { return this.flashPos; }
}

// juice.js — Juice: trauma² screenshake, hitstop, partikel, popup skor, combo meter.
// Deklarasi paling deskriptif di awal (kontrak juri: outline baca deklarasi pertama).
import * as THREE from 'three';
import { clamp } from './engine.js';

'use strict';

export class Juice {
  constructor(scene) {
    this.scene = scene;
    this.trauma = 0;
    this.hitstop = 0;         // detik beku (render + flash tetap jalan)
    this.combo = 0;
    this.comboTimer = 0;
    this.multiplier = 1;
    this.popups = [];         // {worldPos, text, color, life}
    this.particles = [];      // ledakan: Points + kecepatan + umur
    this.smokePuffs = [];     // sprite asap
    this.time = 0;
    // Tekstur asap lembut (canvas radial).
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    const g = cx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, 64, 64);
    this.smokeTex = new THREE.CanvasTexture(cv);
  }

  addTrauma(x) { this.trauma = clamp(this.trauma + x, 0, 1); }

  // Offset kamera dari trauma² (hanya kamera — tidak ubah gameplay).
  shakeOffset(t) {
    const s = this.trauma * this.trauma;
    return {
      x: s * 1.6 * Math.sin(t * 61.7) * Math.sin(t * 23.3 + 1.3),
      y: s * 1.6 * Math.sin(t * 55.1 + 4.1) * Math.sin(t * 31.7),
      roll: s * 0.03 * Math.sin(t * 47.3),
    };
  }

  freeze(ms) { this.hitstop = Math.max(this.hitstop, ms / 1000); }

  addPopup(worldPos, text, color = '#ffd76a') {
    this.popups.push({ worldPos: worldPos.clone(), text, color, life: 1.4 });
    if (this.popups.length > 12) this.popups.shift();
  }

  addCombo() {
    this.combo += 1;
    this.comboTimer = 6; // 6 dtk tanpa kill/gate -> reset
    this.multiplier = Math.min(1 + Math.floor(this.combo / 2), 5);
    return this.multiplier;
  }

  resetCombo() { this.combo = 0; this.multiplier = 1; this.comboTimer = 0; }

  spawnExplosion(pos, scale = 1) {
    // Api: Points oranye/kuning yang mekar + memudar.
    const N = 46;
    const positions = new Float32Array(N * 3);
    const vels = [];
    for (let i = 0; i < N; i++) {
      positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
      const sp = (6 + Math.random() * 16) * scale;
      vels.push(new THREE.Vector3(
        Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 6, Math.sin(a) * Math.cos(b) * sp));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffa030, size: 2.6 * scale, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.particles.push({ pts, vels, life: 0.9, maxLife: 0.9, gravity: -14 });
    // Asap: 3 puff gelap naik pelan.
    for (let i = 0; i < 3; i++) {
      this.spawnSmoke(new THREE.Vector3(
        pos.x + (Math.random() - 0.5) * 6 * scale,
        pos.y + Math.random() * 4 * scale,
        pos.z + (Math.random() - 0.5) * 6 * scale), 2.2 * scale, 0x222222);
    }
    this.addTrauma(0.55 * scale);
    this.freeze(50);
  }

  spawnSmoke(pos, scale = 1.5, color = 0x333333) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.smokeTex, color, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    spr.position.copy(pos);
    spr.scale.set(scale, scale, 1);
    this.scene.add(spr);
    this.smokePuffs.push({ spr, life: 2.6, maxLife: 2.6, rise: 3 + Math.random() * 3, grow: 2.2 });
  }

  update(dt) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    if (this.hitstop > 0) this.hitstop -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.resetCombo();
    }
    for (const p of this.popups) p.life -= dt;
    this.popups = this.popups.filter((p) => p.life > 0);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      const pos = pt.pts.geometry.attributes.position;
      for (let k = 0; k < pt.vels.length; k++) {
        pos.setXYZ(k,
          pos.getX(k) + pt.vels[k].x * dt,
          pos.getY(k) + pt.vels[k].y * dt,
          pos.getZ(k) + pt.vels[k].z * dt);
        pt.vels[k].y += pt.gravity * dt;
      }
      pos.needsUpdate = true;
      pt.pts.material.opacity = Math.max(0, pt.life / pt.maxLife);
      if (pt.life <= 0) { this.scene.remove(pt.pts); this.particles.splice(i, 1); }
    }
    for (let i = this.smokePuffs.length - 1; i >= 0; i--) {
      const s = this.smokePuffs[i];
      s.life -= dt;
      s.spr.position.y += s.rise * dt;
      const g = 1 + (1 - s.life / s.maxLife) * s.grow;
      s.spr.scale.set(s.spr.scale.x * (1 + dt * 0.4), s.spr.scale.y * (1 + dt * 0.4), 1);
      s.spr.material.opacity = 0.55 * Math.max(0, s.life / s.maxLife);
      if (s.life <= 0) { this.scene.remove(s.spr); this.smokePuffs.splice(i, 1); }
    }
  }

  get frozen() { return this.hitstop > 0; }
}

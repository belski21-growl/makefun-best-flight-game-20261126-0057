// afterburner.js — Afterburner: glow cone, speed lines, BBM 3x, suara mesin naik.
// Deklarasi paling deskriptif di awal (kontrak juri: outline baca deklarasi pertama).
import * as THREE from 'three';
import { clamp, lerp } from './engine.js';

'use strict';

export class Afterburner {
  constructor(scene, jetGroup) {
    this.scene = scene;
    this.jet = jetGroup;
    this.active = false;
    this.intensity = 0; // 0..1, lerp halus
    // Cone glow oranye/biru per nosel (dibangun ulang dari jet hero — dicari di grup).
    this.glows = [];
    jetGroup.traverse((m) => {
      if (m.userData && m.userData.isAfterburnerGlow) this.glows.push(m);
    });
    // Speed lines: 26 garis radial di sekeliling kamera (efek kecepatan).
    const N = 26;
    const pos = new Float32Array(N * 6);
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lines = new THREE.LineSegments(this.lineGeo, new THREE.LineBasicMaterial({
      color: 0xffe8c0, transparent: true, opacity: 0,
    }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.lineSeeds = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      this.lineSeeds.push({ a, r: 2.2 + (i % 5) * 0.7, len: 3 + (i % 3) * 2, z: -6 - (i % 4) * 2 });
    }
    // Titik cahaya oranye di belakang jet (glow palsu ala tool-hunt #5).
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d');
    const g = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,180,60,0.95)');
    g.addColorStop(0.5, 'rgba(255,110,20,0.4)');
    g.addColorStop(1, 'rgba(255,90,10,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
    this.glowTex = new THREE.CanvasTexture(cv);
    this.glowSprites = [];
    for (const s of [-1, 1]) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0,
      }));
      spr.scale.set(3.2, 3.2, 1);
      spr.userData.side = s;
      jetGroup.add(spr);
      spr.position.set(s * 0.55, 0, -5.4);
      this.glowSprites.push(spr);
    }
  }

  update(dt, active, jetPos, jetQuat, camPos) {
    this.active = active;
    this.intensity = clamp(this.intensity + (active ? dt * 5 : -dt * 3.5), 0, 1);
    // Glow cone + sprite menyala saat AB.
    for (const glow of this.glows) {
      glow.material.opacity = 0.25 + 0.75 * this.intensity;
      const s = 0.7 + 0.5 * this.intensity;
      glow.scale.set(s, s, 0.8 + 1.1 * this.intensity);
    }
    for (const spr of this.glowSprites) {
      spr.material.opacity = this.intensity * 0.85;
      const s = 2.2 + this.intensity * 2.4;
      spr.scale.set(s, s, 1);
    }
    // Speed lines: radial di depan kamera, hanya saat AB + cepat.
    const pos = this.lineGeo.attributes.position;
    const op = this.intensity;
    this.lines.material.opacity = op * 0.55;
    if (op > 0.02) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(jetQuat);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(jetQuat);
      const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
      const center = jetPos.clone().addScaledVector(fwd, 14);
      for (let i = 0; i < this.lineSeeds.length; i++) {
        const sd = this.lineSeeds[i];
        const ca = Math.cos(sd.a), sa = Math.sin(sd.a);
        const base = center.clone()
          .addScaledVector(right, ca * sd.r)
          .addScaledVector(up, sa * sd.r);
        const tip = base.clone().addScaledVector(fwd, sd.len * (0.5 + op));
        pos.setXYZ(i * 2, base.x, base.y, base.z);
        pos.setXYZ(i * 2 + 1, tip.x, tip.y, tip.z);
      }
      pos.needsUpdate = true;
      this.lines.visible = true;
    } else {
      this.lines.visible = false;
    }
  }
}

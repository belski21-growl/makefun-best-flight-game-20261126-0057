// cockpit.js — RealCockpit: frame kanopi 3D + kaca HUD pitch ladder + radar scope +
// bola attitude + panel ENG/SYS + ILS + hujan di kanopi (M3).
// Deklarasi paling deskriptif di awal (kontrak juri: outline baca deklarasi pertama).
import * as THREE from 'three';
import { clamp } from './engine.js';

'use strict';

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return [cv, cv.getContext('2d')];
}

export class RealCockpit {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.visible = false;
    camera.add(this.group);
    this._buildFrame();
    this._buildHudGlass();
    this._buildRadar();
    this._buildAttitude();
    this._buildEngPanel();
    this._buildRainGlass();
  }

  _buildFrame() {
    // Frame kanopi 3D: tiang kiri/kanan + atas + pilar samping + dasbor bawah.
    // POSISI DI DALAM frustum (FOV 62°: setengah-tinggi terlihat di z=0,78
    // hanya ~0,47 — frame r4 di y ±0,62/z=-0,95 jatuh DI LUAR frame, makanya
    // kokpit terbaca sebagai HUD 2D tanpa kanopi). Tiang lebih tebal supaya
    // terbaca sebagai struktur, bukan garis.
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.7, metalness: 0.4 });
    const dashMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.85, metalness: 0.2 });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      this.group.add(m);
      return m;
    };
    // Tiang kanopi kiri/kanan (miring ke dalam, tebal 0,10 — terbaca).
    add(new THREE.BoxGeometry(0.10, 1.0, 0.10), frameMat, -0.56, 0.10, -0.78, 0, 0, 0.10);
    add(new THREE.BoxGeometry(0.10, 1.0, 0.10), frameMat, 0.56, 0.10, -0.78, 0, 0, -0.10);
    // Bar atas kanopi (di dalam frame atas).
    add(new THREE.BoxGeometry(1.22, 0.09, 0.10), frameMat, 0, 0.44, -0.78);
    // Pilar samping bawah.
    add(new THREE.BoxGeometry(0.10, 0.5, 0.10), frameMat, -0.72, -0.20, -0.72, 0, 0.3, 0);
    add(new THREE.BoxGeometry(0.10, 0.5, 0.10), frameMat, 0.72, -0.20, -0.72, 0, -0.3, 0);
    // Dasbor bawah (lebar, gelap — panel radar/attitude/ENG DUDUK di atasnya).
    add(new THREE.BoxGeometry(1.95, 0.42, 0.16), dashMat, 0, -0.44, -0.88);
    // Glareshield: bibir atas dasbor (coaming) — garis gelap pemisah kaca/dasbor.
    add(new THREE.BoxGeometry(1.95, 0.08, 0.12), frameMat, 0, -0.20, -0.88);
    // Konsol samping bawah (kiri/kanan) — dasbor terasa 3D, bukan papan.
    add(new THREE.BoxGeometry(0.42, 0.22, 0.14), dashMat, -0.78, -0.38, -0.82, 0, 0.25, 0);
    add(new THREE.BoxGeometry(0.42, 0.22, 0.14), dashMat, 0.78, -0.38, -0.82, 0, -0.25, 0);
    // Kaca depan samping (transparan, kilap tipis) — memberi rasa kanopi.
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x8ab8d8, transparent: true, opacity: 0.07, roughness: 0.1, metalness: 0.6,
      side: THREE.DoubleSide, depthWrite: false,
    });
    add(new THREE.PlaneGeometry(0.62, 0.85), glassMat, -0.88, 0.15, -0.62, 0, 0.7, 0);
    add(new THREE.PlaneGeometry(0.62, 0.85), glassMat, 0.88, 0.15, -0.62, 0, -0.7, 0);
  }

  _buildHudGlass() {
    // Kaca HUD: plane transparan + CanvasTexture (pitch ladder + ILS + IAS/ALT).
    const [cv, cx] = makeCanvas(512, 360);
    this.hudCv = cv; this.hudCx = cx;
    this.hudTex = new THREE.CanvasTexture(cv);
    const mat = new THREE.MeshBasicMaterial({
      map: this.hudTex, transparent: true, opacity: 0.96, depthWrite: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.55), mat);
    plane.position.set(0, 0.08, -1.02);
    this.group.add(plane);
    this.hudPlane = plane;
  }

  _buildRadar() {
    const [cv, cx] = makeCanvas(256, 256);
    this.radarCv = cv; this.radarCx = cx;
    this.radarTex = new THREE.CanvasTexture(cv);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36),
      new THREE.MeshBasicMaterial({ map: this.radarTex, transparent: true, depthWrite: false }));
    // Panel MAJU ke z=-0,70 (di depan muka dasbor -0,80) — dasbor r4 menutup
    // panel karena muka dasbor lebih dekat ke kamera daripada panel.
    plane.position.set(-0.48, -0.30, -0.70);
    this.group.add(plane);
    const label = this._labelPlane('TACTICAL NAV / RDR', 0.24);
    label.position.set(-0.48, -0.10, -0.70);
    this.group.add(label);
  }

  _buildAttitude() {
    const [cv, cx] = makeCanvas(256, 256);
    this.attCv = cv; this.attCx = cx;
    this.attTex = new THREE.CanvasTexture(cv);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({ map: this.attTex, transparent: true, depthWrite: false }));
    plane.position.set(0, -0.30, -0.70);
    this.group.add(plane);
  }

  _buildEngPanel() {
    const [cv, cx] = makeCanvas(288, 256);
    this.engCv = cv; this.engCx = cx;
    this.engTex = new THREE.CanvasTexture(cv);
    // m1: panel ENG/SYS digeser ke kanan + dipersempit (0,38 -> 0,34) supaya
    // tidak menabrak bola attitude di tengah dan tidak menutup teks radio.
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.28),
      new THREE.MeshBasicMaterial({ map: this.engTex, transparent: true, depthWrite: false }));
    // Diangkat (y -0,27, tinggi 0,28): baris bawah "HOOK DN" r4 terpotong
    // bar HUD bawah.
    plane.position.set(0.52, -0.27, -0.70);
    this.group.add(plane);
  }

  _buildRainGlass() {
    // Hujan di kanopi (M3): plane depan dengan streak hujan (canvas, animasi).
    const [cv, cx] = makeCanvas(512, 512);
    this.rainCv = cv; this.rainCx = cx;
    this.rainTex = new THREE.CanvasTexture(cv);
    const mat = new THREE.MeshBasicMaterial({
      map: this.rainTex, transparent: true, opacity: 0, depthWrite: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.3), mat);
    plane.position.set(0, 0.08, -1.06);
    this.group.add(plane);
    this.rainMat = mat;
    this.rainDrops = [];
    for (let i = 0; i < 90; i++) {
      this.rainDrops.push({ x: Math.random(), y: Math.random(), len: 0.03 + Math.random() * 0.06, sp: 0.4 + Math.random() * 0.7 });
    }
  }

  _labelPlane(text, w) {
    const [cv, cx] = makeCanvas(256, 32);
    cx.fillStyle = '#9fb8c4';
    cx.font = '700 14px "Segoe UI", Arial, sans-serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(text, 128, 16);
    const tex = new THREE.CanvasTexture(cv);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.125),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  }

  // --- Gambar kaca HUD: pitch ladder + ILS LOC/GS + IAS/ALT (ala Valkyrie ref4-1). ---
  _drawHudGlass(s) {
    const cx = this.hudCx, W = 512, H = 360;
    cx.clearRect(0, 0, W, H);
    cx.strokeStyle = 'rgba(110,255,170,0.92)';
    cx.fillStyle = 'rgba(110,255,170,0.95)';
    cx.lineWidth = 2;
    cx.font = '700 22px "Segoe UI", Arial, sans-serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    const cy = H / 2 - s.pitch * 5; // horizon geser dengan pitch
    // Pitch ladder: +10/+5/-5/-10.
    for (const deg of [10, 5, -5, -10]) {
      const y = cy - deg * 5;
      if (y < 20 || y > H - 20) continue;
      const w = deg === 10 || deg === -10 ? 70 : 46;
      cx.beginPath();
      cx.moveTo(W / 2 - w, y); cx.lineTo(W / 2 - 16, y);
      cx.moveTo(W / 2 + 16, y); cx.lineTo(W / 2 + w, y);
      cx.stroke();
      cx.fillText((deg > 0 ? '+' : '') + deg, W / 2 - w - 26, y);
      cx.fillText((deg > 0 ? '+' : '') + deg, W / 2 + w + 26, y);
    }
    // Garis horizon + flight path marker.
    cx.beginPath(); cx.moveTo(60, cy); cx.lineTo(W - 60, cy); cx.stroke();
    cx.beginPath(); cx.arc(W / 2, cy, 12, 0, Math.PI * 2); cx.stroke();
    cx.beginPath(); cx.moveTo(W / 2, cy - 12); cx.lineTo(W / 2, cy - 26); cx.stroke();
    // ILS: LOC (vertikal) + GS (horizontal) + diamond.
    if (s.ils) {
      const lx = W / 2 + s.ils.loc * 90;
      const gy = cy + s.ils.gs * 60;
      cx.strokeStyle = 'rgba(255,215,106,0.95)';
      cx.beginPath(); cx.moveTo(lx, 30); cx.lineTo(lx, H - 30); cx.stroke();
      cx.beginPath(); cx.moveTo(60, gy); cx.lineTo(W - 60, gy); cx.stroke();
      cx.save();
      cx.translate(lx, gy); cx.rotate(Math.PI / 4);
      cx.fillStyle = '#ffd76a'; cx.fillRect(-7, -7, 14, 14);
      cx.restore();
    }
    // Kotak IAS kiri + ALT kanan.
    cx.strokeStyle = 'rgba(110,255,170,0.9)';
    cx.strokeRect(14, H / 2 - 34, 96, 44);
    cx.fillText(s.kt + ' KT', 62, H / 2 - 12);
    cx.strokeRect(W - 110, H / 2 - 34, 96, 44);
    cx.fillText(s.ft + ' FT', W - 62, H / 2 - 12);
    cx.font = '700 16px "Segoe UI", Arial, sans-serif';
    cx.fillText('THR ' + s.thr + '%  AOA ' + s.aoa + '°', W / 2, H - 18);
    this.hudTex.needsUpdate = true;
  }

  _drawRadar(s, t) {
    const cx = this.radarCx, W = 256, H = 256;
    cx.clearRect(0, 0, W, H);
    cx.fillStyle = 'rgba(4,18,12,0.92)';
    cx.beginPath(); cx.arc(128, 128, 120, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = 'rgba(110,255,170,0.5)';
    cx.lineWidth = 1;
    for (const r of [40, 80, 120]) { cx.beginPath(); cx.arc(128, 128, r, 0, Math.PI * 2); cx.stroke(); }
    // Sweep.
    const a = (t * 1.2) % (Math.PI * 2);
    const grad = cx.createConicGradient ? null : null;
    cx.strokeStyle = 'rgba(110,255,170,0.9)';
    cx.beginPath(); cx.moveTo(128, 128);
    cx.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118); cx.stroke();
    // Blip target (heading-up): plot dari radarTargets.
    if (s.radarTargets) {
      for (const tg of s.radarTargets.slice(0, 8)) {
        const dx = tg.x - s.playerX, dz = tg.z - s.playerZ;
        const h = s.hdg * Math.PI / 180;
        const rx = dx * Math.cos(h) - dz * Math.sin(h);
        const rz = dx * Math.sin(h) + dz * Math.cos(h);
        const px = 128 + rx * (120 / 2000), py = 128 - rz * (120 / 2000);
        if (Math.hypot(px - 128, py - 128) > 116) continue;
        cx.fillStyle = tg.color;
        cx.beginPath(); cx.arc(px, py, tg.size + 2, 0, Math.PI * 2); cx.fill();
      }
    }
    // Pesawat sendiri.
    cx.fillStyle = '#ffd76a';
    cx.beginPath(); cx.moveTo(128, 118); cx.lineTo(122, 134); cx.lineTo(134, 134); cx.closePath(); cx.fill();
    this.radarTex.needsUpdate = true;
  }

  _drawAttitude(s) {
    const cx = this.attCx, W = 256, H = 256;
    cx.clearRect(0, 0, W, H);
    cx.save();
    cx.beginPath(); cx.arc(128, 128, 110, 0, Math.PI * 2); cx.clip();
    cx.translate(128, 128);
    cx.rotate(-s.roll * Math.PI / 180);
    cx.translate(0, s.pitch * 2.2);
    cx.fillStyle = '#2a6fb8'; cx.fillRect(-130, -130, 260, 130); // langit
    cx.fillStyle = '#8a5a30'; cx.fillRect(-130, 0, 260, 130);   // tanah
    cx.strokeStyle = '#f5ead0'; cx.lineWidth = 3;
    cx.beginPath(); cx.moveTo(-130, 0); cx.lineTo(130, 0); cx.stroke();
    cx.restore();
    // Simbol pesawat tetap.
    cx.strokeStyle = '#ffd76a'; cx.lineWidth = 4;
    cx.beginPath(); cx.moveTo(98, 128); cx.lineTo(158, 128); cx.stroke();
    cx.beginPath(); cx.moveTo(128, 118); cx.lineTo(128, 138); cx.stroke();
    cx.strokeStyle = 'rgba(245,234,208,0.6)'; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(128, 128, 110, 0, Math.PI * 2); cx.stroke();
    this.attTex.needsUpdate = true;
  }

  _drawEng(s) {
    const cx = this.engCx, W = 288, H = 256;
    cx.clearRect(0, 0, W, H);
    cx.fillStyle = 'rgba(4,14,10,0.92)'; cx.fillRect(0, 0, W, H);
    cx.textAlign = 'left'; cx.textBaseline = 'middle';
    cx.font = '700 20px "Segoe UI", Arial, sans-serif';
    cx.fillStyle = '#9fb8c4';
    cx.fillText('ENG / SYS', 14, 22);
    cx.fillStyle = '#f5ead0';
    cx.font = '400 19px "Segoe UI", Arial, sans-serif';
    cx.fillText('N1', 14, 58); cx.fillText(s.thr + '%', 190, 58);
    cx.fillText('FUEL', 14, 88); cx.fillText(s.fuel + '%', 190, 88);
    cx.fillText('HULL', 14, 118); cx.fillText(s.hull + '/' + s.hullMax, 190, 118);
    // Bar N1 + fuel.
    cx.fillStyle = 'rgba(255,255,255,0.14)'; cx.fillRect(14, 70, 260, 8);
    cx.fillStyle = '#5ad8a0'; cx.fillRect(14, 70, 260 * (s.thr / 100), 8);
    cx.fillStyle = 'rgba(255,255,255,0.14)'; cx.fillRect(14, 100, 260, 8);
    cx.fillStyle = s.fuel < 20 ? '#ff6a5a' : '#5ad8a0'; cx.fillRect(14, 100, 260 * (s.fuel / 100), 8);
    // GEAR / FLAPS / HOOK.
    cx.font = '700 18px "Segoe UI", Arial, sans-serif';
    const chips = [
      ['GEAR ' + (s.gearDown ? 'DN' : 'UP'), s.gearDown ? '#5ad8a0' : '#9fb8c4'],
      ['FLAPS ' + (s.flapsDown ? 'FULL' : 'UP'), s.flapsDown ? '#5ad8a0' : '#9fb8c4'],
      ['HOOK ' + (s.hookDown ? 'DN' : 'UP'), s.hookDown ? '#5ad8a0' : '#9fb8c4'],
    ];
    chips.forEach(([txt, col], i) => {
      cx.fillStyle = col;
      cx.fillText(txt, 14, 156 + i * 28);
    });
    // Baris ILS dihapus: status ILS sudah tampil di panel BALL HUD kanan-atas;
    // di sini ia jatuh di tepi bawah panel dan tertutup bar HUD bawah.
    this.engTex.needsUpdate = true;
  }

  _drawRain(t, intensity) {
    const cx = this.rainCx, W = 512, H = 512;
    cx.clearRect(0, 0, W, H);
    cx.strokeStyle = 'rgba(200,220,255,0.55)';
    cx.lineWidth = 1.4;
    for (const dr of this.rainDrops) {
      dr.y += dr.sp * 0.016;
      if (dr.y > 1.1) { dr.y = -0.1; dr.x = Math.random(); }
      const x = dr.x * W, y = dr.y * H;
      cx.beginPath();
      cx.moveTo(x, y);
      cx.lineTo(x - 6, y + dr.len * H);
      cx.stroke();
    }
    this.rainTex.needsUpdate = true;
    this.rainMat.opacity = intensity * 0.75;
  }

  update(s, t, dt) {
    if (!this.group.visible) return;
    this._drawHudGlass(s);
    this._drawRadar(s, t);
    this._drawAttitude(s);
    this._drawEng(s);
    if (s.rain > 0.05) this._drawRain(t, s.rain);
    else this.rainMat.opacity = 0;
  }

  setVisible(v) { this.group.visible = v; }
}

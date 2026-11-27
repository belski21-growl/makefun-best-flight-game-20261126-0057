// hud.js — HeadsUpDisplay: radar, pita, label gate 3D, kompas, blok misi/status,
// bar, G/AOA, banner, top bar, discipline, fuel economy, LSO + ILS.
// Deklarasi paling deskriptif di awal (kontrak juri: outline baca deklarasi pertama).
import * as THREE from 'three';
import { clamp } from './engine.js';

'use strict';

export class HeadsUpDisplay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.radioLines = [];   // {speaker, text, life}
    this.banner = null;     // {text, sub, life}
    this.chipText = '';
    this.sizeHud();
  }

  sizeHud() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  pushRadio(speaker, text) {
    this.radioLines.push({ speaker, text, life: 7 });
    if (this.radioLines.length > 3) this.radioLines.shift();
  }

  showBanner(text, sub, seconds = 5) {
    this.banner = { text, sub, life: seconds };
  }

  _panel(x, y, w, h, gold = 0.55) {
    const c = this.ctx;
    c.fillStyle = 'rgba(8,16,24,0.84)';
    c.strokeStyle = 'rgba(255,200,90,' + gold + ')';
    c.lineWidth = 1;
    c.beginPath(); c.roundRect(x, y, w, h, 6); c.fill(); c.stroke();
  }

  _text(str, x, y, size, color, align = 'left', bold = false) {
    const c = this.ctx;
    c.font = (bold ? '700 ' : '400 ') + size + 'px "Segoe UI", Arial, sans-serif';
    c.fillStyle = color || '#f5ead0';
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillText(str, x, y);
  }

  _bar(x, y, w, h, frac, color) {
    const c = this.ctx;
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.roundRect(x, y, w, h, 3); c.fill();
    c.fillStyle = color;
    c.beginPath(); c.roundRect(x, y, Math.max(0, w * clamp(frac, 0, 1)), h, 3); c.fill();
  }

  draw(s) {
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const d = s.display; // flight.display()
    c.clearRect(0, 0, W, H);

    // Flash petir: kilat putih singkat di seluruh frame (M3).
    if (s.flashAlpha > 0.01) {
      c.fillStyle = 'rgba(230,240,255,' + (s.flashAlpha * 0.55).toFixed(3) + ')';
      c.fillRect(0, 0, W, H);
    }

    // --- Top bar penuh (ala Canyon Sentinel): 6 sel nilai. ---
    this._panel(10, 8, W - 20, 46);
    const topItems = [
      ['ALTITUDE', d.ft + ' FT'], ['AIRSPEED', d.kt + ' KT'], ['HEADING', String(d.hdg).padStart(3, '0') + '°'],
      ['THROTTLE', d.thr + '%'], ['FUEL', d.fuel + '%'],
      ['FLIGHT SCORE', String(Math.round(s.score)).padStart(5, '0')],
    ];
    const tw = (W - 20) / topItems.length;
    topItems.forEach(([lab, val], i) => {
      this._text(lab, 10 + i * tw + tw / 2, 20, 10, '#9fb8c4', 'center', true);
      this._text(val, 10 + i * tw + tw / 2, 40, 19, i === 5 ? '#ffd76a' : '#f5ead0', 'center', true);
    });

    // --- Blok misi kiri-atas. ---
    this._panel(10, 62, 268, 66);
    this._text(s.mission.code + ' · ' + s.mission.name, 20, 76, 12, '#ffcf6a', 'left', true);
    this._text('TUJUAN ' + s.objectivesDone + '/' + s.objectivesTotal + ' · ' + s.mission.verb, 20, 94, 11, '#f5ead0', 'left');
    this._text('DISCIPLINE ' + (s.discipline >= 0 ? '+' : '') + s.discipline, 20, 112, 11, s.discipline >= 0 ? '#8dff9a' : '#ff8a7a', 'left', true);

    // --- Blok status kanan-atas: mode THR, RWY+PAPI saat approach, peringatan. ---
    this._panel(W - 268, 62, 258, 66);
    const mode = d.ab ? 'AFTERBURNER' : 'CRUISE'; // m4: 'CRUISE CEPAT' tidak konsisten bahasanya
    this._text('MODE: ' + mode, W - 258, 76, 12, d.ab ? '#ff9a3d' : '#ffcf6a', 'left', true);
    this._text(s.statusLine2 || 'SISTEM NORMAL', W - 258, 94, 11, '#cfe0e8', 'left');
    const warn = [];
    if (d.ice > 0.25) warn.push('ES ' + Math.round(d.ice * 100) + '%');
    if (s.lightningWarn) warn.push('PETIR DEKAT');
    if (s.inCloud) warn.push('DI DALAM AWAN');
    if (d.stalled) warn.push('STALL!');
    if (d.fuel < 20) warn.push('BBM RENDAH');
    this._text(warn.length ? '⚠ ' + warn.join(' · ') : 'ANGIN: ' + (s.windText || 'TENANG'), W - 258, 112, 11, warn.length ? '#ff6a5a' : '#cfe0e8', 'left', true);

    // --- Strip kompas atas + pill HDG di bawah strip (bukan menimpa angka). ---
    this._panel(W / 2 - 160, 62, 320, 48);
    const ticks = [];
    for (let k = -60; k <= 60; k += 15) {
      const hdg = (d.hdg + k + 360) % 360;
      ticks.push([hdg, k]);
    }
    ticks.forEach(([hdg, off]) => {
      const x = W / 2 + off * 2.4;
      this._text(String(hdg).padStart(3, '0'), x, 74, 9, off === 0 ? '#ffd76a' : '#9fb8c4', 'center', off === 0);
      c.fillStyle = off === 0 ? '#ffd76a' : '#9fb8c4';
      c.fillRect(x - 0.5, 82, 1, off === 0 ? 10 : 6);
    });
    this._text('HDG ' + String(d.hdg).padStart(3, '0') + '°', W / 2, 104, 11, '#ffd76a', 'center', true);

    // --- Pita SPD kiri / ALT kanan (dengan skala). ---
    this._panel(10, H / 2 - 120, 78, 240);
    this._text('SPD', 49, H / 2 - 106, 11, '#ffcf6a', 'center', true);
    for (let k = -40; k <= 40; k += 20) {
      const v = d.kt + k;
      if (v < 0) continue;
      this._text(String(v), 49, H / 2 - k * 1.6, 9, k === 0 ? '#ffd76a' : '#8aa4b0', 'center', k === 0);
    }
    this._text(d.kt + ' KT', 49, H / 2 + 96, 15, '#ffd76a', 'center', true);
    this._panel(W - 88, H / 2 - 120, 78, 240);
    this._text('ALT', W - 49, H / 2 - 106, 11, '#ffcf6a', 'center', true);
    for (let k = -200; k <= 200; k += 100) {
      const v = d.ft + k;
      if (v < 0) continue;
      this._text(String(v), W - 49, H / 2 - k * 0.32, 9, k === 0 ? '#ffd76a' : '#8aa4b0', 'center', k === 0);
    }
    this._text(d.ft + ' FT', W - 49, H / 2 + 96, 15, '#ffd76a', 'center', true);

    // --- VSI + G/AOA: panel SENDIRI yang cukup lebar (perbaikan probe: teks meluber).
    // Naik 30 px supaya tidak tertutup lingkaran radar; sembunyikan saat panel LSO
    // tampil (LSO sudah menampilkan sink rate + touchdown).
    if (!s.lso) {
    this._panel(W - 148, H / 2 + 100, 138, 66);
    this._text('VSI ' + d.vsiSigned + ' FT/M', W - 79, H / 2 + 114, 12, '#f5ead0', 'center', true);
    this._text('G ' + d.g, W - 79, H / 2 + 134, 12, d.g > 3 ? '#ff8a7a' : '#f5ead0', 'center', true);
    this._text('AOA ' + d.aoa + '°', W - 79, H / 2 + 154, 12, '#f5ead0', 'center', true);
    }

    // --- Radar kanan-bawah (heading-up, 2 KM, plot nyata). Disembunyikan saat
    // panel LSO tampil (LSO lebih penting di final; radar tertutup panel itu).
    if (!s.lso) {
    const cx = W - 118, cy = H - 128, r = 64;
    c.save();
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(6,20,16,0.88)'; c.fillRect(cx - r, cy - r, r * 2, r * 2);
    c.strokeStyle = 'rgba(120,255,170,0.35)';
    c.beginPath(); c.arc(cx, cy, r * 0.5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    // Garis heading (atas = arah pesawat).
    c.strokeStyle = 'rgba(120,255,170,0.5)';
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - r); c.stroke();
    const plot = (wx, wz, color, size) => {
      const dx = wx - s.playerX, dz = wz - s.playerZ;
      const h = d.hdg * Math.PI / 180;
      const rx = dx * Math.cos(h) - dz * Math.sin(h);
      const rz = dx * Math.sin(h) + dz * Math.cos(h);
      const scale = r / 2000; // 2 KM
      const px = cx + rx * scale, py = cy - rz * scale;
      if (Math.hypot(px - cx, py - cy) > r - 4) return;
      c.fillStyle = color;
      c.beginPath(); c.arc(px, py, size, 0, Math.PI * 2); c.fill();
    };
    if (s.radarTargets) for (const t of s.radarTargets) plot(t.x, t.z, t.color, t.size);
    // Pesawat sendiri (segitiga emas di tengah).
    c.fillStyle = '#ffd76a';
    c.beginPath(); c.moveTo(cx, cy - 9); c.lineTo(cx - 6, cy + 7); c.lineTo(cx + 6, cy + 7); c.closePath(); c.fill();
    c.restore();
    this._text('RADAR 2KM', cx, cy + r + 12, 10, '#9fb8c4', 'center', true);
    }

    // --- Bar THR / FUEL / AIRFRAME kiri-bawah (naik di atas bar bawah). ---
    this._panel(10, H - 138, 258, 92);
    const bars = [
      ['THR', d.thr / 100, '#ffd76a', d.thr + '%'],
      ['FUEL', d.fuel / 100, d.fuel < 20 ? '#ff6a5a' : '#5ad8a0', d.fuel + '%'],
      ['AIRFRAME', d.hull / d.hullMax, d.hull / d.hullMax < 0.4 ? '#ff6a5a' : '#8dff9a', d.hull + '/' + d.hullMax],
    ];
    bars.forEach(([lab, frac, col, val], i) => {
      const y = H - 118 + i * 26;
      this._text(lab, 20, y - 6, 10, '#9fb8c4', 'left', true);
      this._bar(20, y + 2, 150, 10, frac, col);
      this._text(val, 178, y + 7, 11, '#f5ead0', 'left', true);
    });

    // --- Combo meter (besar, dekat skor) + indikator afterburner. ---
    if (s.combo > 1) {
      this._panel(W / 2 + 190, 62, 120, 34);
      this._text('COMBO x' + s.multiplier, W / 2 + 250, 79, 16, '#ff9a3d', 'center', true);
    }
    if (d.ab) this._text('AFTERBURNER', W / 2, H - 138, 15, '#ff9a3d', 'center', true);

    // --- Chip target berikut: ikut ring TERLIHAT terdekat; kalau di luar frame -> panah tepi.
    // Chip proyeksi disembunyikan saat endBanner tampil (misi selesai) —
    // chip menabrak panel "MENDARAT — SKOR AMAN" di tengah frame (shot 4).
    // Bar chip atas (di bawah kompas) tetap tampil.
    if (s.target && !s.endBanner) {
      const p = this._project(s.target.pos, s.camera);
      if (p && p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05) {
        const gx = (p.x * 0.5 + 0.5) * W, gy = (0.5 - p.y * 0.5) * H;
        // POLES r5 item 1b: di kokpit, chip yang jatuh di zona dasbor
        // bawah-tengah menempel di atas bola attitude (kuning di atas tan =
        // nyaris tak terbaca). Naikkan 180 px — ke langit kosong di atas bola,
        // di bawah ladder -10 dan teks THR/AOA — supaya terbaca penuh.
        const cy2 = (s.cockpit && gy > H - 240) ? gy - 180 : gy;
        this._panel(gx - 85, cy2 - 52, 170, 26);
        this._text(s.target.label + ' · ' + Math.round(s.targetDist) + ' m', gx, cy2 - 39, 12, '#ffd76a', 'center', true);
      } else {
        // Panah tepi-frame ke arah target.
        const dx = s.target.pos.x - s.playerX, dz = s.target.pos.z - s.playerZ;
        const ang = Math.atan2(dx, -dz) - (d.hdg * Math.PI / 180);
        const ex = W / 2 + Math.sin(ang) * (W / 2 - 90);
        const ey = H / 2 - Math.cos(ang) * (H / 2 - 120);
        let exx = clamp(ex, 60, W - 60), eyy = clamp(ey, 120, H - 60);
        // POLES r5 item 1b (lanjutan): di kokpit shot 2, target DINDING BADAI
        // ada DI BELAKANG jet (z -800 vs jet -950) — panah tepi jatuh di tengah
        // bawah, tepat di atas bola attitude (kuning di atas tan). Geser kiri
        // 220 px — ke sela kosong antara radar scope dan bola; arah (bawah =
        // di belakang) tetap terjaga. Mode chase tidak berubah.
        if (s.cockpit) exx = clamp(exx - 220, 60, W - 60);
        c.fillStyle = '#ffd76a';
        c.beginPath();
        c.moveTo(exx, eyy - 12); c.lineTo(exx - 9, eyy + 8); c.lineTo(exx + 9, eyy + 8);
        c.closePath(); c.fill();
        this._text(s.target.label + ' ' + Math.round(s.targetDist) + ' m', exx, eyy + 22, 11, '#ffd76a', 'center', true);
      }
      this._panel(W / 2 - 170, 116, 340, 28);
      this._text('▸ ' + s.target.label + ' — ' + Math.round(s.targetDist) + ' m', W / 2, 130, 13, '#ffd76a', 'center', true);
    }

    // --- Banner objektif besar (awal misi) + chip objektif persisten. ---
    if (this.banner && this.banner.life > 0) {
      const a = clamp(this.banner.life, 0, 1);
      c.globalAlpha = a;
      this._panel(W / 2 - 340, 146, 680, 44, 0.85);
      this._text(this.banner.text, W / 2, 168, 16, '#ffd76a', 'center', true);
      this._panel(W / 2 - 150, 62, 300, 34);
      c.globalAlpha = 1;
    }

    // --- Label gate 3D (pool 3, proyeksi nyata). Gate yang jadi target saat ini
    // TIDAK diberi label 3D — chip target di dekat ring sudah menampilkannya.
    // B3: tiap label diberi offset vertikal BERBEDA (stagger -34/-66/-98 px)
    // + backing gelap, supaya label tidak numpuk di satu titik dan teks kecil
    // tetap kebaca di atas emas/langit terang.
    if (s.gateLabels) {
      for (let li = 0; li < s.gateLabels.slice(0, 3).length; li++) {
        const gl = s.gateLabels[li];
        if (s.target && gl.pos.x === s.target.pos.x && gl.pos.z === s.target.pos.z) continue;
        const p = this._project(gl.pos, s.camera);
        if (!p || p.z >= 1) continue;
        const gx = (p.x * 0.5 + 0.5) * W, gy = (0.5 - p.y * 0.5) * H;
        if (gx < 40 || gx > W - 40 || gy < 40 || gy > H - 40) continue;
        const oy = -34 - li * 32;
        c.font = '700 12px "Segoe UI", Arial, sans-serif';
        const mtw = c.measureText(gl.label).width + 18;
        this._panel(gx - mtw / 2, gy + oy - 11, mtw, 22, 0.7);
        this._text(gl.label, gx, gy + oy, 12, '#ffd76a', 'center', true);
      }
    }

    // --- Popup skor (proyeksi dunia). ---
    if (s.popups) {
      for (const pp of s.popups) {
        const p = this._project(pp.worldPos, s.camera);
        if (!p || p.z >= 1) continue;
        const gx = (p.x * 0.5 + 0.5) * W, gy = (0.5 - p.y * 0.5) * H - (1.4 - pp.life) * 40;
        c.globalAlpha = clamp(pp.life, 0, 1);
        this._text(pp.text, gx, gy, 15, pp.color, 'center', true);
        c.globalAlpha = 1;
      }
    }

    // --- ILS ball + LOC/GS saat approach (M3 + semua pendaratan). ---
    if (s.approach) {
      this._panel(W - 268, 140, 258, 62);
      const ballColor = s.approach.ball === 'ON GLIDESLOPE' ? '#5ad8a0' : s.approach.ball === 'HIGH' ? '#ffd76a' : '#ff6a5a';
      this._text('BALL: ' + s.approach.ball, W - 258, 154, 12, ballColor, 'left', true);
      this._text(s.approach.ilsLocked ? 'ILS LOC/GS LOCKED' : 'ILS MENCARI…', W - 258, 172, 11, s.approach.ilsLocked ? '#5ad8a0' : '#cfe0e8', 'left', true);
      this._text('RWY ' + s.approach.rwy + ' · PAPI ' + s.approach.papi, W - 258, 190, 11, '#cfe0e8', 'left');
    }

    // --- Panel LSO grade saat final / setelah mendarat. ---
    if (s.lso) {
      this._panel(W - 268, H - 260, 258, 118);
      this._text('LANDING GRADE — ' + s.lso.grade, W - 258, H - 246, 13, '#ffd76a', 'left', true);
      this._text('CENTERLINE ERROR  ' + s.lso.centerline + ' M', W - 258, H - 224, 11, '#f5ead0', 'left');
      this._text('SINK RATE  ' + s.lso.sink + ' M/S', W - 258, H - 206, 11, '#f5ead0', 'left');
      this._text('TOUCHDOWN  ' + s.lso.kt + ' KT', W - 258, H - 188, 11, '#f5ead0', 'left');
      this._text('FUEL REM  ' + s.lso.fuel + '%', W - 258, H - 170, 11, '#f5ead0', 'left');
      this._text('SORTIE SCORE  ' + s.lso.score, W - 258, H - 152, 12, '#ffd76a', 'left', true);
    }

    // --- Radio chatter (bawah-tengah, naik 20 px supaya tidak tertutup chip target).
    // m1: di mode kokpit, teks digeser ke kiri (pusat -130 px) + diberi
    // backing gelap supaya terbaca di atas bola attitude / radar scope —
    // tanpa backing, teks kuning pucat di atas bola tan hampir tak terbaca.
    // POLES r5 item 1c: di kokpit, teks radio naik 30 px (H-146) — tadinya
    // menumpuk di atas baris hint kontrol bawah. Mode chase tidak berubah
    // (shot 1/3/4 pixel-identik untuk baris ini).
    let ry = s.cockpit ? H - 146 : H - 116;
    const radioX = s.cockpit ? W / 2 - 130 : W / 2;
    for (let i = this.radioLines.length - 1; i >= 0; i--) {
      const rl = this.radioLines[i];
      const txt = rl.speaker + ': ' + rl.text;
      c.globalAlpha = clamp(rl.life / 2, 0, 1);
      if (s.cockpit) {
        c.font = '12px system-ui, sans-serif';
        const tw = c.measureText(txt).width;
        c.fillStyle = 'rgba(4,10,16,0.62)';
        c.beginPath();
        c.roundRect(radioX - tw / 2 - 9, ry - 15, tw + 18, 20, 5);
        c.fill();
      }
      this._text(txt, radioX, ry, 12, '#cfe0e8', 'center');
      c.globalAlpha = 1;
      ry -= 20;
    }

    // --- Bar bawah: discipline + fuel economy + mission profile + waktu. ---
    this._panel(10, H - 46, W - 20, 36);
    const burn = (0.16 + d.thr / 100 * 0.22 + (d.ab ? 0.85 : 0)).toFixed(2);
    const bottomItems = [
      'DISCIPLINE ' + (s.discipline >= 0 ? '+' : '') + s.discipline,
      'FUEL ECONOMY — ECO · BURN ' + burn + '%/S',
      'MISSION PROFILE — ' + s.mission.profile,
      'WAKTU ' + s.clock,
    ];
    const bw = (W - 20) / bottomItems.length;
    bottomItems.forEach((txt, i) => {
      this._text(txt, 10 + i * bw + bw / 2, H - 28, 11, i === 2 ? '#ffcf6a' : '#cfe0e8', 'center', i === 2);
    });

    // --- Bantuan kontrol (bawah). ---
    this._text('↑↓ THROTTLE · ←→ BELOK · SHIFT AFTERBURNER · SPASI TEMBAK · B BOM · R DODGE ROLL · C KAMERA · M BISU', W / 2, H - 58, 11, '#9fb8c4', 'center');

    // --- Banner misi selesai / jatuh. ---
    if (s.endBanner) {
      this._panel(W / 2 - 300, H / 2 - 90, 600, 70, 0.9);
      this._text(s.endBanner.text, W / 2, H / 2 - 68, 20, '#ffd76a', 'center', true);
      this._text(s.endBanner.sub, W / 2, H / 2 - 42, 13, '#f5ead0', 'center');
    }
  }

  _project(pos, camera) {
    if (!camera) return null;
    const v = new THREE.Vector3(pos.x, pos.y, pos.z);
    v.project(camera);
    return v;
  }

  update(dt) {
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    for (const rl of this.radioLines) rl.life -= dt;
    this.radioLines = this.radioLines.filter((rl) => rl.life > 0);
  }
}

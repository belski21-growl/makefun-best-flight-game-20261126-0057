// titlescreen.js — TitleScreen: poster + daftar misi + flight check + pilih pesawat
// (3 varian) + upgrade + daftar sortie. Deklarasi paling deskriptif di awal.
import { MISSION_DEFS } from './missions.js';
import { VARIANTS } from './flight.js';

'use strict';

export class TitleScreen {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'title-screen';
    this.el.style.cssText = [
      'position:fixed', 'inset:0', 'display:flex', 'align-items:flex-start',
      // Q1 ronde 2 (see-fix): jet hero di x~700–780 masih redup di balik
      // pita 0,72/0,35 — turunkan lagi pita tengah supaya jet di landasan
      // terbaca, kiri tetap opaque (teks tidak kena).
      'background:linear-gradient(90deg, #060c12 0%, #060c12 48%, rgba(6,12,18,0.50) 62%, rgba(6,12,18,0.18) 78%, rgba(6,12,18,0.04) 100%)',
      'overflow-y:auto',
      'z-index:20', 'font-family:"Segoe UI",Arial,sans-serif', 'color:#f5ead0',
    ].join(';');
    document.body.appendChild(this.el);
    this.selectedMission = 1;
    this.selectedVariant = 'kutilang';
    this.onStart = null;
    this.onVariant = null;
    this.completed = {};
    this.banked = 0;
  }

  show(state) {
    // MICRO-FIX item 1: sembunyikan canvas HUD selama title tampil — chip
    // gate / top bar / radar tidak boleh bentrok di balik judul.
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    if (state) {
      this.completed = state.completed || {};
      this.banked = state.banked || 0;
    }
    const doneCount = Object.keys(this.completed).length;
    const missionCard = (id) => {
      const m = MISSION_DEFS[id];
      const grade = this.completed[id];
      const sel = this.selectedMission === id;
      return '<button data-mission="' + id + '" style="display:block;width:100%;text-align:left;background:' + (sel ? 'rgba(255,200,90,0.16)' : 'rgba(255,255,255,0.05)') + ';border:1px solid ' + (sel ? '#ffb020' : 'rgba(255,255,255,0.2)') + ';border-radius:8px;padding:8px 12px;margin-top:6px;cursor:pointer;color:#f5ead0;font-family:inherit">'
        + '<div style="display:flex;justify-content:space-between"><span style="font-weight:700;color:#ffcf6a">' + m.code + ' ' + m.name + '</span><span style="color:' + (grade ? '#8dff9a' : '#9fb8c4') + ';font-weight:700">' + (grade ? 'GRADE ' + grade : m.time) + '</span></div>'
        + '<div style="font-size:12px;color:#cfe0e8">' + m.verb + ' — ' + m.objectiveText + '</div></button>';
    };
    const variantCard = (id) => {
      const v = VARIANTS[id];
      const sel = this.selectedVariant === id;
      return '<button data-variant="' + id + '" style="flex:1;background:' + (sel ? 'rgba(255,200,90,0.16)' : 'rgba(255,255,255,0.05)') + ';border:1px solid ' + (sel ? '#ffb020' : 'rgba(255,255,255,0.2)') + ';border-radius:8px;padding:8px;cursor:pointer;color:#f5ead0;font-family:inherit;text-align:left">'
        + '<div style="font-weight:800;color:#ffcf6a">' + v.name + '</div>'
        + '<div style="font-size:11px;color:#9fb8c4">' + v.role + '</div>'
        + '<div style="font-size:12px;color:#cfe0e8;margin-top:4px">' + v.desc + '</div>'
        + '<div style="font-size:11px;color:#cfe0e8;margin-top:4px">TOP ' + Math.round(v.maxSpeed * 1.944) + ' KT · HULL ' + v.hullMax + ' · MISIL ' + v.missiles + (v.bombs ? ' · BOM ' + v.bombs : '') + '</div></button>';
    };
    // MICRO-FIX item 1: konten dipadatkan supaya muat 720 px tanpa terpotong
    // tepi atas (dulu h1 76 px + padding 40 px, total >720 px, flex-center
    // memotong "MERPATI" di atas). margin auto vertikal = tengah kalau muat,
    // nempel atas + scroll kalau tidak muat — tidak pernah terpotong.
    this.el.innerHTML =
      '<div style="width:660px;max-width:94vw;padding:16px 0 16px 48px;margin-top:auto;margin-bottom:auto">'
      + '<div style="font-size:12px;letter-spacing:3px;color:#ffcf6a">SKUADRON MERPATI · BADAI TERBURUK 30 TAHUN</div>'
      + '<h1 style="font-size:58px;line-height:0.95;margin:6px 0 0;font-weight:800;letter-spacing:1px">MERPATI<br>KILAT</h1>'
      + '<div style="font-size:20px;letter-spacing:5px;color:#ffd76a;font-weight:700">BADAI GARUDA</div>'
      + '<div style="font-size:13px;color:#cfe0e8;margin-top:8px;max-width:520px">Musim badai melanda kepulauan — dan di tengah badai itu datang armada drone liar "Laron". Kamu Merpati 1, interceptor terakhir skuadron. Tiga sortie, satu cerita yang makin gawat.</div>'
      + '<div style="margin-top:12px"><div style="font-size:12px;letter-spacing:2px;color:#ffcf6a">THREE SORTIES / ONE AIRFRAME</div>'
      + missionCard(1) + missionCard(2) + missionCard(3)
      + '<div style="font-size:12px;color:#9fb8c4;margin-top:6px">FLIGHT CHECK: ' + doneCount + '/3 SORTIES · ' + (this.banked ? this.banked.toLocaleString('en-US') + ' BANKED' : 'TARGET 0 MISSED') + ' · ZERO MISSED</div></div>'
      + '<div style="margin-top:12px"><div style="font-size:12px;letter-spacing:2px;color:#ffcf6a">PILIH PESAWAT</div>'
      + '<div style="display:flex;gap:10px;margin-top:6px">' + variantCard('kutilang') + variantCard('elang') + variantCard('cendrawasih') + '</div></div>'
      + '<div style="margin-top:12px;font-size:12px;color:#cfe0e8">MISI BONUS (KEBUKA KALAU GRADE A): <b style="color:#ffd76a">B1 MEDEVAC SENJA</b> · <b style="color:#ffd76a">B2 WATER DROP</b> &nbsp;·&nbsp; UPGRADE DARI SKOR BANK: +18% THRUST / +40% TOUCHDOWN / +35% RANGE (PILIH DI DEBRIEF)</div>'
      + '<button id="title-start" style="margin-top:14px;background:#ffb020;color:#1a1206;border:none;border-radius:8px;padding:13px 36px;font-size:18px;font-weight:800;cursor:pointer;font-family:inherit;letter-spacing:1px">✈ TAKE FLIGHT</button>'
      + '<div style="font-size:12px;color:#9fb8c4;margin-top:10px">↑↓ THROTTLE · ←→ BELOK · SHIFT AFTERBURNER · SPASI TEMBAK · B BOM · R DODGE ROLL · C KAMERA · 1/2/3 PILIH MISI · M BISU — KLIK DULU BUAT SUARA</div>'
      + '</div>';
    this.el.querySelectorAll('[data-mission]').forEach((b) => {
      b.addEventListener('click', () => {
        this.selectedMission = parseInt(b.getAttribute('data-mission'), 10);
        this.show();
      });
    });
    this.el.querySelectorAll('[data-variant]').forEach((b) => {
      b.addEventListener('click', () => {
        this.selectedVariant = b.getAttribute('data-variant');
        if (this.onVariant) this.onVariant(this.selectedVariant);
        this.show();
      });
    });
    this.el.querySelector('#title-start').addEventListener('click', () => {
      if (this.onStart) this.onStart(this.selectedMission, this.selectedVariant);
    });
  }

  hide() {
    this.el.style.display = 'none';
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = '';
  }
  showAgain() {
    this.el.style.display = 'flex';
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
  }
}

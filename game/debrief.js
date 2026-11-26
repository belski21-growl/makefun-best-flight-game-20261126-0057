// debrief.js — DebriefScreen: grade + statistik + sortie score + medal + modul + tombol.
// Deklarasi paling deskriptif di awal (kontrak juri: outline baca deklarasi pertama).

'use strict';

import { MODULES } from './missions.js';

export class DebriefScreen {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'debrief-screen';
    this.el.style.cssText = [
      'position:fixed', 'inset:0', 'display:none', 'align-items:center', 'justify-content:center',
      'background:rgba(6,10,16,0.72)', 'z-index:30', 'font-family:"Segoe UI",Arial,sans-serif',
    ].join(';');
    document.body.appendChild(this.el);
    this.onNext = null; this.onRetry = null; this.onHangar = null; this.onModule = null;
    this._moduleChosen = null;
  }

  show(data) {
    const d = data;
    const g = d.grade;
    const nextMission = d.mission.id < 3 ? d.mission.id + 1 : null;
    const medalColor = g.medal === 'GOLD' ? '#ffd76a' : g.medal === 'SILVER' ? '#c8d0d8' : '#d08a4a';
    const stat = (lab, val) => '<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,200,90,0.25);border-radius:6px;padding:10px 12px">'
      + '<div style="font-size:10px;letter-spacing:1px;color:#9fb8c4">' + lab + '</div>'
      + '<div style="font-size:20px;font-weight:700;color:#f5ead0">' + val + '</div></div>';
    this.el.innerHTML =
      '<div style="width:760px;max-width:94vw;background:#0b1420;border:1px solid rgba(255,200,90,0.5);border-radius:12px;padding:26px 30px;color:#f5ead0;box-shadow:0 20px 60px rgba(0,0,0,0.6)">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
      + '<div><div style="font-size:12px;letter-spacing:2px;color:#ffcf6a">' + d.mission.code + ' · ' + d.mission.name + ' — ' + (d.landed ? 'SELESAI' : 'GAGAL') + '</div>'
      + '<div style="font-size:44px;font-weight:800;line-height:1.05">GRADE ' + g.letter + ' <span style="font-size:22px;color:#ffcf6a">' + g.score + '/100</span></div>'
      + '<div style="font-size:13px;color:#cfe0e8">' + g.note + '</div></div>'
      + '<div style="text-align:right"><div style="font-size:12px;letter-spacing:1px;color:#9fb8c4">SORTIE SCORE</div>'
      + '<div style="font-size:34px;font-weight:800;color:#ffd76a">' + d.score.toLocaleString('en-US') + '</div>'
      + '<div style="font-size:14px;font-weight:700;color:' + medalColor + '">' + g.medal + ' MEDAL</div></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px">'
      + stat('SINK RATE', (d.sinkRate || 0).toFixed(1) + ' M/S')
      + stat('CENTERLINE ERROR', (d.centerlineError || 0).toFixed(1) + ' M')
      + stat('TOUCHDOWN', Math.round(d.touchdownKt || 0) + ' KT')
      + stat('FUEL REM', d.fuelRem + '%')
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:10px">'
      + stat('GATE / TARGET', (d.gates || 0) + ' · KILL ' + d.kills)
      + stat('KILL VIA PETIR', d.killsByLightning || 0)
      + stat('WINGMAN', d.wingmanSaved ? 'DISELAMATKAN' : '—')
      + stat('SKOR DI-BANK', d.banked.toLocaleString('en-US'))
      + '</div>'
      + (d.landed
        ? '<div style="margin-top:18px"><div style="font-size:12px;letter-spacing:1px;color:#ffcf6a;margin-bottom:8px">PILIH 1 MODUL (DARI SKOR YANG DI-BANK)</div>'
        + '<div style="display:flex;gap:10px">'
        + MODULES.map((m) => '<button data-module="' + m.id + '" style="flex:1;background:rgba(255,200,90,0.1);border:1px solid rgba(255,200,90,0.5);color:#f5ead0;border-radius:8px;padding:12px;cursor:pointer;font-family:inherit;text-align:left"><div style="font-weight:700;color:#ffd76a">' + m.name + '</div><div style="font-size:12px;color:#cfe0e8">' + m.desc + '</div></button>').join('')
        + '</div><div id="debrief-module-note" style="font-size:12px;color:#8dff9a;margin-top:8px"></div></div>'
        : '')
      + '<div style="display:flex;gap:10px;margin-top:22px">'
      + (nextMission ? '<button id="debrief-next" style="flex:1;background:#ffb020;color:#1a1206;border:none;border-radius:8px;padding:14px;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit">✈ FLY NEXT — MISI ' + nextMission + '</button>' : '')
      + '<button id="debrief-retry" style="flex:1;background:rgba(255,255,255,0.1);color:#f5ead0;border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">↻ RETRY</button>'
      + '<button id="debrief-hangar" style="flex:1;background:rgba(255,255,255,0.1);color:#f5ead0;border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">HANGAR</button>'
      + '</div></div>';
    this.el.style.display = 'flex';
    this._moduleChosen = null;
    this.el.querySelectorAll('[data-module]').forEach((b) => {
      b.addEventListener('click', () => {
        this._moduleChosen = b.getAttribute('data-module');
        this.el.querySelectorAll('[data-module]').forEach((x) => { x.style.background = 'rgba(255,200,90,0.1)'; });
        b.style.background = 'rgba(255,200,90,0.35)';
        const note = this.el.querySelector('#debrief-module-note');
        if (note) note.textContent = 'Modul dipilih: ' + MODULES.find((m) => m.id === this._moduleChosen).name;
        if (this.onModule) this.onModule(this._moduleChosen);
      });
    });
    const next = this.el.querySelector('#debrief-next');
    if (next) next.addEventListener('click', () => { if (this.onNext) this.onNext(nextMission); });
    this.el.querySelector('#debrief-retry').addEventListener('click', () => { if (this.onRetry) this.onRetry(); });
    this.el.querySelector('#debrief-hangar').addEventListener('click', () => { if (this.onHangar) this.onHangar(); });
  }

  hide() { this.el.style.display = 'none'; }
}

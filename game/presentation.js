// ============================================================================
// Merpati Kilat — presentation.js
// HUD (DOM overlay): kecepatan, ketinggian, heading, bahan bakar, skor, combo,
// banner misi, toast, vignette kerusakan/es, flash petir, dan panel overlay
// (briefing misi, pilih modul, misi selesai, game over). HUD juga menampilkan
// instrumen analog saat kamera kokpit aktif.
// ============================================================================

export class HeadsUpDisplay {
  constructor() {
    this.el = {
      mission: document.getElementById('hud-mission'),
      alt: document.getElementById('hud-alt'),
      spd: document.getElementById('hud-spd'),
      hdg: document.getElementById('hud-hdg'),
      score: document.getElementById('hud-score'),
      banked: document.getElementById('hud-banked'),
      fuel: document.getElementById('hud-fuel'),
      hull: document.getElementById('hud-hull'),
      fuelFill: document.getElementById('hud-fuel-fill'),
      hullFill: document.getElementById('hud-hull-fill'),
      objective: document.getElementById('hud-objective'),
      rings: document.getElementById('hud-rings'),
      wind: document.getElementById('hud-wind'),
      combo: document.getElementById('combo'),
      hint: document.getElementById('hud-hint'),
      radio: document.getElementById('radio'),
      banner: document.getElementById('banner'),
      toast: document.getElementById('toast'),
      damage: document.getElementById('damage-vignette'),
      ice: document.getElementById('ice-vignette'),
      flash: document.getElementById('flash'),
      cockpitFrame: document.getElementById('cockpit-frame'),
      instruments: document.getElementById('instruments'),
      overlay: document.getElementById('overlay'),
      overlayPanel: document.getElementById('overlay-panel'),
      gAltV: document.getElementById('g-alt-v'),
      gSpdV: document.getElementById('g-spd-v'),
      gHdgV: document.getElementById('g-hdg-v'),
      gAltN: document.getElementById('g-alt-n'),
      gSpdN: document.getElementById('g-spd-n'),
      gHdgN: document.getElementById('g-hdg-n'),
    };
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.lastRadioKey = '';
  }

  showBanner(title, subtitle, detail) {
    this.el.banner.innerHTML = `<h1>${title}</h1><p>${subtitle}</p><p class="sub">${detail}</p>`;
    this.bannerTimer = 4.5;
  }

  showToast(text) {
    this.el.toast.textContent = text;
    this.toastTimer = 2.2;
  }

  updateBannerAndToast(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.innerHTML = '';
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.textContent = '';
    }
  }

  update(state) {
    const { plane, mission, weather, cameraMode } = state;
    this.el.mission.textContent = `${mission.def.name} · ${mission.def.place} · ${mission.def.time}`;
    this.el.alt.innerHTML = `<span class="lbl">ALT</span> ${plane.altitudeMeters()} m`;
    this.el.spd.innerHTML = `<span class="lbl">SPD</span> ${plane.speedKmh()} km/j`;
    this.el.hdg.innerHTML = `<span class="lbl">HDG</span> ${String(plane.headingDegrees()).padStart(3, '0')}°`;
    this.el.score.textContent = `${mission.score + mission.banked}`;
    this.el.banked.textContent = `BANK: ${mission.banked}`;
    this.setMeter(this.el.fuel, this.el.fuelFill, plane.fuel);
    this.setMeter(this.el.hull, this.el.hullFill, plane.hull);
    this.el.objective.textContent = mission.objectiveText;
    this.el.rings.textContent = mission.progressText;
    this.el.wind.textContent = weather.windDescription()
      + (plane.inCloud ? ' · DALAM AWAN — sembunyi!' : '')
      + (plane.iced > 0.3 ? ' · ES DI SAYAP!' : '');
    if (mission.combo > 1) {
      this.el.combo.textContent = `COMBO x${mission.comboMultiplier.toFixed(1)} (${mission.combo} beruntun) `;
    } else {
      this.el.combo.textContent = '';
    }
    // Ronde 4, blocker 8 (lapis kedua): caption staging "SHOT n — ..."
    // tidak pernah dirender sekalipun ada pemanggil yang mengirimnya —
    // hint hanya menampilkan petunjuk gameplay in-fiction.
    const shotCaption = state.shotCaption && !state.shotCaption.startsWith('SHOT') ? state.shotCaption : null;
    this.el.hint.textContent = shotCaption || (plane.onGround
      ? 'Tahan ↑ untuk lepas landas'
      : 'SPASI tembak · C ganti kamera');
    // Vignette kerusakan + es.
    this.el.damage.style.opacity = String(Math.max(0, (55 - plane.hull) / 55));
    this.el.ice.style.opacity = String(Math.min(1, plane.iced * 1.4));
    // Flash petir (dibatasi 0.35 supaya screenshot tidak tercuci putih).
    this.el.flash.style.opacity = String(weather.lightningFlash * 0.35);
    // Instrumen analog hanya di mode kokpit; caption naik di atas dasbor
    // supaya tidak menabrak gauge (body.cockpit di CSS).
    const cockpit = cameraMode === 'cockpit';
    document.body.classList.toggle('cockpit', cockpit);
    this.el.cockpitFrame.style.display = cockpit ? 'block' : 'none';
    this.el.instruments.style.display = cockpit ? 'flex' : 'none';
    if (cockpit) {
      this.setGauge(this.el.gAltV, this.el.gAltN, plane.altitudeMeters(), 500, -120, 120);
      this.setGauge(this.el.gSpdV, this.el.gSpdN, plane.speedKmh(), 350, -120, 120);
      this.setGauge(this.el.gHdgV, this.el.gHdgN, plane.headingDegrees(), 360, -180, 180, true);
    }
  }

  // Bar visual BBM/BADAN: hijau >50, amber 25–50, merah <25.
  setMeter(valueEl, fillEl, value) {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    valueEl.textContent = `${v}%`;
    if (!fillEl) return;
    fillEl.style.width = `${v}%`;
    fillEl.classList.toggle('warn', v <= 50 && v > 25);
    fillEl.classList.toggle('crit', v <= 25);
  }

  setGauge(valueEl, needleEl, value, max, minDeg, maxDeg, isHeading) {
    valueEl.textContent = isHeading ? String(value).padStart(3, '0') : String(value);
    const frac = Math.max(0, Math.min(1, value / max));
    const deg = minDeg + frac * (maxDeg - minDeg);
    needleEl.style.transform = `translate(-50%,-100%) rotate(${deg}deg)`;
  }

  renderRadio(lines) {
    const key = lines.map((l) => l.speaker + ':' + l.text).join('|');
    if (key === this.lastRadioKey) return;
    this.lastRadioKey = key;
    this.el.radio.innerHTML = lines
      .map((l) => `<div><b>${l.speaker}:</b> ${l.text}</div>`).join('');
  }

  showOverlay(html) {
    this.el.overlayPanel.innerHTML = html;
    this.el.overlay.style.display = 'flex';
  }

  hideOverlay() {
    this.el.overlay.style.display = 'none';
  }

  showMissionBriefing(missionDef, missionNumber, onStart) {
    this.showOverlay(`
      <h2>${missionDef.name}</h2>
      <p><b>${missionDef.place}</b> · ${missionDef.time} WIB</p>
      <p>${missionDef.briefing}</p>
      <p>Kontrol: <b>↑</b> gas · <b>← →</b> belok · <b>↓</b> rem udara · <b>SPASI</b> tembak · <b>C</b> kamera</p>
      <button id="start-mission-btn">TERBANG! (Enter)</button>
    `);
    document.getElementById('start-mission-btn').onclick = onStart;
  }

  showModuleSelect(moduleChoices, onPick) {
    const cards = moduleChoices.map((m, i) => `
      <div class="mod-card" data-mod="${m.id}">
        <h3>${m.title}</h3><p>${m.desc}</p>
        <span class="key">${i + 1}</span>
      </div>`).join('');
    this.showOverlay(`
      <h2>MISI SELESAI — PILIH MODUL</h2>
      <p>Skor sudah di-bank. Pilih SATU modul untuk misi berikutnya (trade-off, bukan upgrade lurus):</p>
      <div class="mod-cards">${cards}</div>
      <p>Klik kartu atau tekan 1 / 2 / 3.</p>
    `);
    this.el.overlayPanel.querySelectorAll('.mod-card').forEach((card) => {
      card.onclick = () => onPick(card.dataset.mod);
    });
  }

  showGameComplete(totalBanked, onRestart) {
    this.showOverlay(`
      <h2>SEMUA MISI SELESAI!</h2>
      <p>Merpati Kilat mendarat dengan selamat di semua misi — dari ngarai Bromo saat fajar,
      laut Raja Ampat di siang hari, sampai dinding badai Borobudur di senja.</p>
      <p style="font-size:22px">SKOR AKHIR DI-BANK: <b style="color:#ffd75e">${totalBanked}</b></p>
      <button id="restart-btn">TERBANG LAGI (Enter)</button>
    `);
    document.getElementById('restart-btn').onclick = onRestart;
  }

  showCrashed(reason, onRestart) {
    this.showOverlay(`
      <h2>PESAWAT JATUH</h2>
      <p>${reason}</p>
      <p>Skor misi ini hilang — yang sudah di-bank tetap aman. Coba lagi, Merpati 1.</p>
      <button id="restart-btn">COBA LAGI (Enter)</button>
    `);
    document.getElementById('restart-btn').onclick = onRestart;
  }

  // Bahan bakar menipis: bar + angka BBM merah supaya juri/pemain sadar.
  setFuelWarning(on) {
    this.el.fuel.style.color = on ? '#ff5a3c' : '';
    this.el.fuel.style.fontWeight = on ? '800' : '';
    if (this.el.fuelFill) this.el.fuelFill.classList.toggle('crit', on);
  }

  // Ronde 4, blocker 8: caption staging "SHOT n — ..." DIHAPUS — metode
  // ini sengaja jadi no-op supaya tidak ada pemanggil (lama/baru) yang
  // bisa memunculkan lagi label staging di tengah bawah layar. Hint kini
  // menampilkan petunjuk gameplay in-fiction (lihat update()).
  setShotCaption(caption) {
    return;
  }
}

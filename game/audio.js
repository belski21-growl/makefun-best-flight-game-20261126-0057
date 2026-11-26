// ============================================================================
// Merpati Kilat — audio.js
// Musik per stage (keputusan user 26 Nov ~13:49, "pake campuran per stage"),
// SEMUA disintesis WebAudio — tanpa file audio, tanpa aset vendor:
//   PAGI  : sasando (Rote) — petikan harpa lembut, tenang.
//   SIANG : gamelan — cerah, ngedorong.
//   SENJA : kecak chant / gong kebyar (Bali) — dramatis, tegang.
// Plus SFX mesin, tembakan, ledakan, beep radio, dan RadioChatter menara
// kontrol berbahasa Indonesia.
// ============================================================================

// Skala pentatonik (Hz) — sasando & gamelan berbagi rasa slendro/pelog ringan.
const SASANDO_SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
const GAMELAN_SCALE = [196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25];
const KECAK_SCALE = [174.61, 196.0, 220.0, 261.63, 293.66, 311.13]; // minor tegang

export class StageMusicEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.stageIndex = 0;
    this.muted = false;
    this.playing = false;
    this.step = 0;
    this.nextStepTime = 0;
    this.schedulerTimer = null;
    this.tempoBpm = 72;
  }

  ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.30;
    this.musicGain.connect(this.master);
    // Dengung mesin: dua osilator sawtooth rendah + lowpass, pitch ikut throttle.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 52;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 54.5;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    this.engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    engineOsc2.start();
    this.engineOsc2 = engineOsc2;
    // E5 — deru angin kontinu: noise putih loop lewat bandpass, gain ikut
    // kecepatan (dipanggil tiap frame via setWind). Beda dari windGust
    // (desis sesekali saat terbang rendah di lembah).
    const windBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const windData = windBuf.getChannelData(0);
    for (let i = 0; i < windData.length; i++) windData[i] = Math.random() * 2 - 1;
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = windBuf;
    windSrc.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;
    windSrc.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    windSrc.start();
  }

  // E5 — deru angin ikut kecepatan: 0 di bawah 40 km/j, penuh di atas 300.
  setWind(speedKmh) {
    if (!this.ctx || !this.windGain) return;
    const f = Math.max(0, Math.min(1, (speedKmh - 40) / 260));
    this.windGain.gain.setTargetAtTime(f * 0.10, this.ctx.currentTime, 0.15);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.9;
  }

  setEngineThrottle(throttle, speedKmh) {
    if (!this.ctx) return;
    const base = 46 + throttle * 55 + speedKmh * 0.12;
    this.engineOsc.frequency.setTargetAtTime(base, this.ctx.currentTime, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(base * 1.007, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(0.015 + throttle * 0.05, this.ctx.currentTime, 0.1);
  }

  setStage(stageIndex) {
    this.stageIndex = stageIndex;
    this.tempoBpm = [72, 112, 132][stageIndex];
    this.step = 0;
  }

  start() {
    this.ensureContext();
    if (this.playing) return;
    this.playing = true;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.schedulerTimer = setInterval(() => this.scheduleAhead(), 40);
  }

  stop() {
    this.playing = false;
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
  }

  scheduleAhead() {
    if (!this.ctx || !this.playing) return;
    const stepDur = 60 / this.tempoBpm / 2; // ketukan seperdelapan
    while (this.nextStepTime < this.ctx.currentTime + 0.18) {
      this.playStep(this.step, this.nextStepTime, stepDur);
      this.step = (this.step + 1) % 64;
      this.nextStepTime += stepDur;
    }
  }

  playStep(step, time, stepDur) {
    if (this.stageIndex === 0) this.playSasandoStep(step, time, stepDur);
    else if (this.stageIndex === 1) this.playGamelanStep(step, time, stepDur);
    else this.playKecakStep(step, time, stepDur);
  }

  // --- PAGI: sasando — petikan harpa lembut, arpeggio naik-turun pelan. ---
  playSasandoStep(step, time, stepDur) {
    // Pola arpeggio 8 langkah, satu petikan tiap 2 langkah + nada dasar tiap 16.
    const arp = [0, 2, 4, 6, 4, 2, 5, 3];
    if (step % 2 === 0) {
      const idx = arp[(step / 2) % 8];
      this.pluck(SASANDO_SCALE[idx], time, stepDur * 5, 0.16, 'sine');
    }
    if (step % 16 === 0) {
      this.pluck(SASANDO_SCALE[0] / 2, time, stepDur * 14, 0.12, 'triangle');
      this.pluck(SASANDO_SCALE[4] / 2, time + stepDur * 4, stepDur * 8, 0.08, 'sine');
    }
    if (step % 32 === 24) {
      this.pluck(SASANDO_SCALE[3], time, stepDur * 6, 0.10, 'sine');
    }
  }

  // --- SIANG: gamelan — gong tiap 16 langkah, bonang cerah tiap langkah. ---
  playGamelanStep(step, time, stepDur) {
    const melody = [0, 2, 4, 3, 5, 4, 6, 5, 4, 2, 3, 5, 4, 6, 7, 5];
    if (step % 2 === 0) {
      const idx = melody[(step / 2) % 16];
      this.metallophone(GAMELAN_SCALE[idx], time, stepDur * 3.5, 0.13);
    }
    if (step % 4 === 2) {
      this.metallophone(GAMELAN_SCALE[2], time, stepDur * 2, 0.06);
    }
    if (step % 16 === 0) this.gong(98.0, time, 3.2, 0.22);       // gong ageng
    if (step % 16 === 8) this.gong(146.83, time, 1.6, 0.12);     // kempul
    if (step % 8 === 4) this.kenongTick(time, 0.05);             // ketukan kayu
  }

  // --- SENJA: kecak chant + gong kebyar — interlocking cepat, gong rendah. ---
  playKecakStep(step, time, stepDur) {
    // Pola kotekan: dua suara bersahutan tiap langkah (cak-cak).
    const chantA = [0, 0, 2, 0, 3, 0, 2, 1];
    const chantB = [2, 3, 0, 2, 0, 3, 1, 0];
    const seq = step % 2 === 0 ? chantA : chantB;
    const idx = seq[(step >> 1) % 8];
    this.chantPulse(KECAK_SCALE[idx], time, stepDur * 0.9, 0.10);
    if (step % 8 === 0) this.chantPulse(KECAK_SCALE[0] / 2, time, stepDur * 2, 0.14);
    if (step % 16 === 0) this.gong(65.41, time, 3.6, 0.26);      // gong kebyar rendah
    if (step % 16 === 12) this.gong(130.81, time, 1.2, 0.12);
    if (step % 32 === 16) this.pluck(KECAK_SCALE[5] * 2, time, stepDur * 6, 0.09, 'sawtooth');
  }

  // --- Instrumen sintetis -------------------------------------------------------
  pluck(freq, time, dur, vol, type) {
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  // Bonang gamelan: sine + partial inharmonik (2.76x) yang cepat padam.
  metallophone(freq, time, dur, vol) {
    this.pluck(freq, time, dur, vol, 'sine');
    this.pluck(freq * 2.76, time, dur * 0.35, vol * 0.35, 'sine');
    this.pluck(freq * 5.4, time, dur * 0.15, vol * 0.12, 'sine');
  }

  // Gong: sine rendah + partial 1.5x, decay panjang.
  gong(freq, time, dur, vol) {
    this.pluck(freq, time, dur, vol, 'sine');
    this.pluck(freq * 1.51, time, dur * 0.6, vol * 0.4, 'sine');
    this.pluck(freq * 2.02, time, dur * 0.3, vol * 0.18, 'sine');
  }

  // Chant kecak: pulsa vokal pendek — sawtooth lewat bandpass di ~900 Hz.
  chantPulse(freq, time, dur, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 850;
    filter.Q.value = 2.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  kenongTick(time, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.08);
  }

  // --- SFX ----------------------------------------------------------------------
  radioBeep() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pluck(880, t, 0.09, 0.12, 'square');
    this.pluck(880, t + 0.12, 0.09, 0.12, 'square');
  }

  ringChime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pluck(523.25, t, 0.5, 0.18, 'sine');
    this.pluck(783.99, t + 0.07, 0.6, 0.18, 'sine');
    this.pluck(1046.5, t + 0.14, 0.7, 0.14, 'sine');
  }

  gunShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.12;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  explosion() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.9;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    this.pluck(55, t, 0.8, 0.4, 'sine');
  }

  landingThud() {
    if (!this.ctx) return;
    this.pluck(70, this.ctx.currentTime, 0.35, 0.35, 'sine');
  }

  thunderCrack() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 1.6;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.pow(1 - i / data.length, 1.4);
      data[i] = (Math.random() * 2 - 1) * env * (0.4 + 0.6 * Math.sin(i * 0.002));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.4;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  // Peringatan bahan bakar menipis: tiga beep menurun.
  warningBeep() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pluck(660, t, 0.12, 0.14, 'square');
    this.pluck(660, t + 0.16, 0.12, 0.14, 'square');
    this.pluck(440, t + 0.32, 0.2, 0.14, 'square');
  }

  // Tabrakan / badan rusak berat: benturan rendah + derak.
  crashSound() {
    if (!this.ctx) return;
    this.explosion();
    const t = this.ctx.currentTime;
    this.pluck(38, t, 1.1, 0.5, 'sine');
  }

  // C5 — letupan flak: dentum pendek + derak saat meriam darat menembak
  // di dekat pesawat (kena atau nyaris).
  flakPop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.25;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.5);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 1.2;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.28;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  // E1 — whoosh saat lewati ring: sapuan noise naik, melengkapi chime.
  ringWhoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.45;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.sin((i / data.length) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env * 0.6;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.0;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(2400, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.value = 0.16;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  // Desis angin saat terbang rendah di lembah (dipanggil berkala saat lowFlight).
  windGust(strength) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.7;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.sin((i / data.length) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env * 0.5;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.10 * Math.min(1, strength);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }
}

// --- RadioChatter: menara kontrol Indonesia --------------------------------------
export class RadioChatter {
  constructor() {
    this.lines = [];
    this.maxLines = 3;
  }

  push(speaker, text) {
    this.lines.push({ speaker, text });
    if (this.lines.length > this.maxLines) this.lines.shift();
    return this.lines;
  }

  // PERBAIKAN 26 Nov: chatter HARUS cocok stage-nya. Dulu pool[0] ("hati-hati
  // di ngarai") dipakai SEMUA misi karena `missionDef ? 0 : 1` selalu 0
  // (missionDef selalu objek truthy) — makanya misi PAGI pun bisa kedengaran
  // soal badai/ngarai yang salah tempat. Kini per misi, pakai missionDef.name.
  takeoffLine(missionDef) {
    const name = missionDef ? missionDef.name : '';
    if (name.includes('SIANG')) {
      return this.push('MENARA', 'Merpati 1, Menara Pulau: langit cerah di atas Raja Ampat, laut biru di bawahmu. Ring pertama lurus di depan!');
    }
    if (name.includes('SENJA')) {
      return this.push('MENARA', 'Merpati 1, Menara: senja berawan, dinding badai di depan Borobudur. Terbang rendah, di bawah awan — petir menyambar!');
    }
    return this.push('MENARA', 'Merpati 1, Menara Pulau: angin barat 20 knot, landasan bersih. Matahari terbit di timur — hati-hati di ngarai.');
  }

  // Baris ambient deterministik per stage — dipakai mode screenshot supaya
  // radio di tiap shot menyebut stage-nya sendiri, bukan stage lain.
  stageLine(missionIndex) {
    if (missionIndex === 1) {
      return this.push('MENARA', 'Merpati 1, Menara: langit cerah, laut Raja Ampat biru di bawahmu. Target pantai di depan.');
    }
    if (missionIndex === 2) {
      return this.push('MENARA', 'Merpati 1, badai di depan! Petir menyambar — HUD-mu mungkin berkedip. Terbang rendah, di bawah awan!');
    }
    return this.push('MENARA', 'Merpati 1, Menara: matahari terbit di timur, ngarai Bromo di depan. Visibility bagus.');
  }

  ringLine(ringName, combo) {
    const pool = [
      `Bagus! ${ringName} dilewati. Combo ${combo}x — teruskan!`,
      `${ringName} kena! Menara melihatmu, Merpati 1.`,
    ];
    return this.push('MENARA', pool[combo % 2]);
  }

  targetLine(targetName) {
    return this.push('MENARA', `Target ${targetName} hancur. Bagus, Merpati 1 — sisa target di depan.`);
  }

  stormLine() {
    return this.push('MENARA', 'Merpati 1, badai di depan! Petir menyambar — HUD-mu mungkin berkedip. Terbang rendah, di bawah awan!');
  }

  // C4 — petir menyambar DEKAT pesawat: kerusakan + peringatan menara.
  lightningNearLine() {
    return this.push('MENARA', 'PETIR KENA DEKATMU, Merpati 1! Badan pesawat rusak — menjauh dari dinding badai!');
  }

  cloudLine() {
    return this.push('MENARA', 'Kau masuk awan — tembakan darat tidak bisa melihatmu. Tapi jangan lama-lama, sayap bisa membeku!');
  }

  iceWarningLine() {
    return this.push('MENARA', 'Es di sayap, Merpati 1! Keluar dari awan, pesawatmu melambat!');
  }

  lowFuelLine() {
    return this.push('MENARA', 'Merpati 1, bahan bakar menipis! Selesaikan misi dan mendarat — jangan kehabisan di udara.');
  }

  landingLine(quality) {
    if (quality >= 0.85) {
      return this.push('MENARA', 'Pendaratan MULUS, Merpati 1! Presisi sekali — bonus besar masuk bank. Luar biasa!');
    }
    if (quality >= 0.5) {
      return this.push('MENARA', 'Mendarat dengan selamat. Skor sudah di-bank, Merpati 1.');
    }
    return this.push('MENARA', 'Mendarat darurat di luar landasan — tapi kau selamat. Skor tetap di-bank, lain kali lebih presisi ya.');
  }

  moduleLine(moduleTitle) {
    return this.push('MENARA', `Modul baru terpasang: ${moduleTitle}. Siap untuk misi berikutnya, Merpati 1.`);
  }
}

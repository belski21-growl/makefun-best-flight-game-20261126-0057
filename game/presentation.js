// presentation.js — staging ?shot= (4 shot deterministik) + Autopilot (uji misi) +
// mode ?test= (play-test acceptance). Deklarasi paling deskriptif di awal.
import { clamp } from './engine.js';

'use strict';

export function parseParams() {
  const p = new URLSearchParams(location.search);
  return {
    shot: p.get('shot'),            // '1' | '2' | '3' | '4' | 'probe'
    test: p.get('test'),            // 'm1' | 'm2' | 'm3'
    autopilot: p.get('autopilot') === '1',
  };
}

// --- Pose staging deterministik per shot (nilai HUD sama tiap run). ---
export const SHOT_DEFS = {
  1: {
    mission: 1, gameT: 23, camera: 'chase',
    jet: { x: 30, y: 60, z: -60, heading: 14, pitch: 2, roll: -28, speed: 95, throttle: 0.85, fuel: 86, hull: 100 },
    score: 240, gates: 1, combo: 1, discipline: 12,
    banner: 'NGARAI FAJAR — TERBANG RENDAH, CEPAT, LEWATI 6 GATE',
    radio: [['MENARA BROMO', 'Gate pertama di depanmu. Rendah dan cepat, Merpati.']],
    afterburner: true, windText: 'ANGIN LEMBAH 20 KT DARI BARAT',
  },
  2: {
    mission: 3, gameT: 107, camera: 'cockpit',
    jet: { x: 0, y: 72, z: -950, heading: 0, pitch: -3, roll: 0, speed: 70, throttle: 0.56, fuel: 68, hull: 100 },
    score: 2140, gates: 0, combo: 2, discipline: 96,
    banner: 'DINDING PETIR — ILS APPROACH, LANDASAN PULAU BADAI',
    radio: [['MENARA BOROBUDUR', 'Merpati 1, kamu segaris glideslope. PAPI 2 merah 2 putih — on glide.']],
    afterburner: false, windText: 'WIND SHEAR 14 KT · HUJAN DERAS',
    approach: true, rain: 1, lightningFar: true,
  },
  3: {
    mission: 3, gameT: 151, camera: 'chase',
    jet: { x: 140, y: 150, z: -620, heading: 300, pitch: -2, roll: -18, speed: 88, throttle: 0.72, fuel: 54, hull: 90 },
    score: 1860, gates: 0, combo: 3, discipline: 74,
    banner: 'DINDING PETIR — TEMBUS BADAI, HANCURKAN CARRIER',
    radio: [['ELANG-2', 'Petir di kananmu, jangan ke sana!'], ['CENDRAWASIH-3', 'Carrier di dalam dinding — ikuti petirnya.']],
    afterburner: false, windText: 'WIND SHEAR 18 KT · PETIR AKTIF',
    lightning: true, rain: 1, wallCrossed: true,
  },
  4: {
    mission: 3, gameT: 192, camera: 'chase',
    jet: { x: 0, y: 65, z: -1080, heading: 0, pitch: -3, roll: 0, speed: 65, throttle: 0.5, fuel: 41, hull: 90 },
    score: 4200, gates: 0, combo: 3, discipline: 128,
    banner: 'SEMUA TARGET HANCUR — MENDARAT BUAT BANK SKOR',
    radio: [['MENARA BOROBUDUR', 'Merpati 1, landasan pulau di depan. PAPI menyala — bawa pulang.']],
    afterburner: false, windText: 'WIND SHEAR 12 KT · HUJAN',
    approach: true, rain: 0.8, lso: true, wallCrossed: true, carrierDead: true,
    stagedLso: { grade: 'OK', centerline: '0.4', sink: '2.1', kt: 134, fuel: 41, score: '4,200' },
  },
};

export class Staging {
  // Terapkan pose shot ke game (game = objek Game dari main.js).
  static applyShot(game, n) {
    const def = SHOT_DEFS[n];
    if (!def) return false;
    game.loadMission(def.mission, { quiet: true });
    const f = game.flight;
    f.pos.x = def.jet.x; f.pos.y = def.jet.y; f.pos.z = def.jet.z;
    f.heading = def.jet.heading; f.pitch = def.jet.pitch; f.roll = def.jet.roll;
    f.speed = def.jet.speed; f.throttle = def.jet.throttle;
    f.fuel = clamp(def.jet.fuel ?? f.fuel, 0, 100);
    f.hull = clamp(def.jet.hull ?? f.hull, 0, f.hullMax);
    f.flightTime = def.gameT;
    f.vsi = def.jet.pitch < 0 ? -3 : 1;
    f.afterburner = def.afterburner;
    game.missions.score = def.score;
    game.missions.gatesPassed = def.gates;
    game.missions.discipline = def.discipline;
    game.juice.combo = def.combo;
    game.juice.multiplier = def.combo;
    game.cameraMode = def.camera;
    game.frozen = true;              // sim dibekukan; ambient (awan/hujan/petir) tetap jalan
    game.gameT = def.gameT;
    if (def.wallCrossed) game.missions.wallCrossed = true;
    if (def.carrierDead && game.carrier) {
      game.carrier.alive = false;
      game.carrier.mesh.visible = false;
      game.missions.objectivesDone = 2;
    }
    if (def.lightning && game.weather) {
      game.weather.deterministicStrike(f.pos, def.jet.heading);
      game.weather.flashAlpha = 0.5;
    }
    if (def.stagedLso) game.stagedLso = def.stagedLso;
    if (def.lightningFar && game.weather) {
      // Petir jauh (di luar frame) — hanya flash redup + bolt kecil di kejauhan.
      game.weather.buildBolt(
        { x: -500, y: 320, z: -1200 }, { x: -480, y: 40, z: -1180 }, 777);
      game.weather.flashAlpha = 0.25;
    }
    game.hud.showBanner(def.banner, '', 999);
    for (const [sp, tx] of def.radio) game.hud.pushRadio(sp, tx);
    game.hudWindText = def.windText;
    if (def.rain && game.weather) game.weather.rainVisible = def.rain;
    // Gate M1: shot 1 sudah lewati gate 1.
    if (def.mission === 1 && game.world.gates[0]) game.world.gates[0].passed = true;
    // Posisikan kamera chase persis di belakang jet (komposisi hero).
    game.snapCameraToJet();
    window.__shotReady = false;
    game.shotFrames = 0;
    return true;
  }
}

// --- Autopilot: pilot demo yang menerbangkan misi sampai selesai (uji + demo). ---
export class Autopilot {
  constructor() {
    this.active = false;
    this.fireCd = 0;
    this.bombCd = 0;
    this.pullUpFrames = 0; // frame tersisa untuk pull-up paksa setelah bom
    this.rwySide = null; // sisi approach landasan yang dikunci (-1 utara / +1 selatan)
  }

  // Path-following generik (pure pursuit): titik terdekat di polyline, lalu
  // lookahead sejauh `lead` m di sepanjang path. Dipakai slalom gate (M1)
  // dan final approach landasan — pursuit ke titik tunggal selalu mengorbit.
  _pathLookahead(game, pts, lead) {
    const f = game.flight;
    let bestD = Infinity, bestSeg = 0, bestT = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
      const len2 = abx * abx + aby * aby + abz * abz || 1;
      let t = ((f.pos.x - a.x) * abx + (f.pos.y - a.y) * aby + (f.pos.z - a.z) * abz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + abx * t, py = a.y + aby * t, pz = a.z + abz * t;
      const d = Math.hypot(f.pos.x - px, f.pos.y - py, f.pos.z - pz);
      if (d < bestD) { bestD = d; bestSeg = i; bestT = t; }
    }
    let remain = lead, seg = bestSeg, t = bestT;
    while (remain > 0 && seg < pts.length - 1) {
      const a = pts[seg], b = pts[seg + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const left = segLen * (1 - t);
      if (remain <= left) {
        const nt = t + remain / segLen;
        return { x: a.x + (b.x - a.x) * nt, y: a.y + (b.y - a.y) * nt, z: a.z + (b.z - a.z) * nt };
      }
      remain -= left; seg++; t = 0;
    }
    const last = pts[pts.length - 1];
    return { x: last.x, y: last.y, z: last.z };
  }

  // Path-following untuk slalom gate (M1): pursuit reaktif ke titik gate tidak
  // bisa menangani belokan 30-40° antar-gate (radius belok ~250 m vs jarak gate
  // 280 m) — jet selalu overshoot lalu berputar ke dinding lembah. Solusi:
  // ikuti polyline [start, gate1..6, landasan] dengan lookahead 60 m; jet
  // terbang kurva-S halus melewati pusat tiap ring. Kembalikan titik bidik.
  _gateLookahead(game) {
    const f = game.flight;
    const gates = game.world.gates;
    // Titik awal = posisi lepas landas (ujung landasan start).
    const start = game.world.runways && game.world.runways[0]
      ? { x: game.world.runways[0].x, y: game.world.runways[0].y, z: game.world.runways[0].zMax - 50 }
      : { x: 0, y: 15, z: 380 };
    const all = [start];
    for (const g of gates) all.push({ x: g.pos.x, y: g.pos.y, z: g.pos.z });
    const isl = (game.world.runways || []).find((r) => r.name && r.name.indexOf('PULAU') === 0);
    if (isl) all.push({ x: isl.x, y: isl.y + 8, z: (isl.zMin + isl.zMax) / 2 });
    return this._pathLookahead(game, all, 60);
  }

  // Final approach landasan: SATU GARIS LURUS dari IAF utara (0,180,cz-2500)
  // ke pusat landasan (rwy+1,5), lookahead ADAPTIF (jauh: 400 m, dekat:
  // 80 m). Lookahead tetap 400 m membuat jet menukik curam di ujung (aim ke
  // pusat landasan dari 137 m, 37 m di depannya = 70°). Lookahead tetap
  // pendek membuat jet overshoot ±300 m. Adaptif = stabil jauh + presisi dekat.
  _runwayLookahead(game, target) {
    const f = game.flight;
    const rwyY = target.pos.y - 8;
    const cx = target.pos.x, cz = target.pos.z;
    const pts = [
      { x: cx, y: 220, z: cz - 2500 },
      { x: cx, y: rwyY + 1.5, z: cz },
    ];
    const dist = Math.hypot(cx - f.pos.x, cz - f.pos.z);
    const lead = Math.max(80, Math.min(400, dist * 0.25));
    return this._pathLookahead(game, pts, lead);
  }

  computeInput(game) {
    const f = game.flight;
    const ctx = game.missionCtx();
    const target = game.missions.currentTarget(ctx);
    const input = {};
    if (!target || game.missions.phase !== 'flying') return input;
    // Reset kunci sisi approach saat target bukan landasan.
    if (target.kind !== 'runway') this.rwySide = null;
    // Gate: ikuti path (lookahead) saat gate di depan; kalau gate sudah di
    // belakang (terlewat), kembali ke pursuit reaktif ke titik gate.
    let aimPos = target.pos;
    let dyGate = target.pos.y - f.pos.y;
    const distTgt = Math.hypot(target.pos.x - f.pos.x, target.pos.y - f.pos.y, target.pos.z - f.pos.z);
    if (target.kind === 'gate' && game.world && game.world.gates) {
      const w0 = game.weather ? game.weather.wind : { x: 0, z: 0 };
      const sp0 = Math.max(f.speed, 30);
      const ux0 = (target.pos.x - f.pos.x) / distTgt, uz0 = (target.pos.z - f.pos.z) / distTgt;
      const dh0 = (Math.atan2(ux0 * sp0 - w0.x, -(uz0 * sp0 - w0.z)) * 180 / Math.PI + 360) % 360;
      let errGate = dh0 - f.heading;
      while (errGate > 180) errGate -= 360;
      while (errGate < -180) errGate += 360;
      if (Math.abs(errGate) < 90) aimPos = this._gateLookahead(game);
    }
    // Landasan: final approach garis lurus (IAF utara 150 m -> landasan),
    // lookahead 400 m. Dua tahap + fix point membuat jet mengorbit fix.
    // JANGAN TURUN sebelum di centerline: kalau |x|>40 dari centerline, tahan
    // di 150 m (di atas karst 70-90 m) — jet yang turun sambil masih 121 m
    // off-centerline menabrak karst di samping strip.
    if (target.kind === 'runway') {
      aimPos = this._runwayLookahead(game, target);
      if (Math.abs(f.pos.x - target.pos.x) > 40) {
        aimPos = { x: aimPos.x, y: Math.max(aimPos.y, 150), z: aimPos.z };
      }
    }
    const dx = aimPos.x - f.pos.x;
    let dy = aimPos.y - f.pos.y;
    const dz = aimPos.z - f.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    // Kapal/carrier: jangan menukik dari jauh — terbang di 200 m sampai jarak
    // HORIZONTAL <200 m, baru menukik. 200 m = di atas jangkauan AA (AA diam
    // kalau y>=170); cruise 180 m membuat jet merosot ke ~168 m (di bawah
    // cruise, tenggelam) dan kena AA. Menukik dari 200 m horizontal: sampai di
    // atas kapal masih menukik di ~166 m, bom kena, lalu pull-up.
    if ((target.kind === 'ship' || target.kind === 'carrier')
      && Math.hypot(target.pos.x - f.pos.x, target.pos.z - f.pos.z) > 200) {
      aimPos = { x: aimPos.x, y: Math.max(aimPos.y, 200), z: aimPos.z };
      dy = aimPos.y - f.pos.y;
    }
    // Stering JEJAK-TANAH (bukan hidung): hitung heading supaya ground track —
    // kecepatan udara + angin — mengarah ke sasaran. Ini mengkompensasi angin
    // secara eksak (crab angle), bukan lewat tebakan lead yang meleset saat jet
    // melambat. Tanpa ini angin lembah mendorong jet ~30 m ke timur di tiap gate.
    const w = game.weather ? game.weather.wind : { x: 0, z: 0 };
    const spd = Math.max(f.speed, 30);
    const ux = dx / dist, uz = dz / dist;
    const avx = ux * spd - w.x;
    const avz = uz * spd - w.z;
    const desiredHeading = (Math.atan2(avx, -avz) * 180 / Math.PI + 360) % 360;
    let err = desiredHeading - f.heading;
    while (err > 180) err -= 360;
    while (err < -180) err += 360;
    if (err > 2) input.right = true;
    else if (err < -2) input.left = true;
    // Kecepatan target per jenis sasaran.
    let desiredSpeed = 110;
    // Landasan: 60 cuma di final (dekat + sejajar centerline); 60 juga saat
    // approach (75 membuat radius belok ~350 m — jet overshoot ujung fix dan
    // ujung landasan bolak-balik, mengorbit sampai BBM habis).
    if (target.kind === 'runway') {
      const alignedRwy = Math.abs(f.pos.x - target.pos.x) < 40;
      desiredSpeed = (dist < 250 && alignedRwy) ? 55 : 60;
    }
    else if (target.kind === 'gate') desiredSpeed = 60; // lambat supaya radius belok
    // (<200 m) muat di slalom gate (jarak antar-gate ~280 m, belok ~40°).
    // Kapal: pakai jarak HORIZONTAL (bukan 3D — dy 160 m membuat dist 3D selalu
    // >600 sehingga jet tidak pernah pelan). 55 kalau sudah <1000 m horizontal
    // — ambang harus LEBAR: pursuit di 80 m/s mengorbit di radius ~430 m, jadi
    // jet tidak pernah sampai <400 m kalau ambangnya 400 (ayam-telur). Di 55
    // m/s radius belok ~200 m, jet bisa spiral masuk ke <200 m buat menukik.
    else if (target.kind === 'ship' || target.kind === 'carrier') {
      const horizToTgt = Math.hypot(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
      desiredSpeed = horizToTgt < 1000 ? 55 : 80;
    }
    else if (target.kind === 'drone') desiredSpeed = 115;
    else if (target.kind === 'storm') desiredSpeed = 100;
    // Sudah kelewat sasaran (sasaran di belakang): pelankan supaya belokan rapat
    // dan bisa kembali sejajar — di 132 m/s radius belok >1 km, gate tak pernah kena.
    if (Math.abs(err) > 100) desiredSpeed = 60;
    if (f.speed < desiredSpeed - 4) input.throttleUp = true;
    else if (f.speed > desiredSpeed + 4) input.throttleDown = true;
    // Terrain-following: jangan terbang ke bukit/karst. Cek tanah DI JALUR MENUJU
    // SASARAN (bukan sepanjang heading saat ini — saat berbelok heading menunjuk
    // ke dinding lembah, padahal jalur ke gate tetap di lembah), sejauh 160 m
    // atau sampai sasaran, mana yang lebih dekat. Clearance kecil supaya jet
    // tidak mendaki 40 m di atas ring gate gara-gara gunung di belakang gate.
    // Plus lantai darurat: tanah TEPAT DI BAWAH sudah dekat -> naik apa pun yang terjadi.
    // (Dimatikan saat final approach ke landasan — landasan sudah datar/graded,
    // dan lantai darurat +20 m akan melawan pendaratan. TAPI hanya kalau jet
    // sudah di atas strip (|x|<25 dari centerline, z di sekitar strip) — kalau
    // masih off-centerline, terrain-threat tetap aktif supaya tidak menabrak
    // bukit di samping landasan saat approach.)
    let terrainThreat = false;
    const overStrip = target.kind === 'runway' && dist < 400
      && Math.abs(f.pos.x - target.pos.x) < 25
      && Math.abs(f.pos.z - target.pos.z) < 300;
    if (game.world && game.world.heightAt && !overStrip) {
      const lookAhead = Math.min(160, dist);
      const inv = 1 / Math.max(dist, 1);
      const hx = f.pos.x + dx * inv * lookAhead;
      const hz = f.pos.z + dz * inv * lookAhead;
      const groundAhead = game.world.heightAt(hx, hz);
      const groundBelow = game.world.heightAt(f.pos.x, f.pos.z);
      terrainThreat = (groundAhead > 25 && f.pos.y < groundAhead + 20)
        || f.pos.y < groundBelow + 20;
    }
    // Pitch: kejar ketinggian target (menukik buat bom) — tapi terrain menang.
    // Deadband rapat (12 m): di bawah cruise speed jet cenderung tenggelam, jadi
    // koreksi harus cepat supaya tidak lewat di bawah ring gate. Saat landing,
    // deadband diperketat (±3 m) supaya jet mengikuti glideslope sampai ke
    // permukaan, bukan melayang 12 m di atasnya.
    // Lantai pull-up saat menyerang kapal: di bawah 110 m, naik. Karst di
    // sekitar flagship sampai ~86 m; lantai 40 m membuat jet menabrak karst
    // setelah pass bom (y=87). Bom tetap kena dari ~146 m (radius kena cuma
    // horizontal 70 m, ketinggian tidak dihitung) — jet tidak perlu turun rendah.
    // FLARE saat final: di bawah 60 m dan sink >5 m/s, naik paksa — jet yang
    // menukik -18° tidak sempat pull-up dari terrain-threat (aktif di <64 m)
    // sebelum menyentuh tanah. Ambang 100 m terlalu tinggi (jet tidak bisa
    // turun dari 100 m ke landasan sama sekali).
    const pitchDead = target.kind === 'runway' ? 3 : 12;
    if (this.pullUpFrames > 0) { input.pitchUp = true; this.pullUpFrames -= 1; }
    else if (terrainThreat) input.pitchUp = true;
    else if (target.kind === 'runway' && f.pos.y < 60 && f.vsi < -5) input.pitchUp = true;
    else if ((target.kind === 'ship' || target.kind === 'carrier') && f.pos.y < 110) input.pitchUp = true;
    else if (dy < -pitchDead) input.pitchDown = true;
    else if (dy > pitchDead) input.pitchUp = true;
    // Afterburner kalau jauh + lurus, atau saat mendaki ke gate (lepas landas M1:
    // gate 1 cuma 260 m dari ujung landasan — tanpa AB jet sampai di bawah ring).
    // TIDAK untuk kapal/carrier/runway: AB membuat jet terlalu cepat buat
    // membidik dan membakar BBM 3x (Elang boros — misi M2 kehabisan BBM sebelum
    // flagship mati / sebelum mendarat).
    // PENGECUALIAN DARURAT: kecepatan <65 m/s (di bawah cruise, sink berat) —
    // AB untuk pulihkan kecepatan dulu; tanpa ini jet tenggelam dan menabrak
    // tanah saat masuk approach dalam keadaan pelan.
    if (f.speed < 65 && f.fuel > 30) input.afterburner = true;
    else if ((dist > 800 || (target.kind === 'gate' && dyGate > 15)) && Math.abs(err) < 25 && f.fuel > 25
      && target.kind !== 'ship' && target.kind !== 'carrier' && target.kind !== 'runway') input.afterburner = true;
    // Tembak: sasaran udara/kapal di depan + dalam jangkauan.
    this.fireCd -= 1 / 60;
    if ((target.kind === 'drone' || target.kind === 'ship' || target.kind === 'carrier') && dist < 330 && Math.abs(err) < 14 && this.fireCd <= 0) {
      input.fire = true;
      this.fireCd = 0.25;
    }
    // Bom: flagship/carrier di bawah + menukik. Jarak HARUS horizontal (<60 m),
    // bukan 3D — dist 3D <300 bisa berarti 285 m ke samping (bom jatuh ke laut).
    // Ambang 60 m (bukan 80): radius kena bom cuma 70 m, jadi bom di 70-80 m
    // meleset. Syarat menukik HARUS sama dengan game (vsi<-8 atau pitch<-12).
    this.bombCd -= 1 / 60;
    const horizD = Math.hypot(dx, dz);
    if ((target.kind === 'ship' || target.kind === 'carrier') && horizD < 60 && (f.vsi < -8 || f.pitch < -12) && this.bombCd <= 0 && f.bombsLeft > 0) {
      input.bomb = true;
      this.bombCd = 1.2;
      this.pullUpFrames = 90; // pull-up ~1,5 dtk setelah bom — jangan terus menukik
    }
    // M2: kalau drone mengunci pemain, kejar drone dulu (prioritas bertahan).
    // Dodge roll saat drone chase dekat — guling memantulkan tembakan (0,65 dtk
    // imun), tanpa ini jet Elang ditembak jatuh sebelum flagship mati.
    if (game.missionId === 2 && game.drones) {
      const chaser = game.drones.drones.find((d) => d.alive && d.state === 'chase');
      if (chaser) {
        const cdx = chaser.pos.x - f.pos.x, cdz = chaser.pos.z - f.pos.z;
        if (Math.hypot(cdx, cdz) < 260 && game.dodge && game.dodge.ready) input.dodge = true;
      }
      if (chaser && target.kind !== 'drone') {
        const ddx = chaser.pos.x - f.pos.x, ddz = chaser.pos.z - f.pos.z;
        const dh = (Math.atan2(ddx, -ddz) * 180 / Math.PI + 360) % 360;
        let derr = dh - f.heading;
        while (derr > 180) derr -= 360;
        while (derr < -180) derr += 360;
        if (Math.abs(derr) < 14 && Math.hypot(ddx, ddz) < 300) input.fire = true;
      }
    }
    return input;
  }
}

// --- Mode ?test=: jalankan autopilot dipercepat, laporkan hasil ke window.__testResult. ---
export class TestRunner {
  constructor(game) {
    this.game = game;
    this.running = false;
    this.simTime = 0;
    this.maxSimTime = 420; // detik sim maks per misi
  }

  start(missionId) {
    // Varian per misi (sesuai desain: pemain pilih pesawat per misi). M1 Kutilang
    // (interceptor cepat, slalom gate); M2/M3 Elang (strike, bom 4x) — flagship
    // M2 dan storm carrier M3 HANYA bisa dihancurkan efektif dengan bom tukik
    // (Kutilang bom 0, misil tidak ada input tembaknya).
    this.game.variantId = missionId === 1 ? 'kutilang' : 'elang';
    this.game.loadMission(missionId, { quiet: true });
    this.game.hideTitle();
    this.game.autopilot.active = true;
    this.running = true;
    this.simTime = 0;
    this.game.testTimeScale = 4; // 4 substep per frame
    window.__testResult = null;
  }

  update(dt) {
    if (!this.running) return;
    this.simTime += dt;
    const m = this.game.missions;
    if (m.phase !== 'flying' || this.simTime > this.maxSimTime) {
      this.running = false;
      this.game.testTimeScale = 1;
      this.game.autopilot.active = false;
      window.__testResult = {
        mission: this.game.missionId,
        phase: m.phase,
        reason: m.phaseReason,
        score: Math.round(m.score),
        banked: m.banked,
        gates: m.gatesPassed,
        kills: m.kills,
        fuel: Math.round(this.game.flight.fuel),
        hull: Math.round(this.game.flight.hull),
        simTime: Math.round(this.simTime),
        errors: window.__gameErrors ? window.__gameErrors.length : 0,
      };
    }
  }
}

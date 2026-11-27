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
    score: 240, gates: 1, combo: 1, discipline: 12, kills: 0,
    banner: 'NGARAI FAJAR — TERBANG RENDAH, CEPAT, LEWATI 6 GATE',
    radio: [['MENARA BROMO', 'Gate pertama di depanmu. Rendah dan cepat, Merpati.']],
    afterburner: true, windText: 'ANGIN LEMBAH 20 KT DARI BARAT',
  },
  2: {
    mission: 3, gameT: 107, camera: 'cockpit',
    jet: { x: 0, y: 72, z: -950, heading: 0, pitch: -3, roll: 0, speed: 70, throttle: 0.56, fuel: 68, hull: 100 },
    score: 2140, gates: 0, combo: 2, discipline: 96, kills: 2,
    banner: 'DINDING PETIR — ILS APPROACH, LANDASAN PULAU BADAI',
    radio: [['MENARA BOROBUDUR', 'Merpati 1, kamu segaris glideslope. PAPI 2 merah 2 putih — on glide.']],
    afterburner: false, windText: 'WIND SHEAR 14 KT · HUJAN DERAS',
    approach: true, rain: 1, lightningFar: true,
  },
  3: {
    // M2 DOGFIGHT DI DALAM BADAI (bukan M3): drone Laron + wingman + flagship
    // HARUS kelihatan di frame — diposisikan eksplisit di applyShot.
    mission: 2, gameT: 151, camera: 'chase',
    jet: { x: 300, y: 90, z: -620, heading: 0, pitch: -2, roll: -18, speed: 78, throttle: 0.72, fuel: 54, hull: 90 },
    score: 3250, gates: 0, combo: 3, discipline: 88, kills: 2,
    banner: 'BADAI KARANG — DOGFIGHT, TENGGELAMKAN KAPAL INDUK',
    radio: [['ELANG-2', 'Merpati 1, gue dikejar 2 drone! Tolong!'], ['CENDRAWASIH-3', 'Kapal induk di depan — asap hitam, itu dia.']],
    afterburner: false, windText: 'BADAI KARANG · HUJAN + PETIR',
    lightning: true, rain: 1, storm: true,
  },
  4: {
    // TOUCHDOWN / rollout di landasan pulau (bukan approach): LSO hanya boleh
    // tampil SETELAH touchdown — di sini jet SUDAH mendarat (landed: true),
    // jadi panel LSO tampil secara sah dengan TOUCHDOWN KT = SPD saat itu.
    // POLES r5 item 2+3: skor disamakan dengan debrief shot 5 (5,301 sortie /
    // 5,001 banked — 4200 + 801 bonus presisi + 300 wingman, banked = 5001);
    // touchdown BENERAN: y 44,8 = perut pesawat (radius badan 0,62) tepat di
    // permukaan strip (44,15), roll 0 (sayap datar), VSI 0 (pitch 0), SPD 65
    // m/s = 126 KT = touchdownKt. ALT 0 FT via radio-altimeter di _hudState.
    mission: 3, gameT: 192, camera: 'chase',
    jet: { x: 0, y: 44.8, z: -1330, heading: 0, pitch: 0, roll: 0, speed: 65, throttle: 0.5, fuel: 41, hull: 90 },
    score: 5301, gates: 0, combo: 3, discipline: 128, kills: 5,
    banner: 'MENDARAT — SKOR AMAN · LANDASAN PULAU BADAI',
    radio: [['MENARA BOROBUDUR', 'Merpati 1, landasan pulau di depan. PAPI menyala — bawa pulang.']],
    afterburner: false, windText: 'WIND SHEAR 12 KT · HUJAN',
    rain: 0.8, lso: true, wallCrossed: true, carrierDead: true, landed: true,
    stagedLso: { grade: 'OK', centerline: '0.4', sink: '2.1', kt: 126, fuel: 41, score: '5,301', banked: '5,001' },
  },
  5: {
    // DEBRIEF (bukti, bukan shot dossier): layar grade + medal + modul,
    // dipicu lewat jalur ASLI missions._finish() — bukan fabrikasi DOM.
    mission: 3, gameT: 192, camera: 'chase',
    jet: { x: 0, y: 45.5, z: -1300, heading: 0, pitch: 0, roll: -8, speed: 65, throttle: 0.5, fuel: 41, hull: 90 },
    score: 4200, gates: 0, combo: 3, discipline: 128, kills: 5, killsByLightning: 2, wingmanSaved: true,
    banner: 'DINDING PETIR — MISI SELESAI',
    radio: [['MENARA BOROBUDUR', 'Merpati 1, selamat datang kembali. Skor di-bank.']],
    afterburner: false, windText: 'WIND SHEAR 12 KT · HUJAN',
    rain: 0.8, wallCrossed: true, carrierDead: true, landed: true, debrief: true,
    stagedLso: { grade: 'OK', centerline: '0.4', sink: '2.1', kt: 126, fuel: 41, score: '4,200' },
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
    // M2: G/AOA/VSI dari pose manuver — rumus SAMA dengan sim live
    // (stagedInstruments), bukan angka tetap. Tiap shot beda karena
    // pitch/roll/speed-nya beda.
    const inst = f.stagedInstruments(def.jet.pitch, def.jet.roll, def.jet.speed);
    f.vsi = inst.vsi; f.gLoad = inst.gLoad; f.aoa = inst.aoa;
    f.afterburner = def.afterburner;
    game.missions.score = def.score;
    game.missions.gatesPassed = def.gates;
    game.missions.kills = def.kills || 0;
    game.missions.killsByLightning = def.killsByLightning || 0;
    game.missions.wingmanSaved = !!def.wingmanSaved;
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
    // M6: touchdown state (shot 4/5) — jet SUDAH mendarat di landasan.
    if (def.landed) {
      f.landed = true;
      f.sinkRate = 2.1; f.centerlineError = 0.4; f.touchdownKt = 126;
      game.missions.phase = 'done';
      game.missions.objectivesDone = 2;
    }
    // Shot 3 (M2 di badai): cuaca badai dipaksa ke misi 2 (dinding + hujan
    // + fog gelap) — staging saja, gameplay M2 live tidak berubah.
    if (def.storm && game.weather) {
      game.weather._buildStormWall();
      game.weather._buildRain();
      const fog = game.renderer.scene.fog;
      if (fog) { fog.color.set(0x555a75); fog.near = 200; fog.far = 1300; }
    }
    // Shot 3 (M2): jet diposisikan RELATIF terhadap flagship aktual, dari arah
    // dengan garis pandang BERSIH — cek segmen jet->flagship vs menara karst
    // (r4: approach selatan terhalang karst (-80,-673) 53 m di depan jet dan
    // karst (-154,-914) menempel flagship). Selatan diutamakan; kalau
    // terhalang, coba barat/timur/utara.
    if (def.mission === 2 && game.ships) {
      const fl0 = game.ships.flagship();
      const karsts = (game.world && game.world.karstSpots) || [];
      const losClear = (jx, jz, fx, fz) => {
        for (const k of karsts) {
          const abx = fx - jx, abz = fz - jz;
          const len2 = abx * abx + abz * abz;
          let t = ((k.x - jx) * abx + (k.z - jz) * abz) / len2;
          t = Math.max(0, Math.min(1, t));
          const px = jx + abx * t, pz = jz + abz * t;
          const dist = Math.hypot(k.x - px, k.z - pz);
          const ySight = 90 - 84 * t;
          if (dist < k.r + 12 && ySight < k.top) return false;
        }
        return true;
      };
      // [dx, dz, heading]: BARAT/TIMUR dulu (broadside!) — kapal memanjang
      // utara-selatan; dari selatan ia terlihat END-ON (26 m saja, siluet
      // kecil di depan karst), dari barat/timur sisi panjangnya (170 m)
      // terbaca penuh sebagai kapal. Selatan/utara hanya cadangan.
      // CATATAN SATUAN: flight.heading dalam DERAJAT (0=utara, 90=timur) —
      // jangan pakai radian (π/2 = 1,57° → jet tetap menghadap utara).
      const dirs = [[-280, 0, 90], [280, 0, -90], [0, 280, 0], [0, -280, 180]];
      let picked = dirs[0];
      for (const d of dirs) {
        if (losClear(fl0.pos.x + d[0], fl0.pos.z + d[1], fl0.pos.x, fl0.pos.z)) { picked = d; break; }
      }
      f.pos.x = fl0.pos.x + picked[0]; f.pos.y = 90; f.pos.z = fl0.pos.z + picked[1];
      f.heading = picked[2]; f.pitch = -2; f.roll = -18;
      game.__shot3Dir = picked; // dipakai staging drone/wingman di bawah
    }
    if (def.lightning && game.weather) {
      game.weather.deterministicStrike(f.pos, f.heading);
      game.weather.flashAlpha = 0.3;
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
    // Shot 3: drone Laron + wingman + flagship DIPOSISIKAN eksplisit di frame
    // (bukan hanya teks) — relatif terhadap flagship aktual DAN arah approach
    // yang terpilih: 3 drone di koridor antara jet dan flagship, 2 di sisi
    // flagship; wingman formasi kiri-kanan jet (tegak lurus heading).
    if (def.mission === 2 && game.drones && game.ships) {
      const flag = game.ships.flagship();
      const fx = flag.pos.x, fz = flag.pos.z;
      const dir = game.__shot3Dir || [0, 280, 0];
      const ax = dir[0] / 280, az = dir[1] / 280; // flagship -> jet
      const lx = -az, lz = ax; // lateral
      const droneSpots = [
        [fx + ax * 200 + lx * 50, 110, fz + az * 200 + lz * 50],
        [fx + ax * 160 - lx * 60, 100, fz + az * 160 - lz * 60],
        [fx + ax * 110 + lx * 30, 140, fz + az * 110 + lz * 30],
        [fx + lx * 90, 60, fz + lz * 90],
        [fx - lx * 90, 70, fz - lz * 90],
      ];
      const droneHeading = Math.atan2(ax, -az); // menghadap pemain
      game.drones.drones.forEach((d, i) => {
        if (!droneSpots[i]) return;
        d.pos.set(droneSpots[i][0], droneSpots[i][1], droneSpots[i][2]);
        d.heading = droneHeading;
        d.mesh.position.copy(d.pos);
        d.mesh.rotation.set(0, droneHeading, 0);
      });
      const fhx = Math.sin(f.heading), fhz = -Math.cos(f.heading);
      const rhx = Math.cos(f.heading), rhz = Math.sin(f.heading);
      const wingSpots = [
        [f.pos.x + fhx * 12 - rhx * 26, 86, f.pos.z + fhz * 12 - rhz * 26],
        [f.pos.x + fhx * 8 + rhx * 26, 84, f.pos.z + fhz * 8 + rhz * 26],
      ];
      game.wingman.wingmen.forEach((w, i) => {
        if (!wingSpots[i]) return;
        w.pos.set(wingSpots[i][0], wingSpots[i][1], wingSpots[i][2]);
        w.heading = f.heading;
        w.mesh.position.copy(w.pos);
        w.mesh.rotation.set(0, f.heading * Math.PI / 180, -0.25);
      });
      const fp = flag.pos;
      game.juice.spawnSmoke(fp.clone().set(fp.x, 34, fp.z - 6), 3.2, 0x1a1a1a);
      game.juice.spawnSmoke(fp.clone().set(fp.x - 4, 42, fp.z - 10), 4.0, 0x1a1a1a);
      game.juice.spawnSmoke(fp.clone().set(fp.x + 4, 50, fp.z - 2), 4.8, 0x222222);
    }
    // Posisikan kamera chase persis di belakang jet (komposisi hero).
    game.snapCameraToJet();
    // Shot 5 (debrief): picu lewat jalur ASLI missions._finish() — grade +
    // medal + skor dihitung kode nyata dari state staged, bukan fabrikasi.
    // LSO di belakang overlay diselaraskan ke skor akhir (5001, bukan 4200).
    if (def.debrief) {
      game.missions._finish(true, game.missionCtx(), game.flight);
      if (game.stagedLso) {
        game.stagedLso = { ...game.stagedLso, score: Math.round(game.missions.score).toLocaleString('en-US') };
      }
    }
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
    this.rwyJoined = false; // sudah gabung final lewat IAF (straight-in panjang)
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
    // Reset kunci sisi approach + status join final saat target bukan landasan.
    if (target.kind !== 'runway') { this.rwySide = null; this.rwyJoined = false; }
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
    // Landasan: final approach garis lurus dari IAF utara (0,220,cz-2500) ke
    // landasan — TAPI jet harus gabung final LEWAT IAF dulu (straight-in
    // panjang), bukan snap ke final di dekat strip. Snap itu yang bikin
    // limit cycle M2: jet gabung final cuma 300-500 m dari strip di 150 m,
    // radius belok ~230 m di 57 m/s, jendela |x|<40 cuma 1-2 dtk padahal
    // harus kehilangan ~130 m (max sink ~17 m/s) — mengorbit sampai BBM
    // habis (terbukti: flying di cap 420, fuel 0, kill 6).
    // "Joined" = pernah dalam 350 m dari IAF, ATAU sudah kelewat IAF ke
    // utara, ATAU sudah sejajar final (|x|<120 + heading searah final +
    // tidak jauh di atas glideslope). Sebelum joined, bidik IAF. Sesudah joined,
    // ikuti glideslope dengan koridor pelebaran: boleh turun begitu sejajar
    // koridor (40 m di <300 m, +0,12 m per meter jarak di luar itu) — di
    // jauh glideslope sudah di atas karst (70-90 m); di dekat strip jet
    // harus sudah di centerline. Lantai 150 m tetap berlaku kalau di luar
    // koridor; LSO grade TIDAK berubah (centerline error + sink tetap
    // diukur jujur di flight.js).
    if (target.kind === 'runway') {
      const cx = target.pos.x, cz = target.pos.z;
      const distH = Math.hypot(f.pos.x - cx, f.pos.z - cz);
      const distIaf = Math.hypot(f.pos.x - cx, f.pos.z - (cz - 2500));
      let hdgErr = f.heading - 180;
      while (hdgErr > 180) hdgErr -= 360;
      while (hdgErr < -180) hdgErr += 360;
      const onNorthFinal = f.pos.z < cz && Math.abs(hdgErr) < 40;
      let hdgErr0 = f.heading;
      while (hdgErr0 > 180) hdgErr0 -= 360;
      while (hdgErr0 < -180) hdgErr0 += 360;
      const onSouthFinal = f.pos.z > cz && Math.abs(hdgErr0) < 40;
      // "Sejajar final" = dekat centerline + heading searah final + TIDAK
      // jauh di atas glideslope. Tanpa syarat ketinggian, jet yang kebetulan
      // melintas dekat strip di 110 m (M2) ikut kehitung sejajar lalu
      // menukik mustahil; tanpa syarat jarak, M1 yang keluar gate 6 persis
      // di final selatan (144 m dari strip, |x|=3, heading 350) malah
      // dikirim memutar ke IAF di pegunungan dan JATUH. Glideslope dihitung
      // dari IAF (220 m) ke ujung landasan (target.y-6,5).
      const endY = target.pos.y - 6.5;
      const glideY = endY + (220 - endY) * Math.min(distH, 2500) / 2500;
      const established = Math.abs(f.pos.x - cx) < 120 && (onNorthFinal || onSouthFinal)
        && f.pos.y <= glideY + 30;
      if (distIaf < 350 || f.pos.z < cz - 2500 || established) this.rwyJoined = true;
      if (!this.rwyJoined) {
        aimPos = { x: cx, y: 220, z: cz - 2500 };
      } else {
        aimPos = this._runwayLookahead(game, target);
        const corridor = 40 + 0.12 * Math.max(0, distH - 300);
        if (Math.abs(f.pos.x - cx) > corridor) {
          aimPos = { x: aimPos.x, y: Math.max(aimPos.y, 150), z: aimPos.z };
        }
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

// main.js — Game: loop, cold start, kamera (chase/kokpit), input, tembak/bom,
// staging screenshot, autopilot test. Deklarasi paling deskriptif di awal.
import * as THREE from 'three';
import { FlightRenderer, PALETTES, clamp, lerp, DEG, mulberry32 } from './engine.js';
import { FlightModel, VARIANTS } from './flight.js';
import { TerrainMesh } from './world.js';
import { WeatherSystem } from './weather.js';
import { DroneSquadron, FlakBattery, FleetShips, StormCarrier } from './enemies.js';
import { WingmanSquadron } from './wingman.js';
import { DodgeRoll } from './dodgeroll.js';
import { Afterburner } from './afterburner.js';
import { Juice } from './juice.js';
import { MissionManager, MISSION_DEFS } from './missions.js';
import { HeadsUpDisplay } from './hud.js';
import { RealCockpit } from './cockpit.js';
import { DebriefScreen } from './debrief.js';
import { TitleScreen } from './titlescreen.js';
import { StageMusicEngine } from './audio.js';
import { RadioChatter } from './radio.js';
import { parseParams, Staging, Autopilot, TestRunner } from './presentation.js';

'use strict';

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
window.__gameErrors = errors;

export class Game {
  constructor() {
    const params = parseParams();
    this.params = params;
    this.canvas = document.getElementById('gl');
    this.renderer = new FlightRenderer(this.canvas);
    this.scene = this.renderer.scene;
    this.camera = this.renderer.camera;
    this.hud = new HeadsUpDisplay(document.getElementById('hud'));
    this.cockpit = new RealCockpit(this.camera);
    this.audio = new StageMusicEngine();
    this.radio = new RadioChatter((sp, tx) => {
      this.hud.pushRadio(sp, tx);
      this.audio.sfx('beep');
    });
    this.missions = new MissionManager();
    this.juice = new Juice(this.scene);
    this.dodge = new DodgeRoll();
    this.autopilot = new Autopilot();
    this.tester = new TestRunner(this);
    this.testTimeScale = 1;
    this.title = new TitleScreen();
    this.debrief = new DebriefScreen();
    this.missionId = 1;
    this.variantId = 'kutilang';
    this.cameraMode = 'chase';
    this.camBlend = 0; // 0 chase, 1 kokpit
    this.gameT = 0;
    this.frozen = false;
    this.shotFrames = 0;
    this.started = false; // sudah TAKE FLIGHT
    this.hudWindText = '';
    this.fireCd = 0;
    this.bombCd = 0;
    this.alarmCd = 0;
    this.lastStrikeSeen = 0;
    this.statusEl = document.getElementById('status');
    this._bindInput();
    this._bindScreens();
    // Title screen dulu (poster di atas scene landasan M1).
    this.loadMission(1, { quiet: true });
    this.title.show({ completed: this.missions.completed, banked: this.missions.banked });
    this.title.onStart = (mid, vid) => {
      this.variantId = vid;
      this.audio.ensureStarted();
      this.startMission(mid);
    };
    this.title.onVariant = (vid) => { this.variantId = vid; this._rebuildJet(); };
    // Mode staging / test langsung tanpa title.
    if (params.shot && params.shot !== 'probe') {
      this.hideTitle();
      this.audio.ensureStarted = () => {};
      Staging.applyShot(this, parseInt(params.shot, 10));
      this.started = true;
    } else if (params.test) {
      const mid = { m1: 1, m2: 2, m3: 3 }[params.test] || 1;
      this.hideTitle();
      this.tester.start(mid);
      this.started = true;
    }
    if (params.autopilot) this.autopilot.active = true;
  }

  hideTitle() { this.title.hide(); }

  missionCtx() {
    return {
      flight: this.flight,
      world: this.world,
      drones: this.drones,
      ships: this.ships,
      carrier: this.carrier,
      wingman: this.wingman,
      weather: this.weather,
      juice: this.juice,
      audio: this.audio,
      flightPos: this.jet.position,
    };
  }

  // --- Bangun ulang dunia + musuh + cuaca per misi. ---
  loadMission(id, opts = {}) {
    this.missionId = id;
    if (this.missionRoot) {
      this.scene.remove(this.missionRoot);
      this.missionRoot.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.missionRoot = new THREE.Group();
    this.scene.add(this.missionRoot);
    const palette = PALETTES[id];
    this.renderer.applyPalette(id);
    // Dunia dibangun di dalam missionRoot (scene dipindah sementara).
    const worldScene = this.missionRoot;
    this.world = new TerrainMesh(worldScene, id);
    this.world.build(palette);
    this.weather = new WeatherSystem(worldScene, id, palette);
    this.flight = new FlightModel(this.variantId);
    this.flight.reset();
    // Modul antar misi — pengali di instance, BUKAN mutasi VARIANTS (shared).
    if (this.missions.module) {
      if (this.missions.module.id === 'thrust') this.flight.speedMult = 1.18;
      if (this.missions.module.id === 'range') this.flight.fuelBurnMult = 0.65;
      if (this.missions.module.id === 'touchdown') this.flight.touchdownBonus = true;
    }
    const rwy = this.world.runways[0];
    this.flight.pos = { x: rwy.x, y: rwy.y + 1.5, z: rwy.zMax - 50 };
    this.flight.heading = 0;
    // Musuh per misi.
    if (id === 2) {
      this.drones = new DroneSquadron(worldScene, 5, { x: 300, z: -900, r: 420 }, 21);
      this.aa = new FlakBattery(worldScene, [[-520, -700, 70], [480, -900, 95], [120, -1150, 60]]);
      this.ships = new FleetShips(worldScene, palette, (x, z) => this.world.heightAt(x, z), this.world.karstSpots);
      this.carrier = null;
    } else if (id === 3) {
      this.drones = new DroneSquadron(worldScene, 4, { x: 0, z: -800, r: 380 }, 33);
      this.aa = new FlakBattery(worldScene, [[-300, -600, 30], [300, -1000, 45]]);
      this.ships = null;
      this.carrier = new StormCarrier(worldScene);
    } else {
      this.drones = new DroneSquadron(worldScene, 0, { x: 0, z: 0, r: 1 }, 1);
      this.aa = new FlakBattery(worldScene, []);
      this.ships = null;
      this.carrier = null;
    }
    this.wingman = new WingmanSquadron(worldScene);
    this.wingman.onRescued = (w) => {
      this.missions.wingmanSaved = true;
      this.missions.score += 300;
      this.juice.addPopup(this.jet.position, '+300 ELANG-2 DISELAMATKAN');
      this.radio.say('ELANG-2', 'Makasih, Merpati! Gue lindungin kamu sekarang.');
    };
    this.wingman.onRetreated = (w) => {
      this.radio.say('ELANG-2', 'Gue mundur buat repair… kamu sendirian. Maaf.');
    };
    this.missions.startMission(id);
    this.audio.setMission(id);
    this.radio.startMission(id);
    this._rebuildJet();
    this._placeJetOnRunway();
    if (!opts.quiet) {
      this.hud.showBanner(MISSION_DEFS[id].banner, MISSION_DEFS[id].briefing, 6);
      this.radio.say('MENARA', 'Merpati 1, tekan panah atas buat lepas landas.');
    }
    this.gameT = 0;
    this.frozen = false;
    this.stagedLso = null;
  }

  startMission(id) {
    this.loadMission(id);
    this.title.hide();
    this.debrief.hide();
    this.started = true;
    this.audio.ensureStarted();
  }

  _placeJetOnRunway() {
    const rwy = this.world.runways[0];
    this.flight.pos = { x: rwy.x, y: rwy.y + 1.5, z: rwy.zMax - 50 };
    this.flight.heading = 0;
    this.flight.pitch = 0;
    this.flight.roll = 0;
    this.flight.speed = 0;
    this.flight.throttle = 0;
    this.flight.flightTime = 0;
    this._syncJetMesh();
    this.snapCameraToJet();
  }

  // --- Pesawat HERO sculpted dari primitif (probe + aileron/elevator hidup + panel). ---
  _rebuildJet() {
    if (this.jet) this.scene.remove(this.jet);
    const v = VARIANTS[this.variantId];
    const jet = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: v.body, flatShading: true, roughness: 0.42, metalness: 0.35 });
    const accentMat = new THREE.MeshStandardMaterial({ color: v.accent, flatShading: true, roughness: 0.5, metalness: 0.2 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x38393e, flatShading: true, roughness: 0.6, metalness: 0.5 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x0e1626, roughness: 0.15, metalness: 0.75 });
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.7 });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      jet.add(m);
      return m;
    };
    // Hidung meruncing + badan meruncing ke ekor (sumbu Z = maju).
    add(new THREE.ConeGeometry(0.55, 2.1, 10), bodyMat, 0, 0, 2.05, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.55, 0.62, 3.0, 10), bodyMat, 0, 0, -0.6, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.62, 0.45, 1.6, 10), bodyMat, 0, 0, -3.0, Math.PI / 2);
    // Garis panel tipis gelap di sepanjang badan.
    add(new THREE.BoxGeometry(0.05, 0.03, 4.6), lineMat, 0.58, 0.28, -0.8);
    add(new THREE.BoxGeometry(0.05, 0.03, 4.6), lineMat, -0.58, 0.28, -0.8);
    // Kanopi: setengah-elipsoid gelap mengkilap.
    add(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), canopyMat, 0, 0.42, 1.55, 0, 0, 0, 1, 0.62, 1.7);
    this.ailerons = [];
    this.elevators = [];
    for (const s of [1, -1]) {
      // Sayap swept + ujung aksen + roundel merah-putih + rel misil.
      add(new THREE.BoxGeometry(3.4, 0.12, 2.4), bodyMat, s * 1.9, 0, -0.6, 0, s * -0.45, 0);
      add(new THREE.BoxGeometry(0.25, 0.14, 2.2), accentMat, s * 3.55, 0, -1.15, 0, s * -0.45, 0);
      const red = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: 0xd81e14 }));
      red.rotation.x = -Math.PI / 2; red.position.set(s * 2.1, 0.075, -0.7); jet.add(red);
      const white = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: 0xf2f2ee }));
      white.rotation.x = -Math.PI / 2; white.position.set(s * 2.1, 0.08, -0.7); jet.add(white);
      // Aileron (bergerak saat belok).
      const ail = add(new THREE.BoxGeometry(1.5, 0.07, 0.7), bodyMat, s * 2.4, -0.02, -1.85, 0, s * -0.45, 0);
      ail.userData.side = s;
      this.ailerons.push(ail);
      // Stabilator ekor (elevator, bergerak saat pitch).
      const stab = add(new THREE.BoxGeometry(1.8, 0.1, 1.0), bodyMat, s * 1.0, 0, -3.3, 0, s * -0.35, 0);
      stab.userData.side = s;
      this.elevators.push(stab);
      // Sirip ekor miring ke luar (canted) + ujung aksen.
      add(new THREE.BoxGeometry(0.1, 1.5, 1.4), bodyMat, s * 0.55, 0.85, -3.1, 0, s * 0.3, -s * 0.38);
      add(new THREE.BoxGeometry(0.12, 0.22, 1.4), accentMat, s * 0.82, 1.55, -3.1, 0, s * 0.3, -s * 0.38);
      // Nosel mesin + glow afterburner (cone emissive oranye).
      add(new THREE.CylinderGeometry(0.3, 0.34, 0.7, 10), darkMat, s * 0.55, 0, -3.85, Math.PI / 2);
      const glow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.6, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8c1e, transparent: true, opacity: 0.3 }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(s * 0.55, 0, -5.2);
      glow.userData.isAfterburnerGlow = true;
      jet.add(glow);
      // Rel misil ujung sayap.
      add(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 6), darkMat, s * 3.6, -0.02, -1.1, Math.PI / 2);
    }
    jet.rotation.order = 'YXZ';
    this.jet = jet;
    this.scene.add(jet);
    this.afterburner = new Afterburner(this.scene, jet);
    this._syncJetMesh();
  }

  _syncJetMesh() {
    const f = this.flight;
    this.jet.position.set(f.pos.x, f.pos.y, f.pos.z);
    this.jet.rotation.y = (180 - f.heading) * DEG;
    this.jet.rotation.x = -f.pitch * DEG;
    this.jet.rotation.z = -(f.roll + f.dodgeRollExtra) * DEG;
    // Aileron miring saat belok, elevator saat pitch — pesawat "hidup".
    const bankF = clamp(f.roll / 55, -1, 1);
    for (const a of this.ailerons) a.rotation.x = -a.userData.side * bankF * 0.45;
    const pitchF = clamp(f.pitch / 20, -1, 1);
    for (const e of this.elevators) e.rotation.x = -pitchF * 0.3;
  }

  _bindInput() {
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.audio.ensureStarted();
      if (e.code === 'KeyC') this._toggleCamera();
      if (e.code === 'KeyM') this.audio.setMuted(!this.audio.muted);
      if (e.code === 'KeyR') { if (this.dodge.tryStart()) this.audio.sfx('dodge'); }
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
        const mid = parseInt(e.code.slice(-1), 10);
        if (this.started && this.flight.speed < 5 && this.flight.flightTime < 12) this.startMission(mid);
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.hud.sizeHud();
    });
  }

  _bindScreens() {
    this.missions.onDebrief = (data) => {
      this.audio.sfx(data.landed ? 'bank' : 'explosionBig');
      this.debrief.show(data);
      this.started = false;
    };
    this.missions.onObjective = (text) => { this.hud.showBanner(text, '', 3); };
    this.missions.onRadio = (sp, tx) => { this.radio.say(sp, tx); };
    this.debrief.onNext = (mid) => { this.debrief.hide(); this.startMission(mid); };
    this.debrief.onRetry = () => { this.debrief.hide(); this.startMission(this.missionId); };
    this.debrief.onHangar = () => {
      this.debrief.hide();
      this.loadMission(this.missionId, { quiet: true });
      this.title.show({ completed: this.missions.completed, banked: this.missions.banked });
      this.started = false;
    };
    this.debrief.onModule = (id) => {
      this.missions.applyModule(id);
    };
  }

  _toggleCamera() {
    this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' : 'chase';
  }

  snapCameraToJet() {
    const f = this.flight;
    const fwd = this._forwardVec();
    const chasePos = new THREE.Vector3(f.pos.x - fwd.x * 16, f.pos.y + 5.5, f.pos.z - fwd.z * 16);
    const cockPos = new THREE.Vector3(f.pos.x + fwd.x * 1.8, f.pos.y + 1.35, f.pos.z + fwd.z * 1.8);
    const pos = this.cameraMode === 'cockpit' ? cockPos : chasePos;
    this.camera.position.copy(pos);
    const look = this.cameraMode === 'cockpit'
      ? new THREE.Vector3(f.pos.x + fwd.x * 60, f.pos.y + fwd.y * 60 + 1, f.pos.z + fwd.z * 60)
      : new THREE.Vector3(f.pos.x + fwd.x * 45, f.pos.y + 1.2, f.pos.z + fwd.z * 45);
    this.camera.lookAt(look);
    this.camBlend = this.cameraMode === 'cockpit' ? 1 : 0;
  }

  _forwardVec() {
    const f = this.flight;
    const h = f.heading * DEG, p = f.pitch * DEG;
    return new THREE.Vector3(Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p));
  }

  _readInput() {
    if (this.autopilot.active) return this.autopilot.computeInput(this);
    const k = this.keys;
    return {
      throttleUp: !!k.ArrowUp,
      throttleDown: !!k.ArrowDown,
      left: !!k.ArrowLeft,
      right: !!k.ArrowRight,
      pitchUp: !!k.KeyW,
      pitchDown: !!k.KeyS,
      afterburner: !!k.ShiftLeft || !!k.ShiftRight,
      fire: !!k.Space,
      bomb: !!k.KeyB,
    };
  }

  _fireCannon() {
    const f = this.flight;
    if (this.fireCd > 0 || f.crashed || f.landed) return;
    this.fireCd = 0.14;
    this.audio.sfx('cannon');
    const origin = this.jet.position.clone();
    const dir = this._forwardVec();
    const ctx = this.missionCtx();
    // Urutan cek: drone -> AA -> kapal -> carrier -> menara radio.
    let hit = this.drones ? this.drones.hitCheck(origin, dir) : null;
    if (hit) {
      this.juice.spawnExplosion(hit.pos, 0.7);
      this.missions.registerKill(ctx, 'drone', hit.pos);
      return;
    }
    hit = this.aa ? this.aa.hitCheck(origin, dir) : null;
    if (hit) {
      this.juice.spawnExplosion(hit.pos, 0.8);
      this.missions.addScore(150, ctx, 'AA HANCUR');
      return;
    }
    if (this.ships) {
      hit = this.ships.hitCheck(origin, dir);
      if (hit) {
        this.juice.spawnExplosion(hit.pos, hit.kind === 'flagship' ? 1.6 : 1.0);
        if (!hit.alive) this.missions.registerKill(ctx, hit.kind, hit.pos);
        else this.missions.addScore(50, ctx, 'KENA');
        return;
      }
    }
    if (this.carrier) {
      const r = this.carrier.hitCheck(origin, dir);
      if (r) {
        this.juice.spawnExplosion(this.carrier.pos, 1.2);
        if (r === 'dead') {
          this.missions.registerKill(ctx, 'carrier', this.carrier.pos);
          this.weather.calmStorm();
        } else this.missions.addScore(80, ctx, 'INTI KENA');
        return;
      }
    }
    const tower = this.world.radioTower;
    if (tower && tower.alive) {
      const to = new THREE.Vector3().subVectors(tower.pos, origin);
      if (to.length() < 420 && to.normalize().dot(dir) > 0.96) {
        tower.hp -= 1;
        this.juice.spawnExplosion(tower.pos, 0.8);
        if (tower.hp <= 0) this.missions.addScore(50, ctx, 'MENARA KENA');
      }
    }
  }

  _dropBomb() {
    const f = this.flight;
    if (this.bombCd > 0 || f.bombsLeft <= 0 || f.crashed || f.landed) return;
    this.bombCd = 0.8;
    f.bombsLeft -= 1;
    this.audio.sfx('missile');
    const diving = f.pitch < -12 || f.vsi < -8;
    if (this.ships) {
      const res = this.ships.bombHit({ x: f.pos.x, z: f.pos.z }, diving);
      if (res.hit) {
        this.juice.spawnExplosion(res.ship.pos, res.ship.kind === 'flagship' ? 2.2 : 1.4);
        this.audio.sfx('explosionBig');
        if (res.sunk) this.missions.registerKill(this.missionCtx(), res.ship.kind, res.ship.pos);
        else this.missions.addScore(120, this.missionCtx(), 'BOM KENA');
      } else {
        this.hud.pushRadio('MERPATI 1', res.reason);
      }
    } else if (this.carrier) {
      if (diving && Math.hypot(this.carrier.pos.x - f.pos.x, this.carrier.pos.z - f.pos.z) < 80) {
        this.carrier.hp -= 2;
        this.juice.spawnExplosion(this.carrier.pos, 2.0);
        if (this.carrier.hp <= 0) {
          this.carrier.alive = false;
          this.carrier.mesh.visible = false;
          this.missions.registerKill(this.missionCtx(), 'carrier', this.carrier.pos);
          this.weather.calmStorm();
        }
      } else {
        this.hud.pushRadio('MERPATI 1', diving ? 'BOM MELESET' : 'BOM MELESET — HARUS MENUKIK');
      }
    }
  }

  _onEnemyShoot(ev) {
    if (ev.target !== 'player') return;
    if (!ev.hit) return;
    if (this.dodge.rolling) return; // dodge roll memantulkan tembakan
    this.flight.damage(ev.damage);
    this.juice.addTrauma(0.35);
    this.juice.resetCombo();
    this.alarmCd = 0;
    this.audio.sfx('alarm');
  }

  // --- Info approach (ILS ball + LSO) buat HUD + kokpit. ---
  _approachInfo() {
    const f = this.flight;
    // Panel ILS adalah alat bantu pendaratan: tampil kapan pun landasan ada dalam
    // 1400 m dan pesawat sudah mengudara — bukan hanya saat target = runway
    // (M3: target bisa dinding/carrier sementara pesawat sudah di final).
    let rwy = null, dist = Infinity;
    for (const r of this.world.runways) {
      const d = Math.hypot(r.x - f.pos.x, ((r.zMin + r.zMax) / 2) - f.pos.z);
      if (d < dist) { dist = d; rwy = r; }
    }
    if (!rwy || dist > 1400 || f.pos.y < rwy.y + 8) return null;
    // Panel hanya saat benar-benar final: heading sejajar sumbu landasan (0°/180°,
    // landasan membujur utara-selatan), pesawat di luar ujung strip (bukan di
    // atasnya — mis. baru lepas landas), dan dekat centerline. Tanpa gate ini
    // panel muncul di tengah misi tiap kali pesawat lewat dekat landasan.
    const hNorm = ((f.heading % 360) + 360) % 360;
    const aligned = Math.min(hNorm, 360 - hNorm) < 20 || Math.abs(hNorm - 180) < 20;
    const beyond = f.pos.z < rwy.zMin - 30 || f.pos.z > rwy.zMax + 30;
    const nearCenterline = Math.abs(f.pos.x - rwy.x) < 60;
    if (!aligned || !beyond || !nearCenterline) return null;
    const idealAlt = rwy.y + dist * 0.0524 + 6; // glideslope ~3°
    const err = f.pos.y - idealAlt;
    const ball = err > 9 ? 'HIGH' : err < -9 ? 'LOW' : 'ON GLIDESLOPE';
    const onCenterline = Math.abs(f.pos.x - rwy.x) < 16;
    const ilsLocked = onCenterline && aligned;
    return {
      ball, ilsLocked,
      rwy: rwy.name, papi: '2M 2K',
      loc: clamp((f.pos.x - rwy.x) / 16, -1, 1),
      gs: clamp(err / 30, -1, 1),
      dist,
    };
  }

  _lsoInfo(approach) {
    // M6: panel LSO grade HANYA tampil SETELAH touchdown (gate pada state
    // landed / fase done/failed). Panel "preview" pre-touchdown (grade '—',
    // TOUCHDOWN KT sebelum roda menyentuh tanah) DIHAPUS — itulah yang tampil
    // prematur di shot 4 r4 (213 FT, TOUCHDOWN 134 KT padahal SPD 126 KT).
    // Staging shot 4/5: stagedLso hanya dipakai kalau flight.landed sudah true.
    if (this.stagedLso && this.flight.landed) return this.stagedLso;
    const f = this.flight;
    const m = this.missions;
    if (m.phase === 'done' || m.phase === 'failed') {
      const g = m.grade || { letter: '—' };
      return {
        grade: g.letter === 'A' ? 'OK' : g.letter === 'B' ? 'OK' : g.letter === 'C' ? 'ROUGH' : 'BOLTER',
        centerline: f.centerlineError.toFixed(1),
        sink: f.sinkRate.toFixed(1),
        kt: Math.round(f.touchdownKt),
        fuel: Math.round(f.fuel),
        score: Math.round(m.score).toLocaleString('en-US'),
      };
    }
    return null;
  }

  _hudState() {
    const f = this.flight;
    const d = f.display();
    // POLES r5 item 3: radio-altimeter saat mendarat — roda di landasan =
    // 0 FT. ALT MSL (pos.y x 3,28) di landasan pulau (y=44) membaca 149 FT
    // padahal jet sudah touchdown; angka itu menyesatkan di shot 4. Hanya
    // saat landed; shot 1/2/3 (terbang) tidak berubah. Pita ALT ikut 0.
    if (f.landed) d.ft = 0;
    const ctx = this.missionCtx();
    const target = this.missions.currentTarget(ctx);
    const targetDist = target ? Math.hypot(target.pos.x - f.pos.x, target.pos.y - f.pos.y, target.pos.z - f.pos.z) : 0;
    const approach = this._approachInfo();
    // Radar: gate emas, drone merah, kapal oranye, carrier merah besar, landasan hijau, wingman biru.
    const radarTargets = [];
    if (this.world.gates) for (const g of this.world.gates) if (!g.passed) radarTargets.push({ x: g.pos.x, z: g.pos.z, color: '#ffd76a', size: 4 });
    if (this.drones) for (const dr of this.drones.drones) if (dr.alive) radarTargets.push({ x: dr.pos.x, z: dr.pos.z, color: '#ff5030', size: 3 });
    if (this.ships) for (const s of this.ships.ships) if (s.alive) radarTargets.push({ x: s.pos.x, z: s.pos.z, color: '#ff9a3d', size: 5 });
    if (this.carrier && this.carrier.alive) radarTargets.push({ x: this.carrier.pos.x, z: this.carrier.pos.z, color: '#ff2020', size: 6 });
    for (const r of this.world.runways) radarTargets.push({ x: r.x, z: (r.zMin + r.zMax) / 2, color: '#5ad8a0', size: 4 });
    if (this.wingman) for (const w of this.wingman.wingmen) if (w.alive && !w.retreated) radarTargets.push({ x: w.pos.x, z: w.pos.z, color: '#7fd8ff', size: 3 });
    const gateLabels = (this.world.gates || []).filter((g) => !g.passed).slice(0, 3).map((g) => ({
      pos: g.pos, label: 'GATE ' + (g.index + 1) + ' · ' + Math.round(Math.hypot(g.pos.x - f.pos.x, g.pos.y - f.pos.y, g.pos.z - f.pos.z)) + ' m',
    }));
    const mins = Math.floor(f.flightTime / 60);
    const secs = Math.floor(f.flightTime % 60);
    return {
      display: d,
      score: this.missions.score,
      mission: MISSION_DEFS[this.missionId],
      objectivesDone: this.missions.objectivesDone,
      objectivesTotal: this.missions.objectivesTotal,
      discipline: Math.round(this.missions.discipline),
      statusLine2: approach ? 'RWY ' + approach.rwy + ' · PAPI ' + approach.papi : 'SISTEM NORMAL',
      lightningWarn: this.weather.lightningWarn > 0,
      inCloud: this.weather.inCloud,
      windText: this.hudWindText || this.weather.windDirText,
      playerX: f.pos.x, playerZ: f.pos.z,
      camera: this.camera,
      radarTargets, target, targetDist, gateLabels,
      popups: this.juice.popups,
      approach,
      lso: this._lsoInfo(approach),
      // MICRO-FIX item 2: HUD perlu tahu jet sudah mendarat supaya peringatan
      // "DI DALAM AWAN" tidak tampil saat landed (shot 4/5).
      landed: f.landed,
      cockpit: this.cameraMode === 'cockpit',
      combo: this.juice.combo,
      multiplier: this.juice.multiplier,
      clock: String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0'),
      flashAlpha: this.weather.flashAlpha,
      endBanner: this.missions.phase === 'done'
        // MICRO-FIX item 2: headline akhir dibedakan dari banner misi —
        // dulu "MENDARAT — SKOR AMAN" dobel dengan banner staging shot 4.
        ? { text: 'SKOR AMAN — BANK +' + (this.stagedLso && this.stagedLso.banked ? this.stagedLso.banked : Math.round(this.missions.score).toLocaleString('en-US')), sub: 'SORTIE ' + Math.round(this.missions.score).toLocaleString('en-US') + ' · Repair selesai' }
        : this.missions.phase === 'failed'
          ? { text: 'JATUH — COBA LAGI', sub: 'Restart dalam 5 detik · tekan RETRY di debrief' }
          : null,
    };
  }

  _cockpitState(approach) {
    const f = this.flight;
    const d = f.display();
    return {
      pitch: f.pitch, roll: f.roll, hdg: d.hdg,
      kt: d.kt, ft: d.ft, thr: d.thr, aoa: d.aoa,
      fuel: d.fuel, hull: d.hull, hullMax: d.hullMax,
      gearDown: f.speed < 90, flapsDown: f.speed < 90, hookDown: this.missionId === 3,
      ilsLocked: approach ? approach.ilsLocked : false,
      ils: approach ? { loc: approach.loc, gs: approach.gs } : null,
      radarTargets: this._hudState().radarTargets,
      playerX: f.pos.x, playerZ: f.pos.z,
      rain: this.missionId === 3 ? 1 : 0,
    };
  }

  update(dt, t) {
    const f = this.flight;
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.bombCd = Math.max(0, this.bombCd - dt);
    this.alarmCd = Math.max(0, this.alarmCd - dt);
    if (!this.frozen && this.started) {
      const input = this._readInput();
      // Angin dari weather sebagai gaya lateral.
      this.weather.update(dt, t, f.pos, this.camera.position, this.renderer);
      f.windPush.x = this.weather.wind.x;
      f.windPush.z = this.weather.wind.z;
      f.ice = this.weather.iceTimer;
      this.dodge.update(dt, f);
      f.update(dt, input, { x: 0, z: 0 }, (x, z) => this.world.heightAt(x, z), this.world.runways);
      if (input.fire) this._fireCannon();
      if (input.bomb) this._dropBomb();
      if (input.dodge && this.dodge.tryStart()) this.audio.sfx('dodge');
      // Petir baru -> guntur.
      if (this.weather.strikeCount > this.lastStrikeSeen) {
        this.lastStrikeSeen = this.weather.strikeCount;
        this.audio.sfx('thunder');
      }
      // Musuh + wingman.
      this.drones.update(dt, t, f.pos, this.dodge.rolling,
        this.wingman.wingmen.map((w) => ({ id: w.id, pos: w.pos, alive: w.alive && !w.retreated })),
        (ev) => this._onEnemyShoot(ev));
      this.aa.update(dt, f.pos, this.weather.inCloud, (ev) => this._onEnemyShoot(ev));
      if (this.ships) this.ships.update(dt, t, this.juice);
      if (this.carrier) this.carrier.update(dt, t);
      this.wingman.update(dt, t, f.pos, f.heading, f.roll, this.drones, (ev) => {
        this.juice.spawnExplosion(ev.drone.pos, 0.7);
        this.missions.registerKill(this.missionCtx(), 'drone', ev.drone.pos);
      });
      this.missions.update(dt, this.missionCtx());
      this.radio.update(f.flightTime);
      this.audio.setEngine(f.throttle, f.afterburner);
      this.gameT = f.flightTime;
      this.tester.update(dt);
    } else {
      // Frozen (staging): ambient saja, deterministik.
      this.weather.update(0, t, f.pos, this.camera.position, this.renderer);
      if (this.weather.rain) this.weather.rain.visible = this.params.shot === '2' || this.params.shot === '3' || this.params.shot === '4' || this.params.shot === '5';
    }
    // Frozen (staging): ambient dibekukan juga — deterministik penuh.
    this.world.update(this.frozen ? 0 : dt, this.frozen ? this.gameT : t);
    this.juice.update(this.frozen ? 0 : dt);
    this.afterburner.update(dt, f.afterburner && !this.frozen, this.jet.position, this.jet.quaternion, this.camera.position);
    this._syncJetMesh();
    // --- Kamera: chase lerp + lookahead + bank roll; kokpit stabil; transisi halus. ---
    const targetBlend = this.cameraMode === 'cockpit' ? 1 : 0;
    this.camBlend = lerp(this.camBlend, targetBlend, clamp(dt * 4, 0, 1));
    const fwd = this._forwardVec();
    const chasePos = new THREE.Vector3(f.pos.x - fwd.x * 16, f.pos.y + 5.5, f.pos.z - fwd.z * 16);
    const cockPos = new THREE.Vector3(f.pos.x + fwd.x * 1.8, f.pos.y + 1.35, f.pos.z + fwd.z * 1.8);
    const camPos = chasePos.clone().lerp(cockPos, this.camBlend);
    const chaseLook = new THREE.Vector3(f.pos.x + fwd.x * 45, f.pos.y + 1.2, f.pos.z + fwd.z * 45);
    const cockLook = new THREE.Vector3(f.pos.x + fwd.x * 60, f.pos.y + fwd.y * 60 + 1, f.pos.z + fwd.z * 60);
    const look = chaseLook.clone().lerp(cockLook, this.camBlend);
    // Trauma² shake (hanya kamera).
    const sh = this.juice.shakeOffset(t);
    camPos.x += sh.x; camPos.y += sh.y;
    this.camera.position.copy(camPos);
    this.camera.up.set(Math.sin((f.roll * DEG) * 0.3) + sh.roll, 1, 0);
    this.camera.lookAt(look);
    this.camera.up.set(0, 1, 0);
    this.renderer.updateCameraLights(camPos, look);
    this.cockpit.setVisible(this.camBlend > 0.5);
    // --- HUD + kokpit. ---
    const hs = this._hudState();
    this.hud.update(dt);
    this.hud.draw(hs);
    if (this.camBlend > 0.5) this.cockpit.update(this._cockpitState(hs.approach), t, dt);
  }

  run() {
    const timer = new THREE.Timer();
    timer.connect(document);
    let frames = 0;
    const loop = () => {
      timer.update();
      let dt = clamp(timer.getDelta(), 0, 0.1);
      const t = timer.getElapsed();
      // Hitstop: sim beku, render + flash tetap jalan.
      if (this.juice.frozen) dt = 0;
      const steps = this.testTimeScale;
      for (let s = 0; s < steps; s++) this.update(dt, t);
      this.renderer.render(t);
      frames++;
      if (frames === 5) {
        const info = this.renderer.info;
        this.statusEl.textContent = 'GAME OK calls=' + info.render.calls + ' triangles=' + info.render.triangles + ' errors=' + errors.length;
        window.__gameReady = true;
        window.__gameInfo = { calls: info.render.calls, triangles: info.render.triangles, errors: [...errors], frames };
        if (this.params.shot && this.params.shot !== 'probe') {
          window.__shotReady = true;
          this.statusEl.textContent += ' SHOT ' + this.params.shot + ' READY';
        }
        if (this.params.test) window.__testReady = true;
      }
    };
    this.renderer.renderer.setAnimationLoop(loop);
  }
}

// --- Boot. ---
const game = new Game();
window.__game = game;
game.run();

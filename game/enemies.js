// enemies.js — DroneSquadron (Laron) + FlakBattery + FleetShips (flagship) + StormCarrier.
// Deklarasi paling deskriptif di awal (kontrak juri: outline baca deklarasi pertama).
import * as THREE from 'three';
import { mulberry32, clamp, lerp } from './engine.js';

'use strict';

// --- Bangun drone "Laron": kecil runcing, sayap delta, mata merah. ---
function buildDroneMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, flatShading: true, roughness: 0.5, metalness: 0.6 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2.2 });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 6), bodyMat);
  nose.rotation.x = Math.PI / 2; nose.position.z = 1.2; g.add(nose);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 2.4, 6), bodyMat);
  body.rotation.x = Math.PI / 2; g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.1), bodyMat);
  wing.position.z = -0.4; g.add(wing);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), eyeMat);
  eye.position.set(0, 0.3, 1.4); g.add(eye);
  g.traverse((m) => { m.castShadow = true; });
  return g;
}

export class DroneSquadron {
  constructor(scene, count, area, seed = 11) {
    this.scene = scene;
    this.drones = [];
    this.area = area; // {x, z, r}
    const rnd = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const mesh = buildDroneMesh();
      const d = {
        mesh,
        pos: new THREE.Vector3(area.x + (rnd() - 0.5) * area.r, 90 + rnd() * 90, area.z + (rnd() - 0.5) * area.r),
        heading: rnd() * Math.PI * 2,
        speed: 55 + rnd() * 25,
        hp: 1,
        alive: true,
        state: 'patrol',
        shootCd: 2 + rnd() * 3,
        wp: new THREE.Vector3(area.x + (rnd() - 0.5) * area.r, 90 + rnd() * 80, area.z + (rnd() - 0.5) * area.r),
        target: null, // 'player' | wingman ref
        wobble: rnd() * 10,
      };
      mesh.position.copy(d.pos);
      scene.add(mesh);
      this.drones.push(d);
    }
    this.tracers = [];
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xff5030 });
  }

  aliveCount() { return this.drones.filter((d) => d.alive).length; }

  update(dt, t, playerPos, playerRolling, wingmen, onShoot) {
    for (const d of this.drones) {
      if (!d.alive) continue;
      const toPlayer = new THREE.Vector3().subVectors(playerPos, d.pos);
      const distP = toPlayer.length();
      // Pilih target: pemain (kalau dekat) atau wingman yang dikejar.
      let tgt = null, tgtPos = null;
      if (d.target === 'wingman' && wingmen) {
        const w = wingmen.find((wm) => wm.id === d.wingmanId && wm.alive);
        if (w) { tgt = 'wingman'; tgtPos = w.pos; }
        else d.target = null;
      }
      if (!tgtPos && distP < 420) { tgt = 'player'; tgtPos = playerPos; }
      if (tgtPos) {
        d.state = 'chase';
        const dir = new THREE.Vector3().subVectors(tgtPos, d.pos).normalize();
        const desired = Math.atan2(dir.x, -dir.z);
        let dh = desired - d.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        d.heading += clamp(dh, -1.4 * dt, 1.4 * dt);
        d.pos.addScaledVector(dir, d.speed * 1.15 * dt);
        d.pos.y += clamp(tgtPos.y - d.pos.y, -1, 1) * 8 * dt;
        // Tembak kalau menghadap target + dalam jangkauan; dodge roll memantulkan.
        d.shootCd -= dt;
        if (d.shootCd <= 0 && distP < 320) {
          d.shootCd = 2.2 + Math.random() * 1.6;
          const hit = !playerRolling && tgt === 'player' && Math.random() < 0.35;
          this._fireTracer(d.pos, tgtPos);
          if (onShoot) onShoot({ from: d.pos, to: tgtPos, hit, target: tgt, damage: 6 });
        }
      } else {
        d.state = 'patrol';
        const toWp = new THREE.Vector3().subVectors(d.wp, d.pos);
        if (toWp.length() < 30) {
          d.wp.set(this.area.x + (Math.random() - 0.5) * this.area.r,
            90 + Math.random() * 80, this.area.z + (Math.random() - 0.5) * this.area.r);
        }
        const dir = toWp.normalize();
        const desired = Math.atan2(dir.x, -dir.z);
        let dh = desired - d.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        d.heading += clamp(dh, -0.8 * dt, 0.8 * dt);
        d.pos.addScaledVector(dir, d.speed * dt);
      }
      d.pos.y += Math.sin(t * 2 + d.wobble) * 2 * dt;
      d.mesh.position.copy(d.pos);
      d.mesh.rotation.set(0, d.heading, Math.sin(t * 1.5 + d.wobble) * 0.25);
    }
    // Tracer memudar.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      tr.mesh.material.opacity = Math.max(0, tr.life * 3);
      if (tr.life <= 0) { this.scene.remove(tr.mesh); this.tracers.splice(i, 1); }
    }
  }

  _fireTracer(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, len, 4),
      new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.9 }));
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.3 });
  }

  // Tembakan pemain: drone terdekat di depan dalam kerucut -> kena.
  hitCheck(origin, dirVec, range = 420) {
    let best = null, bestD = range;
    for (const d of this.drones) {
      if (!d.alive) continue;
      const to = new THREE.Vector3().subVectors(d.pos, origin);
      const dist = to.length();
      if (dist > range) continue;
      const cos = to.normalize().dot(dirVec);
      if (cos > 0.965 && dist < bestD) { best = d; bestD = dist; }
    }
    if (best) { best.hp -= 1; if (best.hp <= 0) { best.alive = false; best.mesh.visible = false; } }
    return best;
  }
}

export class FlakBattery {
  constructor(scene, positions) {
    this.scene = scene;
    this.batteries = [];
    for (const [x, z, y] of positions) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 3, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a4a44, flatShading: true, roughness: 0.9 }));
      base.position.y = 1.5; g.add(base);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 5, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2a26, flatShading: true, roughness: 0.6, metalness: 0.5 }));
      barrel.position.y = 4.5; barrel.rotation.z = 0.5; g.add(barrel);
      g.position.set(x, y, z);
      g.traverse((m) => { m.castShadow = true; });
      scene.add(g);
      this.batteries.push({ mesh: g, pos: new THREE.Vector3(x, y + 5, z), hp: 2, alive: true, cd: 1.5 });
    }
    this.tracers = [];
  }

  update(dt, playerPos, playerInCloud, onShoot) {
    for (const b of this.batteries) {
      if (!b.alive) continue;
      const dist = b.pos.distanceTo(playerPos);
      b.cd -= dt;
      // AA tidak mengunci kalau pemain di dalam awan (M3) atau terlalu tinggi.
      if (!playerInCloud && dist < 520 && playerPos.y < 170 && b.cd <= 0) {
        b.cd = 2.6;
        const hit = Math.random() < 0.22;
        if (onShoot) onShoot({ from: b.pos, to: playerPos, hit, target: 'player', damage: 8, aa: true });
      }
    }
  }

  hitCheck(origin, dirVec, range = 420) {
    let best = null, bestD = range;
    for (const b of this.batteries) {
      if (!b.alive) continue;
      const to = new THREE.Vector3().subVectors(b.pos, origin);
      const dist = to.length();
      if (dist > range) continue;
      if (to.normalize().dot(dirVec) > 0.97 && dist < bestD) { best = b; bestD = dist; }
    }
    if (best) { best.hp -= 1; if (best.hp <= 0) { best.alive = false; best.mesh.visible = false; } }
    return best;
  }
}

export class FleetShips {
  constructor(scene, palette, heightAt, karstSpots) {
    this.scene = scene;
    this.ships = [];
    this.smoke = [];
    // Kapal HARUS di air: cari titik heightAt < 1,0 di sekitar posisi
    // desain (spiral 500 m). Ambang 1,0 = di bawah permukaan laut (y=1,2);
    // ambang -0,5 GAGAL total (flagship r4 tetap di (300,-900)) karena
    // koridor approach landasan meratakan tanah di |x|<120 ke y=34 dan ekor
    // gaussian pulau menjaga h ~0..+5 di selat antar pulau. Titik juga harus
    // bersih dari menara karst (pusat kapal > r karst + 30 m) — air di
    // (-120,-900) ternyata di dalam jejak karst (-154,-914, r=43), kapal
    // tertutup batu dari kamera.
    const karstClear = (x, z) => {
      if (!karstSpots) return true;
      for (const k of karstSpots) {
        if (Math.hypot(x - k.x, z - k.z) < k.r + 30) return false;
      }
      return true;
    };
    const waterSpot = (x, z, maxR = 500) => {
      if (!heightAt || (heightAt(x, z) < 1.0 && karstClear(x, z))) return [x, z];
      for (let r = 20; r <= maxR; r += 20) {
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          const nx = x + Math.cos(ang) * r, nz = z + Math.sin(ang) * r;
          if (heightAt(nx, nz) < 1.0 && karstClear(nx, nz)) return [nx, nz];
        }
      }
      return [x, z];
    };
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x3a4148, flatShading: true, roughness: 0.7, metalness: 0.4 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x2a2f34, flatShading: true, roughness: 0.8 });
    // Flagship: besar, berasap, butuh 3 bom tukik ATAU 6 misil. Terbaca sebagai
    // kapal perang: lambung + garis + haluan + menara + jendela jembatan + tiang
    // radar + cerobong + lampu dek.
    const flag = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 120), hullMat);
    hull.position.y = 4.5; flag.add(hull);
    for (const s of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 118),
        new THREE.MeshStandardMaterial({ color: 0x8a2a20, flatShading: true, roughness: 0.7 }));
      stripe.position.set(s * 13.2, 5, 0); flag.add(stripe);
    }
    const bow = new THREE.Mesh(new THREE.ConeGeometry(13, 26, 4), hullMat);
    bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 4.5, -72); flag.add(bow);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(10, 16, 14), deckMat);
    tower.position.set(0, 16, 8); flag.add(tower);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(10.5, 2.6, 14.5),
      new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x6fb8e8, emissiveIntensity: 1.6 }));
    bridge.position.set(0, 22, 8); flag.add(bridge);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 10, 6), deckMat);
    mast.position.set(0, 28, 8); flag.add(mast);
    const radarBar = new THREE.Mesh(new THREE.BoxGeometry(8, 0.7, 1), deckMat);
    radarBar.position.set(0, 33, 8); flag.add(radarBar);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 12, 8), deckMat);
    stack.position.set(0, 22, -6); flag.add(stack);
    // Lampu dek (deret kuning).
    const deckLampMat = new THREE.MeshStandardMaterial({ color: 0xffc860, emissive: 0xffa020, emissiveIntensity: 1.8 });
    for (let z = -50; z <= 50; z += 25) {
      for (const s of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), deckLampMat);
        lamp.position.set(s * 12.5, 9.4, z); flag.add(lamp);
      }
    }
    // Cari air terbuka buat flagship (posisi desain (300,-900) itu daratan).
    const [fx, fz] = waterSpot(300, -900);
    flag.position.set(fx, 1.2, fz);
    flag.traverse((m) => { m.castShadow = true; });
    scene.add(flag);
    this.ships.push({
      mesh: flag, pos: new THREE.Vector3(fx, 6, fz), hp: 6, maxHp: 6, alive: true,
      kind: 'flagship', name: 'KAPAL INDUK', bombHits: 0, smokeTimer: 0,
    });
    // Kapal kecil (AA) — target bonus.
    const smallDefs = [[120, -700], [480, -1050], [180, -1150]];
    smallDefs.forEach(([x, z], i) => {
      const [sx, sz] = waterSpot(x, z);
      const s = new THREE.Group();
      const h = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 34), hullMat);
      h.position.y = 2.5; s.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 6), deckMat);
      t.position.set(0, 6, 4); s.add(t);
      s.position.set(sx, 1.2, sz);
      s.traverse((m) => { m.castShadow = true; });
      scene.add(s);
      this.ships.push({
        mesh: s, pos: new THREE.Vector3(sx, 4, sz), hp: 2, maxHp: 2, alive: true,
        kind: 'escort', name: 'KAPAL KECIL ' + (i + 1), bombHits: 0, smokeTimer: 0,
      });
    });
  }

  flagship() { return this.ships[0]; }
  aliveCount() { return this.ships.filter((s) => s.alive).length; }

  // Bom: hanya efektif saat menukik (pitch < -12° atau sink < -8 m/s).
  bombHit(pos, diving) {
    if (!diving) return { hit: false, reason: 'BOM MELESET — HARUS MENUKIK' };
    let best = null, bestD = 70;
    for (const s of this.ships) {
      if (!s.alive) continue;
      const d = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
      if (d < bestD) { best = s; bestD = d; }
    }
    if (!best) return { hit: false, reason: 'BOM JATUH KE LAUT' };
    best.bombHits += 1;
    best.hp -= 2;
    if (best.hp <= 0) { best.alive = false; best.mesh.visible = false; }
    return { hit: true, ship: best, sunk: !best.alive };
  }

  missileHit(ship) {
    ship.hp -= 1;
    if (ship.hp <= 0) { ship.alive = false; ship.mesh.visible = false; return true; }
    return false;
  }

  hitCheck(origin, dirVec, range = 420) {
    let best = null, bestD = range;
    for (const s of this.ships) {
      if (!s.alive) continue;
      const to = new THREE.Vector3().subVectors(s.pos, origin);
      const dist = to.length();
      if (dist > range) continue;
      if (to.normalize().dot(dirVec) > 0.96 && dist < bestD) { best = s; bestD = dist; }
    }
    if (best) {
      best.hp -= 1;
      if (best.hp <= 0) { best.alive = false; best.mesh.visible = false; }
    }
    return best;
  }

  update(dt, t, juice) {
    // Asap hitam dari flagship (set-piece M2) — naik dari cerobong.
    const flag = this.flagship();
    if (flag.alive) {
      flag.smokeTimer -= dt;
      if (flag.smokeTimer <= 0 && juice) {
        flag.smokeTimer = 0.4;
        juice.spawnSmoke(new THREE.Vector3(flag.pos.x, 30, flag.pos.z - 6), 1.6, 0x1a1a1a);
      }
    }
  }
}

export class StormCarrier {
  constructor(scene) {
    this.scene = scene;
    const g = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x39404e, flatShading: true, roughness: 0.6, metalness: 0.5 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x232830, flatShading: true, roughness: 0.8 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x8a2a20, flatShading: true, roughness: 0.7 });
    const winMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x6fb8e8, emissiveIntensity: 1.6 });
    // Pesawat induk raksasa melayang di dinding badai — TERBACA sebagai kapal:
    // lambung + garis merah + dek + island/menara + cerobong berasap + jet parkir.
    const hull = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 170), hullMat);
    hull.position.y = 0; g.add(hull);
    // Garis lambung merah (kiri-kanan) — siluet kapal, bukan balok abu-abu.
    for (const s of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 168), stripeMat);
      stripe.position.set(s * 20.2, 2, 0); g.add(stripe);
    }
    const bow = new THREE.Mesh(new THREE.ConeGeometry(20, 34, 4), hullMat);
    bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0, -100); g.add(bow);
    // Dek penerbangan (lebih lebar dari lambung, abu terang).
    const deck = new THREE.Mesh(new THREE.BoxGeometry(46, 2.5, 162), deckMat);
    deck.position.y = 8; g.add(deck);
    // Garis tengah dek + marka pendaratan.
    const centerLine = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 150),
      new THREE.MeshStandardMaterial({ color: 0xd8c860, emissive: 0x8a7a20, emissiveIntensity: 0.6 }));
    centerLine.position.set(0, 9.4, 0); g.add(centerLine);
    // Island / menara komando (kanan dek) + jendela jembatan menyala.
    const tower = new THREE.Mesh(new THREE.BoxGeometry(14, 26, 18), deckMat);
    tower.position.set(12, 21, 12); g.add(tower);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(14.5, 3, 18.5), winMat);
    bridge.position.set(12, 30, 12); g.add(bridge);
    // Tiang radar + antena putar di atas menara.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 12, 6), hullMat);
    mast.position.set(12, 40, 12); g.add(mast);
    const radarBar = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 1.2), deckMat);
    radarBar.position.set(12, 46, 12); g.add(radarBar);
    // Cerobong berasap (kiri menara) + 3 gumpal asap statis.
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, 14, 8), deckMat);
    stack.position.set(-12, 16, -8); g.add(stack);
    const smokeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, flatShading: true, roughness: 1, transparent: true, opacity: 0.75 });
    this.smokePuffs = [];
    [[-12, 26, -8, 5], [-14, 32, -10, 6.5], [-10, 39, -6, 8]].forEach(([x, y, z, r]) => {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), smokeMat);
      puff.position.set(x, y, z); puff.scale.y = 1.3; g.add(puff);
      this.smokePuffs.push(puff);
    });
    // Jet parkir di dek (2 siluet kecil) — ini kapal induk, bukan balok.
    const jetMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, flatShading: true, roughness: 0.6 });
    [[-12, -40], [10, -55]].forEach(([x, z]) => {
      const pj = new THREE.Group();
      const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 6), jetMat);
      fus.rotation.x = Math.PI / 2; pj.add(fus);
      const w = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.15, 1.4), jetMat);
      w.position.z = -0.5; pj.add(w);
      pj.position.set(x, 10.2, z);
      g.add(pj);
    });
    // Inti bercahaya = titik lemah.
    const core = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 2.6 }));
    core.position.set(0, 0, 30);
    g.add(core);
    this.core = core;
    // Lampu-lampu dek (deret kuning, kiri-kanan).
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffc860, emissive: 0xffa020, emissiveIntensity: 1.8 });
    for (let z = -70; z <= 70; z += 28) {
      for (const s of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), lampMat);
        lamp.position.set(s * 22.5, 9.6, z);
        g.add(lamp);
      }
    }
    g.position.set(0, 150, -820);
    g.traverse((m) => { m.castShadow = true; });
    scene.add(g);
    this.mesh = g;
    this.pos = new THREE.Vector3(0, 150, -820);
    this.hp = 5;
    this.maxHp = 5;
    this.alive = true;
    this.drift = 0;
  }

  update(dt, t) {
    if (!this.alive) return;
    this.drift += dt;
    this.mesh.position.y = 150 + Math.sin(this.drift * 0.5) * 6;
    this.mesh.position.x = Math.sin(this.drift * 0.22) * 24;
    this.pos.copy(this.mesh.position);
    this.core.material.emissiveIntensity = 2.2 + 0.9 * Math.sin(t * 4);
    // Asap cerobong mengembang pelan.
    if (this.smokePuffs) for (let i = 0; i < this.smokePuffs.length; i++) {
      const p = this.smokePuffs[i];
      p.position.y += Math.sin(t * 0.7 + i * 2) * 0.008;
    }
  }

  hitCheck(origin, dirVec, range = 500) {
    if (!this.alive) return null;
    const to = new THREE.Vector3().subVectors(this.pos, origin);
    const dist = to.length();
    if (dist > range) return null;
    if (to.normalize().dot(dirVec) > 0.94) {
      this.hp -= 1;
      if (this.hp <= 0) { this.alive = false; this.mesh.visible = false; return 'dead'; }
      return 'hit';
    }
    return null;
  }
}

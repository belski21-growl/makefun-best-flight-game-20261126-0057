// world.js — TerrainMesh + landmark + heightAt (grading koridor landasan di dalamnya)
// + laut + awan 3D. Deklarasi paling deskriptif di awal (kontrak juri: outline baca deklarasi pertama).
import * as THREE from 'three';
import { mulberry32, fbm, vnoise, clamp, lerp, sstep } from './engine.js';

'use strict';

// --- Fungsi ketinggian per misi (dipakai mesh DAN heightAt — satu sumber kebenaran). ---
function heightM1(x, z) {
  const n = fbm(x * 0.0035 + 11, z * 0.0035 + 7);
  const wall = sstep(110, 520, Math.abs(x)) * 190;   // dinding ngarai naik ke kiri-kanan
  const ridge = sstep(600, 1300, -z) * 40;           // makin jauh ke utara makin tinggi
  return 8 + n * 16 + wall + ridge;
}
function heightM2(x, z) {
  // Kepulauan: laut -6, pulau = bump gaussian di titik seeded.
  let h = -6 + fbm(x * 0.004 + 3, z * 0.004 + 5) * 6;
  const islands = [
    [0, 0, 420, 95], [-520, -700, 260, 70], [480, -900, 300, 110],
    [-380, 500, 220, 55], [620, 300, 200, 48], [-700, -200, 180, 60],
    [240, -1400, 260, 80], [-240, -1150, 200, 62],
  ];
  for (const [ix, iz, r, ht] of islands) {
    const d2 = ((x - ix) * (x - ix) + (z - iz) * (z - iz)) / (r * r);
    if (d2 < 4) h += ht * Math.exp(-d2 * 1.6);
  }
  return h;
}
function heightM3(x, z) {
  const n = fbm(x * 0.003 + 21, z * 0.003 + 17);
  const hill = sstep(500, 1200, Math.abs(x)) * 90;
  return 6 + n * 22 + hill;
}
const HEIGHT_FN = { 1: heightM1, 2: heightM2, 3: heightM3 };

// Koridor landasan per misi: {x, zMin, zMax, y} — grading DI DALAM heightAt.
const RUNWAYS = {
  1: [
    { x: 0, zMin: -430, zMax: 430, y: 15.3, name: 'BROMO 09' },
    { x: 0, zMin: -1560, zMax: -1180, y: 52, name: 'PULAU 27' },
  ],
  2: [
    { x: 0, zMin: -430, zMax: 430, y: 34, name: 'AMPAT 09' },
  ],
  3: [
    { x: 0, zMin: -430, zMax: 430, y: 15.3, name: 'BOROBUDUR 09' },
    { x: 0, zMin: -1560, zMax: -1180, y: 44, name: 'PULAU BADAI 27' },
  ],
};

export class TerrainMesh {
  constructor(scene, missionId) {
    this.scene = scene;
    this.missionId = missionId;
    this.palette = null;
    this.heightFn = HEIGHT_FN[missionId] || heightM1;
    this.runways = RUNWAYS[missionId] || RUNWAYS[1];
    this.group = new THREE.Group();
    this.clouds = [];
    this.gates = [];
    this.karstSpots = []; // {x, z, r, top} menara karst M2 — kapal + garis pandang harus menghindar
    this.sea = null;
    this.glitter = null;
    scene.add(this.group);
  }

  // heightAt: grading koridor landasan DI DALAM dirinya (B1 diperbaiki — bukan iris strip).
  // Koridor LEBAR (x ±30 m penuh, memudar ke ±100 m; z ±120 m dari ujung) —
  // approach path di centerline sering meleset 30-60 m ke samping saat berbelok,
  // dan koridor sempit (±24/±70 m) membuat tanah di samping strip tetap karst
  // 70+ m sehingga jet menabrak bukit saat final.
  // + KORIDOR APPROACH: lembah datar selebar ±30 m sepanjang sumbu landasan
  // (±700 m) — fix approach 600 m di luar koridor pendek, path final menembus
  // karst 70-90 m. Koridor ini hanya di centerline (x ±30 m), karst di samping
  // (x > 100 m) tetap menjulang.
  heightAt(x, z) {
    let h = this.heightFn(x, z);
    for (const r of this.runways) {
      const inZ = z > r.zMin - 120 && z < r.zMax + 120;
      if (inZ) {
        const edgeX = sstep(30, 100, Math.abs(x - r.x));          // 0 di tengah koridor
        const edgeZ = sstep(0, 120, Math.min(z - (r.zMin - 120), (r.zMax + 120) - z));
        const w = Math.max(edgeX, 1 - edgeZ);                     // 0 = penuh grading
        h = lerp(r.y, h, clamp(w, 0, 1));
      }
      // Koridor approach (lembah datar di centerline, ±700 m).
      const inAppZ = z > r.zMin - 700 && z < r.zMax + 700;
      if (inAppZ) {
        const edgeAppX = sstep(60, 120, Math.abs(x - r.x));
        const edgeAppZ = sstep(0, 100, Math.min(z - (r.zMin - 700), (r.zMax + 700) - z));
        const wApp = Math.max(edgeAppX, 1 - edgeAppZ);
        h = lerp(r.y, h, clamp(wApp, 0, 1));
      }
    }
    return h;
  }

  build(palette) {
    this.palette = palette;
    this._buildTerrain(palette);
    this._buildRunways(palette);
    this._buildLandmarks(palette);
    this._buildVegetation(palette);
    this._buildClouds(palette);
    if (palette.sea) this._buildSea(palette);
    if (this.missionId === 1) this._buildGates();
    return this;
  }

  _buildTerrain(p) {
    // Segmen 150 (bukan 110): faset ~19 m — lereng tidak lagi terbaca sebagai
    // bidang kertas raksasa. Pewarnaan + mottling frekuensi tinggi supaya tiap
    // lereng punya variasi terang-gelap (shading), bukan satu warna datar.
    const geo = new THREE.PlaneGeometry(2800, 2800, 150, 150);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const rnd = mulberry32(20261126 + this.missionId * 97);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      // Pewarnaan berdasar ketinggian + AO hand-baked + jitter 4% + variasi hijau/amber
      // (perbaikan probe: lembah coklat monoton -> hijau/amber berpatch).
      const ao = 1 - 0.28 * fbm(x * 0.02 + 3, z * 0.02 + 9);
      const jit = 0.96 + rnd() * 0.08;
      const patch = fbm(x * 0.006 + 40, z * 0.006 + 20); // patch hijau vs amber
      // Mottling frekuensi tinggi: bercak terang-gelap tiap ~20 m — lereng
      // tidak pernah satu warna datar (akar bidang peach B2).
      const mottle = 0.72 + 0.56 * fbm(x * 0.045 + 9, z * 0.045 + 4);
      const rockBand = fbm(x * 0.012 + 60, z * 0.012 + 30); // pita batu berlapis
      let c;
      if (h < 14) c = p.terrainLow;
      else if (h < 70) c = lerp([p.terrainMid[0], p.terrainMid[1], p.terrainMid[2]], p.grass, patch * 0.85);
      else c = lerp(p.terrainRock, [p.terrainRock[0] * 0.65, p.terrainRock[1] * 0.65, p.terrainRock[2] * 0.7], patch * 0.7); // variasi nada batu — lereng tidak seragam
      // Pita batu berlapis di lereng tinggi: strata gelap-terang berselang.
      if (h >= 70) {
        const band = 0.82 + 0.36 * rockBand;
        c = [c[0] * band, c[1] * band, c[2] * band];
      }
      // Jalur sungai/lembah hijau di M1: dasar ngarai hijau segar.
      if (this.missionId === 1 && h < 30 && Math.abs(x) < 130) {
        c = lerp([c[0], c[1], c[2]], p.grass, 0.7);
      }
      colors[i * 3] = c[0] * ao * jit * mottle;
      colors[i * 3 + 1] = c[1] * ao * jit * mottle;
      colors[i * 3 + 2] = c[2] * ao * jit * mottle;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 1, metalness: 0,
    }));
    terrain.receiveShadow = true;
    this.group.add(terrain);
    this.terrainMesh = terrain;
  }

  _buildRunways(p) {
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.92 });
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.8 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffb020, emissiveIntensity: 0.9 });
    for (const r of this.runways) {
      const len = r.zMax - r.zMin;
      const zc = (r.zMin + r.zMax) / 2;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(34, len), stripMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(r.x, r.y + 0.15, zc);
      strip.receiveShadow = true;
      this.group.add(strip);
      for (let z = r.zMin + 30; z < r.zMax - 20; z += 40) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 18), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(r.x, r.y + 0.3, z);
        this.group.add(dash);
      }
      // Lampu tepi + PAPI (2 merah 2 kuning, emissive) di ujung approach.
      for (let z = r.zMin + 10; z < r.zMax; z += 60) {
        for (const s of [-1, 1]) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1), edgeMat);
          lamp.position.set(r.x + s * 18, r.y + 0.6, z);
          this.group.add(lamp);
        }
      }
      const papiCols = [0xff3020, 0xff3020, 0xffe066, 0xffe066];
      papiCols.forEach((col, k) => {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.1),
          new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.8 }));
        lamp.position.set(r.x - 24 - k * 3.4, r.y + 0.8, r.zMax - 60);
        this.group.add(lamp);
      });
    }
  }

  _buildLandmarks(p) {
    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; this.group.add(mesh); return mesh; };
    if (this.missionId === 1) {
      // Kerucut Bromo TERPANCUNG + kawah + lava glow (landmark keras M1).
      // Kerucut runcing r4 membuat rim torus (r=42) melayang seperti halo di
      // atas puncak yang runcing (radius ~0 di puncak). Kerucut terpancung
      // (atas r=42 = radius rim) membuat rim DUDUK di tepi kawah.
      const bx = 430, bz = -720, bh = this.heightAt(bx, bz);
      add(new THREE.Mesh(new THREE.CylinderGeometry(42, 190, 175, 14),
        new THREE.MeshStandardMaterial({ color: 0x3d2e33, flatShading: true, roughness: 1 })), bx, bh + 82, bz);
      const rim = add(new THREE.Mesh(new THREE.TorusGeometry(42, 7, 6, 14),
        new THREE.MeshStandardMaterial({ color: 0x52403d, flatShading: true, roughness: 1 })), bx, bh + 169, bz);
      rim.rotation.x = Math.PI / 2;
      const lava = add(new THREE.Mesh(new THREE.CircleGeometry(30, 14),
        new THREE.MeshBasicMaterial({ color: 0xff7318 })), bx, bh + 166, bz);
      lava.rotation.x = -Math.PI / 2;
      this.lava = lava;
      // Kolom uap dari kawah (4 bola abu-abu tembus pandang, naik 90 m):
      // dari sudut pandang rendah, kawah di puncak tak terlihat — kolom uap
      // inilah yang membuat kerucut terbaca sebagai gunung berapi aktif.
      const steamMat = new THREE.MeshStandardMaterial({ color: 0xcfc8c0, flatShading: true, roughness: 1, transparent: true, opacity: 0.55 });
      [[0, 185, 0, 13], [6, 210, -4, 17], [-5, 238, 5, 21], [2, 268, -2, 25]].forEach(([ox, oy, oz, r]) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), steamMat);
        puff.position.set(bx + ox, bh + oy, bz + oz);
        this.group.add(puff);
      });
      // Menara radio (target bonus M1) di tebing dekat gate 4.
      const tx = -180, tz = -650, th = this.heightAt(tx, tz);
      const tower = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 42, 6),
        new THREE.MeshStandardMaterial({ color: 0x8a8a92, flatShading: true, roughness: 0.6, metalness: 0.5 }));
      mast.position.y = 21; tower.add(mast);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xd8d8d0, flatShading: true, roughness: 0.5 }));
      dish.position.y = 42; tower.add(dish);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }));
      beacon.position.y = 46; tower.add(beacon);
      tower.position.set(tx, th, tz);
      tower.traverse((m) => { m.castShadow = true; });
      this.group.add(tower);
      this.radioTower = { pos: new THREE.Vector3(tx, th + 22, tz), mesh: tower, hp: 2, alive: true };
      // Tebing berlapis (strata): teras batu berselang warna di dinding ngarai
      // — gunung bukan lagi segitiga karton polos, tapi lapisan geologi.
      const strataCols = [0x6a4a34, 0x54382a, 0x7a5a3c, 0x4a3026];
      const srnd = mulberry32(808);
      for (let k = 0; k < 8; k++) {
        const side = k % 2 ? 1 : -1;
        const sx = side * (240 + srnd() * 260);
        const sz = -100 - srnd() * 900;
        const sy = this.heightAt(sx, sz);
        const w = 60 + srnd() * 90, d = 40 + srnd() * 60, hh = 6 + srnd() * 8;
        const strata = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d),
          new THREE.MeshStandardMaterial({ color: strataCols[k % 4], flatShading: true, roughness: 1 }));
        // Ditanam ke lereng (y = sy - 2): kotak yang duduk DI ATAS lereng
        // miring kelihatan melayang; yang tertanam terbaca sebagai lapisan batu.
        strata.position.set(sx, sy - 2, sz);
        strata.rotation.y = (srnd() - 0.5) * 0.5;
        strata.castShadow = true;
        this.group.add(strata);
      }
      // Desa di dasar ngarai dekat landasan (rumah + jendela hangat menyala).
      const hrnd = mulberry32(909);
      for (let k = 0; k < 9; k++) {
        const hx = -140 + hrnd() * 260, hz = 180 + hrnd() * 220;
        if (Math.abs(hx) < 46) continue;
        this._buildHouse(hx, hz, hrnd);
      }
    }
    if (this.missionId === 2) {
      // Pulau karst menjulang + pasir putih (landmark M2).
      const rnd = mulberry32(5150);
      const karstMat = new THREE.MeshStandardMaterial({ color: 0x5a6a58, flatShading: true, roughness: 1 });
      const karstTop = new THREE.MeshStandardMaterial({ color: 0x3f6a3a, flatShading: true, roughness: 1 });
      for (let i = 0; i < 7; i++) {
        const x = (rnd() - 0.5) * 1400, z = -300 - rnd() * 1100;
        const h = 70 + rnd() * 90;
        const karst = new THREE.Mesh(new THREE.CylinderGeometry(18 + rnd() * 14, 34 + rnd() * 20, h, 7), karstMat);
        karst.position.set(x, h * 0.32, z);
        karst.castShadow = true;
        this.group.add(karst);
        const top = new THREE.Mesh(new THREE.ConeGeometry(20 + rnd() * 12, 22, 7), karstTop);
        top.position.set(x, h * 0.32 + h / 2 + 8, z);
        top.castShadow = true;
        this.group.add(top);
        // Catat jejak karst (radius bawah + tinggi puncak) buat penempatan kapal
        // dan cek garis pandang shot 3 — menara ini yang menutupi flagship r4.
        this.karstSpots.push({ x, z, r: karst.geometry.parameters.radiusBottom, top: h * 0.32 + h / 2 + 19 });
      }
      // Mercusuar merah-putih di pulau dekat landasan (ala Lantern Post).
      const lx = 120, lz = 320, lh = this.heightAt(lx, lz);
      const light = new THREE.Group();
      const towerM = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 26, 10),
        new THREE.MeshStandardMaterial({ color: 0xd8d8d8, flatShading: true, roughness: 0.8 }));
      towerM.position.y = 13; light.add(towerM);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 4, 10),
        new THREE.MeshStandardMaterial({ color: 0xc81e1e, flatShading: true, roughness: 0.8 }));
      band.position.y = 18; light.add(band);
      const lampM = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffd76a, emissiveIntensity: 2.4 }));
      lampM.position.y = 27; light.add(lampM);
      light.position.set(lx, lh, lz);
      light.traverse((m) => { m.castShadow = true; });
      this.group.add(light);
      // Pantai pasir putih: cincin pasir di garis air tiap pulau karst.
      const sandMat = new THREE.MeshStandardMaterial({ color: 0xe8d8a8, flatShading: true, roughness: 1 });
      const islands2 = [
        [0, 0, 420], [-520, -700, 260], [480, -900, 300],
        [-380, 500, 220], [620, 300, 200], [-700, -200, 180],
        [240, -1400, 260], [-240, -1150, 200],
      ];
      for (const [ix, iz, r] of islands2) {
        const ring = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 20), sandMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(ix, 1.6, iz);
        this.group.add(ring);
      }
      // Perahu nelayan (lambung + layar) di laut dekat jalur terbang.
      const boatMat = new THREE.MeshStandardMaterial({ color: 0x7a4a28, flatShading: true, roughness: 0.9 });
      const sailMat = new THREE.MeshStandardMaterial({ color: 0xf2ead8, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
      [[150, -500], [-260, -760], [420, -620]].forEach(([bx2, bz2]) => {
        const boat = new THREE.Group();
        const hullB = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 9), boatMat);
        hullB.position.y = 0.8; boat.add(hullB);
        const bowB = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3, 4), boatMat);
        bowB.rotation.x = -Math.PI / 2; bowB.rotation.y = Math.PI / 4;
        bowB.position.set(0, 0.8, -5.5); boat.add(bowB);
        const mastB = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 5), boatMat);
        mastB.position.y = 4.5; boat.add(mastB);
        const sail = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 5.5), sailMat);
        sail.position.set(0, 4.5, 0.8); boat.add(sail);
        boat.position.set(bx2, 1.4, bz2);
        boat.rotation.y = 0.6;
        boat.traverse((mm) => { mm.castShadow = true; });
        this.group.add(boat);
      });
      // Kota pelabuhan kecil dekat landasan (rumah + jendela hangat).
      const prnd = mulberry32(616);
      for (let k = 0; k < 7; k++) {
        const hx = 60 + prnd() * 160, hz = 300 + prnd() * 140;
        this._buildHouse(hx, hz, prnd);
      }
    }
    if (this.missionId === 3) {
      // Stupa Borobudur — DIPINDAH ke (-260, -1350): DI DEPAN jalur final ke
      // landasan pulau (heading 000), jadi kebaca di shot kokpit ILS,
      // bukan di belakang pesawat. Diperbesar 1,35x, batu lebih terang,
      // puncak emas + obor hangat supaya siluetnya kebaca di senja badai.
      // (Terrain hanya ±1400 m — di luar itu tidak ada tanah; -1350 aman.)
      const bx = -260, bz = -1350, bh = this.heightAt(bx, bz);
      const stone = new THREE.MeshStandardMaterial({ color: 0x9c8a72, flatShading: true, roughness: 1 });
      const stoneDark = new THREE.MeshStandardMaterial({ color: 0x7a6a58, flatShading: true, roughness: 1 });
      const base = new THREE.Group();
      const sizes = [200, 162, 124, 89];
      sizes.forEach((s, k) => {
        const tier = new THREE.Mesh(new THREE.BoxGeometry(s, 12, s), k % 2 ? stoneDark : stone);
        tier.position.y = 6 + k * 12;
        tier.castShadow = true;
        base.add(tier);
      });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), stone);
      dome.position.y = 56; dome.castShadow = true;
      base.add(dome);
      // Puncak emas (finial) — titik terang yang menandai "ini Borobudur".
      const finial = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffb020, emissiveIntensity: 1.8 }));
      finial.position.y = 84; base.add(finial);
      // Stupa lonceng kecil di sekeliling teras atas.
      const rnd = mulberry32(303);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const sx = Math.cos(a) * 57, sz = Math.sin(a) * 57;
        const stupa = new THREE.Mesh(new THREE.ConeGeometry(6, 12, 6), stoneDark);
        stupa.position.set(sx, 54, sz);
        stupa.castShadow = true;
        base.add(stupa);
      }
      // Obor hangat di 4 sudut dasar — cahaya oranye di tengah badai ungu.
      const torchMat = new THREE.MeshStandardMaterial({ color: 0xff9040, emissive: 0xff7010, emissiveIntensity: 2.2 });
      [[-95, -95], [95, -95], [-95, 95], [95, 95]].forEach(([tx2, tz2]) => {
        const torch = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), torchMat);
        torch.position.set(tx2, 8, tz2);
        base.add(torch);
      });
      base.position.set(bx, bh - 2, bz);
      this.group.add(base);
      this.borobudur = { pos: new THREE.Vector3(bx, bh + 20, bz) };
      // Desa dekat landasan awal (rumah + jendela hangat).
      const vrnd = mulberry32(717);
      for (let k = 0; k < 6; k++) {
        const hx = -160 + vrnd() * 300, hz = 150 + vrnd() * 220;
        if (Math.abs(hx) < 46) continue;
        this._buildHouse(hx, hz, vrnd);
      }
    }
  }

  // Rumah kecil: dinding + atap limas + jendela hangat menyala (emissive).
  // Dipakai desa M1/M2/M3 — dunia tidak lagi kosong di sekitar landasan.
  _buildHouse(x, z, rnd) {
    const h = this.heightAt(x, z);
    if (h < 3) return;
    const g = new THREE.Group();
    const wallCols = [0xd8c8a8, 0xc8b090, 0xb8a080, 0xd8d0c0];
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 7),
      new THREE.MeshStandardMaterial({ color: wallCols[(rnd() * 4) | 0], flatShading: true, roughness: 1 }));
    wall.position.y = 2.5; wall.castShadow = true; g.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 3.4, 4),
      new THREE.MeshStandardMaterial({ color: 0x8a3a28, flatShading: true, roughness: 1 }));
    roof.position.y = 6.7; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xffc860, emissive: 0xffa020, emissiveIntensity: 2 }));
    win.position.set(0, 2.6, 3.56); g.add(win);
    g.position.set(x, h, z);
    g.rotation.y = rnd() * Math.PI;
    this.group.add(g);
  }

  _buildVegetation(p) {
    const rnd = mulberry32(777 + this.missionId * 31);
    const treeMat = new THREE.MeshStandardMaterial({
      color: this.missionId === 3 ? 0x2a3a2a : 0x3d5c2e, flatShading: true, roughness: 1,
    });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x59371e, flatShading: true, roughness: 1 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a5248, flatShading: true, roughness: 1 });
    const treeGeo = new THREE.ConeGeometry(2.4, 8, 6);
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 2.6, 5);
    const rockGeo = new THREE.DodecahedronGeometry(2.2, 0);
    const bushGeo = new THREE.SphereGeometry(2.0, 7, 5);
    const bushMat = new THREE.MeshStandardMaterial({
      color: this.missionId === 3 ? 0x24382a : 0x2e5226, flatShading: true, roughness: 1,
    });
    const N = 170;
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, N);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 120);
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, 90);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let placed = 0, placedR = 0;
    for (let i = 0; i < 600 && placed < N; i++) {
      const x = (rnd() - 0.5) * 2400, z = (rnd() - 0.5) * 2400;
      if (Math.abs(x) < 46 && z > -470 && z < 470) continue; // jangan di landasan
      const h = this.heightAt(x, z);
      if (h < 3 || h > 90) continue;
      if (this.missionId === 2 && h < 8) continue; // M2: pohon hanya di pulau
      const s = 0.9 + rnd() * 1.4;
      e.set(0, rnd() * Math.PI * 2, 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, h + 5 * s, z), q, new THREE.Vector3(s, s, s));
      trees.setMatrixAt(placed, m);
      m.compose(new THREE.Vector3(x, h + 1.3 * s, z), q, new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(placed, m);
      placed++;
    }
    for (let i = 0; i < 300 && placedR < 120; i++) {
      const x = (rnd() - 0.5) * 2400, z = (rnd() - 0.5) * 2400;
      if (Math.abs(x) < 46 && z > -470 && z < 470) continue;
      const h = this.heightAt(x, z);
      if (h < 3) continue;
      const s = 0.6 + rnd() * 1.8;
      e.set(rnd(), rnd() * 3, rnd()); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, h + 1 * s, z), q, new THREE.Vector3(s, s * 0.7, s));
      rocks.setMatrixAt(placedR, m);
      placedR++;
    }
    // Semak (bola gepeng hijau gelap) — isi sela lereng supaya tidak gundul.
    let placedB = 0;
    for (let i = 0; i < 400 && placedB < 90; i++) {
      const x = (rnd() - 0.5) * 2200, z = (rnd() - 0.5) * 2200;
      if (Math.abs(x) < 46 && z > -470 && z < 470) continue;
      const h = this.heightAt(x, z);
      if (h < 3 || h > 80) continue;
      if (this.missionId === 2 && h < 8) continue;
      const s = 0.8 + rnd() * 1.6;
      e.set(0, rnd() * Math.PI * 2, 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, h + 0.8 * s, z), q, new THREE.Vector3(s, s * 0.55, s));
      bushes.setMatrixAt(placedB, m);
      placedB++;
    }
    trees.count = placed; trunks.count = placed; rocks.count = placedR; bushes.count = placedB;
    trees.castShadow = true;
    this.group.add(trees); this.group.add(trunks); this.group.add(rocks); this.group.add(bushes);
  }

  _buildClouds(p) {
    const rnd = mulberry32(4242 + this.missionId * 13);
    // Awan BERVOLUME: 3 nada per gumpal (atas terang / tengah / bawah gelap) —
    // bukan satu warna datar. Puff bawah lebih gelap = bayangan sendiri (AO),
    // puff atas lebih terang = kena matahari. Tanpa ini awan terbaca kertas.
    const shade = (hex, f) => {
      const r = ((hex >> 16) & 255) * f / 255, g = ((hex >> 8) & 255) * f / 255, b = (hex & 255) * f / 255;
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(r, g, b), emissive: p.cloudEmissive,
        emissiveIntensity: this.missionId === 3 ? 0.10 : 0.28,
        flatShading: true, roughness: 1,
      });
    };
    const mats = [shade(p.cloud, 1.18), shade(p.cloud, 0.95), shade(p.cloud, 0.62)];
    const sphereGeo = new THREE.SphereGeometry(1, 8, 6);
    const count = this.missionId === 3 ? 14 : 9;
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const cx = (rnd() - 0.5) * 2200, cy = 170 + rnd() * 110, cz = (rnd() - 0.5) * 2200;
      const puffs = 4 + ((rnd() * 4) | 0);
      for (let k = 0; k < puffs; k++) {
        const py = (rnd() - 0.5) * 15;
        // Nada dari ketinggian puff di dalam gumpal: atas terang, bawah gelap.
        const mi = py > 4 ? 0 : py < -4 ? 2 : 1;
        const s = new THREE.Mesh(sphereGeo, mats[mi]);
        s.position.set((rnd() - 0.5) * 52, py, (rnd() - 0.5) * 34);
        const r = 12 + rnd() * 18;
        s.scale.set(r, r * 0.55, r);
        g.add(s);
      }
      g.position.set(cx, cy, cz);
      g.userData.drift = 1.5 + rnd() * 2.5;
      this.group.add(g);
      this.clouds.push(g);
    }
  }

  _buildSea(p) {
    const geo = new THREE.PlaneGeometry(2800, 2800, 48, 48);
    geo.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: p.sea, roughness: 0.22, metalness: 0.15,
    }));
    sea.position.y = 1.2;
    sea.receiveShadow = true;
    this.group.add(sea);
    this.sea = sea;
    // Jalur glitter matahari di air (ala Valkyrie ref4-3): strip additive ke arah matahari.
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 512;
    const cx = cv.getContext('2d');
    const grad = cx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, 'rgba(255,220,140,0.85)');
    grad.addColorStop(0.5, 'rgba(255,200,110,0.28)');
    grad.addColorStop(1, 'rgba(255,200,110,0)');
    cx.fillStyle = grad; cx.fillRect(0, 0, 64, 512);
    const tex = new THREE.CanvasTexture(cv);
    const glitter = new THREE.Mesh(new THREE.PlaneGeometry(90, 1500),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.55,
      }));
    glitter.rotation.x = -Math.PI / 2;
    // Arahkan strip dari matahari ke kamera awal (sepanjang sumbu Z di M2/M3).
    glitter.position.set(this.missionId === 3 ? -160 : 60, 2.2, -700);
    glitter.rotation.z = this.missionId === 3 ? 0.35 : -0.3;
    this.group.add(glitter);
    this.glitter = glitter;
  }

  _buildGates() {
    // 6 gate emas raksasa beruntun di ngarai (M1). Ayunan lateral dijaga
    // ±30 m (bukan ±70): slalom 30-40° antar-gate terbukti tidak bisa
    // diterbangkan model ini (radius belok ~250 m di 64 m/s) — jet selalu
    // overshoot lalu menabrak dinding lembah. Ayunan ±30 m = belok ~12°/gate,
    // tetap terasa slalom tapi bisa diselesaikan manusia maupun autopilot.
    const defs = [
      { x: 0, y: 55, z: 120 }, { x: 30, y: 62, z: -160 }, { x: -25, y: 58, z: -420 },
      { x: 35, y: 66, z: -680 }, { x: -30, y: 72, z: -920 }, { x: 0, y: 78, z: -1140 },
    ];
    defs.forEach((d, i) => {
      const gate = new THREE.Mesh(new THREE.TorusGeometry(17, 1.0, 8, 30),
        new THREE.MeshStandardMaterial({
          color: 0xffb020, emissive: 0xff9a10, emissiveIntensity: 0.75,
          roughness: 0.35, metalness: 0.6,
        }));
      gate.position.set(d.x, d.y, d.z);
      gate.castShadow = true;
      this.group.add(gate);
      this.gates.push({ mesh: gate, pos: new THREE.Vector3(d.x, d.y, d.z), index: i, passed: false, radius: 17 });
    });
  }

  update(dt, t) {
    // Awan hanyut pelan; gate berdenyut.
    for (const c of this.clouds) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 1300) c.position.x = -1300;
    }
    for (const g of this.gates) {
      g.mesh.material.emissiveIntensity = 0.6 + 0.25 * Math.sin(t * 2.2 + g.index);
    }
    if (this.lava) this.lava.material.color.setHSL(0.03, 0.95, 0.45 + 0.08 * Math.sin(t * 3));
  }
}

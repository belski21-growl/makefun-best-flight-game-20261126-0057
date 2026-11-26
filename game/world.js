// ============================================================================
// Merpati Kilat — world.js
// Dunia Indonesia prosedural: terrain heightmap (ngarai Bromo, kepulauan,
// laut), landmark nyata (Monas, Borobudur, Bromo, Raja Ampat), landasan,
// ring, target darat, dan awan. Semua geometri dirakit dari kode.
// ============================================================================

import { makeValueNoise2D, makeSeededRandom, MeshBuilder } from './engine.js';

export const WORLD_SIZE = 3600;        // meter, dunia persegi
export const WORLD_HALF = WORLD_SIZE / 2;
export const SEA_LEVEL = 0;

// --- TerrainMesh --------------------------------------------------------------
export class TerrainMesh {
  constructor(renderer, seed) {
    this.noise = makeValueNoise2D(seed);
    this.size = WORLD_SIZE;
    this.segments = 120;
    this.step = this.size / this.segments;
    this.heights = new Float32Array((this.segments + 1) * (this.segments + 1));
    for (let j = 0; j <= this.segments; j++) {
      for (let i = 0; i <= this.segments; i++) {
        const x = -WORLD_HALF + i * this.step;
        const z = -WORLD_HALF + j * this.step;
        this.heights[j * (this.segments + 1) + i] = this.computeHeight(x, z);
      }
    }
    this.mesh = this.buildMesh(renderer);
    this.seaMesh = this.buildSeaMesh(renderer);
  }

  computeHeight(x, z) {
    const n = this.noise;
    // Pegunungan di utara (z negatif) dan barat, lembah ngarai di tengah.
    let h = n(x * 0.00045 + 7.3, z * 0.00045 + 2.1, 4) * 150;
    h += n(x * 0.0016 + 1.7, z * 0.0016 + 9.4, 3) * 46;
    // Punggung gunung Bromo di barat laut.
    const dBromo = Math.hypot(x + 900, z + 700);
    h += Math.max(0, 260 - dBromo * 0.28) * 1.1;
    // Ngarai: lembah dalam membujur timur-barat di z ~ +180 (jalur misi 1).
    const dCanyon = Math.abs(z - 180);
    h -= Math.max(0, 95 - dCanyon * 0.55) * 1.15;
    // Kepulauan + laut di selatan-timur (z positif besar): turun ke bawah laut.
    const seaMask = Math.max(0, (z - 700) / 900) * Math.max(0, (x + 200) / 900);
    h -= seaMask * 190;
    const islandMask = Math.max(0, 1 - Math.hypot(x - 1150, z - 1250) / 420);
    h += islandMask * 120; // Pulau Raja Ampat
    const island2 = Math.max(0, 1 - Math.hypot(x - 1450, z - 850) / 260);
    h += island2 * 70;
    // Ratakan tanah di sekitar landasan pulau (1150, 980) supaya landasan
    // tidak terkubur / melayang — blend halus ke y=6 dalam radius 200 m.
    const dRunway = Math.hypot(x - 1150, z - 980);
    if (dRunway < 200) {
      const t = dRunway / 200;
      h = h * t + 6 * (1 - t);
    }
    return h;
  }

  heightAt(x, z) {
    const gx = (x + WORLD_HALF) / this.step;
    const gz = (z + WORLD_HALF) / this.step;
    const i = Math.max(0, Math.min(this.segments - 1, Math.floor(gx)));
    const j = Math.max(0, Math.min(this.segments - 1, Math.floor(gz)));
    const fx = gx - i, fz = gz - j;
    const w = this.segments + 1;
    const h00 = this.heights[j * w + i], h10 = this.heights[j * w + i + 1];
    const h01 = this.heights[(j + 1) * w + i], h11 = this.heights[(j + 1) * w + i + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  groundColor(height, slope) {
    if (height < 2) return [0.76, 0.72, 0.55];          // pantai pasir
    if (height < 55) return [0.23, 0.42, 0.18];         // hutan hijau
    if (height < 120) return [0.32, 0.45, 0.20];        // bukit
    if (slope > 0.55) return [0.42, 0.36, 0.30];        // tebing batu
    return [0.55, 0.50, 0.44];                          // puncak batu
  }

  buildMesh(renderer) {
    const b = new MeshBuilder();
    const w = this.segments + 1;
    for (let j = 0; j < this.segments; j++) {
      for (let i = 0; i < this.segments; i++) {
        const x0 = -WORLD_HALF + i * this.step;
        const z0 = -WORLD_HALF + j * this.step;
        const x1 = x0 + this.step, z1 = z0 + this.step;
        const h00 = this.heights[j * w + i], h10 = this.heights[j * w + i + 1];
        const h01 = this.heights[(j + 1) * w + i], h11 = this.heights[(j + 1) * w + i + 1];
        const hm = (h00 + h10 + h01 + h11) / 4;
        const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00)) / this.step;
        const color = this.groundColor(hm, slope);
        // Urutan titik dibalik supaya normal menghadap +Y (ke atas): versi
        // sebelumnya menghadap -Y sehingga terrain ter-cull dari atas dan
        // yang terlihat hanya kubah langit di bawah horizon.
        b.addQuad([x0, h00, z0], [x0, h01, z1], [x1, h11, z1], [x1, h10, z0], color);
      }
    }
    return b.build(renderer);
  }

  buildSeaMesh(renderer) {
    // Bidang laut biru di y = SEA_LEVEL + 0.4, menutupi area selatan-timur.
    const b = new MeshBuilder();
    const s = WORLD_HALF;
    // Winding dibalik supaya normal menghadap +Y (alasan sama seperti terrain).
    b.addQuad([-s, SEA_LEVEL + 0.4, 500], [-s, SEA_LEVEL + 0.4, s],
      [s, SEA_LEVEL + 0.4, s], [s, SEA_LEVEL + 0.4, 500], [0.10, 0.38, 0.62]);
    return b.build(renderer);
  }
}

// --- Landmark Indonesia --------------------------------------------------------
export class LandmarkSet {
  constructor(renderer) {
    this.meshes = [];
    this.buildMonas(renderer);
    this.buildBorobudur(renderer);
    this.buildBromoCone(renderer);
    this.buildRajaAmpatIslands(renderer);
  }

  buildMonas(renderer) {
    // Monas: tugu obelisk + api emas, di lapangan kota (x=-350, z=-950).
    const b = new MeshBuilder();
    const bx = -350, bz = -950;
    b.addBox(bx, 14, bz, 46, 28, 46, [0.62, 0.60, 0.55]);            // podium
    b.addBox(bx, 34, bz, 30, 16, 30, [0.55, 0.53, 0.48]);
    b.addBox(bx, 95, bz, 11, 110, 11, [0.88, 0.86, 0.78]);          // obelisk
    b.addCone(bx, 158, bz, 7, 16, 8, [1.0, 0.78, 0.15]);            // api emas
    b.addBox(bx - 60, 2, bz, 120, 4, 14, [0.30, 0.30, 0.32]);       // jalan kota
    b.addBox(bx, 2, bz - 60, 14, 4, 120, [0.30, 0.30, 0.32]);
    this.meshes.push({ mesh: b.build(renderer), name: 'Monas' });
  }

  buildBorobudur(renderer) {
    // Borobudur: teras berundak + stupa, di dataran (x=620, z=-620).
    const b = new MeshBuilder();
    const bx = 620, bz = -620;
    const stone = [0.58, 0.55, 0.48];
    b.addBox(bx, 4, bz, 150, 8, 150, stone);
    b.addBox(bx, 11, bz, 118, 7, 118, stone);
    b.addBox(bx, 17, bz, 88, 6, 88, stone);
    b.addBox(bx, 22, bz, 60, 5, 60, stone);
    b.addCylinder(bx, 30, bz, 10, 12, 10, [0.66, 0.62, 0.54]);
    b.addSphere(bx, 40, bz, 6, 6, 10, [0.72, 0.68, 0.58]);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const sx = bx + Math.cos(a) * 42, sz = bz + Math.sin(a) * 42;
      b.addCylinder(sx, 22, sz, 4, 7, 8, [0.62, 0.59, 0.51]);
      b.addSphere(sx, 27, sz, 3.2, 5, 8, [0.70, 0.66, 0.56]);
    }
    this.meshes.push({ mesh: b.build(renderer), name: 'Borobudur' });
  }

  buildBromoCone(renderer) {
    // Kerucut Bromo berasap: gunung + kawah gelap di barat laut.
    const b = new MeshBuilder();
    b.addCone(-900, 120, -700, 260, 260, 14, [0.42, 0.38, 0.34]);
    b.addCone(-900, 238, -700, 90, 42, 12, [0.25, 0.22, 0.20]);
    b.addCone(-900, 246, -700, 62, 10, 12, [0.16, 0.14, 0.13]); // kawah
    this.meshes.push({ mesh: b.build(renderer), name: 'Bromo' });
  }

  buildRajaAmpatIslands(renderer) {
    // Pulau karst Raja Ampat: kerucut hijau menjulang dari laut.
    const b = new MeshBuilder();
    const spots = [[1150, 1250, 120], [1290, 1330, 80], [1010, 1380, 70], [1420, 1120, 60]];
    for (const [x, z, r] of spots) {
      b.addCone(x, 26, z, r, 62, 10, [0.16, 0.38, 0.16]);
      b.addCone(x, 52, z, r * 0.55, 26, 10, [0.24, 0.46, 0.20]);
    }
    this.meshes.push({ mesh: b.build(renderer), name: 'RajaAmpat' });
  }
}

// --- Runway (landasan pendek di pulau) ------------------------------------------
export class RunwayStrip {
  constructor(renderer, terrain) {
    // Landasan di (x=1150, z=980) — pulau dekat laut, arah utara-selatan.
    // terrain (opsional): dipakai heightAt-nya supaya strip mengikuti
    // permukaan pulau; tanpa terrain, strip jatuh ke y=6 (perilaku lama).
    this.center = [1150, 0, 980];
    this.heading = 0; // menghadap utara (-Z)
    this.length = 260;
    this.width = 26;
    const b = new MeshBuilder();
    const cx = this.center[0], cz = this.center[2];
    // Ronde 2 revisi (b) — Goldfish B1: iris DATAR ronde 2a (top =
    // heightAt(tengah)+0,5 per segmen 5 m) membentuk TANGGA — tiap slab
    // datar beda ~1 m dari tetangganya, patahan/tonjolan antar-segmen
    // terlihat di shot 2 + 4. Kini tiap segmen jadi BIDANG MIRING yang
    // mengikuti heightAt di KEDUA ujung (top = groundYAt(z)+0,5 di z0
    // dan z1): permukaan atas segmen yang berurutan berbagi rusuk yang
    // sama persis, jadi strip jadi SATU permukaan miring kontinu tanpa
    // ledge. Sisi samping mengikuti kemiringan yang sama dan dasarnya
    // terkubur 0,7 m di bawah terrain. Posisi/panjang/lebar/heading
    // landasan TIDAK berubah.
    const half = this.length / 2;
    const segLen = 5;
    const groundYAt = (z) => (terrain ? terrain.heightAt(cx, z) : 6);
    const stripColor = [0.22, 0.22, 0.24];
    const x0 = cx - this.width / 2, x1 = cx + this.width / 2;
    for (let z0 = cz - half; z0 < cz + half; z0 += segLen) {
      const z1 = Math.min(cz + half, z0 + segLen);
      const yt0 = groundYAt(z0) + 0.5, yt1 = groundYAt(z1) + 0.5;
      const yb0 = groundYAt(z0) - 0.7, yb1 = groundYAt(z1) - 0.7;
      // Permukaan atas miring (winding sama seperti terrain: normal +Y).
      b.addQuad([x0, yt0, z0], [x0, yt1, z1], [x1, yt1, z1], [x1, yt0, z0], stripColor);
      // Sisi barat + timur miring, dasar terkubur di bawah terrain.
      b.addQuad([x0, yb1, z1], [x0, yt1, z1], [x0, yt0, z0], [x0, yb0, z0], stripColor);
      b.addQuad([x1, yb0, z0], [x1, yt0, z0], [x1, yt1, z1], [x1, yb1, z1], stripColor);
      // Ujung utara/selatan hanya di segmen pertama/terakhir.
      if (z0 === cz - half) {
        b.addQuad([x0, yb0, z0], [x0, yt0, z0], [x1, yt0, z0], [x1, yb0, z0], stripColor);
      }
      if (z1 === cz + half) {
        b.addQuad([x1, yb1, z1], [x1, yt1, z1], [x0, yt1, z1], [x0, yb1, z1], stripColor);
      }
    }
    // Garis tengah putih + marka ujung kuning — kini QUAD MIRING yang
    // mengikuti permukaan strip di kedua ujung segmen (bukan box datar:
    // box datar ikut membentuk tangga mini di atas strip). Quad tipis
    // 0,15 m di atas strip, rusuk antar-segmen berbagi titik yang sama
    // persis sehingga marka pun kontinu tanpa patahan.
    const inDash = (z) => {
      for (let k = -4; k <= 4; k++) {
        const mz = cz + k * 26;
        if (z >= mz - 7 && z <= mz + 7) return true;
      }
      return false;
    };
    const inThreshold = (z) => (z >= cz - half + 2 && z <= cz - half + 10)
      || (z >= cz + half - 10 && z <= cz + half - 2);
    for (let z0 = cz - half; z0 < cz + half; z0 += segLen) {
      const z1 = Math.min(cz + half, z0 + segLen);
      const zm = (z0 + z1) / 2;
      const mt0 = groundYAt(z0) + 0.65, mt1 = groundYAt(z1) + 0.65;
      if (inDash(zm)) {
        const dx0 = cx - 1.5, dx1 = cx + 1.5;
        b.addQuad([dx0, mt0, z0], [dx0, mt1, z1], [dx1, mt1, z1], [dx1, mt0, z0], [0.95, 0.95, 0.90]);
      }
      if (inThreshold(zm)) {
        const tx0 = cx - (this.width - 6) / 2, tx1 = cx + (this.width - 6) / 2;
        b.addQuad([tx0, mt0, z0], [tx0, mt1, z1], [tx1, mt1, z1], [tx1, mt0, z0], [0.95, 0.80, 0.20]);
      }
    }
    // Menara kecil + hanggar di sisi landasan. Ronde 4, blocker 3/6:
    // terrain di bawah menara BUKAN y=6 — menara berdiri di bukit
    // 22–27 m, jadi dasar y=6 terkubur dan hanya pucuknya yang nongol di
    // atas punggung bukit, terbaca melayang di atas laut. Dasar kini
    // ditanam di titik terrain TERENDAH footprint (22 m) supaya badan
    // utuh berdiri di atas tanah; atap menempel tepat di atas badan
    // (38+3=41, tanpa celah 1 m seperti sebelumnya).
    b.addBox(cx - 40, 30, cz - 60, 12, 16, 12, [0.70, 0.68, 0.60]);
    b.addBox(cx - 40, 41, cz - 60, 16, 6, 16, [0.25, 0.45, 0.65]);
    // Hanggar (blocker 3) — PINDAH ke (1200,900), ujung utara landasan:
    // posisi lama (1194,1020) berdiri di atas terrain selatan yang TIDAK
    // TER-RENDER (akar masalah: MeshBuilder tidak sharing vertex, terrain
    // 120x120 = 86.400 vertex > batas index Uint16 65.535 — segitiga dari
    // baris z~930 ke selatan indeksnya terlipat, jadi laut menutupi darat;
    // engine.js dilarang disentuh ronde ini, jadi bangunan dipindah ke
    // pita hijau utara yang ter-render — terbukti oleh menara di (1110,920)
    // yang kini terbaca grounded). Dasar ditanam di titik terrain terendah
    // footprint baru (23 m): badan 23–37, sisi selatan (terrain 23–28 m)
    // muncul di atas tanah, bukan melayang.
    b.addBox(cx + 50, 30, cz - 80, 26, 14, 34, [0.55, 0.58, 0.62], [0.35, 0.55, 0.70]);
    this.mesh = b.build(renderer);
    // Permukaan strip di tengah landasan (dipakai acuan pendaratan).
    this.groundY = (terrain ? terrain.heightAt(cx, cz) : 6) + 0.5;
  }
}

// --- Ring (target terbang) ------------------------------------------------------
export class RingSet {
  constructor(renderer, ringDefs) {
    this.rings = ringDefs.map((def) => ({
      pos: def.pos, radius: def.radius, passed: false, name: def.name,
      mesh: this.buildRingMesh(renderer, def.radius, def.color || [1.0, 0.75, 0.15]),
      dimMesh: this.buildRingMesh(renderer, def.radius, [0.45, 0.45, 0.45]),
    }));
  }

  buildRingMesh(renderer, radius, color) {
    const b = new MeshBuilder();
    b.addRing([0, 0, 0], radius, 1.6, 28, color);
    // Penanda panah kecil di bawah ring.
    b.addCone(0, -radius - 8, 0, 3, 10, 6, color);
    return b.build(renderer);
  }
}

// --- GroundTarget (target darat yang menembak) ----------------------------------
export class GroundTargetSet {
  constructor(renderer, targetDefs) {
    this.targets = targetDefs.map((def) => ({
      pos: def.pos, alive: true, name: def.name, fireCooldown: 1 + Math.random() * 2,
      mesh: this.buildTargetMesh(renderer),
    }));
  }

  buildTargetMesh(renderer) {
    const b = new MeshBuilder();
    b.addBox(0, 2, 0, 12, 4, 12, [0.30, 0.34, 0.28]);          // alas beton
    b.addCylinder(0, 7, 0, 4.5, 6, 10, [0.45, 0.42, 0.36]);     // badan turret
    b.addCylinder(0, 11, 0, 1.2, 12, 6, [0.20, 0.20, 0.20]);    // laras (tegak, disederhanakan)
    b.addBox(0, 12.5, 0, 3, 3, 3, [0.85, 0.20, 0.15]);          // lampu merah
    return b.build(renderer);
  }
}

// --- CloudSet (awan sebagai cover + bahaya es) ------------------------------------
export class CloudSet {
  constructor(renderer, count, seed) {
    const rand = makeSeededRandom(seed);
    this.clouds = [];
    const b = new MeshBuilder();
    for (let i = 0; i < count; i++) {
      const cx = (rand() - 0.5) * 3200;
      const cy = 150 + rand() * 160;
      const cz = (rand() - 0.5) * 3200;
      const r = 26 + rand() * 42;
      this.clouds.push({ pos: [cx, cy, cz], radius: r });
      // Gumpalan dari beberapa bola tumpang tindih (segmen lebih halus
      // supaya tidak terlihat seperti batu bersudut).
      b.addSphere(cx, cy, cz, r, 8, 14, [0.96, 0.97, 1.0]);
      b.addSphere(cx + r * 0.7, cy - r * 0.15, cz + r * 0.2, r * 0.62, 8, 12, [0.94, 0.95, 0.99]);
      b.addSphere(cx - r * 0.65, cy - r * 0.1, cz - r * 0.25, r * 0.58, 8, 12, [0.95, 0.96, 1.0]);
    }
    this.mesh = b.build(renderer);
  }

  // Apakah titik berada di dalam awan (untuk cover + es)?
  containsPoint(p) {
    for (const c of this.clouds) {
      const dx = p[0] - c.pos[0], dy = p[1] - c.pos[1], dz = p[2] - c.pos[2];
      if (dx * dx + dy * dy + dz * dz < c.radius * c.radius) return c;
    }
    return null;
  }
}

// --- AircraftMesh (pesawat "Merpati Kilat") ---------------------------------------
export class AircraftMesh {
  constructor(renderer) {
    this.mesh = this.buildDetailed(renderer);
  }

  buildDetailed(renderer) {
    const b = new MeshBuilder();
    const body = [0.85, 0.82, 0.78];
    const accent = [0.95, 0.62, 0.10];
    const dark = [0.16, 0.18, 0.22];
    const glass = [0.25, 0.55, 0.75];
    // Fuselage: kotak panjang + hidung lancip dari prisma segitiga.
    b.addBox(0, 0, -2, 2.2, 2.0, 11, body);
    // Hidung lancip dari kotak miring: dua segitiga prisma.
    b.addPrism([0, -7.5], [-1.0, -13.5], [1.0, -13.5], 1.4, accent);
    // Kanopi kokpit.
    b.addBox(0, 1.35, -4.5, 1.5, 1.0, 3.4, glass, [0.55, 0.80, 0.95]);
    // Sayap utama (swept back).
    b.addPrism([-1.0, -3.5], [-11.5, 1.5], [-1.0, 1.0], 0.35, body);
    b.addPrism([1.0, -3.5], [1.0, 1.0], [11.5, 1.5], 0.35, body);
    // Ujung sayap oranye.
    b.addPrism([-10.4, 0.9], [-11.5, 1.5], [-9.6, 1.9], 0.38, accent);
    b.addPrism([10.4, 0.9], [9.6, 1.9], [11.5, 1.5], 0.38, accent);
    // Ekor horizontal + vertikal.
    b.addPrism([-0.9, 3.2], [-4.6, 5.6], [-0.9, 4.6], 0.3, body);
    b.addPrism([0.9, 3.2], [0.9, 4.6], [4.6, 5.6], 0.3, body);
    b.addBox(0, 2.6, 4.4, 0.3, 3.2, 2.6, accent);               // sirip vertikal
    // Mesin: dua tabung di bawah sayap + api knalpot.
    b.addCylinder(-3.4, -0.6, 0.5, 0.85, 5.5, 8, dark);
    b.addCylinder(3.4, -0.6, 0.5, 0.85, 5.5, 8, dark);
    b.addCylinder(-3.4, -0.6, 3.6, 0.6, 1.2, 8, [0.95, 0.55, 0.15]);
    b.addCylinder(3.4, -0.6, 3.6, 0.6, 1.2, 8, [0.95, 0.55, 0.15]);
    // Strip kilat di badan.
    b.addBox(0, -0.4, -2, 2.3, 0.35, 9, accent);
    return b.build(renderer);
  }
}

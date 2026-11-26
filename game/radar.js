// RadarMinimap — radar 2D heading-up (atas = arah hadapan pesawat).
// Dihitung nyata tiap frame dari posisi dunia relatif terhadap pesawat.
export class RadarMinimap {
  constructor() {
    this.range = 2000; // meter
    this.size = 150;
    this.scale = (this.size / 2 - 6) / this.range; // px per meter

    this.el = document.createElement('div');
    this.el.className = 'merpati-radar';
    this.el.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:110px', 'z-index:4',
      'pointer-events:none', 'text-align:center',
    ].join(';');

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.style.cssText = [
      'display:block', 'width:150px', 'height:150px', 'border-radius:50%',
      'background:rgba(5,18,30,.72)', 'border:1px solid rgba(255,215,94,.38)',
      'box-shadow:0 0 0 1px rgba(5,18,30,.4)',
    ].join(';');
    this.el.appendChild(this.canvas);

    const label = document.createElement('div');
    label.textContent = 'RADAR 2KM';
    label.style.cssText = [
      'margin-top:4px', 'font-size:11px', 'font-weight:700',
      'letter-spacing:.12em', 'color:#ffd75e',
      'text-shadow:0 1px 2px rgba(0,0,0,.8)',
    ].join(';');
    this.el.appendChild(label);
    document.body.appendChild(this.el);

    this.ctx = this.canvas.getContext('2d');
    this._cockpit = false;
  }

  // Relatif (timur, utara) -> koordinat radar (kanan, depan) heading-up.
  _rel(east, north, sinH, cosH) {
    return [east * cosH - north * sinH, east * sinH + north * cosH];
  }

  _plot(east, north, sinH, cosH) {
    const [r, f] = this._rel(east, north, sinH, cosH);
    const c = this.size / 2;
    return [c + r * this.scale, c - f * this.scale];
  }

  _inRange(x, y) {
    const c = this.size / 2;
    const dx = x - c, dy = y - c;
    return dx * dx + dy * dy <= (c - 4) * (c - 4);
  }

  update({ plane, rings, bonusRings, targets, runway }) {
    if (!plane || !this.ctx) return;
    const ctx = this.ctx;
    const c = this.size / 2;
    const cockpit = document.body.classList.contains('cockpit');
    if (cockpit !== this._cockpit) {
      this._cockpit = cockpit;
      this.el.style.bottom = cockpit ? '210px' : '110px';
      // Kokpit: geser ke kiri supaya tidak menabrak pita ketinggian (x 1204–1268).
      this.el.style.right = cockpit ? '92px' : '16px';
    }

    const heading = (plane.headingDegrees ? plane.headingDegrees() : 0) * Math.PI / 180;
    const sinH = Math.sin(heading), cosH = Math.cos(heading);
    const px = plane.position[0], pz = plane.position[2];

    ctx.clearRect(0, 0, this.size, this.size);

    // Lingkaran jarak 500/1000/1500/2000 m + salib tengah.
    ctx.strokeStyle = 'rgba(159,232,255,.28)';
    ctx.lineWidth = 1;
    for (const d of [500, 1000, 1500, 2000]) {
      ctx.beginPath();
      ctx.arc(c, c, d * this.scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(c, 4); ctx.lineTo(c, this.size - 4);
    ctx.moveTo(4, c); ctx.lineTo(this.size - 4, c);
    ctx.stroke();

    // Landasan: garis putih pendek arah utara-selatan dunia.
    if (runway && runway.center) {
      const [rx, ry] = this._plot(runway.center[0] - px, -(runway.center[2] - pz), sinH, cosH);
      if (this._inRange(rx, ry)) {
        // Arah utara di frame radar: (kanan, depan) = (-sinH, cosH).
        const ux = -sinH * 11, uy = -cosH * 11;
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx - ux, ry + uy);
        ctx.lineTo(rx + ux, ry - uy);
        ctx.stroke();
      }
    }

    const plotRing = (ring, isNext) => {
      const [x, y] = this._plot(ring.pos[0] - px, -(ring.pos[2] - pz), sinH, cosH);
      if (!this._inRange(x, y)) return;
      if (ring.passed) {
        ctx.fillStyle = 'rgba(160,170,180,.55)';
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      } else if (isNext) {
        ctx.strokeStyle = '#ffd75e';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = '#ffd75e';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    };

    // Ring berikut (terdekat yang belum dilewati) = lingkaran emas ganda.
    let nextRing = null;
    let nextDist = Infinity;
    const list = (rings && rings.rings) || [];
    for (const r of list) {
      if (r.passed) continue;
      const d = Math.hypot(r.pos[0] - px, r.pos[1] - plane.position[1], r.pos[2] - pz);
      if (d < nextDist) { nextDist = d; nextRing = r; }
    }
    for (const r of list) plotRing(r, r === nextRing);
    for (const r of (bonusRings && bonusRings.rings) || []) {
      if (r.passed) continue;
      const [x, y] = this._plot(r.pos[0] - px, -(r.pos[2] - pz), sinH, cosH);
      if (!this._inRange(x, y)) continue;
      // Bintang emas kecil.
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
        const a2 = a + Math.PI / 5;
        const ox = Math.cos(a) * 5, oy = Math.sin(a) * 5;
        const ix = Math.cos(a2) * 2.2, iy = Math.sin(a2) * 2.2;
        if (i === 0) ctx.moveTo(x + ox, y + oy); else ctx.lineTo(x + ox, y + oy);
        ctx.lineTo(x + ix, y + iy);
      }
      ctx.closePath(); ctx.fill();
    }

    // Target hidup = wajik merah.
    for (const t of (targets && targets.targets) || []) {
      if (!t.alive) continue;
      const [x, y] = this._plot(t.pos[0] - px, -(t.pos[2] - pz), sinH, cosH);
      if (!this._inRange(x, y)) continue;
      ctx.fillStyle = '#ff5a5a';
      ctx.beginPath();
      ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y);
      ctx.closePath(); ctx.fill();
    }

    // Segitiga pesawat di tengah, menunjuk ke atas.
    ctx.fillStyle = '#eaf6ff';
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c, c - 9); ctx.lineTo(c + 6, c + 7); ctx.lineTo(c, c + 3); ctx.lineTo(c - 6, c + 7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

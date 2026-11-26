// GateLabels — label DOM untuk 3 ring berikut yang belum dilewati.
// Proyeksi 3D -> layar dihitung manual (matriks 4x4 column-major, gaya WebGL).
// Pool 3 label, dibuat sekali, dipakai ulang.
export class GateLabels {
  constructor() {
    this.labels = [];
    for (let i = 0; i < 3; i++) {
      const el = document.createElement('div');
      el.style.cssText = [
        'position:fixed', 'left:0', 'top:0', 'display:none',
        'transform:translate(-50%,-50%)', 'z-index:4', 'pointer-events:none',
        'padding:2px 8px', 'border-radius:999px', 'font-size:12px',
        'font-weight:700', 'white-space:nowrap', 'color:#ffd75e',
        'background:rgba(5,18,30,.72)', 'border:1px solid rgba(255,215,94,.38)',
        'text-shadow:0 1px 2px rgba(0,0,0,.8)',
      ].join(';');
      document.body.appendChild(el);
      this.labels.push(el);
    }
  }

  // matriks column-major: out[i] = sum_j m[i + j*4] * v[j]
  _mulMat4Vec4(m, v) {
    const out = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      out[i] = m[i] * v[0] + m[i + 4] * v[1] + m[i + 8] * v[2] + m[i + 12] * v[3];
    }
    return out;
  }

  update({ view, projection, width, height, plane, rings }) {
    if (!view || !projection || !plane || !rings || !rings.rings) {
      for (const el of this.labels) el.style.display = 'none';
      return;
    }
    const px = plane.position[0], py = plane.position[1], pz = plane.position[2];

    // 3 ring berikut yang belum dilewati, terdekat dulu.
    const upcoming = rings.rings
      .map((r, i) => ({ ring: r, n: i + 1 }))
      .filter(({ ring }) => !ring.passed)
      .map(({ ring, n }) => ({
        ring, n,
        dist: Math.hypot(ring.pos[0] - px, ring.pos[1] - py, ring.pos[2] - pz),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);

    for (let i = 0; i < 3; i++) {
      const el = this.labels[i];
      const item = upcoming[i];
      if (!item) { el.style.display = 'none'; continue; }
      const p = item.ring.pos;
      const viewPos = this._mulMat4Vec4(view, [p[0], p[1], p[2], 1]);
      const clip = this._mulMat4Vec4(projection, viewPos);
      const w = clip[3];
      if (w <= 0) { el.style.display = 'none'; continue; }
      const ndcX = clip[0] / w;
      const ndcY = clip[1] / w;
      const sx = (ndcX + 1) / 2 * width;
      const sy = (1 - ndcY) / 2 * height;
      if (sx < 40 || sx > width - 40 || sy < 40 || sy > height - 40) {
        el.style.display = 'none';
        continue;
      }
      el.textContent = `RING ${item.n} · ${Math.round(item.dist)} m`;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.style.display = 'block';
    }
  }
}

// SpeedAltTapes — dua pita vertikal DOM: kecepatan (kiri) & ketinggian (kanan).
// Tick hanya digeser (transform), DOM tidak di-rebuild tiap frame.
export class SpeedAltTapes {
  constructor() {
    this._prevAlt = null;
    this._prevTime = null;
    this._vsi = 0;

    this.speed = this._makeTape({
      side: 'left',
      label: 'KECEPATAN',
      max: 360,
      tickStep: 20,
      scale: 0.5, // px per km/j -> 360 * 0.5 = 180px
      unit: 'km/j',
    });
    this.alt = this._makeTape({
      side: 'right',
      label: 'KETINGGIAN',
      max: 500,
      tickStep: 100,
      scale: 0.36, // px per m -> 500 * 0.36 = 180px
      unit: 'm',
    });

    // Sub-label: THR di bawah pita kiri, VSI di bawah pita kanan.
    this.thrEl = this._makeSub(this.speed.wrap, 'THR 0%');
    this.vsiEl = this._makeSub(this.alt.wrap, 'VSI +0 m/dtk');
  }

  _makeSub(wrap, text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = [
      'margin-bottom:4px', 'font-size:11px', 'font-weight:700', 'color:#9fe8ff',
      'text-align:center', 'text-shadow:0 1px 2px rgba(0,0,0,.8)',
      'white-space:nowrap',
    ].join(';');
    // Di ATAS label pita (bukan di bawah panel): sub-label di bawah panel
    // jatuh tepat di atas lingkaran radar dan menabrak tepinya.
    wrap.insertBefore(el, wrap.firstChild);
    return el;
  }

  _makeTape({ side, label, max, tickStep, scale, unit }) {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed', `${side}:12px`, 'top:50%', 'transform:translateY(-50%)',
      'z-index:4', 'pointer-events:none', 'width:64px', 'text-align:center',
      'font-family:inherit', 'color:#eaf6ff',
    ].join(';');

    const head = document.createElement('div');
    head.textContent = label;
    head.style.cssText = [
      'font-size:10px', 'font-weight:700', 'letter-spacing:.08em', 'color:#ffd75e',
      'margin-bottom:4px', 'text-shadow:0 1px 2px rgba(0,0,0,.8)',
    ].join(';');
    wrap.appendChild(head);

    // Panel kaca gelap + garis batik tepi atas (gaya HUD).
    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:relative', 'height:220px', 'overflow:hidden',
      'background:rgba(5,18,30,.72)', 'border:1px solid rgba(255,215,94,.38)',
      'border-radius:6px',
    ].join(';');
    const batik = document.createElement('div');
    batik.style.cssText = [
      'position:absolute', 'top:0', 'left:0', 'right:0', 'height:4px', 'z-index:2',
      'background:repeating-linear-gradient(90deg,#ffd75e 0 8px,#0e7c7b 8px 16px,#ff9d45 16px 24px)',
    ].join(';');
    panel.appendChild(batik);

    // Strip tick: digeser via transform; tiap tick di posisi -v*scale dari tengah.
    const strip = document.createElement('div');
    strip.style.cssText = [
      'position:absolute', 'left:0', 'top:50%', 'width:100%', 'height:0',
    ].join(';');
    for (let v = 0; v <= max; v += tickStep) {
      const tick = document.createElement('div');
      tick.style.cssText = [
        'position:absolute', `top:${-v * scale}px`, 'left:0', 'width:100%',
        'transform:translateY(-50%)', 'display:flex', 'align-items:center',
        'justify-content:center', 'gap:3px',
      ].join(';');
      const line = document.createElement('span');
      line.style.cssText = 'display:block;width:10px;height:1px;background:rgba(234,246,255,.7);';
      const num = document.createElement('span');
      num.textContent = String(v);
      num.style.cssText = 'font-size:10px;color:#eaf6ff;text-shadow:0 1px 2px rgba(0,0,0,.9);';
      tick.appendChild(line);
      tick.appendChild(num);
      strip.appendChild(tick);
    }
    panel.appendChild(strip);

    // Garis tengah + kotak nilai kini.
    const mid = document.createElement('div');
    mid.style.cssText = [
      'position:absolute', 'left:0', 'right:0', 'top:50%', 'height:1px',
      'background:rgba(255,215,94,.6)', 'transform:translateY(-.5px)',
    ].join(';');
    panel.appendChild(mid);

    const value = document.createElement('div');
    value.textContent = `0 ${unit}`;
    value.style.cssText = [
      'position:absolute', 'left:4px', 'right:4px', 'top:50%',
      'transform:translateY(-50%)', 'padding:3px 0', 'font-size:12px',
      'font-weight:700', 'color:#eaf6ff', 'background:rgba(5,18,30,.88)',
      'border:1px solid #ffd75e', 'border-radius:4px', 'z-index:3',
      'white-space:nowrap',
    ].join(';');
    panel.appendChild(value);

    wrap.appendChild(panel);
    document.body.appendChild(wrap);
    return { wrap, strip, value, max, scale, unit };
  }

  _updateTape(t, val) {
    const v = Math.max(0, Math.min(t.max, val));
    t.strip.style.transform = `translateY(${v * t.scale}px)`;
    t.value.textContent = `${Math.round(val)} ${t.unit}`;
  }

  update({ plane }) {
    if (!plane) return;
    const speed = plane.speedKmh ? plane.speedKmh() : 0;
    const alt = plane.altitudeMeters ? plane.altitudeMeters() : 0;

    const now = performance.now();
    if (this._prevAlt !== null && this._prevTime !== null) {
      const dt = (now - this._prevTime) / 1000;
      if (dt > 0.05 && dt < 2) {
        const raw = (alt - this._prevAlt) / dt;
        // Haluskan sedikit supaya angka tidak lompat-lompat.
        this._vsi = this._vsi * 0.6 + raw * 0.4;
      }
    }
    this._prevAlt = alt;
    this._prevTime = now;

    this._updateTape(this.speed, speed);
    this._updateTape(this.alt, alt);

    const thr = Math.round((plane.throttle || 0) * 100);
    this.thrEl.textContent = `THR ${thr}%`;
    const sign = this._vsi >= 0 ? '+' : '−';
    this.vsiEl.textContent = `VSI ${sign}${Math.abs(Math.round(this._vsi))} m/dtk`;
  }
}

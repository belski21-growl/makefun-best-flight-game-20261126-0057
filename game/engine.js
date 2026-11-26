// ============================================================================
// Merpati Kilat — engine.js
// WebGL 1.0 tulisan tangan (tanpa library 3D): matematika matriks, shader,
// kompilasi program, dan pembangun mesh prosedural (terrain, pesawat, ring,
// target, landasan, awan, partikel). Semua geometri dibuat dari kode.
// ============================================================================

// --- Deterministic RNG (mulberry32) ------------------------------------------
export function makeSeededRandom(seed) {
  let a = seed >>> 0;
  return function seededRandom() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Vec3 helpers -------------------------------------------------------------
export function vec3(x, y, z) { return [x, y, z]; }
export function vec3Add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function vec3Sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function vec3Scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function vec3Dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function vec3Cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function vec3Length(a) { return Math.sqrt(vec3Dot(a, a)); }
export function vec3Normalize(a) {
  const l = vec3Length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function vec3Lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// --- Mat4 (column-major, seperti WebGL) ---------------------------------------
export function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
export function mat4Multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[0 * 4 + r] * b[c * 4 + 0] + a[1 * 4 + r] * b[c * 4 + 1]
        + a[2 * 4 + r] * b[c * 4 + 2] + a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
export function mat4Perspective(fovYDeg, aspect, near, far) {
  const f = 1 / Math.tan((fovYDeg * Math.PI / 180) / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0];
}
export function mat4LookAt(eye, center, up) {
  const z = vec3Normalize(vec3Sub(eye, center));
  const x = vec3Normalize(vec3Cross(up, z));
  const y = vec3Cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -vec3Dot(x, eye), -vec3Dot(y, eye), -vec3Dot(z, eye), 1];
}
export function mat4Translation(x, y, z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}
export function mat4Scale(x, y, z) {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}
export function mat4RotationX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}
export function mat4RotationY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}
export function mat4RotationZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
// Yaw (Y) lalu pitch (X) lalu roll (Z) — urutan pesawat.
export function mat4YawPitchRoll(yaw, pitch, roll) {
  return mat4Multiply(mat4RotationY(yaw), mat4Multiply(mat4RotationX(pitch), mat4RotationZ(roll)));
}
export function mat4TransformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
export function mat4TransformDirection(m, d) {
  return [
    m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
    m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
    m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
  ];
}

// --- Value noise 2D (untuk heightmap prosedural) ------------------------------
export function makeValueNoise2D(seed) {
  const rand = makeSeededRandom(seed);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = base[i]; base[i] = base[j]; base[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const lattice = new Float32Array(256);
  for (let i = 0; i < 256; i++) lattice[i] = rand();
  function fade(t) { return t * t * (3 - 2 * t); }
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const h00 = lattice[perm[(perm[xi & 255] + yi) & 255]];
    const h10 = lattice[perm[(perm[(xi + 1) & 255] + yi) & 255]];
    const h01 = lattice[perm[(perm[xi & 255] + yi + 1) & 255]];
    const h11 = lattice[perm[(perm[(xi + 1) & 255] + yi + 1) & 255]];
    const u = fade(xf), v = fade(yf);
    return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
  }
  return function fbmNoise2(x, y, octaves) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2(x * freq, y * freq);
      norm += amp; amp *= 0.5; freq *= 2.03;
    }
    return sum / norm;
  };
}

// --- Shader sources -----------------------------------------------------------
const VERTEX_SHADER_SOURCE = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vWorldPos;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorldPos = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  gl_Position = uProjection * uView * world;
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vWorldPos;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uAmbientColor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uCameraPos;
uniform float uEmissive;
void main() {
  vec3 n = normalize(vNormal);
  vec3 sunDir = normalize(uSunDirection);
  float diff = max(dot(n, sunDir), 0.0);
  vec3 lit = vColor * (uAmbientColor + uSunColor * diff);
  lit += vColor * uEmissive;
  float dist = distance(uCameraPos, vWorldPos);
  float fogFactor = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  vec3 col = mix(lit, uFogColor, fogFactor);
  gl_FragColor = vec4(col, 1.0);
}
`;

const SKY_VERTEX_SHADER = `
attribute vec3 aPosition;
uniform mat4 uView;
uniform mat4 uProjection;
varying vec3 vDir;
void main() {
  vDir = aPosition;
  vec4 pos = uProjection * uView * vec4(aPosition, 1.0);
  gl_Position = pos.xyww;
}
`;

const SKY_FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vDir;
uniform vec3 uTopColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunSize;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.08, 1.0);
  vec3 col = mix(uHorizonColor, uTopColor, pow(max(h, 0.0), 0.62));
  float sunAmount = max(dot(d, normalize(uSunDirection)), 0.0);
  col += uSunColor * pow(sunAmount, 220.0) * 1.6;
  col += uSunColor * pow(sunAmount, 10.0) * uSunSize;
  if (d.y < 0.0) col = mix(col, uHorizonColor * 0.72, clamp(-d.y * 4.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

// --- WebGLRenderer ------------------------------------------------------------
export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL tidak tersedia di browser ini');
    this.gl = gl;
    this.program = this.compileProgram(VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    this.skyProgram = this.compileProgram(SKY_VERTEX_SHADER, SKY_FRAGMENT_SHADER);
    this.attrib = {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      color: gl.getAttribLocation(this.program, 'aColor'),
    };
    this.uniform = {
      model: gl.getUniformLocation(this.program, 'uModel'),
      view: gl.getUniformLocation(this.program, 'uView'),
      projection: gl.getUniformLocation(this.program, 'uProjection'),
      sunDirection: gl.getUniformLocation(this.program, 'uSunDirection'),
      sunColor: gl.getUniformLocation(this.program, 'uSunColor'),
      ambientColor: gl.getUniformLocation(this.program, 'uAmbientColor'),
      fogColor: gl.getUniformLocation(this.program, 'uFogColor'),
      fogNear: gl.getUniformLocation(this.program, 'uFogNear'),
      fogFar: gl.getUniformLocation(this.program, 'uFogFar'),
      cameraPos: gl.getUniformLocation(this.program, 'uCameraPos'),
      emissive: gl.getUniformLocation(this.program, 'uEmissive'),
    };
    this.skyUniform = {
      view: gl.getUniformLocation(this.skyProgram, 'uView'),
      projection: gl.getUniformLocation(this.skyProgram, 'uProjection'),
      topColor: gl.getUniformLocation(this.skyProgram, 'uTopColor'),
      horizonColor: gl.getUniformLocation(this.skyProgram, 'uHorizonColor'),
      sunDirection: gl.getUniformLocation(this.skyProgram, 'uSunDirection'),
      sunColor: gl.getUniformLocation(this.skyProgram, 'uSunColor'),
      sunSize: gl.getUniformLocation(this.skyProgram, 'uSunSize'),
    };
    this.skyMesh = this.createSkyDomeMesh();
    this.meshCache = new Map();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      throw new Error('Shader gagal dikompilasi: ' + log);
    }
    return shader;
  }

  compileProgram(vertexSource, fragmentSource) {
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, this.compileShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, this.compileShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Program gagal di-link: ' + gl.getProgramInfoLog(program));
    }
    return program;
  }

  createMesh(positions, normals, colors, indices) {
    const gl = this.gl;
    const mesh = {
      positionBuffer: gl.createBuffer(),
      normalBuffer: gl.createBuffer(),
      colorBuffer: gl.createBuffer(),
      indexBuffer: gl.createBuffer(),
      indexCount: indices.length,
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    return mesh;
  }

  // Hapus buffer mesh sementara (peluru/tracer/partikel yang dibangun per frame)
  // supaya GPU tidak bocor memori.
  deleteMesh(mesh) {
    const gl = this.gl;
    if (!mesh) return;
    for (const key of ['positionBuffer', 'normalBuffer', 'colorBuffer', 'indexBuffer']) {
      if (mesh[key]) gl.deleteBuffer(mesh[key]);
    }
  }

  createSkyDomeMesh() {
    // Kubus besar terbalik (inside-out) sebagai kubah langit.
    const s = 900;
    const positions = [];
    const indices = [];
    const corners = [
      [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
      [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s],
    ];
    const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
    for (const face of faces) {
      const base = positions.length / 3;
      for (const ci of face) positions.push(corners[ci][0], corners[ci][1], corners[ci][2]);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const gl = this.gl;
    const mesh = {
      positionBuffer: gl.createBuffer(),
      indexBuffer: gl.createBuffer(),
      indexCount: indices.length,
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    return mesh;
  }

  resize(width, height) {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  }

  beginFrame(clearColor) {
    const gl = this.gl;
    gl.clearColor(clearColor[0], clearColor[1], clearColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  drawSky(viewMatrix, projectionMatrix, sky) {
    const gl = this.gl;
    gl.useProgram(this.skyProgram);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    // Matikan atribut normal/warna program utama: buffer-nya bisa sudah
    // dihapus (mesh sementara peluru/tracer/partikel) — atribut yang menyala
    // tanpa buffer membuat drawElements gagal INVALID_OPERATION.
    gl.disableVertexAttribArray(this.attrib.normal);
    gl.disableVertexAttribArray(this.attrib.color);
    // Kubah langit digambar dengan depth = 1.0 (pos.xyww): pakai LEQUAL supaya
    // lolos depth test melawan clear depth 1.0; kembalikan ke LESS sesudahnya.
    gl.depthFunc(gl.LEQUAL);
    const viewNoTrans = viewMatrix.slice();
    viewNoTrans[12] = 0; viewNoTrans[13] = 0; viewNoTrans[14] = 0;
    gl.uniformMatrix4fv(this.skyUniform.view, false, new Float32Array(viewNoTrans));
    gl.uniformMatrix4fv(this.skyUniform.projection, false, new Float32Array(projectionMatrix));
    gl.uniform3fv(this.skyUniform.topColor, new Float32Array(sky.topColor));
    gl.uniform3fv(this.skyUniform.horizonColor, new Float32Array(sky.horizonColor));
    gl.uniform3fv(this.skyUniform.sunDirection, new Float32Array(sky.sunDirection));
    gl.uniform3fv(this.skyUniform.sunColor, new Float32Array(sky.sunColor));
    gl.uniform1f(this.skyUniform.sunSize, sky.sunGlow);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyMesh.positionBuffer);
    const loc = gl.getAttribLocation(this.skyProgram, 'aPosition');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.skyMesh.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.skyMesh.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
  }

  drawMesh(mesh, modelMatrix, viewMatrix, projectionMatrix, lighting) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniform.model, false, new Float32Array(modelMatrix));
    gl.uniformMatrix4fv(this.uniform.view, false, new Float32Array(viewMatrix));
    gl.uniformMatrix4fv(this.uniform.projection, false, new Float32Array(projectionMatrix));
    gl.uniform3fv(this.uniform.sunDirection, new Float32Array(lighting.sunDirection));
    gl.uniform3fv(this.uniform.sunColor, new Float32Array(lighting.sunColor));
    gl.uniform3fv(this.uniform.ambientColor, new Float32Array(lighting.ambientColor));
    gl.uniform3fv(this.uniform.fogColor, new Float32Array(lighting.fogColor));
    gl.uniform1f(this.uniform.fogNear, lighting.fogNear);
    gl.uniform1f(this.uniform.fogFar, lighting.fogFar);
    gl.uniform3fv(this.uniform.cameraPos, new Float32Array(lighting.cameraPos));
    gl.uniform1f(this.uniform.emissive, lighting.emissive || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
    gl.enableVertexAttribArray(this.attrib.position);
    gl.vertexAttribPointer(this.attrib.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
    gl.enableVertexAttribArray(this.attrib.normal);
    gl.vertexAttribPointer(this.attrib.normal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colorBuffer);
    gl.enableVertexAttribArray(this.attrib.color);
    gl.vertexAttribPointer(this.attrib.color, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
  }
}

// --- MeshBuilder: rakit segitiga dari kotak/prisma --------------------------------
export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.indices = [];
  }

  addTriangle(p1, p2, p3, color) {
    const base = this.positions.length / 3;
    const n = vec3Normalize(vec3Cross(vec3Sub(p2, p1), vec3Sub(p3, p1)));
    for (const p of [p1, p2, p3]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.colors.push(color[0], color[1], color[2]);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  addQuad(p1, p2, p3, p4, color) {
    this.addTriangle(p1, p2, p3, color);
    this.addTriangle(p1, p3, p4, color);
  }

  // Kotak axis-aligned, pusat cx,cy,cz, ukuran sx,sy,sz, warna per sisi opsional.
  addBox(cx, cy, cz, sx, sy, sz, color, topColor) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const top = topColor || color;
    // Urutan tiap quad dibalik supaya normal menghadap ke luar: versi lama
    // menaruh muka atas menghadap -Y dan muka depan/belakang tertukar
    // (kotak tetap terlihat padat karena muka lawannya yang tampil, tapi
    // pencahayaan dan posisi permukaan jadi salah).
    this.addQuad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], top);
    this.addQuad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], color);
    this.addQuad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], color);
    this.addQuad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], color);
    this.addQuad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], color);
    this.addQuad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], color);
  }

  // Prisma segitiga (sayap): alas segitiga di XZ, tebal Y.
  addPrism(p1, p2, p3, thickness, color) {
    const y0 = -thickness / 2, y1 = thickness / 2;
    const a = [p1[0], y1, p1[1]], b = [p2[0], y1, p2[1]], c = [p3[0], y1, p3[1]];
    const a2 = [p1[0], y0, p1[1]], b2 = [p2[0], y0, p2[1]], c2 = [p3[0], y0, p3[1]];
    this.addTriangle(a, b, c, color);
    this.addTriangle(c2, b2, a2, color);
    this.addQuad(a, a2, b2, b, color);
    this.addQuad(b, b2, c2, c, color);
    this.addQuad(c, c2, a2, a, color);
  }

  // Cincin datar (annulus) menghadap +Z, dipakai untuk ring target.
  addRing(center, radius, tube, segments, color) {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p0 = [center[0] + Math.cos(a0) * radius, center[1] + Math.sin(a0) * radius, center[2]];
      const p1 = [center[0] + Math.cos(a1) * radius, center[1] + Math.sin(a1) * radius, center[2]];
      const q0 = [center[0] + Math.cos(a0) * (radius - tube), center[1] + Math.sin(a0) * (radius - tube), center[2]];
      const q1 = [center[0] + Math.cos(a1) * (radius - tube), center[1] + Math.sin(a1) * (radius - tube), center[2]];
      this.addQuad(p0, p1, q1, q0, color);
    }
  }

  build(renderer) {
    return renderer.createMesh(this.positions, this.normals, this.colors, this.indices);
  }

  // Silinder tegak (sumbu Y) — dipakai untuk menara, tugu, dan turret darat.
  addCylinder(cx, cy, cz, radius, height, segments, color, topColor) {
    const y0 = cy - height / 2, y1 = cy + height / 2;
    const top = topColor || color;
    const topCenter = [cx, y1, cz];
    const bottomCenter = [cx, y0, cz];
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * radius, y0, cz + Math.sin(a0) * radius];
      const p1 = [cx + Math.cos(a1) * radius, y0, cz + Math.sin(a1) * radius];
      const p2 = [cx + Math.cos(a1) * radius, y1, cz + Math.sin(a1) * radius];
      const p3 = [cx + Math.cos(a0) * radius, y1, cz + Math.sin(a0) * radius];
      this.addQuad(p0, p1, p2, p3, color);
      this.addTriangle(bottomCenter, p1, p0, color);
      this.addTriangle(topCenter, p3, p2, top);
    }
  }

  // Kerucut tegak (sumbu Y) — atap candi, puncak gunung, hidung pesawat.
  addCone(cx, cy, cz, radius, height, segments, color) {
    const y0 = cy - height / 2, y1 = cy + height / 2;
    const tip = [cx, y1, cz];
    const baseCenter = [cx, y0, cz];
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * radius, y0, cz + Math.sin(a0) * radius];
      const p1 = [cx + Math.cos(a1) * radius, y0, cz + Math.sin(a1) * radius];
      this.addTriangle(p0, p1, tip, color);
      this.addTriangle(baseCenter, p1, p0, color);
    }
  }

  // Bola kasar dari lat/long grid — dipakai untuk awan, matahari, dan kubah candi.
  addSphere(cx, cy, cz, radius, latSegments, lonSegments, color) {
    for (let la = 0; la < latSegments; la++) {
      const t0 = la / latSegments, t1 = (la + 1) / latSegments;
      const phi0 = t0 * Math.PI, phi1 = t1 * Math.PI;
      for (let lo = 0; lo < lonSegments; lo++) {
        const a0 = (lo / lonSegments) * Math.PI * 2;
        const a1 = ((lo + 1) / lonSegments) * Math.PI * 2;
        const pt = (phi, a) => [
          cx + radius * Math.sin(phi) * Math.cos(a),
          cy + radius * Math.cos(phi),
          cz + radius * Math.sin(phi) * Math.sin(a),
        ];
        this.addQuad(pt(phi0, a0), pt(phi0, a1), pt(phi1, a1), pt(phi1, a0), color);
      }
    }
  }
}

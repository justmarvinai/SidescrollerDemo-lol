// Tiny pixel-art toolkit: indexed bitmaps, ASCII sprite parsing, outlines, noise, dither.
import { C, LUT, DARKER, hexToInt } from './palette.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  return c;
}
export function ctx2d(c) {
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return g;
}

// ---------- deterministic randomness ----------
export function rng(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
  f.range = (a, b) => a + f() * (b - a);
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}
export function hash(x, y = 0, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = smooth(x - i);
  return hash(i, 0, seed) * (1 - f) + hash(i + 1, 0, seed) * f;
}
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
export function fbm1(x, seed = 0, oct = 4) {
  let v = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { v += noise1(x, seed + o * 17) * amp; tot += amp; x *= 2; amp *= 0.5; }
  return v / tot;
}
export function fbm2(x, y, seed = 0, oct = 3) {
  let v = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { v += noise2(x, y, seed + o * 17) * amp; tot += amp; x *= 2; y *= 2; amp *= 0.5; }
  return v / tot;
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------- indexed bitmap ----------
export class Pix {
  constructor(w, h) {
    this.w = w | 0; this.h = h | 0;
    this.d = new Uint8Array(this.w * this.h);
  }
  static fromArt(art, legend) {
    const rows = (typeof art === 'string' ? art.split('\n') : art).map((s) => s.trim()).filter((s) => s.length);
    const h = rows.length, w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const p = new Pix(w, h);
    for (let y = 0; y < h; y++) {
      const r = rows[y];
      if (r.length !== w) console.warn('sprite row length mismatch', y, r.length, w, rows[0]);
      for (let x = 0; x < r.length; x++) {
        const ch = r[x];
        if (ch === '.' || ch === ' ') continue;
        const v = legend[ch];
        if (v === undefined) throw new Error(`sprite: unknown char "${ch}" in row ${y}: ${r}`);
        p.d[y * w + x] = v;
      }
    }
    return p;
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0; }
  set(x, y, v) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = v; }
  // set only where already opaque / only where empty
  setOn(x, y, v) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[y * this.w + x]) this.d[y * this.w + x] = v; }
  setOff(x, y, v) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h && !this.d[y * this.w + x]) this.d[y * this.w + x] = v; }
  rect(x, y, w, h, v) {
    x |= 0; y |= 0;
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) this.d[j * this.w + i] = v;
  }
  hline(x0, x1, y, v) { for (let x = x0; x <= x1; x++) this.set(x, y, v); }
  vline(x, y0, y1, v) { for (let y = y0; y <= y1; y++) this.set(x, y, v); }
  disc(cx, cy, r, v) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, v);
      }
  }
  ellipse(cx, cy, rx, ry, v) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, v);
      }
  }
  // brush line: w = thickness in px
  line(x0, y0, x1, y1, v, w = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.brush(x0, y0, v, w);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  brush(x, y, v, w) {
    if (w <= 1) this.set(x, y, v);
    else if (w === 2) { this.set(x, y, v); this.set(x + 1, y, v); this.set(x, y + 1, v); this.set(x + 1, y + 1, v); }
    else { const o = (w - 1) >> 1; this.rect(x - o, y - o, w, w, v); }
  }
  blit(src, dx, dy, opt) {
    dx |= 0; dy |= 0;
    const flip = opt && opt.flip, map = opt && opt.map;
    for (let y = 0; y < src.h; y++) {
      const ty = dy + y;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < src.w; x++) {
        let v = src.d[y * src.w + (flip ? src.w - 1 - x : x)];
        if (!v) continue;
        const tx = dx + x;
        if (tx < 0 || tx >= this.w) continue;
        if (map) v = map[v] !== undefined ? map[v] : v;
        this.d[ty * this.w + tx] = v;
      }
    }
    return this;
  }
  clone() { const p = new Pix(this.w, this.h); p.d.set(this.d); return p; }
  flipH() {
    const p = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) p.d[y * this.w + x] = this.d[y * this.w + this.w - 1 - x];
    return p;
  }
  transpose() {
    const p = new Pix(this.h, this.w);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) p.d[x * p.w + y] = this.d[y * this.w + x];
    return p;
  }
  flipV() {
    const p = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) p.d[y * this.w + x] = this.d[(this.h - 1 - y) * this.w + x];
    return p;
  }
  pad(n) { const p = new Pix(this.w + n * 2, this.h + n * 2); p.blit(this, n, n); return p; }
  // Scale2x (EPX): doubles the size while keeping diagonals smooth. Used before rotating sprites.
  scale2x() {
    const p = new Pix(this.w * 2, this.h * 2);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const e = this.d[y * this.w + x], b = this.get(x, y - 1), d = this.get(x - 1, y), f = this.get(x + 1, y), h = this.get(x, y + 1);
      const o = (y * 2) * p.w + x * 2;
      p.d[o] = d === b && b !== f && d !== h ? d : e;
      p.d[o + 1] = b === f && b !== d && f !== h ? f : e;
      p.d[o + p.w] = d === h && d !== b && h !== f ? d : e;
      p.d[o + p.w + 1] = h === f && d !== h && b !== f ? f : e;
    }
    return p;
  }
  remap(map) {
    const p = this.clone();
    for (let i = 0; i < p.d.length; i++) { const v = p.d[i]; if (v && map[v] !== undefined) p.d[i] = map[v]; }
    return p;
  }
  // Outline every opaque pixel's 4-neighbourhood. mode 'ink' = solid colour,
  // 'sel' = selective outline (darker shade of the pixel it hugs, ink underneath).
  outline(col = C.ink, mode = 'ink', grow = true) {
    const src = grow ? this.pad(1) : this.clone();
    const out = src.clone();
    const { w, h } = src;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (src.d[y * w + x]) continue;
        const up = src.get(x, y - 1), dn = src.get(x, y + 1), lf = src.get(x - 1, y), rt = src.get(x + 1, y);
        if (!(up || dn || lf || rt)) continue;
        if (mode === 'ink') { out.d[y * w + x] = col; continue; }
        // selective: pixels above the sprite (dn opaque) get a tinted dark, others ink
        const n = dn || lf || rt || up;
        out.d[y * w + x] = up && !dn ? col : DARKER[n] || col;
      }
    return out;
  }
  // drop a 1px shadow of colour v under/right of opaque pixels (only on empty px)
  toCanvas(lut = LUT) {
    const c = makeCanvas(this.w, this.h), g = ctx2d(c);
    const img = g.createImageData(this.w, this.h);
    const u = new Uint32Array(img.data.buffer);
    for (let i = 0; i < this.d.length; i++) u[i] = this.d[i] ? lut[this.d[i]] : 0;
    g.putImageData(img, 0, 0);
    return c;
  }
}

// ---------- canvas helpers ----------
export function flipCanvas(src) {
  const c = makeCanvas(src.width, src.height), g = ctx2d(c);
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  return c;
}
// Solid-colour silhouette of a canvas (hit flashes, shadows, afterimages)
export function silhouette(src, color) {
  const c = makeCanvas(src.width, src.height), g = ctx2d(c);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}
export function lutWith(pairs) {
  const lut = new Uint32Array(LUT);
  for (const [idx, hex] of pairs) lut[idx] = hexToInt(hex);
  return lut;
}

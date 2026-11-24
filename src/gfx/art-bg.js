// Parallax backdrop: dithered skies, sun & moon, clouds, mountains and forest layers.
// Layers are painted once with abstract "slot" colours, then coloured per mood
// (golden hour -> dusk -> night) so the world can change time of day as you travel.
import { C, P, mix, makeLUT } from './palette.js';
import { Pix, makeCanvas, ctx2d, rng, hash, noise1, noise2, fbm1, bayer, lerp, clamp } from './pixel.js';
import { drawTree, drawPine, drawDeadTree, drawBush, leafClump } from './art-trees.js';

export const VIEW_W = 320, VIEW_H = 180;
export const MOOD_NAMES = ['gold', 'dusk', 'night'];

const S = (i) => C['s' + i];

export const MOODS = {
  gold: {
    sky: ['#31469a', '#4f68bd', '#8187d2', '#bb94cb', '#eba4a6', '#f9c38b', '#fde6a4'],
    haze: '#f4b79c',
    mtn: { lit: '#f6b98f', mid: '#b57ea8', sh: '#77609f', snow: '#fff3d6', snowSh: '#d0a6c8' },
    leaf: ['#17332f', '#1f5038', '#35773b', '#69a03a', '#b3d254', '#e6ee8a'],
    bark: ['#2a1a24', '#44282c', '#6b3f33', '#99643f'],
    cloud: { body: '#f6c7b4', light: '#fff1d2', shade: '#c592c0' },
    stone: ['#3a3552', '#5d5a78', '#8a8aa2', '#bdbcc8'],
    ambient: '#fff1e0', glow: 0.0, stars: 0,
  },
  dusk: {
    sky: ['#141540', '#2b216a', '#552a80', '#8c3586', '#c74c78', '#ef7c5c', '#f9b45b'],
    haze: '#a8477c',
    mtn: { lit: '#b9567f', mid: '#5e3678', sh: '#35275f', snow: '#f5a89b', snowSh: '#8d5290' },
    leaf: ['#0f1730', '#152a43', '#1c4852', '#2c7365', '#56a583', '#a5dba0'],
    bark: ['#150f24', '#261a33', '#40283f', '#693f4c'],
    cloud: { body: '#7a3f86', light: '#f58a6a', shade: '#40286e' },
    stone: ['#1f1b3c', '#373160', '#5a4f86', '#8d7bab'],
    ambient: '#b9a2d8', glow: 0.5, stars: 0.35,
  },
  night: {
    sky: ['#05071a', '#0a0f30', '#111b4a', '#192b63', '#23417a', '#2e5d8b', '#48889a'],
    haze: '#27477d',
    mtn: { lit: '#3d5f9b', mid: '#203367', sh: '#141d47', snow: '#abcfea', snowSh: '#4b6ba9' },
    leaf: ['#060c1f', '#0b1931', '#112e48', '#1b4e5e', '#37827e', '#7fc7a9'],
    bark: ['#070818', '#0f1128', '#1b1d3c', '#2f3358'],
    cloud: { body: '#1c2c5e', light: '#5f8ac9', shade: '#0e1638' },
    stone: ['#0c1030', '#1a2250', '#2e3c78', '#5468a8'],
    ambient: '#6d7fcb', glow: 1, stars: 1,
  },
};

// ---------- sky ----------
function makeSky(m) {
  const c = makeCanvas(VIEW_W, VIEW_H), g = ctx2d(c);
  const img = g.createImageData(VIEW_W, VIEW_H), u = new Uint32Array(img.data.buffer);
  const stops = m.sky, n = stops.length - 1;
  const cols = stops.map((h) => { const v = parseInt(h.slice(1), 16); return (255 << 24) | ((v & 255) << 16) | (((v >> 8) & 255) << 8) | (v >> 16); });
  const horizon = 138;
  for (let y = 0; y < VIEW_H; y++) {
    // ease so bands tighten toward the horizon
    const t = clamp(Math.pow(y / horizon, 1.25), 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(t));
    let f = t - i;
    f = clamp((f - 0.3) / 0.55, 0, 1);
    f = Math.round(f * 4) / 4;
    for (let x = 0; x < VIEW_W; x++) u[y * VIEW_W + x] = f > bayer(x, y) ? cols[i + 1] : cols[i];
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------- celestial bodies ----------
function makeSun() {
  const R = 20, size = 96, p = new Pix(size, size), cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < R - 5) p.set(x, y, C.y6);
      else if (d < R - 1.5) p.set(x, y, C.y5);
      else if (d < R) p.set(x, y, C.y4);
      else if (d < R + 3) p.set(x, y, S(0));
      else if (d < R + 9 && ((x + y) & 1)) p.set(x, y, S(1));
    }
  return p;
}
function makeMoon() {
  const R = 15, size = 80, p = new Pix(size, size), cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d < R) {
        // soft terminator on the lower right
        const sh = Math.hypot(dx + 5, dy + 5) > R + 1.5;
        p.set(x, y, sh ? C.u6 : d < R - 1.2 ? C.white : C.u7);
      } else if (d < R + 6 && (R + 6 - d) / 6 * 0.8 > bayer(x, y)) p.set(x, y, S(0));
      else if (d < R + 20 && (R + 20 - d) / 14 * 0.4 > bayer(x, y)) p.set(x, y, S(1));
    }
  // craters
  const cr = [[-6, -5, 3.4], [4, -8, 1.6], [-9, 5, 1.7], [3, 5, 2.6], [8, -1, 1.3], [-2, 10, 1.4], [-1, 0, 1.2]];
  for (const [ox, oy, r] of cr) {
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const d = Math.hypot(x, y);
      if (d > r) continue;
      const px = Math.round(cx + ox + x), py = Math.round(cy + oy + y);
      if (Math.hypot(px + 0.5 - cx, py + 0.5 - cy) >= R - 1) continue;
      p.set(px, py, d > r - 1 && x + y < 0 ? C.u5 : C.u6);
    }
  }
  return p;
}

// ---------- clouds ----------
function makeCloud(seed, w, h) {
  const r = rng(seed), p = new Pix(w + 8, h + 6);
  const base = h + 2;
  const puffs = [];
  const n = Math.max(4, Math.round(w / 7));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, env = Math.sin(t * Math.PI);
    const rad = Math.max(2.5, (h * 0.5) * (0.35 + env * 0.75) * r.range(0.7, 1.1));
    puffs.push({ x: 4 + t * w + r.range(-2, 2), y: base - rad * r.range(0.75, 1.05), r: rad });
  }
  puffs.sort((a, b) => b.r - a.r);
  for (const f of puffs) {
    for (let y = Math.floor(f.y - f.r); y <= base; y++)
      for (let x = Math.floor(f.x - f.r * 1.5); x <= Math.ceil(f.x + f.r * 1.5); x++) {
        const dx = (x - f.x) / 1.45, dy = y - f.y;
        const d = Math.hypot(dx, dy);
        if (d > f.r || y > base) continue;
        // S0 body, S1 light rim, S2 shade
        const l = (-dx * 0.35 - dy * 0.94) / f.r;
        let c = S(0);
        if (d > f.r - 1.6 && l > 0.25) c = S(1);
        else if (l < -0.35) c = S(2);
        p.set(x, y, c);
      }
  }
  // flat belly: underside in shade, feathered
  for (let x = 0; x < p.w; x++) {
    if (p.get(x, base)) { p.set(x, base, S(2)); if (hash(x >> 1, seed) < 0.5) p.set(x, base, 0); }
    if (p.get(x, base - 1) && hash(x, seed + 3) < 0.6) p.set(x, base - 1, S(2));
  }
  return p;
}

// ---------- mountains ----------
function ridged(x, seed, scale) {
  let v = 0, amp = 1, tot = 0, f = 1 / scale;
  for (let o = 0; o < 4; o++) {
    const n = noise1(x * f, seed + o * 31);
    v += (1 - Math.abs(2 * n - 1)) * amp; tot += amp; amp *= 0.5; f *= 2.13;
  }
  return v / tot;
}
function makeMountains(w, h, seed, o) {
  const p = new Pix(w, h);
  const topAt = (x) => o.base - o.amp * (0.7 * Math.pow(ridged(x, seed, o.scale), 1.4) + 0.3 * noise1(x / (o.scale * 2.5), seed + 99)) + (o.dip ? o.dip(x) : 0);
  for (let x = 0; x < w; x++) {
    const top = topAt(x);
    for (let y = Math.max(0, Math.ceil(top)); y < h; y++) {
      const d = y - top;
      const sx = x + d * 0.75;
      const slope = topAt(sx + 2.5) - topAt(sx - 2.5);
      const wob = (noise2(x * 0.11, y * 0.11, seed) - 0.5) * 1.6;
      let c;
      if (slope + wob > 0.9) c = S(2); else if (slope + wob < -0.5) c = S(0); else c = S(1);
      if (o.snow !== undefined) {
        const depth = (o.snow - top) * 0.6 + (hash(x >> 1, 7, seed) - 0.5) * 5 - Math.abs(slope) * 0.6;
        if (top < o.snow && d < depth) c = c === S(2) ? S(4) : S(3);
      }
      const hz = (y - (h - o.hazeH)) / o.hazeH;
      if (hz > 0 && Math.round(hz * 4) / 4 * 0.95 > bayer(x, y)) c = S(5);
      p.set(x, y, c);
    }
  }
  return p;
}

// ---------- distant tree-covered ridge (flat tones + rim light) ----------
function makeRidge(w, h, seed, o) {
  const p = new Pix(w, h), r = rng(seed);
  const ground = new Float32Array(w), top = new Float32Array(w);
  for (let x = 0; x < w; x++) { ground[x] = o.base - o.amp * fbm1(x / o.scale, seed, 3); top[x] = ground[x]; }
  let x = -4;
  while (x < w + 8) {
    const z = o.zone(x);
    const dens = z.dens;
    const th = r.range(z.h[0], z.h[1]);
    const gx = clamp(Math.round(x), 0, w - 1), gy = ground[gx];
    if (r() < dens) {
      if (r() < z.pine) {
        const hw = th * 0.28;
        for (let dx = -Math.ceil(hw); dx <= Math.ceil(hw); dx++) {
          const xx = Math.round(x) + dx; if (xx < 0 || xx >= w) continue;
          const yy = gy - th * (1 - Math.abs(dx) / (hw + 0.5)) + (Math.abs(dx) % 2 ? 1 : 0);
          top[xx] = Math.min(top[xx], yy);
        }
      } else {
        const rw = th * 0.42;
        for (let dx = -Math.ceil(rw); dx <= Math.ceil(rw); dx++) {
          const xx = Math.round(x) + dx; if (xx < 0 || xx >= w) continue;
          const u = dx / (rw + 0.5);
          const yy = gy - th * 0.45 - Math.sqrt(Math.max(0, 1 - u * u)) * th * 0.55 + (hash(xx, 3, seed) < 0.3 ? 1 : 0);
          top[xx] = Math.min(top[xx], yy);
        }
      }
    }
    x += r.range(z.gap[0], z.gap[1]);
  }
  if (o.extra) o.extra(p, ground, top);
  for (let xx = 0; xx < w; xx++) {
    const t = Math.round(top[xx]);
    for (let y = Math.max(0, t); y < h; y++) {
      let c = S(1);
      const tl = xx > 0 ? Math.round(top[xx - 1]) : t;
      // rim light on edges that face up-left
      if (y === t && tl >= t) c = S(0);
      else if (y < tl && y <= t + 3) c = S(0);
      else if (y - t > 6 && hash(xx >> 1, y >> 1, seed) < 0.12) c = S(2);
      const hz = (y - (h - o.hazeH)) / o.hazeH;
      if (hz > 0 && Math.round(hz * 4) / 4 * 0.9 > bayer(xx, y)) c = S(3);
      p.set(xx, y, c);
    }
  }
  return p;
}

// ---------- broken architecture silhouettes for the ruins ----------
function drawArch(p, x, baseY, w, hgt, st, seed, broken) {
  const r = rng(seed);
  const col = (cx, top, cw) => {
    for (let y = top; y <= baseY; y++)
      for (let dx = 0; dx < cw; dx++) {
        const u = dx / (cw - 1 || 1);
        let c = u < 0.25 ? st[2] : u < 0.7 ? st[1] : st[0];
        if ((y - top) % 9 === 8) c = st[0];
        if (hash(cx + dx, y >> 2, seed) < 0.07) c = st[0];
        p.set(cx + dx, y, c);
      }
    // capital & plinth
    p.rect(cx - 1, top, cw + 2, 2, st[2]); p.rect(cx - 1, top + 2, cw + 2, 1, st[0]);
    p.rect(cx - 1, baseY - 2, cw + 2, 3, st[1]); p.hline(cx - 1, cx + cw, baseY - 2, st[2]);
  };
  const cw = Math.max(4, Math.round(w * 0.18));
  const top = baseY - hgt;
  col(x, top + (broken === 1 ? Math.round(hgt * 0.45) : 0), cw);
  col(x + w - cw, top + (broken === 2 ? Math.round(hgt * 0.5) : 0), cw);
  if (!broken || broken === 3) {
    // semicircular arch spanning the columns
    const rad = (w - cw) / 2, acx = x + w / 2, acy = top;
    for (let a = 0; a <= Math.PI; a += 0.02) {
      if (broken === 3 && a > 1.0 && a < 1.9) continue;
      for (let k = 0; k < cw; k++) {
        const rr = rad + k - cw / 2 + 1;
        const px = Math.round(acx - Math.cos(a) * rr), py = Math.round(acy - Math.sin(a) * rr);
        p.set(px, py, k < 1 ? st[0] : k > cw - 3 ? st[2] : st[1]);
        if (Math.round(a * 14) % 4 === 0 && k < cw - 1) p.set(px, py, st[0]);
      }
    }
  }
  // moss & rubble
  for (let i = 0; i < 5; i++) p.rect(x + r.int(-6, w + 2), baseY - r.int(0, 2), r.int(2, 5), 3, st[r.int(0, 1)]);
}

// ---------- forest layers with real trees ----------
function makeForest(w, h, seed, o) {
  const p = new Pix(w, h), r = rng(seed);
  const leaf = o.leaf, bark = o.bark, st = o.stone;
  const groundAt = (x) => o.base - o.amp * fbm1(x / o.scale, seed + 5, 3);
  const items = [];
  let x = -30;
  while (x < w + 40) {
    const z = o.zone(x);
    if (r() < z.dens) items.push({ x, kind: r() < z.pine ? 'pine' : r() < (z.dead || 0) ? 'dead' : 'tree', z, s: r.int(1, 1e6), k: r() });
    else if (z.arch && r() < z.arch) items.push({ x, kind: 'arch', z, s: r.int(1, 1e6), k: r() });
    x += r.range(z.gap[0], z.gap[1]);
  }
  // back row first (smaller), then front row
  items.sort((a, b) => a.k - b.k);
  for (const it of items) {
    const gy = Math.round(groundAt(clamp(it.x, 0, w - 1))) + 2;
    const sc = o.size * (0.75 + it.k * 0.5);
    if (it.kind === 'pine') drawPine(p, Math.round(it.x), gy, { h: Math.round(lerp(it.z.h[0], it.z.h[1], it.k) * o.size * 1.25), w: Math.round(22 * sc), seed: it.s, leaf, bark });
    else if (it.kind === 'dead') drawDeadTree(p, Math.round(it.x), gy, { h: Math.round(lerp(it.z.h[0], it.z.h[1], it.k) * o.size), tw: Math.round(5 * sc), seed: it.s, bark: st });
    else if (it.kind === 'arch') drawArch(p, Math.round(it.x), gy, Math.round(34 * sc), Math.round(lerp(28, 60, it.k) * o.size), st, it.s, it.s % 4);
    else drawTree(p, Math.round(it.x), gy, { h: Math.round(lerp(it.z.h[0], it.z.h[1], it.k) * o.size), tw: Math.round(7 * sc), R: Math.round(lerp(it.z.r[0], it.z.r[1], it.k) * o.size), seed: it.s, leaf, bark });
  }
  // ground band with undergrowth
  for (let xx = 0; xx < w; xx++) {
    const gy = Math.round(groundAt(xx));
    for (let y = gy; y < h; y++) {
      const d = y - gy;
      let c = d < 1 ? leaf[3] : d < 3 ? leaf[2] : d < 9 ? leaf[1] : leaf[0];
      if (d < 2 && hash(xx, 2, seed) < 0.3) c = leaf[4];
      if (d >= 3 && d < 14 && hash(xx >> 1, y >> 1, seed + 2) < 0.14) c = leaf[d < 9 ? 2 : 1];
      p.set(xx, y, c);
    }
    // grass blades on the lip
    const bl = hash(xx, 9, seed);
    if (bl < 0.45) { p.set(xx, gy - 1, leaf[3]); if (bl < 0.18) p.set(xx, gy - 2, leaf[4]); }
  }
  // bushes hugging the ground
  let bx = r.range(0, 30);
  while (bx < w) {
    const z = o.zone(bx);
    if (r() < z.bush) drawBush(p, Math.round(bx), Math.round(groundAt(clamp(bx, 0, w - 1))) + 3, { R: r.range(5, 9) * o.size, seed: r.int(1, 1e6), leaf, clumps: r.int(3, 5), noClip: true });
    bx += r.range(18, 60);
  }
  return p;
}

// ---------- foreground silhouettes (drawn in front of everything, slightly out of the light) ----------
function makeForeground(w, h, seed, zone) {
  const p = new Pix(w, h), r = rng(seed);
  let x = 0;
  while (x < w) {
    const z = zone(x);
    if (r() < z.fg) {
      const kind = r();
      if (kind < 0.5) {
        // tall grass tuft
        const n = r.int(5, 9);
        for (let i = 0; i < n; i++) {
          const bx = x + r.range(-9, 9), bh = r.range(10, 26), lean = r.range(-0.5, 0.5);
          for (let t = 0; t < bh; t++) {
            const px = Math.round(bx + lean * t * t / bh), py = h - 1 - t;
            p.set(px, py, S(0)); if (t < bh * 0.6) p.set(px + 1, py, S(0));
            if (t > bh * 0.4 && lean < 0) p.setOff(px - 1, py, S(1));
          }
        }
      } else if (kind < 0.8) {
        // fern / leafy plant
        for (let i = 0; i < 5; i++) {
          const ang = lerp(0.5, 2.6, i / 4) + r.range(-0.2, 0.2), len = r.range(14, 24);
          for (let t = 0; t < len; t++) {
            const px = x + Math.cos(ang) * t, py = h - 1 - Math.sin(ang) * t * (1 - t / len * 0.45);
            const wd = Math.round(Math.sin((t / len) * Math.PI) * 3);
            for (let k = -wd; k <= wd; k++) if ((t + k) % 2 === 0 || Math.abs(k) < 2) p.set(Math.round(px), Math.round(py + k), k === -wd && wd > 1 ? S(1) : S(0));
          }
        }
      } else {
        // boulder with moss
        const rw = r.range(12, 22), rh = r.range(8, 14);
        for (let dy = 0; dy <= rh; dy++) for (let dx = -rw; dx <= rw; dx++) {
          const u = dx / rw, v = dy / rh;
          if (u * u + (1 - v) * (1 - v) > 1 + (noise1(dx * 0.3, seed) - 0.5) * 0.3) continue;
          p.set(Math.round(x + dx), h - 1 - (rh - dy), dy < 2 && u < 0.3 ? S(1) : S(0));
        }
      }
    }
    x += r.range(40, 120);
  }
  return p;
}

function hangingCanopy(w, h, seed, zone) {
  // leaves drooping from the top of the frame in the deep forest
  const p = new Pix(w, h), r = rng(seed);
  for (let x = 0; x < w; x++) {
    const z = zone(x);
    if (!z.canopy) continue;
    const depth = (fbm1(x / 37, seed, 3) - 0.3) * 34 * z.canopy;
    for (let y = 0; y < depth; y++) {
      const edge = depth - y;
      if (edge < 3 && hash(x >> 1, y >> 1, seed) < 0.4) continue;
      p.set(x, y, edge < 2.5 ? S(1) : S(0));
    }
  }
  let x = 0;
  while (x < w) {
    const z = zone(x);
    if (z.canopy && r() < 0.5) {
      const len = r.range(10, 34) * z.canopy, sway = r.range(-0.2, 0.2);
      for (let t = 0; t < len; t++) {
        const px = Math.round(x + Math.sin(t * 0.22) * 1.5 + sway * t);
        p.set(px, t, S(0));
        if (t % 4 === 1) { p.set(px - 1, t, S(0)); p.set(px - 2, t + 1, S(1)); }
        if (t % 4 === 3) { p.set(px + 1, t, S(0)); p.set(px + 2, t + 1, S(0)); }
      }
    }
    x += r.range(14, 40);
  }
  return p;
}

// ---------- assembly ----------
function lutFor(colors) {
  const o = {};
  colors.forEach((hex, i) => { o[S(i)] = hex; });
  return makeLUT(o);
}
function moodCanvases(pix, colorFn) {
  const out = {};
  for (const name of MOOD_NAMES) out[name] = pix.toCanvas(lutFor(colorFn(MOODS[name], name)));
  return out;
}

// levelW: world width in px. zoneOf(worldX) -> { village, forest, ruins } weights
export function buildBackdrop(levelW, zoneOf) {
  const bd = { layers: [], clouds: [], sky: {}, stars: [] };
  for (const n of MOOD_NAMES) bd.sky[n] = makeSky(MOODS[n]);

  bd.sun = moodCanvases(makeSun(), (m) => [mix(m.sky[5], '#fff3b0', 0.55), mix(m.sky[4], '#ffd9a0', 0.4)]);
  bd.moon = moodCanvases(makeMoon(), (m) => [mix(m.sky[2], '#9cc4ff', 0.45), mix(m.sky[1], '#6d9be0', 0.3)]);

  const r = rng(77);
  for (let i = 0; i < 9; i++) {
    const big = i < 4;
    const w = big ? r.int(60, 110) : r.int(24, 50), h = big ? r.int(10, 16) : r.int(5, 9);
    const pix = makeCloud(100 + i * 13, w, h);
    bd.clouds.push({
      can: moodCanvases(pix, (m) => [m.cloud.body, m.cloud.light, m.cloud.shade]),
      x: r.range(0, 420), y: big ? r.range(22, 70) : r.range(8, 96), speed: big ? r.range(0.02, 0.04) : r.range(0.05, 0.09),
      factor: big ? 0.03 : 0.015, w: pix.w,
    });
  }
  bd.clouds.sort((a, b) => a.speed - b.speed);
  for (let i = 0; i < 90; i++) bd.stars.push({ x: r.int(0, VIEW_W - 1), y: Math.floor(Math.pow(r(), 1.6) * 120), b: r(), tw: r.range(0.5, 3), ph: r.range(0, 6.28) });

  const layerW = (f) => Math.ceil((levelW - VIEW_W) * f) + VIEW_W;
  const H = 216; // taller than the view so layers can slide vertically
  const worldX = (f) => (lx) => (lx - VIEW_W / 2) / f + VIEW_W / 2;

  const add = (factor, pix, colorFn, extra = {}) => bd.layers.push({ factor, can: moodCanvases(pix, colorFn), w: pix.w, h: pix.h, ...extra });

  // 1. far snowy range
  add(0.045, makeMountains(layerW(0.045), H, 11, { base: 118, amp: 78, scale: 95, snow: 86, hazeH: 44 }),
    (m) => [mix(m.mtn.lit, m.haze, 0.35), mix(m.mtn.mid, m.haze, 0.4), mix(m.mtn.sh, m.haze, 0.42), m.mtn.snow, m.mtn.snowSh, mix(m.haze, m.sky[5], 0.5)]);
  // 2. nearer, darker range
  add(0.09, makeMountains(layerW(0.09), H, 23, { base: 142, amp: 62, scale: 70, hazeH: 34 }),
    (m) => [mix(m.mtn.mid, m.mtn.lit, 0.35), mix(m.mtn.sh, m.mtn.mid, 0.45), mix(m.mtn.sh, m.sky[0], 0.25), 0, 0, mix(m.haze, m.mtn.mid, 0.35)].map((c) => c || '#000000'));

  // 3. far wooded ridge
  const z3 = (f) => (lx) => {
    const z = zoneOf(worldX(f)(lx));
    return { dens: 0.35 + z.forest * 0.6 + z.ruins * 0.3, pine: 0.25 + z.forest * 0.5, h: [8 + z.forest * 6, 16 + z.forest * 14], gap: [5 - z.forest * 2, 13 - z.forest * 6] };
  };
  add(0.17, makeRidge(layerW(0.17), H, 31, { base: 150, amp: 26, scale: 120, hazeH: 30, zone: z3(0.17) }),
    (m) => [mix(m.leaf[3], m.haze, 0.5), mix(m.leaf[2], m.haze, 0.55), mix(m.leaf[1], m.haze, 0.5), mix(m.haze, m.leaf[2], 0.3)]);

  // 4 & 5. forests with real trees
  const zf = (f, near) => (lx) => {
    const z = zoneOf(worldX(f)(lx));
    return {
      dens: 0.3 + z.forest * 0.65 + z.ruins * 0.25,
      pine: z.village * 0.1 + z.forest * 0.35,
      dead: z.ruins * 0.9,
      arch: z.ruins * 0.55,
      bush: 0.5 + z.forest * 0.4,
      h: [22 + z.forest * 34, 46 + z.forest * 60],
      r: [13 + z.forest * 6, 20 + z.forest * 12],
      gap: near ? [26 - z.forest * 8, 70 - z.forest * 30] : [16 - z.forest * 6, 46 - z.forest * 22],
    };
  };
  const leafSlots = [S(0), S(1), S(2), S(3), S(4), S(5)], barkSlots = [S(6), S(7), S(8), S(9)], stoneSlots = [S(10), S(11), S(12), S(13)];
  const forestCols = (depth, dark) => (m) => [
    ...m.leaf.map((c) => mix(mix(c, m.leaf[0], dark), m.haze, depth)),
    ...m.bark.map((c) => mix(mix(c, m.bark[0], dark), m.haze, depth)),
    ...m.stone.map((c) => mix(mix(c, m.stone[0], dark), m.haze, depth)),
  ];
  add(0.3, makeForest(layerW(0.3), H, 41, { base: 152, amp: 12, scale: 90, size: 0.72, zone: zf(0.3, false), leaf: leafSlots, bark: barkSlots, stone: stoneSlots }), forestCols(0.36, 0.1));
  add(0.52, makeForest(layerW(0.52), H, 53, { base: 160, amp: 9, scale: 70, size: 1.05, zone: zf(0.52, true), leaf: leafSlots, bark: barkSlots, stone: stoneSlots }), forestCols(0.14, 0.3));

  // foreground: grasses and boulders at the bottom, drooping canopy at the top
  const zfg = (f) => (lx) => {
    const z = zoneOf(worldX(f)(lx));
    return { fg: 0.45 + z.forest * 0.4, canopy: z.forest };
  };
  const fgCols = (m) => [mix(m.leaf[0], '#000010', 0.45), mix(m.leaf[1], m.leaf[0], 0.3)];
  bd.fgBottom = { factor: 1.35, can: moodCanvases(makeForeground(layerW(1.35), 40, 61, zfg(1.35)), fgCols), h: 40 };
  bd.fgTop = { factor: 1.2, can: moodCanvases(hangingCanopy(layerW(1.2), 64, 67, zfg(1.2)), fgCols), h: 64 };
  return bd;
}

// weights: [{ name, a }] (1 or 2 entries, sum to 1)
function moodDraw(g, cans, weights, sx, sy, sw, sh, dx, dy) {
  const [a, b] = weights;
  g.drawImage(cans[a.name], sx, sy, sw, sh, dx, dy, sw, sh);
  if (b && b.a > 0.01) {
    g.globalAlpha = b.a;
    g.drawImage(cans[b.name], sx, sy, sw, sh, dx, dy, sw, sh);
    g.globalAlpha = 1;
  }
}

export function moodWeights(t) {
  // t: 0 = gold, 1 = dusk, 2 = night (fractional values blend neighbours)
  t = clamp(t, 0, 2);
  const i = Math.min(1, Math.floor(t));
  const f = t - i;
  return [{ name: MOOD_NAMES[i], a: 1 - f }, { name: MOOD_NAMES[i + 1], a: f }];
}

// Draws sky through the nearest forest. camX/camLift in world px, time in seconds.
export function drawBackdrop(g, bd, camX, camLift, moodT, time) {
  const wts = moodWeights(moodT);
  moodDraw(g, bd.sky, wts, 0, 0, VIEW_W, VIEW_H, 0, 0);

  // stars fade in with the night
  const starA = clamp(moodT - 0.55, 0, 1.2) / 1.2;
  if (starA > 0.02) {
    for (const s of bd.stars) {
      const tw = 0.55 + 0.45 * Math.sin(time * s.tw + s.ph);
      const a = starA * (0.35 + s.b * 0.65) * tw * (1 - s.y / 150);
      if (a < 0.08) continue;
      g.globalAlpha = Math.min(1, a);
      g.fillStyle = s.b > 0.8 ? '#fffbdd' : s.b > 0.45 ? '#d2f0fb' : '#8fcdf4';
      const x = (s.x - Math.floor(camX * 0.008) % VIEW_W + VIEW_W) % VIEW_W;
      g.fillRect(x, s.y, 1, 1);
      if (s.b > 0.9 && tw > 0.8) { g.globalAlpha = Math.min(1, a * 0.6); g.fillRect(x - 1, s.y, 3, 1); g.fillRect(x, s.y - 1, 1, 3); }
    }
    g.globalAlpha = 1;
  }

  // sun sinks, moon rises
  const sunY = 30 + moodT * 92, sunX = 44 - camX * 0.004;
  if (moodT < 1.5) {
    g.globalAlpha = clamp(1.5 - moodT, 0, 1);
    moodDraw(g, bd.sun, wts, 0, 0, 96, 96, Math.round(sunX - 48), Math.round(sunY - 48));
    g.globalAlpha = 1;
  }
  if (moodT > 0.9) {
    const k = clamp((moodT - 0.9) / 0.9, 0, 1);
    const moonX = 250 - camX * 0.006, moonY = 112 - k * 72;
    g.globalAlpha = clamp(k * 1.6, 0, 1);
    g.drawImage(bd.moon.night, Math.round(moonX - 40), Math.round(moonY - 40));
    g.globalAlpha = 1;
  }

  for (const c of bd.clouds) {
    const span = VIEW_W + c.w + 80;
    const x = ((c.x - camX * c.factor - time * c.speed * 6) % span + span) % span - c.w - 20;
    moodDraw(g, c.can, wts, 0, 0, c.can.gold.width, c.can.gold.height, Math.round(x), Math.round(c.y + camLift * 0.02));
  }

  // a few birds heading home while there is still daylight
  if (moodT < 1.3) {
    g.fillStyle = '#2a2647';
    g.globalAlpha = clamp(1.3 - moodT, 0, 1) * 0.85;
    for (let i = 0; i < 5; i++) {
      const bx = Math.round(((time * (9 + i * 2) + i * 97 - camX * 0.02) % 420 + 420) % 420 - 50);
      const by = Math.round(26 + i * 11 + Math.sin(time * 0.7 + i * 2) * 5);
      const up = Math.floor(time * 5 + i * 1.7) % 2;
      g.fillRect(bx, by + (up ? 0 : 1), 1, 1); g.fillRect(bx + 1, by + (up ? 1 : 0), 1, 1); g.fillRect(bx + 2, by + (up ? 0 : 1), 1, 1);
      if (i % 2 === 0) { g.fillRect(bx - 1, by + (up ? -1 : 1), 1, 1); g.fillRect(bx + 3, by + (up ? -1 : 1), 1, 1); }
    }
    g.globalAlpha = 1;
  }

  for (const L of bd.layers) {
    const sx = Math.round(clamp(camX * L.factor, 0, L.w - VIEW_W));
    const dy = Math.round(-36 + 36 * L.factor * 0 + camLift * L.factor);
    moodDraw(g, L.can, wts, sx, 0, VIEW_W, L.h, 0, dy);
  }
}

export function drawForeground(g, bd, camX, camLift, moodT) {
  const wts = moodWeights(moodT);
  const b = bd.fgBottom, t = bd.fgTop;
  let sx = Math.round(clamp(camX * b.factor, 0, b.can.gold.width - VIEW_W));
  moodDraw(g, b.can, wts, sx, 0, VIEW_W, b.h, 0, VIEW_H - b.h + 8 + Math.round(camLift * 1.2));
  sx = Math.round(clamp(camX * t.factor, 0, t.can.gold.width - VIEW_W));
  moodDraw(g, t.can, wts, sx, 0, VIEW_W, t.h, 0, -6 + Math.round(camLift * 0.6));
}

export function gallery(section) {
  const zoneOf = (x) => {
    const f = clamp((x - 700) / 500, 0, 1) * (1 - clamp((x - 2500) / 400, 0, 1));
    const ru = clamp((x - 2500) / 400, 0, 1);
    return { village: 1 - f - ru > 0 ? 1 - f - ru : 0, forest: f, ruins: ru };
  };
  const bd = buildBackdrop(3840, zoneOf);
  const q = new URLSearchParams(location.search);
  const shots = (q.get('cams') || '0:0,1500:1,3000:2').split(',').map((s) => s.split(':').map(Number));
  const items = shots.map(([cam, mood]) => ({
    label: `cam ${cam} mood ${mood}`, w: VIEW_W, h: VIEW_H,
    draw: (g) => {
      g.save(); g.beginPath(); g.rect(0, 0, VIEW_W, VIEW_H); g.clip();
      drawBackdrop(g, bd, cam, 0, mood, 1);
      drawForeground(g, bd, cam, 0, mood);
      g.restore();
    },
  }));
  section('backdrop', items);
}

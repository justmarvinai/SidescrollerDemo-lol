// Procedural foliage: leafy trees, pines, dead trees, bushes. All painters take a
// colour ramp (dark -> light) so the same shapes serve the playfield and the parallax.
import { C } from './palette.js';
import { Pix, rng, hash, noise1, noise2, lerp } from './pixel.js';

export const LEAF_GREEN = [C.g2, C.g3, C.g4, C.g5, C.g6, C.g7];
export const LEAF_TEAL = [C.t1, C.t2, C.t3, C.t4, C.t5, C.t6];
export const LEAF_AUTUMN = [C.r1, C.r2, C.r3, C.y2, C.y3, C.y4];
export const LEAF_GLOOM = [C.p1, C.p2, C.p3, C.p4, C.p5, C.p6];
export const BARK = [C.b1, C.b2, C.b3, C.b4];
export const BARK_PALE = [C.n2, C.n3, C.n4, C.n5];

// One clump of leaves, lit from the upper-left, with a scalloped edge.
export function leafClump(p, cx, cy, r, leaf, seed, flat = 1) {
  const x0 = Math.floor(cx - r - 2), x1 = Math.ceil(cx + r + 2);
  const y0 = Math.floor(cy - r * flat - 2), y1 = Math.ceil(cy + r * flat + 2);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = (y - cy) / flat;
      const ang = Math.atan2(dy, dx);
      const rr = r * (1 + 0.16 * (noise1(ang * 3.2 + cx * 0.37, seed) - 0.5) * 2);
      const d = Math.hypot(dx, dy);
      if (d > rr) continue;
      // scalloped rim: nibble little notches out of the edge
      if (d > rr - 1.2 && hash(x >> 1, y >> 1, seed) < 0.18) continue;
      let l = (-dx * 0.55 - dy * 0.83) / rr;
      l += (noise2(x * 0.8, y * 0.8, seed) - 0.5) * 0.55;
      let c;
      if (l < -0.5) c = leaf[0];
      else if (l < -0.05) c = leaf[1];
      else if (l < 0.42) c = leaf[2];
      else if (l < 0.8) c = leaf[3];
      else c = leaf[4];
      p.set(x, y, c);
    }
  // leaf flecks: tiny arcs of the next lighter tone to break up flat areas
  const rnd = rng(seed * 7 + Math.round(cx) * 13 + Math.round(cy));
  const n = Math.round(r * r * 0.07);
  for (let i = 0; i < n; i++) {
    const a = rnd.range(0, Math.PI * 2), d = Math.sqrt(rnd()) * r * 0.8;
    const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d * flat);
    const cur = p.get(x, y), k = leaf.indexOf(cur);
    if (k < 0 || k >= leaf.length - 2) continue;
    const up = leaf[k + 1];
    p.setOn(x, y, up); p.setOn(x + 1, y - 1, up);
    if (rnd.chance(0.5)) p.setOn(x + 2, y, up);
  }
}

function trunk(p, x, baseY, H, tw, bark, seed, lean, taper = 0.55) {
  const cxAt = (t) => x + lean * H * t + Math.sin(t * 3 + seed) * 1.3;
  for (let i = 0; i <= H; i++) {
    const t = i / H, y = baseY - i;
    let w = lerp(tw, tw * taper, Math.pow(t, 0.8));
    if (i < 6) w += (6 - i) * (6 - i) * 0.14 * (tw / 6);
    const cx = cxAt(t), x0 = Math.round(cx - w / 2), x1 = Math.round(cx + w / 2);
    for (let xx = x0; xx <= x1; xx++) {
      const u = (xx - x0) / Math.max(1, x1 - x0);
      let k = u < 0.2 ? 3 : u < 0.5 ? 2 : u < 0.85 ? 1 : 0;
      const col = xx - Math.round(cx);
      const streak = hash(col, Math.floor((y + hash(col, 1, seed) * 9) / 6), seed);
      if (streak < 0.3 && k > 0) k--;
      else if (streak > 0.93 && k < 3) k++;
      if (t > 0.72 && k > 0) k--;
      p.set(xx, y, bark[k]);
    }
  }
  return cxAt;
}

// o: { h, tw, R, seed, leaf, bark, lean, flat, clumps }
export function drawTree(p, x, baseY, o) {
  const r = rng(o.seed);
  const leaf = o.leaf || LEAF_GREEN, bark = o.bark || BARK;
  const H = o.h, R = o.R, lean = o.lean ?? r.range(-0.12, 0.12);
  const cxAt = trunk(p, x, baseY, H, o.tw, bark, o.seed, lean);
  const top = [cxAt(1), baseY - H - R * 0.25];
  // branches peeking under the canopy
  for (let i = 0; i < 3; i++) {
    const t = 0.72 + i * 0.09, side = i % 2 ? 1 : -1;
    const bx = cxAt(t), by = baseY - H * t;
    p.line(bx, by, bx + side * R * r.range(0.35, 0.6), by - R * r.range(0.2, 0.4), bark[side < 0 ? 2 : 1], o.tw > 7 ? 2 : 1);
  }
  const clumps = [];
  const n = o.clumps || Math.round(6 + R * 0.4);
  const flat = o.flat || 0.62;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.3, 0.3), d = 0.45 + r() * 0.5;
    clumps.push({ x: top[0] + Math.cos(a) * d * R * 0.8, y: top[1] + Math.sin(a) * d * R * flat, r: R * r.range(0.34, 0.5) });
  }
  clumps.push({ x: top[0] + R * 0.1, y: top[1] + R * 0.12, r: R * 0.6 });
  clumps.push({ x: top[0] - R * 0.2, y: top[1] - R * 0.15, r: R * 0.5 });
  clumps.sort((a, b) => (b.x * 0.6 + b.y) - (a.x * 0.6 + a.y));
  clumps.forEach((c, i) => leafClump(p, c.x, c.y, c.r, leaf, o.seed + i * 31, 0.86));
  return top;
}

export function drawBush(p, x, baseY, o) {
  const r = rng(o.seed);
  const leaf = o.leaf || LEAF_GREEN, R = o.R;
  const n = o.clumps || 4;
  const cl = [];
  for (let i = 0; i < n; i++) cl.push({ x: x + (i - (n - 1) / 2) * R * 0.7 + r.range(-1, 1), y: baseY - R * r.range(0.45, 0.85), r: R * r.range(0.6, 0.85) });
  cl.sort((a, b) => (b.x * 0.6 + b.y) - (a.x * 0.6 + a.y));
  cl.forEach((c, i) => leafClump(p, c.x, c.y, c.r, leaf, o.seed + i * 17, 0.8));
  // clip below ground
  if (!o.noClip) for (let y = baseY + 1; y < Math.min(p.h, baseY + R * 2); y++) for (let xx = Math.floor(x - R * n); xx < x + R * n; xx++) p.set(xx, y, 0);
}

// o: { h, w, seed, leaf, bark }
export function drawPine(p, x, baseY, o) {
  const leaf = o.leaf || LEAF_TEAL, bark = o.bark || BARK;
  const H = o.h, W = o.w;
  const trunkH = Math.max(3, Math.round(H * 0.16));
  for (let i = 0; i < trunkH + 4; i++) {
    const y = baseY - i, w = i < 2 ? 2 : 1;
    for (let dx = -w; dx <= w; dx++) p.set(x + dx, y, dx < 0 ? bark[2] : dx === 0 ? bark[1] : bark[0]);
  }
  const tiers = Math.max(3, Math.round(H / 8));
  const topY = baseY - H, span = H - trunkH;
  const step = span / tiers;
  for (let k = tiers - 1; k >= 0; k--) {
    const ty = Math.round(topY + k * step * 0.92);
    const th = Math.round(step + 5 + k * 0.6);
    const hwMax = lerp(3, W / 2, (k + 1) / tiers);
    // shadow cast on the tier below
    for (let pass = 0; pass < 2; pass++) {
      const oy = pass === 0 ? 2 : 0;
      for (let yy = 0; yy <= th; yy++) {
        const hw = hwMax * Math.pow(yy / th, 0.9);
        for (let dx = -Math.ceil(hw); dx <= Math.ceil(hw); dx++) {
          const ax = Math.abs(dx);
          if (ax > hw + 0.3) continue;
          // jagged hem
          const hem = th - ((ax + k * 2 + (o.seed & 3)) % 4 === 0 ? 2 : (ax + k) % 4 === 2 ? 1 : 0);
          if (yy > hem) continue;
          let c;
          if (pass === 0) c = leaf[0];
          else {
            const u = dx / (hw + 0.5);
            c = u < -0.45 ? leaf[3] : u < 0.15 ? leaf[2] : leaf[1];
            if (yy >= hem - 1 && u > -0.3) c = leaf[1];
            if (yy <= 1 && u < 0.2) c = leaf[3];
            if (u < -0.6 && (dx + yy) % 3 === 0) c = leaf[4];
          }
          p.set(x + dx, ty + yy + oy, c);
        }
      }
    }
  }
}

// bare, twisted tree for the ruins
export function drawDeadTree(p, x, baseY, o) {
  const r = rng(o.seed), bark = o.bark || BARK_PALE;
  const branch = (bx, by, ang, len, w, depth) => {
    const ex = bx + Math.cos(ang) * len, ey = by - Math.sin(ang) * len;
    p.line(bx, by, ex, ey, bark[depth > 1 ? 1 : 2], Math.max(1, Math.round(w)));
    if (w >= 2) p.line(bx - 1, by, ex - 1, ey, bark[3], 1);
    if (depth <= 0 || len < 4) return;
    const n = depth > 1 ? 2 : r.int(1, 2);
    for (let i = 0; i < n; i++) branch(ex, ey, ang + r.range(0.35, 0.9) * (i ? -1 : 1), len * r.range(0.55, 0.75), w * 0.6, depth - 1);
  };
  trunk(p, x, baseY, o.h * 0.45, o.tw, bark, o.seed, o.lean ?? 0.1, 0.7);
  branch(x + 0.1 * o.h * 0.45, baseY - o.h * 0.45, Math.PI / 2 + r.range(-0.3, 0.3), o.h * 0.35, o.tw * 0.55, 3);
}

export function treeSprite(o) {
  const R = o.R, W = Math.ceil(R * 2.6 + 24), Ht = Math.ceil(o.h + R * 1.6 + 8);
  const p = new Pix(W, Ht);
  drawTree(p, W >> 1, Ht - 1, o);
  return { pix: p, ox: W >> 1, oy: Ht - 1 };
}

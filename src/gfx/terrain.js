// Skins the collision grid into painted ground. Nothing here is a repeating tile:
// soil strata, pebbles, brickwork and grass are generated per pixel across the level.
import { C } from './palette.js';
import { Pix, hash, noise1, noise2, bayer, clamp, rng } from './pixel.js';
import { T, LW, LH, EARTH, STONE, WOOD } from '../game/level.js';

const SOIL = [C.b1, C.b2, C.b3, C.b4, C.b5];
const ROCK = [C.n1, C.n2, C.n3, C.n4, C.n5, C.n6];

function earth(x, y, d, dL, dR, dB, top) {
  const gd = 3 + ((hash(x >> 1, 11) * 3) | 0) + (hash(x, 13) < 0.1 ? 3 : 0);
  if (top && d < gd) {
    if (d === 0) return hash(x, 17) < 0.25 ? C.g7 : C.g6;
    if (d === 1) return hash(x, 19) < 0.35 ? C.g6 : C.g5;
    if (d >= gd - 1) return C.g3;
    return hash(x, y, 23) < 0.25 ? C.g5 : C.g4;
  }
  if (top && d === gd) return C.b1;
  if (top && (dL < 2 || dR < 2) && d < 8 + hash(x, 29) * 6) return dL < 2 ? (d % 3 ? C.g5 : C.g4) : (d % 3 ? C.g4 : C.g3);
  const band = d + (noise1(x / 11, 31) - 0.5) * 10;
  let k, tr = 0;
  if (band < 13) { k = 3; tr = (band - 8) / 5; }
  else if (band < 32) { k = 2; tr = (band - 25) / 7; }
  else if (band < 62) { k = 1; tr = (band - 52) / 10; }
  else k = 0;
  if (tr > 0 && tr > bayer(x, y)) k--;
  const n = noise2(x * 0.2, y * 0.32, 37);
  if (n > 0.7) k--; else if (n < 0.17) k++;
  if ((y + Math.round(Math.sin(x / 17) * 2)) % 11 === 0 && hash(x >> 2, y, 41) < 0.4) k--;
  if (dL === 0 || dR === 0 || dB === 0) k = 0;
  else if (dL === 1) k++;
  else if (dR === 1 || dB === 1) k--;
  return SOIL[clamp(k, 0, 4)];
}

function stone(x, y, d, dL, dR, dB, top) {
  const row = y >> 3, off = (row & 1) * 8;
  const bx = (x + off) >> 4, lx = (x + off) & 15, ly = y & 7;
  const hv = hash(bx, row, 51);
  let k;
  if (lx === 0 || ly === 0) k = 1;
  else {
    k = hv < 0.2 ? 2 : hv > 0.8 ? 4 : 3;
    if (ly === 1 || lx === 1) k++;
    if (ly === 7 || lx === 15) k--;
    if (hash(x, y, 53) < 0.02) k--;
    if (hv > 0.93 && (lx === ly + 3 || lx === ly + 4 && ly > 3)) k = 1;
    if (hv < 0.07) k = Math.min(k, 2);
  }
  if (d > 30) k--;
  if (d > 60) k--;
  if (dL === 0 || dR === 0 || dB === 0) k = 0;
  else if (dL === 1 && k > 1) k++;
  let c = ROCK[clamp(k, 0, 5)];
  if (top) {
    const md = noise1(x / 9, 57) > 0.4 ? 2 + ((hash(x >> 1, 59) * 3) | 0) : 0;
    if (d < md) c = d === 0 ? C.g5 : d >= md - 1 ? C.g2 : C.g4;
    else if (d === 0) c = C.n6;
    else if (d === 1 && md === 0) c = C.n5;
  }
  if (k > 0 && d > 3) {
    const m = noise2(x * 0.11, y * 0.13, 61);
    if (m > 0.8) c = m > 0.86 ? C.g3 : (x + y) & 1 ? C.g2 : c;
  }
  return c;
}

export function skinTerrain(level) {
  const W = LW * T, H = LH * T;
  const back = new Pix(W, H), front = new Pix(W, H);
  const tile = (tx, ty) => (tx < 0 || tx >= LW ? EARTH : ty < 0 || ty >= LH ? 0 : level.tiles[ty * LW + tx]);
  const sol = (tx, ty) => { const v = tile(tx, ty); return v === EARTH || v === STONE; };

  for (let x = 0; x < W; x++) {
    const tx = x >> 4;
    let runTop = -1, runEnd = -1;
    for (let y = 0; y < H; y++) {
      const ty = y >> 4, v = tile(tx, ty);
      if (!(v === EARTH || v === STONE)) { runTop = -1; continue; }
      if (runTop < 0) {
        runTop = y;
        runEnd = y; while (runEnd < H && sol(tx, runEnd >> 4)) runEnd += T - (runEnd & 15);
      }
      const d = y - runTop, top = runTop > 0;
      const dB = runEnd >= H ? 99 : runEnd - 1 - y;
      const dL = sol(tx - 1, ty) ? 99 : x & 15;
      const dR = sol(tx + 1, ty) ? 99 : 15 - (x & 15);
      back.d[y * W + x] = v === EARTH ? earth(x, y, d, dL, dR, dB, top) : stone(x, y, d, dL, dR, dB, top);
    }
  }

  // pebbles & buried stones in the soil
  const r = rng(909);
  for (let cy = 0; cy < H; cy += 9) for (let cx = 0; cx < W; cx += 13) {
    if (r() > 0.17) continue;
    const px = cx + r.int(0, 8), py = cy + r.int(0, 5), big = r.chance(0.3);
    const w = big ? r.int(4, 6) : r.int(2, 3), h = big ? 3 : 2;
    let ok = true;
    for (let j = -2; j < h + 2 && ok; j++) for (let i = -1; i < w + 1; i++) { const c = back.get(px + i, py + j); if (!(c === C.b2 || c === C.b3 || c === C.b4 || c === C.b1 || c === C.b5)) { ok = false; break; } }
    if (!ok) continue;
    const pale = r.chance(0.45);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (big && (i === 0 || i === w - 1) && (j === 0 || j === h - 1)) continue;
      back.set(px + i, py + j, j === 0 ? (pale ? C.n5 : C.b5) : j === h - 1 ? (pale ? C.n3 : C.b2) : pale ? C.n4 : C.b4);
    }
    back.set(px, py + h, C.b1); back.set(px + 1, py + h, C.b1);
  }

  // wooden walkways (one-way platforms)
  for (let ty = 0; ty < LH; ty++) for (let tx = 0; tx < LW; tx++) {
    if (tile(tx, ty) !== WOOD) continue;
    const x0 = tx * T, y0 = ty * T;
    const first = tile(tx - 1, ty) !== WOOD, last = tile(tx + 1, ty) !== WOOD;
    for (let i = 0; i < T; i++) {
      const seam = i % 8 === 7;
      const cols = [hash(x0 + i, 71) < 0.2 ? C.b7 : C.b6, C.b5, hash((x0 + i) >> 3, 73) < 0.4 ? C.b5 : C.b4, C.b3, C.b1];
      for (let j = 0; j < 5; j++) back.set(x0 + i, y0 + j, seam && j < 4 ? C.b2 : cols[j]);
      if (i % 8 === 3) back.set(x0 + i, y0 + 1, C.n3);
    }
    // ropes and struts at the ends
    if (first) { for (let j = 0; j < 9; j++) { back.set(x0, y0 + j - 2, C.b2); back.set(x0 + 1, y0 + j - 2, j < 2 ? C.b6 : C.b4); } for (let j = 5; j < 9; j++) back.set(x0 + 2 + (j - 5), y0 + 13 - j, C.b3); }
    if (last) { for (let j = 0; j < 9; j++) { back.set(x0 + 15, y0 + j - 2, C.b2); back.set(x0 + 14, y0 + j - 2, j < 2 ? C.b6 : C.b4); } for (let j = 5; j < 9; j++) back.set(x0 + 13 - (j - 5), y0 + 13 - j, C.b3); }
  }

  // grass blades that stand up in front of everyone's feet
  for (let x = 0; x < W; x++) {
    const tx = x >> 4;
    for (let ty = 1; ty < LH; ty++) {
      const v = tile(tx, ty);
      if (!(v === EARTH || v === STONE) || sol(tx, ty - 1)) continue;
      const y = ty * T;
      const hb = hash(x, 81);
      if (v === EARTH) {
        if (hb < 0.5) { front.set(x, y - 1, hb < 0.2 ? C.g6 : C.g5); }
        if (hb < 0.16) { front.set(x, y - 2, C.g6); if (hb < 0.06) front.set(x, y - 3, C.g7); }
      } else if (noise1(x / 9, 57) > 0.4 && hb < 0.3) {
        front.set(x, y - 1, C.g4); if (hb < 0.08) front.set(x, y - 2, C.g5);
      }
    }
  }
  return { back, front };
}

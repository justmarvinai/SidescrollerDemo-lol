// The beach itself: painted sand (dry and wet), dune grass, and the textures the
// animated sea is drawn from. The shoreline is a function, not a tile edge.
import { C, P, LUT, rgbOf } from '../../src/gfx/palette.js';
import { Pix, makeCanvas, ctx2d, rng, hash, noise1, noise2, bayer, clamp } from '../../src/gfx/pixel.js';
import { TUFTS, FLOWERS, PEBBLES, SEAWEED } from './art.js';

export const WORLD = { w: 512, h: 288 };
export const VIEW = { w: 320, h: 180 };

// northern edge of the walkable sand (dune grass begins above it)
export const duneEdge = (x) => 34 + (noise1(x * 0.022, 3) - 0.5) * 16 + Math.sin(x * 0.011) * 4;
// where the sea rests between waves
export const shoreBase = (x) => 228 - 13 * Math.sin((Math.PI * (x + 30)) / 590) + (noise1(x * 0.017, 5) - 0.5) * 15;

const SAND = [C.d1, C.d2, C.d3, C.d4, C.d5, C.d6];

function sandIndex(x, y, edge) {
  let k = 4;
  const n = noise2(x * 0.028, y * 0.045, 7);
  if (n > 0.64 || (n > 0.57 && bayer(x, y) > 0.5)) k = 3;
  // wind ripples: broken wavy lines with a lit lip underneath
  const ry = Math.floor(y + Math.sin(x * 0.055 + noise1(y * 0.06, 2) * 5) * 2.6);
  const seg = hash(x >> 3, Math.floor(ry / 9), 10);
  if (ry % 9 === 0 && seg < 0.5) k = 3;
  else if (ry % 9 === 1 && seg < 0.3) k = 5;
  const h = hash(x, y, 9);
  if (h < 0.035) k--; else if (h > 0.965) k++;
  // the foot of the dune sits in soft shade
  if (y - edge < 9 && (9 - (y - edge)) / 9 > bayer(x, y) * 1.3) k--;
  return clamp(k, 0, 5);
}

// Returns three world-sized canvases: dry ground, wet sand, and a dithered wet fringe.
export function paintBeach() {
  const { w, h } = WORLD;
  const dry = new Pix(w, h), wet = new Pix(w, h), fringe = new Pix(w, h);
  for (let x = 0; x < w; x++) {
    const edge = duneEdge(x);
    for (let y = 0; y < h; y++) {
      let c;
      if (y < edge) {
        // dune grass with sandy bald patches
        const depth = edge - y;
        const n = noise2(x * 0.06, y * 0.09, 14);
        let k = n > 0.62 ? 3 : n < 0.3 ? 5 : 4; // index into greens g1..g7
        if (hash(x, y >> 1, 15) < 0.16) k += hash(x, y, 16) < 0.5 ? 1 : -1;
        if (depth > 22) k--;
        c = [C.g1, C.g2, C.g3, C.g4, C.g5, C.g6, C.g7][clamp(k, 2, 6)];
        const bald = noise2(x * 0.05, y * 0.07, 17);
        if (bald > 0.7 && depth < 20) c = bald > 0.76 ? C.d5 : (x + y) & 1 ? C.d4 : c;
        if (depth < 3) c = depth < 1.2 ? C.g3 : hash(x, 1, 18) < 0.5 ? C.g4 : c;
      } else {
        const k = sandIndex(x, y, edge);
        c = SAND[k];
        // wet look: two steps darker with thin bright streaks where water sheets off
        let wk = Math.max(0, k - 2);
        let wc = SAND[wk];
        if (hash(x >> 2, y, 12) < 0.035) wc = C.d4;
        if (hash(x >> 1, y, 13) < 0.012) wc = C.d6;
        wet.d[y * w + x] = wc;
        if ((x + y) & 1) fringe.d[y * w + x] = SAND[Math.max(0, k - 1)];
      }
      dry.d[y * w + x] = c;
    }
  }
  // scatter: pebbles and shell crumbs on the sand, grass tufts and flowers along the dune
  const r = rng(2024);
  for (let i = 0; i < 150; i++) {
    const x = r.int(4, w - 8), y = r.int(40, h - 20);
    if (y < duneEdge(x) + 6) continue;
    if (i % 3 === 0) { const s = PEBBLES[r.int(0, PEBBLES.length - 1)]; dry.blit(s, x, y); wet.blit(s, x, y); }
    else { const c = r.pick([C.white, C.m5, C.d6, C.m4, C.n6]); dry.set(x, y, c); wet.set(x, y, c); if (r.chance(0.4)) { dry.set(x + 1, y, c); wet.set(x + 1, y, c); } }
  }
  // the wrack line: a broken ribbon of weed along the usual high-water mark
  for (let x = 6; x < w - 10; x += r.int(9, 30)) {
    const y = Math.round(shoreBase(x) - 20 + r.range(-5, 5));
    const s = SEAWEED[r.int(0, 1)];
    dry.blit(s, x, y); wet.blit(s, x, y);
  }
  for (let x = 2; x < w - 10; x += r.int(5, 14)) {
    const e = Math.round(duneEdge(x));
    if (r.chance(0.75)) { const s = TUFTS[r.int(0, 2)]; dry.blit(s, x, e - s.h + r.int(0, 5)); }
    if (r.chance(0.3)) { const s = FLOWERS[r.int(0, 2)]; dry.blit(s, x + r.int(0, 6), e - r.int(5, 18)); }
    if (r.chance(0.35)) { const s = TUFTS[r.int(0, 2)]; dry.blit(s, x + r.int(-3, 6), e + r.int(3, 14)); }
  }
  return { dry: dry.toCanvas(), wet: wet.toCanvas(), fringe: fringe.toCanvas() };
}

// Sea textures indexed by depth below the waterline, so wave lines hug the shore's shape.
export function makeSea() {
  const DW = 8, DH = 170;
  const depth = makeCanvas(DW, DH), g = ctx2d(depth), img = g.createImageData(DW, DH), d = img.data;
  const put = (x, y, hex, a) => { const [r, gg, b] = rgbOf(hex), i = (y * DW + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = Math.round(a * 255); };
  // [from depth, colour, alpha]
  const bands = [[0, P.a6, 0.5], [9, P.a5, 0.62], [20, P.a4, 0.8], [36, P.a3, 0.93], [70, P.a2, 1], [118, P.a1, 1]];
  for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
    let i = 0;
    while (i < bands.length - 1 && y >= bands[i + 1][0]) i++;
    // dither into the next band over its last few rows
    if (i < bands.length - 1) {
      const span = Math.min(8, (bands[i + 1][0] - bands[i][0]) * 0.6), f = (y - (bands[i + 1][0] - span)) / span;
      if (f > 0 && Math.round(f * 4) / 4 > bayer(x, y)) i++;
    }
    put(x, y, bands[i][1], bands[i][2]);
    // foam lip
    if (y === 0) put(x, y, P.white, 1);
    else if (y === 1 && bayer(x, y) < 0.8) put(x, y, P.white, 0.95);
    else if (y === 2 && bayer(x, y) < 0.42) put(x, y, P.white, 0.9);
    else if (y === 3 && bayer(x, y) < 0.14) put(x, y, P.a6, 0.9);
  }
  g.putImageData(img, 0, 0);

  // travelling crests: light dashes on a 128 x 32 tile, stacked so one strip covers any depth
  const CW = 128, CP = 32, crest = makeCanvas(CW, CP * 7), cg = ctx2d(crest);
  for (let rep = 0; rep < 7; rep++) for (let band = 0; band < 2; band++) for (let x = 0; x < CW; x++) {
    const y = Math.round(band * 16 + 5 + Math.sin((x / CW) * Math.PI * 2 * (band + 2) + band * 2) * 2.4) + rep * CP;
    const seg = hash(x >> 3, band, 31);
    if (seg < 0.34) continue;
    cg.fillStyle = seg > 0.8 ? P.white : P.a6;
    cg.globalAlpha = seg > 0.8 ? 0.75 : 0.5;
    cg.fillRect(x, y, 1, 1);
    if (seg > 0.62) { cg.globalAlpha = 0.28; cg.fillStyle = P.a6; cg.fillRect(x, y + 1, 1, 1); }
  }
  cg.globalAlpha = 1;
  return { depth, crest, DH, CP };
}

// Ground shadow of a sprite: its silhouette laid over toward the south-east (sun in the north-west).
// Draw the result at (x - ox, y + dy) where (x, y) is the sprite's foot.
export function castShadow(pix, oy, stretch = 0.62, drop = 0.26) {
  const y0 = 1;
  const w = pix.w + Math.ceil(oy * stretch) + 2, h = Math.ceil(oy * drop) + 4;
  const c = makeCanvas(w, h), g = ctx2d(c);
  g.fillStyle = '#2b2440';
  for (let y = 0; y < Math.min(pix.h, oy); y++) {
    const hgt = oy - y, sx = Math.round(hgt * stretch), sy = y0 + Math.round(hgt * drop);
    let run = -1;
    for (let x = 0; x <= pix.w; x++) {
      const on = x < pix.w && pix.d[y * pix.w + x];
      if (on && run < 0) run = x;
      else if (!on && run >= 0) { g.fillRect(run + sx, sy, x - run, 1); run = -1; }
    }
  }
  return { can: c, dy: -y0 };
}

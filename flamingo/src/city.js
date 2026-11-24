// Paints Port Coral: streets, nine themed blocks, a promenade and a strip of beach.
// Output: a ground canvas, a roof/overhang canvas drawn above the actors, a canvas of
// everything that glows, a collision grid, and the list of lights.
import { C, P, DARK1 } from '../../src/gfx/palette.js';
import { Pix, makeCanvas, ctx2d, rng, hash, noise2, bayer, clamp } from '../../src/gfx/pixel.js';
import { drawText, textWidth, SMALL, FONT } from '../../src/gfx/font.js';
import { PROPS, palmTop, parasol } from './sprites.js';

export const T = 16, MW = 58, MH = 43;
export const WORLD = { w: MW * T, h: MH * T };
export const VIEW = { w: 384, h: 216 };
export const ROAD_X = [3, 17, 31, 45].map((t) => t * T), ROAD_Y = [2, 14, 26, 38].map((t) => t * T), RW = 48;
export const blockRect = (i, j) => ({ x: (6 + 14 * i) * T, y: (5 + 12 * j) * T, w: 11 * T, h: 9 * T });
export const SEA_X = 53 * T, SAND_X = 50 * T, PROM_X = 48 * T;
export const CELL = 8, SW = WORLD.w / CELL, SH = WORLD.h / CELL;

const inBand = (v, list) => list.some((s) => v >= s && v < s + RW);
export const onRoadX = (x) => inBand(x, ROAD_X);
export const onRoadY = (y) => inBand(y, ROAD_Y);
export function isRoad(x, y) {
  if (x < ROAD_X[0] || x >= PROM_X || y < ROAD_Y[0] || y >= ROAD_Y[3] + RW) return false;
  return onRoadX(x) || onRoadY(y);
}

export function buildCity() {
  const W = WORLD.w, H = WORLD.h;
  const ground = new Pix(W, H), roofs = new Pix(W, H), em = new Pix(W, H);
  const solid = new Uint8Array(SW * SH);
  const lights = [], circles = [], signs = [], parked = [], spots = {};
  const r = rng(1986);

  const block = (x, y, w, h, v = 1) => { for (let cy = Math.floor(y / CELL); cy < Math.ceil((y + h) / CELL); cy++) for (let cx = Math.floor(x / CELL); cx < Math.ceil((x + w) / CELL); cx++) if (cx >= 0 && cy >= 0 && cx < SW && cy < SH) solid[cy * SW + cx] = v; };
  const light = (x, y, rad, color, glow = 0, o = {}) => lights.push({ x, y, r: rad, color, glow, ...o });
  const glowPx = (x, y, c) => { roofs.set(x, y, c); em.set(x, y, c); };
  const shade = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = ground.get(x + i, y + j); if (v && (i + j < w + h - 3 || bayer(x + i, y + j) > 0.5)) ground.set(x + i, y + j, DARK1[v]); } };

  // ---------------------------------------------------------------- ground
  const asphalt = (x, y, lot) => {
    let k = lot ? 3 : 2;
    const n = noise2(x * 0.045, y * 0.045, 4);
    if (n > 0.74) k--;
    const h = hash(x, y, 6);
    if (h < 0.03) k++; else if (h > 0.972) k--;
    return [C.ink, C.n1, C.n2, C.n3, C.n4][clamp(k, 1, 4)];
  };
  const paving = (x, y, a = C.n4, b = C.n3, c = C.n5) => ((x & 7) === 0 || (y & 7) === 0 ? b : hash(x >> 3, y >> 3, 8) < 0.16 ? c : hash(x, y, 9) < 0.03 ? b : a);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c;
    if (x >= SEA_X) c = C.u1;
    else if (x >= SAND_X) {
      const k = noise2(x * 0.05, y * 0.05, 11) > 0.6 ? 3 : 4, h = hash(x, y, 12);
      c = [C.d1, C.d2, C.d3, C.d4, C.d5, C.d6][h < 0.04 ? k - 1 : h > 0.96 ? k + 1 : k];
    } else if (x >= PROM_X) {
      // boardwalk planks
      const row = y % 6, v = hash(0, Math.floor(y / 6), 13);
      c = row === 5 ? C.b3 : row === 0 ? C.b6 : v < 0.4 ? C.b5 : C.b4;
      if (((hash(1, Math.floor(y / 6), 14) * 26) | 0) + PROM_X + 3 === x && row < 5) c = C.b3;
    } else if (isRoad(x, y)) c = asphalt(x, y, false);
    else if (x < 32) c = (x + Math.floor(Math.sin(y * 0.2) * 2)) % 9 === 0 ? C.u3 : hash(x >> 1, y >> 1, 15) < 0.1 ? C.u2 : C.u1;
    else if (y < 14 || y >= H - 14) c = hash(x >> 1, y >> 1, 16) < 0.3 ? C.g3 : hash(x, y, 17) < 0.2 ? C.g1 : C.g2;
    else c = paving(x, y);
    ground.d[y * W + x] = c;
  }
  block(0, 0, 32, H, 2); block(SEA_X + 10, 0, W, H, 2); block(0, 0, W, 12); block(0, H - 12, W, 12);
  // canal railing
  for (let y = 0; y < H; y++) { ground.set(32, y, C.n6); ground.set(33, y, y % 8 === 0 ? C.n6 : C.n2); ground.set(31, y, C.ink); }

  // kerbs with rounded corners, and a gutter line on the road side
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const b = blockRect(i, j);
    for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
      const dx = Math.min(x - b.x, b.x + b.w - 1 - x), dy = Math.min(y - b.y, b.y + b.h - 1 - y);
      let d = Math.min(dx, dy);
      if (dx < 6 && dy < 6) d = 6 - Math.hypot(6 - dx - 0.5, 6 - dy - 0.5);
      if (d < -1) { if (dx >= 0 && dy >= 0) ground.set(x, y, asphalt(x, y, false)); continue; }
      if (d < 0) ground.set(x, y, C.n1);
      else if (d < 1.2) ground.set(x, y, C.n6);
      else if (d < 2.2) ground.set(x, y, C.n5);
    }
  }
  for (let y = ROAD_Y[0] - 1; y <= ROAD_Y[3] + RW; y++) { ground.set(ROAD_X[0] - 1, y, C.n6); ground.set(PROM_X, y, C.n6); ground.set(PROM_X + 1, y, C.b2); }
  for (let x = ROAD_X[0] - 1; x <= PROM_X; x++) { ground.set(x, ROAD_Y[0] - 1, C.n6); ground.set(x, ROAD_Y[3] + RW, C.n6); }

  // lane markings, crossings and stop lines
  const inX = (x) => ROAD_X.find((s) => x >= s && x < s + RW), inY = (y) => ROAD_Y.find((s) => y >= s && y < s + RW);
  for (const x0 of ROAD_X) for (let y = ROAD_Y[0]; y < ROAD_Y[3] + RW; y++) {
    const cy = inY(y);
    if (cy !== undefined) continue;
    const near = Math.min(...ROAD_Y.map((s) => Math.min(Math.abs(y - s), Math.abs(y - (s + RW - 1)))));
    if (near >= 3 && near <= 9) { for (let x = x0 + 2; x < x0 + RW - 2; x++) if ((x - x0) % 6 < 3) ground.set(x, y, hash(x, y, 20) < 0.12 ? C.n5 : C.n7); }
    else if (near === 12) { for (let x = x0 + 2; x < x0 + RW - 2; x++) ground.set(x, y, C.n6); }
    else if (near > 14 && y % 14 < 8) { ground.set(x0 + 23, y, C.y4); ground.set(x0 + 24, y, C.y3); }
  }
  for (const y0 of ROAD_Y) for (let x = ROAD_X[0]; x < PROM_X; x++) {
    if (inX(x) !== undefined) continue;
    const near = Math.min(...ROAD_X.map((s) => Math.min(Math.abs(x - s), Math.abs(x - (s + RW - 1)))));
    if (near >= 3 && near <= 9) { for (let y = y0 + 2; y < y0 + RW - 2; y++) if ((y - y0) % 6 < 3) ground.set(x, y, hash(x, y, 20) < 0.12 ? C.n5 : C.n7); }
    else if (near === 12) { for (let y = y0 + 2; y < y0 + RW - 2; y++) ground.set(x, y, C.n6); }
    else if (near > 14 && x % 14 < 8) { ground.set(x, y0 + 23, C.y4); ground.set(x, y0 + 24, C.y3); }
  }
  // manholes, patches and cracks
  for (const x0 of ROAD_X) for (const y0 of ROAD_Y) {
    const mx = x0 + 14 + (hash(x0, y0, 21) * 20 | 0), my = y0 + 14 + (hash(x0, y0, 22) * 20 | 0);
    ground.disc(mx, my, 3, C.n3); ground.disc(mx, my, 2, C.n1); ground.set(mx - 1, my - 1, C.n4); ground.set(mx + 1, my, C.n3);
  }
  for (let i = 0; i < 70; i++) {
    let x = r.int(ROAD_X[0], PROM_X), y = r.int(ROAD_Y[0], ROAD_Y[3] + RW);
    if (!isRoad(x, y)) continue;
    if (i % 3 === 0) { const w = r.int(6, 14), h = r.int(5, 10); for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) if (isRoad(x + a, y + b) && ground.get(x + a, y + b) !== C.y4 && ground.get(x + a, y + b) !== C.y3 && ground.get(x + a, y + b) !== C.n7) ground.set(x + a, y + b, (a + b) % 2 ? C.n1 : C.n2); }
    else for (let k = 0; k < r.int(8, 22); k++) { if (isRoad(x, y)) ground.set(x, y, C.n1); x += r.int(-1, 1); y += r.chance(0.7) ? 1 : 0; }
  }

  // ---------------------------------------------------------------- building kit
  const AC = Pix.fromArt(`
555555
567765
573375
573375
567765
444444`, { 3: C.n2, 4: C.n3, 5: C.n4, 6: C.n5, 7: C.n6 });
  const VENT = Pix.fromArt(`
565
636
565`, { 3: C.ink, 5: C.n4, 6: C.n6 });
  // o: ramp [shadow, base, light, rim], style, wall, wallRamp, windows, doors, trim (neon colour index), seed, round
  function building(x, y, w, h, o = {}) {
    const rr = rng(o.seed || x * 3 + y * 7);
    const ramp = o.ramp || [C.n2, C.n3, C.n4, C.n5], style = o.style || 'gravel';
    const wall = o.wall ?? 10, wr = o.wallRamp || [C.n1, C.n3, C.n4];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (o.round) { const dx = Math.min(i, w - 1 - i), dy = Math.min(j, h - 1 - j); if (dx < o.round && dy < o.round && Math.hypot(o.round - dx - 0.5, o.round - dy - 0.5) > o.round) continue; }
      const edge = Math.min(i, j, w - 1 - i, h - 1 - j);
      let c = ramp[1];
      if (edge < 2) c = j < 2 || i < 2 ? (edge === 0 ? ramp[3] : ramp[2]) : ramp[0];
      else if (edge === 2 && (j === 2 || i === 2)) c = ramp[0];
      else if (style === 'metal') c = i % 4 === 0 ? ramp[0] : i % 4 === 1 ? ramp[2] : ramp[1];
      else if (style === 'tile') c = j % 4 === 3 ? ramp[0] : (i + ((j >> 2) & 1) * 3) % 6 === 0 ? ramp[0] : hash(i / 6 | 0, j >> 2, x) < 0.2 ? ramp[2] : ramp[1];
      else if (style === 'panel') c = i % 18 === 9 || j % 18 === 9 ? ramp[0] : hash(i, j, x) < 0.03 ? ramp[2] : ramp[1];
      else { const hsh = hash(i, j, x + y); c = hsh < 0.07 ? ramp[2] : hsh > 0.93 ? ramp[0] : ramp[1]; }
      roofs.set(x + i, y + j, c);
    }
    // south-facing wall with windows and doors
    for (let j = 0; j < wall; j++) for (let i = 0; i < w; i++) {
      let c = j === 0 ? C.ink : j === wall - 1 ? wr[0] : j < 2 ? wr[0] : i < 1 || i > w - 2 ? wr[0] : wr[1];
      if (j >= 2 && j < wall - 1 && hash(i, j, x + 5) < 0.04) c = wr[2];
      roofs.set(x + i, y + h + j, c);
    }
    if (o.windows) for (let i = 4; i < w - 6; i += o.windows.step || 9) {
      if ((o.doors || []).some((d) => Math.abs(d - i) < 9)) continue;
      const lit = rr() < (o.windows.lit ?? 0.6), col = o.windows.color || C.y4;
      for (let b = 2; b < wall - 3; b++) for (let a = 0; a < 5; a++) { const px = x + i + a, py = y + h + b; if (lit) glowPx(px, py, a === 0 || b === 2 ? C.y6 : col); else roofs.set(px, py, a + b < 3 ? C.u3 : C.u1); }
      if (lit && o.windows.light !== false && rr() < 0.5) light(x + i + 2, y + h + wall + 2, 20, o.windows.lightColor || '#ffc27a');
    }
    for (const d of o.doors || []) {
      for (let b = 1; b < wall; b++) for (let a = 0; a < 7; a++) roofs.set(x + d + a, y + h + b, a === 0 || a === 6 || b === 1 ? C.ink : o.doorColor || C.b3);
      roofs.set(x + d + 5, y + h + wall - 4, C.y4);
    }
    if (o.trim) {
      // a neon tube running round the parapet
      for (let i = 3; i < w - 3; i++) { glowPx(x + i, y + 3, o.trim); glowPx(x + i, y + h - 4, o.trim); }
      for (let j = 3; j < h - 3; j++) { glowPx(x + 3, y + j, o.trim); glowPx(x + w - 4, y + j, o.trim); }
      const hex = P[Object.keys(C).find((k) => C[k] === o.trim)];
      for (let i = 12; i < w; i += 34) { light(x + i, y + h + wall + 4, 30, hex, 0); light(x + i, y - 4, 22, hex, 0); }
      for (let j = 10; j < h; j += 34) { light(x - 4, y + j, 22, hex, 0); light(x + w + 4, y + j, 22, hex, 0); }
    }
    // rooftop clutter
    const n = o.clutter ?? Math.round((w * h) / 900);
    for (let k = 0; k < n; k++) {
      const px = x + rr.int(6, Math.max(7, w - 14)), py = y + rr.int(6, Math.max(7, h - 14));
      if (rr() < 0.6) { roofs.rect(px + 1, py + 1, 6, 6, ramp[0]); roofs.blit(AC, px, py); }
      else { roofs.blit(VENT, px, py); roofs.set(px + 3, py + 3, ramp[0]); }
    }
    block(x, y, w, h + wall);
    shade(x + w, y + 4, 5, h + wall); shade(x + 3, y + h + wall, w + 2, 4);
    return { x, y, w, h, wall };
  }
  const skylight = (x, y, w, h, col) => { roofs.rect(x - 1, y - 1, w + 2, h + 2, C.n2); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) glowPx(x + i, y + j, (i + j) % 5 === 0 ? C.white : col); };
  const sign = (text, x, y, color, o = {}) => {
    const font = o.big ? FONT : SMALL, w = textWidth(text, font) + 6, h = font.height + 5;
    roofs.rect(x - 1, y - 1, w + 2, h + 2, C.ink); roofs.rect(x, y, w, h, C.n1);
    for (let i = 0; i < w; i++) { roofs.set(x + i, y, C.n2); }
    signs.push({ text, x: x + 3, y: y + 3, color, font });
    light(x + w / 2, y + h + 6, o.r || 38, color, 12);
    if (o.solid !== false) block(x, y, w, h);
    return w;
  };
  const prop = (name, x, y, o = {}) => {
    const p = PROPS[name], layer = o.top ? roofs : ground;
    layer.blit(p, Math.round(x - p.w / 2), Math.round(y - p.h / 2));
    if (o.solid !== false) circles.push({ x, y, r: o.r || Math.min(p.w, p.h) / 2 - 0.5, kind: name });
  };
  const palm = (x, y, seed, R = 13) => {
    const p = palmTop(seed, R);
    // shadow on the ground, trunk stub, then the crown in the overhang layer
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (i * i + j * j < R * R * 0.8 && bayer(x + i, y + j) > 0.3) { const v = ground.get(x + i + 5, y + j + 6); if (v) ground.set(x + i + 5, y + j + 6, DARK1[v]); }
    ground.disc(x, y, 2, C.b3);
    roofs.blit(p, Math.round(x - p.w / 2), Math.round(y - p.h / 2));
    circles.push({ x, y, r: 2.2, kind: 'palm' });
  };
  const lamp = (x, y, dx, dy, color = '#ffb46a') => {
    ground.rect(x - 1, y - 1, 2, 2, C.n2);
    for (let k = 1; k <= 6; k++) roofs.set(x + dx * k, y + dy * k, C.n3);
    const hx = x + dx * 7, hy = y + dy * 7;
    roofs.rect(hx - 1, hy - 1, 3, 3, C.n4); glowPx(hx, hy, C.y6); glowPx(hx + dx, hy + dy, C.y5);
    light(hx + dx * 4, hy + dy * 4, 56, color, 16);
    circles.push({ x, y, r: 1.4, kind: 'lamp' });
  };
  const bays = (x, y, n, w = 17, len = 26, dir = 1) => {
    for (let k = 0; k <= n; k++) for (let j = 0; j < len; j++) ground.set(x + k * w, y + j * dir, C.n6);
    for (let k = 0; k < n; k++) spots.lastBay = { x: x + k * w + w / 2, y: y + (len / 2) * dir };
    return Array.from({ length: n }, (_, k) => ({ x: x + k * w + w / 2 + 0.5, y: y + (len / 2) * dir, a: dir > 0 ? 0 : Math.PI }));
  };
  const lot = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) ground.set(x + i, y + j, asphalt(x + i, y + j, true)); };
  const tiles = (x, y, w, h, a, b) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) ground.set(x + i, y + j, ((i >> 3) + (j >> 3)) % 2 ? a : b); };
  const pool = (x, y, w, h) => {
    ground.rect(x - 3, y - 3, w + 6, h + 6, C.n6); ground.rect(x - 1, y - 1, w + 2, h + 2, C.white);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const wv = Math.sin(i * 0.5 + Math.sin(j * 0.4) * 2) + Math.sin(j * 0.7 + i * 0.2);
      const c = wv > 1.2 ? C.a6 : wv > 0.2 ? C.a5 : C.a4;
      ground.set(x + i, y + j, c); em.set(x + i, y + j, c);
    }
    block(x, y, w, h, 2);
    light(x + w / 2, y + h / 2, Math.max(w, h) * 0.9, '#48e0d8', 18);
  };

  // ---------------------------------------------------------------- the nine blocks
  const B = (i, j) => { const b = blockRect(i, j); return { x: b.x + T, y: b.y + T, w: b.w - 2 * T, h: b.h - 2 * T }; };
  let b;

  // 1. Pelican Motel: home base
  b = B(0, 0); lot(b.x, b.y, b.w, b.h);
  building(b.x, b.y, 144, 24, { ramp: [C.t1, C.t2, C.t3, C.t5], style: 'tile', windows: { step: 12, lit: 0.55 }, doors: [14, 50, 86, 122], doorColor: C.m2, wallRamp: [C.n2, C.b6, C.b7], trim: C.m3, clutter: 3 });
  building(b.x, b.y + 34, 30, 50, { ramp: [C.t1, C.t2, C.t3, C.t5], style: 'tile', windows: { step: 12 }, wallRamp: [C.n2, C.b6, C.b7], clutter: 1 });
  pool(b.x + 44, b.y + 44, 44, 24);
  prop('lounger', b.x + 96, b.y + 50, { solid: false }); prop('lounger', b.x + 104, b.y + 50, { solid: false });
  palm(b.x + 40, b.y + 78, 3); palm(b.x + 100, b.y + 70, 7, 11);
  parked.push(...bays(b.x + 58, b.y + 84, 5).map((s, k) => ({ ...s, model: ['sedan', 'cabrio', null, 'van', 'sedan'][k], paint: ['cyan', 'cream', '', 'teal', 'red'][k] })));
  sign('MOTEL', b.x + 114, b.y + 42, '#ff5fa8', { big: true });
  sign('VACANCY', b.x + 114, b.y + 58, '#58e8ff');
  spots.home = { x: b.x + 46, y: b.y + 104 }; spots.phone = { x: b.x + 14, y: b.y + 104 };
  prop('booth', spots.phone.x, spots.phone.y - 8); glowPx(spots.phone.x, spots.phone.y - 8, C.a6); light(spots.phone.x, spots.phone.y - 6, 26, '#58e8ff', 8);

  // 2. Diner and filling station
  b = B(1, 0); lot(b.x, b.y, b.w, b.h);
  building(b.x, b.y, 62, 40, { ramp: [C.n3, C.n5, C.n6, C.white], style: 'metal', round: 5, windows: { step: 8, lit: 1, color: C.y5 }, doors: [28], wallRamp: [C.n2, C.r3, C.r4], trim: C.m3, clutter: 2 });
  sign('DINER', b.x + 14, b.y + 14, '#58e8ff', { big: true, solid: false });
  // forecourt canopy: cars drive underneath, so it is overhang only
  for (let j = 0; j < 34; j++) for (let i = 0; i < 64; i++) { const e = Math.min(i, j, 63 - i, 33 - j); roofs.set(b.x + 78 + i, b.y + 52 + j, e === 0 ? C.ink : e < 3 ? C.r4 : e === 3 ? C.r2 : (i + j) % 9 === 0 ? C.n6 : C.white); }
  for (const px of [b.x + 94, b.x + 126]) { for (const py of [b.y + 62, b.y + 76]) { prop('pump', px, py); } light(px, b.y + 69, 44, '#fff3d0', 0); }
  sign('GAS', b.x + 100, b.y + 40, '#ffd84a', { solid: false });
  prop('dumpster', b.x + 20, b.y + 66); prop('crate', b.x + 40, b.y + 68); palm(b.x + 8, b.y + 96, 11); palm(b.x + 60, b.y + 100, 13, 11);
  parked.push({ x: b.x + 36, y: b.y + 96, a: Math.PI / 2, model: 'sedan', paint: 'white' });

  // 3. Hotel Azul
  b = B(2, 0); tiles(b.x, b.y, b.w, b.h, C.n5, C.n4);
  const hotel = building(b.x + 6, b.y, 132, 70, { ramp: [C.n4, C.n6, C.n7, C.white], style: 'panel', wall: 12, windows: { step: 8, lit: 0.8, color: C.y5 }, doors: [62], wallRamp: [C.n2, C.m4, C.m5], trim: C.a5, clutter: 5 });
  pool(hotel.x + 78, hotel.y + 14, 40, 20); solid.fill && block(hotel.x, hotel.y, 132, 82);
  for (let k = 0; k < 4; k++) roofs.blit(PROPS.lounger, hotel.x + 80 + k * 10, hotel.y + 40);
  sign('HOTEL AZUL', hotel.x + 10, hotel.y + 12, '#ff5fa8', { big: true, solid: false });
  skylight(hotel.x + 14, hotel.y + 40, 30, 10, C.a5);
  for (let j = 0; j < 22; j++) for (let i = 0; i < 9; i++) ground.set(hotel.x + 62 + i, hotel.y + 82 + j, i === 0 || i === 8 ? C.y3 : C.r3);
  for (let j = 0; j < 9; j++) for (let i = 0; i < 30; i++) roofs.set(hotel.x + 51 + i, hotel.y + 82 + j, j === 8 ? C.ink : (i >> 2) % 2 ? C.m3 : C.white);
  prop('planter', hotel.x + 52, hotel.y + 96); prop('planter', hotel.x + 80, hotel.y + 96);
  palm(b.x + 12, b.y + 98, 21); palm(b.x + 132, b.y + 98, 23);
  spots.jobCar = { x: b.x + 104, y: b.y + 100, a: Math.PI / 2 };
  light(hotel.x + 66, hotel.y + 92, 40, '#ffd9a0', 0);

  // 4. Rico's garage and yard
  b = B(0, 1); lot(b.x, b.y, b.w, b.h);
  const gar = building(b.x, b.y, 84, 58, { ramp: [C.b2, C.b3, C.b4, C.b5], style: 'metal', wall: 12, wallRamp: [C.n1, C.n4, C.n5], clutter: 3 });
  for (const dx of [8, 46]) for (let j = 1; j < 12; j++) for (let i = 0; i < 28; i++) roofs.set(gar.x + dx + i, gar.y + 58 + j, dx === 8 ? (j < 3 ? C.n3 : C.ink) : j % 3 === 0 ? C.n3 : C.n5);
  sign('GARAGE', b.x + 22, b.y + 20, '#ffd84a', { big: true, solid: false });
  spots.garage = { x: gar.x + 22, y: gar.y + 58 + 12 + 16 }; light(gar.x + 22, gar.y + 74, 40, '#ffe0a0', 0);
  building(b.x + 98, b.y + 6, 44, 30, { ramp: [C.n2, C.n3, C.n4, C.n5], windows: { step: 10 }, doors: [6], clutter: 1 });
  prop('tires', b.x + 96, b.y + 62); prop('tires', b.x + 104, b.y + 66); prop('tires', b.x + 98, b.y + 72); prop('crate', b.x + 132, b.y + 60); prop('crate', b.x + 124, b.y + 64);
  prop('dumpster', b.x + 120, b.y + 100); prop('cone', b.x + 60, b.y + 96, { r: 1 }); prop('cone', b.x + 74, b.y + 100, { r: 1 });
  for (let k = 0; k < 6; k++) ground.disc(b.x + r.int(10, 130), b.y + r.int(78, 108), r.int(2, 4), C.n1);
  parked.push({ x: b.x + 112, y: b.y + 86, a: 0.3, model: 'van', paint: 'white' });

  // 5. Flamingo Plaza
  b = B(1, 1);
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
    const dx = i - b.w / 2, dy = j - b.h / 2, d = Math.hypot(dx, dy * 1.15);
    const path = d < 30 || Math.abs(Math.abs(dx) - Math.abs(dy) * 1.28) < 5;
    let c;
    if (path) c = paving(i, j, C.m4, C.m3, C.m5);
    else { const h = hash(i, j, 31), n = noise2(i * 0.08, j * 0.08, 32); c = h < 0.05 ? C.g5 : h > 0.975 ? (hash(i, j, 33) < 0.5 ? C.m4 : C.y5) : n > 0.6 ? C.g3 : C.g4; }
    ground.set(b.x + i, b.y + j, c);
  }
  const fx = b.x + b.w / 2, fy = b.y + b.h / 2;
  ground.disc(fx, fy, 15, C.n6); ground.disc(fx, fy, 13, C.n4);
  for (let j = -11; j <= 11; j++) for (let i = -11; i <= 11; i++) if (i * i + j * j < 122) { const c = (i * i + j * j < 12) ? C.white : Math.sin(Math.hypot(i, j) * 1.4) > 0.3 ? C.a5 : C.a4; ground.set(fx + i, fy + j, c); em.set(fx + i, fy + j, c); }
  circles.push({ x: fx, y: fy, r: 15, kind: 'fountain' }); light(fx, fy, 46, '#58e8ff', 18);
  spots.fountain = { x: fx, y: fy };
  for (const [px, py, s] of [[16, 16, 31], [128, 14, 33], [14, 96, 35], [130, 98, 37], [72, 10, 39], [72, 102, 41]]) palm(b.x + px, b.y + py, s, s % 4 === 1 ? 13 : 11);
  prop('bench', fx - 34, fy, { solid: false }); prop('bench', fx + 34, fy, { solid: false }); prop('bin', fx + 24, fy - 22); prop('planter', fx - 24, fy + 22);

  // 6. Club Riptide
  b = B(2, 1); lot(b.x, b.y, b.w, b.h);
  const club = building(b.x + 4, b.y, 136, 62, { ramp: [C.p1, C.p2, C.p3, C.p4], style: 'panel', wall: 12, doors: [64], doorColor: C.m2, wallRamp: [C.ink, C.p1, C.p2], trim: C.a5, clutter: 4 });
  for (let i = 8; i < 128; i++) { glowPx(club.x + i, club.y + 7, C.m3); glowPx(club.x + i, club.y + 54, C.m3); }
  for (let j = 7; j < 55; j++) { glowPx(club.x + 7, club.y + j, C.m3); glowPx(club.x + 128, club.y + j, C.m3); }
  sign('RIPTIDE', club.x + 42, club.y + 20, '#ff5fa8', { big: true, solid: false });
  skylight(club.x + 16, club.y + 22, 16, 22, C.m3); skylight(club.x + 104, club.y + 22, 16, 22, C.p5);
  for (const dx of [50, 84]) { ground.rect(club.x + dx, club.y + 78, 2, 2, C.y4); ground.rect(club.x + dx, club.y + 92, 2, 2, C.y4); for (let j = 0; j < 14; j++) ground.set(club.x + dx, club.y + 78 + j, j % 2 ? C.r4 : C.r3); }
  light(club.x + 67, club.y + 84, 46, '#ff5fa8', 14);
  parked.push(...bays(b.x + 8, b.y + 84, 3).map((s, k) => ({ ...s, model: ['cabrio', 'coupe', 'sedan'][k], paint: ['purple', 'yellow', 'black'][k] })));
  parked.push(...bays(b.x + 94, b.y + 84, 2).map((s, k) => ({ ...s, model: ['coupe', null][k], paint: 'cyan' })));

  // 7. The docks
  b = B(0, 2); lot(b.x, b.y, b.w, b.h);
  building(b.x, b.y, 68, 46, { ramp: [C.u1, C.u2, C.u3, C.u4], style: 'metal', doors: [30], wallRamp: [C.n1, C.n3, C.n4], clutter: 2 });
  building(b.x + 80, b.y + 4, 62, 38, { ramp: [C.r1, C.r2, C.r3, C.r4], style: 'metal', doors: [10], wallRamp: [C.n1, C.n3, C.n4], clutter: 2 });
  const container = (x, y, w, ramp) => { for (let j = 0; j < 14; j++) for (let i = 0; i < w; i++) { const e = Math.min(i, j, w - 1 - i, 13 - j); roofs.set(x + i, y + j, e === 0 ? C.ink : i % 3 === 0 ? ramp[0] : j < 5 ? ramp[2] : ramp[1]); } block(x, y, w, 14); shade(x + w, y + 3, 3, 13); shade(x + 2, y + 14, w, 3); };
  container(b.x + 6, b.y + 86, 40, [C.t2, C.t3, C.t4]); container(b.x + 6, b.y + 70, 40, [C.y1, C.y2, C.y3]); container(b.x + 96, b.y + 92, 40, [C.u2, C.u3, C.u4]); container(b.x + 56, b.y + 64, 32, [C.m1, C.m2, C.m3]);
  prop('crate', b.x + 60, b.y + 100); prop('crate', b.x + 68, b.y + 104); prop('crate', b.x + 120, b.y + 64); prop('tires', b.x + 134, b.y + 70);
  sign('PIER 9', b.x + 86, b.y + 12, '#ffd84a', { solid: false });
  spots.crew = [[52, 62], [98, 66], [58, 86], [112, 84], [80, 104]].map(([x, y]) => ({ x: b.x + x, y: b.y + y }));
  spots.docks = { x: b.x + 76, y: b.y + 82 };

  // 8. Police precinct
  b = B(1, 2); lot(b.x, b.y, b.w, b.h);
  const pd = building(b.x + 18, b.y, 108, 54, { ramp: [C.u1, C.u2, C.u3, C.u5], style: 'panel', wall: 12, windows: { step: 9, lit: 0.7, color: C.u6, lightColor: '#a8d8ff' }, doors: [50], wallRamp: [C.n2, C.n5, C.n6], clutter: 3 });
  roofs.disc(pd.x + 80, pd.y + 28, 16, C.u3); roofs.disc(pd.x + 80, pd.y + 28, 14, C.y4); roofs.disc(pd.x + 80, pd.y + 28, 12, C.u2);
  for (let j = -6; j <= 6; j++) { roofs.set(pd.x + 75, pd.y + 28 + j, C.y4); roofs.set(pd.x + 76, pd.y + 28 + j, C.y4); roofs.set(pd.x + 84, pd.y + 28 + j, C.y4); roofs.set(pd.x + 85, pd.y + 28 + j, C.y4); }
  for (let i = 75; i <= 85; i++) { roofs.set(pd.x + i, pd.y + 28, C.y4); roofs.set(pd.x + i, pd.y + 29, C.y4); }
  sign('POLICE', pd.x + 12, pd.y + 16, '#8fd0ff', { big: true, solid: false });
  parked.push(...bays(b.x + 22, b.y + 84, 4).map((s, k) => ({ ...s, model: k % 3 === 2 ? null : 'cop', paint: 'white' })));
  spots.precinct = { x: b.x + 72, y: b.y + 74 };

  // 9. Spray shop and arcade
  b = B(2, 2); lot(b.x, b.y, b.w, b.h);
  const spray = building(b.x, b.y, 60, 52, { ramp: [C.y1, C.y2, C.y3, C.y4], style: 'metal', wall: 12, wallRamp: [C.n1, C.n4, C.n5], clutter: 2 });
  for (let j = 1; j < 12; j++) for (let i = 0; i < 30; i++) roofs.set(spray.x + 15 + i, spray.y + 52 + j, j < 3 ? C.n3 : C.ink);
  sign('SPRAY', spray.x + 12, spray.y + 18, '#58e8ff', { big: true, solid: false });
  spots.spray = { x: spray.x + 30, y: spray.y + 52 + 12 + 16 }; light(spray.x + 30, spray.y + 70, 40, '#ffe0a0', 0);
  building(b.x + 74, b.y + 4, 68, 44, { ramp: [C.m1, C.m2, C.m3, C.m4], style: 'panel', windows: { step: 7, lit: 1, color: C.a5, lightColor: '#58e8ff' }, doors: [30], doorColor: C.p3, wallRamp: [C.ink, C.p1, C.p2], trim: C.y4, clutter: 2 });
  sign('ARCADE', b.x + 86, b.y + 18, '#58e8ff', { big: true, solid: false });
  parked.push(...bays(b.x + 80, b.y + 80, 3).map((s, k) => ({ ...s, model: ['sedan', null, 'van'][k], paint: ['orange', '', 'blue'][k] })));
  palm(b.x + 68, b.y + 100, 51, 11);

  // ---------------------------------------------------------------- street furniture
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const q = blockRect(i, j);
    lamp(q.x + 44, q.y + 4, 0, -1); lamp(q.x + q.w - 44, q.y + 4, 0, -1);
    lamp(q.x + 44, q.y + q.h - 5, 0, 1); lamp(q.x + q.w - 44, q.y + q.h - 5, 0, 1);
    lamp(q.x + 4, q.y + q.h / 2, -1, 0); lamp(q.x + q.w - 5, q.y + q.h / 2, 1, 0);
    prop('hydrant', q.x + 12, q.y + 5); prop('bin', q.x + q.w - 14, q.y + q.h - 7);
    if ((i + j) % 2) prop('box', q.x + q.w - 8, q.y + 30); else prop('bench', q.x + 80, q.y + q.h - 6, { solid: false });
  }
  // promenade and beach
  for (let y = 40; y < H - 30; y += 46) { palm(PROM_X + 20, y, 60 + y, y % 92 === 40 ? 13 : 11); if (y % 92 === 40) lamp(PROM_X + 6, y + 22, -1, 0, '#bff0ff'); else prop('bench', PROM_X + 24, y + 22, { solid: false }); }
  const shades = [[[C.r2, C.r3, C.r4], [C.n5, C.n7, C.white]], [[C.a2, C.a3, C.a5], [C.y2, C.y4, C.y5]], [[C.m1, C.m2, C.m4], [C.n5, C.n7, C.white]], [[C.p2, C.p3, C.p5], [C.y2, C.y4, C.y5]]];
  for (let y = 46, k = 0; y < H - 40; y += 34, k++) {
    const x = SAND_X + 12 + (k % 3) * 9, ps = parasol(...shades[k % 4]);
    ground.blit(PROPS.lounger, x + 6, y + 2);
    for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) if (i * i + j * j < 50) { const v = ground.get(x + i + 3, y + j + 4); if (v) ground.set(x + i + 3, y + j + 4, DARK1[v]); }
    roofs.blit(ps, x - (ps.w >> 1), y - (ps.h >> 1)); circles.push({ x, y, r: 1.5, kind: 'pole' });
  }
  block(SAND_X + 40, 0, 8, H, 0);

  // ---------------------------------------------------------------- bake
  const groundCan = ground.toCanvas(), roofCan = roofs.toCanvas(), emCan = em.toCanvas();
  const rg = ctx2d(roofCan), eg = ctx2d(emCan);
  for (const s of signs) { drawText(rg, s.text, s.x, s.y, { font: s.font, color: s.color }); drawText(eg, s.text, s.x, s.y, { font: s.font, color: s.color }); }

  // cash drops and a radar image
  spots.cash = [[ROAD_X[1] + 12, ROAD_Y[0] + 36], [ROAD_X[2] + 36, ROAD_Y[1] - 60], [ROAD_X[3] + 12, ROAD_Y[1] + 12], [ROAD_X[2] + 12, ROAD_Y[2] + 36], [ROAD_X[0] + 36, ROAD_Y[2] - 50], [ROAD_X[1] + 36, ROAD_Y[3] + 12], [ROAD_X[3] + 36, ROAD_Y[3] - 70]].map(([x, y]) => ({ x, y }));
  const mini = makeCanvas(MW, MH), mg = ctx2d(mini);
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
    const x = tx * T + 8, y = ty * T + 8;
    mg.fillStyle = x >= SEA_X || x < 32 ? P.u2 : x >= SAND_X ? P.d3 : isRoad(x, y) ? P.n5 : solid[Math.floor(y / CELL) * SW + Math.floor(x / CELL)] ? P.p2 : P.n2;
    mg.fillRect(tx, ty, 1, 1);
  }
  return { ground: groundCan, roofs: roofCan, em: emCan, solid, lights, circles, parked: parked.filter((p) => p.model), spots, mini };
}

export function gallery(section) {
  const city = buildCity();
  const c = makeCanvas(WORLD.w, WORLD.h), g = ctx2d(c);
  g.drawImage(city.ground, 0, 0); g.drawImage(city.roofs, 0, 0);
  section('city', [{ canvas: c, label: 'port coral' }]);
}

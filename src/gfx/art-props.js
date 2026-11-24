// Village, forest and ruin props. Small things are hand-drawn ASCII; big things
// (cottages, pillars, the shrine) are painted procedurally so they can vary.
import { C } from './palette.js';
import { Pix, rng, hash, noise1, noise2, bayer, lerp, clamp } from './pixel.js';
import { treeSprite, drawBush, leafClump, LEAF_GREEN, LEAF_TEAL, LEAF_AUTUMN, LEAF_GLOOM, BARK, BARK_PALE, drawDeadTree, drawPine } from './art-trees.js';

// Universal legend: one character per palette entry.
// 0 ink | 1-7 n1..n7 | 8 white | a-g browns | h-n greens | o-t teals
// A-G blues | H-M purples | N-R reds | S-X yellows | u-y skin | Y Z z $ % pinks
export const U = { 0: C.ink, 8: C.white };
'1234567'.split('').forEach((ch, i) => { U[ch] = C['n' + (i + 1)]; });
'abcdefg'.split('').forEach((ch, i) => { U[ch] = C['b' + (i + 1)]; });
'hijklmn'.split('').forEach((ch, i) => { U[ch] = C['g' + (i + 1)]; });
'opqrst'.split('').forEach((ch, i) => { U[ch] = C['t' + (i + 1)]; });
'ABCDEFG'.split('').forEach((ch, i) => { U[ch] = C['u' + (i + 1)]; });
'HIJKLM'.split('').forEach((ch, i) => { U[ch] = C['p' + (i + 1)]; });
'NOPQR'.split('').forEach((ch, i) => { U[ch] = C['r' + (i + 1)]; });
'STUVWX'.split('').forEach((ch, i) => { U[ch] = C['y' + (i + 1)]; });
'uvwxy'.split('').forEach((ch, i) => { U[ch] = C['sk' + (i + 1)]; });
'YZz$%'.split('').forEach((ch, i) => { U[ch] = C['m' + (i + 1)]; });

export const art = (s, outline = true) => { const p = Pix.fromArt(s, U); return outline ? p.outline(C.ink) : p; };

// ------------------------------------------------------------------ items
export const COIN = [
  art(`
..UUU..
.UWWVU.
UWXVVVT
UWVVVUT
UVVVUUT
.UVUUT.
..TTT..`),
  art(`
..UUU..
..WWV..
.UXVVT.
.UWVUT.
.UVVUT.
..VUT..
..TTT..`),
  art(`
...U...
...WT..
...XT..
...VT..
...VT..
...UT..
...T...`),
  art(`
..UUU..
..VWW..
.TVVXU.
.TUVWU.
.TUVVU.
..TUV..
..TTT..`),
];

export const HEART = art(`
.QQ.QQ.
QR%QQQP
QRQQQQP
.QQQQP.
..QQP..
...P...`);

export const POTION = art(`
...fe...
...dc...
..7..6..
..7..6..
.7QRRQ6.
7QR%QQP6
7QRQQQP6
7QQQQPP6
.6PPPP5.
..6665..`);

export const GEM = art(`
..FGF..
.FG8GE.
EGGFFED
.EFEED.
..EDD..
...D...`);

// ember orb (spell pickup), 2 frames
export const EMBER_ORB = [
  art(`
...TT...
..TVVT..
.TVXXVT.
TVX88XVT
TVX88XVT
.TVXXVT.
..TVVT..
...TT...`, false),
  art(`
...TT...
..TUUT..
.TUVVUT.
TUVXXVUT
TUVXXVUT
.TUVVUT.
..TUUT..
...TT...`, false),
];

// ------------------------------------------------------------------ small flora
export const TUFTS = [
  art(`
..l.....m
.l.m..l.l
.kl.l.lk.
..kklkk..`, false),
  art(`
m....l.
.l.m.l.
.lkl.k.
.kkkkk.`, false),
  art(`
...m......
.l..l..m..
.kl.lk.l.l
..kkkkkkk.`, false),
  art(`
.l...
.lm.l
.kl.k
.kkk.`, false),
];

export const FLOWERS = [
  art(`
.%z.
z8z%
.zZ.
.k..
.kl.
lk..
.k..`, false),
  art(`
.WV.
V8VW
.VU.
..k.
.lk.
..kl
..k.`, false),
  art(`
.GF.
F8FG
.FE.
.k..
.kl.
lk..
.k..`, false),
  art(`
.R.
RXR
.Q.
.k.
lk.
.kl
.k.`, false),
];

export const MUSHROOMS = [
  art(`
..PQQP..
.PQ8QQP.
PQQQQ8QP
P8QQQQQP
.Ogff5O.
...gf...
...gf...
..gff5..`),
  art(`
.PQP.
PQ8QP
.gf..
.gf..`),
];

// bioluminescent caps for the deep forest (light sources)
export const GLOWSHROOMS = [
  art(`
..stts..
.st88ts.
stttt8ts
rs8tttsr
.q5665q.
...66...
..566...`, false),
  art(`
.sts.
st8ts
r565r
..6..`, false),
  art(`
.sts....
st8ts.s.
r565rsts
..6..r6r
..6...6.`, false),
];

export const ROCKS = [
  art(`
...4555.....
..45566544..
.4556655443.
445565544332
344554433322
.3344332221.`),
  art(`
..455..
.45654.
4556443
3445332
.33322.`),
  art(`
..45...
.4564..
3455433
.33322.`),
];

export const FERN = art(`
.....l......
..l..lk..l..
..kl.lk.lk..
l..kl.k.k..l
kl..klkk..lk
.kl..kk..lk.
..kk.kk.kk..
....kkkk....`, false);

// ------------------------------------------------------------------ village props
export const CRATE = art(`
eeeeeeeeeeee
edddddddddde
edceddddecdc
eddcedddcddc
edddceecdddc
eddddccddddc
eddddeecdddc
edddecdceddc
eddecdddcedc
edecddddddcc
ecccccccccdc
cccccccccccc`);

export const BARREL = art(`
..dddddd..
.deeeeedc.
dffeeeedcc
3443333332
dfeeeeedcc
dfeeeeddcc
dfeeeeddcc
dfeeeeddcc
3443333332
dfeeeeddcc
.deeeddcc.
..cccccc..`);

export const SIGNPOST = art(`
....ee........
.gggfffffffe..
.gfffffffffed.
.gfeccfecceed.
.gfffffffffed.
.geccfecfceed.
.gfffffffffed.
.eeeeeeeeeedd.
....ed........
....ed........
....ed........
....ed........
....ed........
....ed........
...iedk.......
..kieddk.l....`);

export const FENCE = art(`
..g.......g.....
.gfe.....gfe....
.gfe.....gfe....
ggfeffffggfeffff
eefeddddeefedddd
.gfe.....gfe....
.gfe.....gfe....
ggfeffffggfeffff
eefeddddeefedddd
.gfe.....gfe....
.gfe.....gfe....
.gfe.....gfe....`, false);

export const HAY = art(`
....VVWWVV......
..VVWWVVWWVVU...
.VWVVWWVVUVWVU..
VVWWVVUVWVVUVVU.
VWVVUVVWVUVVUVUT
VVUVVWVUVVUVUUTT
UVVUVVUVUVUUVUTT
.UUVUVUUVUUTUTT.
..TUUTUUTUTTTT..`);

// lamp post (lit); returns { pix, light: [x,y] }
function lampPost() {
  const p = new Pix(16, 44);
  // post
  for (let y = 6; y < 44; y++) { p.set(4, y, C.n4); p.set(5, y, C.n2); }
  p.rect(3, 40, 4, 4, C.n3); p.hline(3, 6, 40, C.n5); p.rect(2, 42, 6, 2, C.n2); p.hline(2, 7, 42, C.n4);
  p.rect(3, 22, 4, 1, C.n5);
  // arm with a curl
  p.hline(4, 12, 5, C.n4); p.hline(5, 12, 6, C.n2); p.set(3, 6, C.n4); p.set(12, 7, C.n3);
  p.set(6, 7, C.n3); p.set(7, 8, C.n3); p.set(6, 9, C.n3);
  // lantern
  const L = Pix.fromArt(`
..343..
.34443.
.UWXWU.
.VXXXV.
.VX8XV.
.UWXWU.
.23332.
..222..`, U);
  p.blit(L, 8, 8);
  return { pix: p.outline(C.ink), light: [12, 13] };
}
export const LAMP = lampPost();

// paper lantern for string lights, three colours
export const PAPER_LANTERNS = [
  art(`
.3.
QRQ
RXR
QRQ
.P.`, false),
  art(`
.3.
UVU
VXV
UVU
.T.`, false),
  art(`
.3.
stt
t8t
sts
.r.`, false),
];

export const WELL = (() => {
  const p = new Pix(30, 34);
  // roof
  for (let y = 0; y < 8; y++) for (let x = 0; x < 30; x++) {
    const hw = 4 + y * 1.5;
    if (Math.abs(x - 14.5) > hw) continue;
    const row = y % 3 === 2;
    p.set(x, y, row ? C.r1 : (x + (y / 3 | 0) * 2) % 5 === 0 ? C.r2 : x < 13 ? C.r3 : C.r2);
    if (y === 0) p.set(x, y, C.r4);
  }
  p.hline(2, 27, 8, C.b2);
  // posts & crank
  for (let y = 9; y < 24; y++) { p.set(5, y, C.b5); p.set(6, y, C.b3); p.set(23, y, C.b5); p.set(24, y, C.b3); }
  p.hline(7, 22, 12, C.b4); p.hline(7, 22, 13, C.b2);
  p.vline(14, 14, 20, C.b6); p.rect(12, 20, 5, 4, C.b4); p.hline(12, 16, 20, C.b5); p.hline(12, 16, 22, C.n3);
  // stone ring
  for (let y = 23; y < 34; y++) for (let x = 2; x < 28; x++) {
    const row = (y - 23) >> 2, lx = (x + (row % 2) * 4) % 8, ly = (y - 23) % 4;
    let c = C.n4;
    if (ly === 0 || lx === 0) c = C.n2; else if (ly === 1) c = C.n5; else if (ly === 3) c = C.n3;
    if (x > 20 && c !== C.n2) c = c === C.n5 ? C.n4 : C.n3;
    if (hash(x >> 3, row, 5) < 0.2 && c === C.n4) c = C.n5;
    p.set(x, y, c);
  }
  p.hline(1, 28, 23, C.n6); p.hline(1, 28, 24, C.n3);
  // moss
  for (let x = 2; x < 28; x++) if (noise1(x * 0.4, 3) > 0.55) { p.set(x, 23, C.g5); p.set(x, 24, C.g4); if (hash(x, 1) < 0.4) p.set(x, 25, C.g3); }
  return p.outline(C.ink);
})();

// ------------------------------------------------------------------ cottages
const ROOFS = {
  slate: [C.u1, C.u2, C.u3, C.u4, C.u5],
  clay: [C.r1, C.r2, C.r3, C.r4, C.r5],
  plum: [C.p1, C.p2, C.p3, C.p4, C.p5],
  moss: [C.g1, C.g2, C.g3, C.g4, C.g5],
};

function paintWindow(p, x, y, w, h, lit, shutter) {
  p.rect(x - 1, y - 1, w + 2, h + 2, C.b2);
  p.hline(x - 1, x + w, y - 1, C.b4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let c;
    if (lit) { c = j < h * 0.35 ? C.y5 : j < h * 0.7 ? C.y4 : C.y3; if (i + j < 3) c = C.y6; }
    else { c = j < h * 0.4 ? C.u3 : C.u2; if (i + j < 3) c = C.u5; }
    p.set(x + i, y + j, c);
  }
  p.vline(x + (w >> 1), y, y + h - 1, C.b2); p.hline(x, x + w - 1, y + (h >> 1), C.b2);
  // sill & flower box
  p.hline(x - 2, x + w + 1, y + h + 1, C.b5); p.hline(x - 2, x + w + 1, y + h + 2, C.b3);
  if (shutter) {
    for (let j = -1; j <= h; j++) for (let i = 0; i < 3; i++) {
      const c = (j + 9) % 3 === 0 ? shutter[0] : i === 0 ? shutter[2] : shutter[1];
      p.set(x - 4 + i, y + j, c); p.set(x + w + 1 + i, y + j, c);
    }
  }
}
function flowerBox(p, x, y, w, seed) {
  p.rect(x, y, w, 3, C.b4); p.hline(x, x + w - 1, y, C.b5); p.hline(x, x + w - 1, y + 2, C.b2);
  for (let i = 0; i < w; i++) {
    const hsh = hash(i, seed, 4);
    p.set(x + i, y - 1, hsh < 0.5 ? C.g4 : C.g5);
    if (hsh < 0.7) p.set(x + i, y - 2, hsh < 0.3 ? C.g5 : C.g4);
    if (hsh > 0.55 && i % 2 === 0) { p.set(x + i, y - 3, [C.m3, C.y4, C.r4, C.m4][(i + seed) % 4]); p.set(x + i, y - 2, C.g5); }
  }
}
function paintDoor(p, x, baseY, w, h) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const y = baseY - h + j;
    // arched top
    const ax = (i + 0.5 - w / 2) / (w / 2), top = (1 - Math.sqrt(Math.max(0, 1 - ax * ax))) * 4;
    if (j < top) continue;
    let c = i % 4 === 3 ? C.b2 : i % 4 === 0 ? C.b5 : C.b4;
    if (j < top + 1.2) c = C.b2;
    if (j === Math.round(h * 0.3) || j === Math.round(h * 0.75)) c = C.n3;
    if (i > w - 3) c = c === C.b5 ? C.b4 : C.b3;
    p.set(x + i, y, c);
  }
  // frame
  for (let j = 3; j < h; j++) { p.set(x - 1, baseY - h + j, C.b2); p.set(x + w, baseY - h + j, C.b2); p.set(x - 2, baseY - h + j, C.b3); p.set(x + w + 1, baseY - h + j, C.b3); }
  p.set(x + w - 3, baseY - (h >> 1), C.y4); p.set(x + w - 3, baseY - (h >> 1) + 1, C.y2);
  // doorstep
  p.rect(x - 3, baseY - 1, w + 6, 2, C.n4); p.hline(x - 3, x + w + 2, baseY - 1, C.n6);
}

// o: { w, h, roofH, roof, door, windows:[x..], chimney, seed, lit, shutter, upper }
export function makeHouse(o) {
  const over = 6, W = o.w + over * 2 + 2, roofH = o.roofH;
  const H = o.h + roofH + 14;
  const p = new Pix(W, H);
  const x0 = over + 1, baseY = H - 1, wallTop = baseY - o.h;
  const roof = ROOFS[o.roof || 'slate'];
  const r = rng(o.seed || 1);

  // chimney first (behind the roof)
  if (o.chimney !== undefined) {
    const cx = x0 + o.chimney, ct = wallTop - roofH - 7;
    for (let y = ct; y < wallTop - 4; y++) for (let i = 0; i < 8; i++) {
      const row = (y - ct) >> 1, lx = (i + (row % 2) * 2) % 4;
      let c = lx === 0 || (y - ct) % 2 === 1 && false ? C.b2 : i < 5 ? C.r3 : C.r2;
      if ((y - ct) % 3 === 2) c = C.b2;
      p.set(cx + i, y, c);
    }
    p.rect(cx - 1, ct, 10, 2, C.n4); p.hline(cx - 1, cx + 8, ct, C.n6);
  }

  // plaster wall
  for (let y = wallTop; y <= baseY; y++) for (let i = 0; i < o.w; i++) {
    let c = C.b7;
    const fromTop = y - wallTop;
    if (fromTop < 5 && (5 - fromTop) / 5 > bayer(i, y) * 0.9) c = C.b6;
    if (fromTop < 2) c = C.b5;
    if (i > o.w - 6 && (i - (o.w - 6)) / 6 > bayer(i, y)) c = C.b6;
    if (noise2(i * 0.3 + (o.seed || 0), y * 0.3, 9) > 0.72) c = C.b6;
    if (hash(i, y, o.seed || 1) < 0.012) c = C.b5;
    p.set(x0 + i, y, c);
  }
  // stone footing
  for (let y = baseY - 5; y <= baseY; y++) for (let i = -1; i <= o.w; i++) {
    const row = (y - baseY + 5) / 3 | 0, lx = (i + 20 + row * 3) % 7, ly = (y - baseY + 5) % 3;
    let c = lx === 0 || ly === 2 ? C.n2 : ly === 0 ? C.n5 : C.n4;
    if (hash((i + 20 + row * 3) / 7 | 0, row, 3) < 0.3 && c === C.n4) c = C.n3;
    p.set(x0 + i, y, c);
  }
  // timber frame
  const beamV = (bx, y1, y2) => { for (let y = y1; y <= y2; y++) { p.set(x0 + bx, y, C.b4); p.set(x0 + bx + 1, y, C.b3); p.set(x0 + bx + 2, y, C.b2); } };
  const beamH = (y, x1, x2) => { for (let i = x1; i <= x2; i++) { p.set(x0 + i, y, C.b4); p.set(x0 + i, y + 1, C.b3); p.set(x0 + i, y + 2, C.b2); } };
  const mid = wallTop + Math.round(o.h * 0.42);
  beamH(wallTop, 0, o.w - 1);
  if (o.upper !== false) beamH(mid, 0, o.w - 1);
  const posts = [0, o.w - 3, ...(o.posts || [])];
  for (const bx of posts) beamV(bx, wallTop, baseY - 6);
  // diagonal braces in the corners
  const brace = (bx, dir) => { for (let k = 0; k < mid - wallTop - 3; k++) { const xx = x0 + bx + dir * k; p.set(xx, mid - 1 - k, C.b3); p.set(xx + 1, mid - 1 - k, C.b4); } };
  if (o.upper !== false) { brace(3, 1); brace(o.w - 5, -1); }

  // windows & door
  for (const wx of o.windows || []) {
    const wy = (o.upper !== false ? mid : wallTop) + 7;
    paintWindow(p, x0 + wx, wy, 9, 10, o.lit !== false, o.shutter);
    flowerBox(p, x0 + wx - 1, wy + 13, 11, wx + (o.seed || 0));
  }
  for (const wx of o.upperWindows || []) paintWindow(p, x0 + wx, wallTop + 5, 7, 7, o.lit !== false, null);
  if (o.door !== undefined) paintDoor(p, x0 + o.door, baseY - 1, 12, 21);

  // roof: trapezoid with shingle rows
  const ridgeInset = Math.round(roofH * 0.55);
  for (let j = 0; j <= roofH; j++) {
    const y = wallTop - roofH + j;
    const t = j / roofH;
    const inset = Math.round(ridgeInset * (1 - t)) - over;
    const xl = x0 + inset, xr = x0 + o.w - 1 - inset;
    const row = Math.floor(j / 4), ly = j % 4;
    for (let x = xl; x <= xr; x++) {
      const lx = (x + row * 3) % 6;
      const tile = hash((x + row * 3) / 6 | 0, row, o.seed || 1);
      let k = tile < 0.2 ? 1 : tile > 0.85 ? 3 : 2;
      if (ly === 3) k = 0;
      else if (ly === 2 && (lx === 0 || lx === 5)) k = 0;
      else if (ly === 0) k = Math.min(4, k + 1);
      else if (lx === 0) k = Math.max(0, k - 1);
      if (x > xr - (roofH - j) * 0.0 - 5) k = Math.max(0, k - 1);
      if (j < 2) k = j === 0 ? 4 : 3;
      p.set(x, y, roof[k]);
    }
    // barge boards on the slanted edges
    p.set(xl, y, C.b3); p.set(xl - 1, y, C.b5); p.set(xr, y, C.b2); p.set(xr + 1, y, C.b3);
  }
  // eave shadow line & moss tufts on the roof
  for (let x = x0 - over; x < x0 + o.w + over; x++) p.set(x, wallTop + 1, C.b1);
  for (let i = 0; i < 5; i++) {
    const mx = x0 + r.int(-2, o.w), my = wallTop - r.int(2, roofH - 4);
    if (!p.get(mx, my)) continue;
    p.setOn(mx, my, C.g4); p.setOn(mx + 1, my, C.g5); p.setOn(mx, my + 1, C.g3); p.setOn(mx + 1, my + 1, C.g4); p.setOn(mx + 2, my + 1, C.g3);
  }
  // ivy creeping up one corner
  if (o.ivy) for (let k = 0; k < 26; k++) {
    const ix = x0 + o.w - 4 + Math.round(Math.sin(k * 0.7) * 2) - (k > 14 ? k - 14 : 0) * 0.4, iy = baseY - 6 - k;
    p.setOn(ix, iy, C.g3); p.setOn(ix + 1, iy, C.g4); if (k % 3 === 0) { p.setOn(ix - 1, iy, C.g5); p.setOn(ix + 2, iy + 1, C.g4); }
  }
  const out = p.outline(C.ink);
  const lights = [...(o.windows || []).map((wx) => [x0 + wx + 5, (o.upper !== false ? mid : wallTop) + 13]), ...(o.upperWindows || []).map((wx) => [x0 + wx + 4, wallTop + 9])];
  return { pix: out, ox: 1, oy: H, lights, chimney: o.chimney !== undefined ? [x0 + o.chimney + 5, wallTop - roofH - 6] : null, door: o.door !== undefined ? x0 + o.door + 6 : null };
}

// hanging shop sign with an icon
export function makeSign(icon) {
  const p = Pix.fromArt(`
3333333333333
.a.........a.
.a.........a.
deeeeeeeeeeed
dfffffffffffc
dfffffffffffc
dfffffffffffc
dfffffffffffc
dfffffffffffc
dfffffffffffc
dcccccccccccc`, U);
  const icons = {
    anvil: ['.2333332.', '23444432.', '..2332...', '..2332...', '.233332..'],
    potion: ['...22....', '..2..2...', '.2QRRQ2..', '.2QQQP2..', '..2222...'],
    lamp: ['...33....', '..3VV3...', '..VXXV...', '..3VV3...', '...33....'],
  };
  const rows = icons[icon] || icons.lamp;
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') p.set(2 + x, 4 + y, U[row[x]]); });
  return p.outline(C.ink);
}

// ------------------------------------------------------------------ campfire / checkpoint
export const CAMPFIRE_BASE = art(`
....................
.....c......d.......
....cdc....ded......
..33cedcddddeedc33..
.3554cdeeeeeddc4553.
.34432ccdddccc23443.
..222.22ccccc22.222.`);

export const CHEST = {
  closed: art(`
..cccccccccccc..
.ceeeeeVVeeeeec.
ceffffeVWeffffec
cefeeeeVVeeeefec
cdddddUVVUdddddc
bUUUUUVXWVUUUUUb
ceeeeeUVVUeeeeec
cefeeeeVUeeeefdc
cedeeeeVUeeeeddc
cdddddddddddddcc
bccccccccccccccb`),
  open: art(`
..cccccccccccc..
.cbbbbbbbbbbbbc.
cbaaaaaaaaaaaabc
cbaaaaaaaaaaaabc
.cccccccccccccc.
..bWXWWXWWXWWb..
.bUVXVWXVVXWVUb.
cdddddUVVUdddddc
ceeeeeUVVUeeeeec
cefeeeeVUeeeefdc
cedeeeeVUeeeeddc
cdddddddddddddcc
bccccccccccccccb`),
};

// ------------------------------------------------------------------ ruins
export function makePillar(h, broken, seed, w = 12) {
  const r = rng(seed), p = new Pix(w + 8, h + 2);
  const x0 = 4;
  for (let j = 0; j < h; j++) {
    const y = p.h - 1 - j;
    let top = h;
    for (let i = 0; i < w; i++) {
      // broken top: jagged diagonal
      if (broken) top = h - 3 - Math.abs(i - (seed % w)) * 0.9 - (hash(i >> 1, seed) * 3 | 0);
      if (j > top) continue;
      const u = i / (w - 1);
      // fluting
      let k = u < 0.12 ? 5 : u < 0.4 ? 4 : u < 0.75 ? 3 : 2;
      if (i % 3 === 2) k -= 1;
      if (j % 14 === 13) k -= 1;              // drum seams
      if (hash(i, j >> 1, seed) < 0.05) k -= 1;
      if (noise2(i * 0.35, j * 0.2, seed) > 0.74) k = Math.min(k, 3);
      p.set(x0 + i, y, [C.n1, C.n2, C.n3, C.n4, C.n5, C.n6][clamp(k, 1, 5)]);
    }
  }
  // base and capital
  const base = (yy, extra) => { for (let i = -extra; i < w + extra; i++) { const u = (i + extra) / (w + extra * 2); p.set(x0 + i, yy, u < 0.2 ? C.n6 : u < 0.7 ? C.n4 : C.n3); } };
  base(p.h - 1, 3); base(p.h - 2, 3); base(p.h - 3, 2); base(p.h - 4, 1);
  for (let i = -3; i < w + 3; i++) p.set(x0 + i, p.h - 1, C.n2);
  if (!broken) { base(p.h - h, 3); base(p.h - h + 1, 3); base(p.h - h + 2, 2); base(p.h - h + 3, 1); for (let i = -3; i < w + 3; i++) p.setOn(x0 + i, p.h - h + 1, C.n3); }
  // moss and vines
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const y = p.h - 1 - j;
    if (!p.get(x0 + i, y)) continue;
    const m = noise2(i * 0.3 + seed, j * 0.12, seed + 4);
    if (m > 0.66 && j < h * 0.7) p.set(x0 + i, y, m > 0.76 ? C.g4 : C.g3);
  }
  for (let v = 0; v < 2; v++) {
    const vx = x0 + r.int(1, w - 2), len = r.int(8, Math.min(26, h - 6));
    const startJ = broken ? h - 12 : h - 4;
    for (let k = 0; k < len; k++) { const y = p.h - 1 - startJ + k, xx = vx + Math.round(Math.sin(k * 0.5 + v) * 1); p.setOn(xx, y, k % 3 ? C.g3 : C.g5); if (k % 4 === 2) p.setOn(xx + 1, y, C.g4); }
  }
  return p.outline(C.ink);
}

// weathered statue of a lamplighter
export const STATUE = art(`
......4554......
.....455654.....
.....456654.....
.....445544.....
....34455443....
...3445554433...
...3455554433...
..34455554433...
..3445i5544332..
..344ji5544332..
..34455i444332..
..3445554443367.
..34455544433V7.
..3445554443WXW.
..3445i54443VXV.
..344ji544433V3.
..3445554443.3..
..3445554443....
..3444554433....
..3444i54433....
..3344ji4433....
..3344554332....
.233445443322...
.2334444433222..
233333333322222.
2444444444433322
2333333333322222`);

// the Ember shrine: pedestal and bowl. Flame is drawn live.
export const SHRINE = (() => {
  const p = new Pix(44, 40);
  const stone = [C.n1, C.n2, C.n3, C.n4, C.n5, C.n6];
  const block = (x, y, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = i / (w - 1);
      let k = u < 0.15 ? 5 : u < 0.5 ? 4 : u < 0.85 ? 3 : 2;
      if (j === 0) k = Math.min(5, k + 1);
      if (j === h - 1) k -= 1;
      if (hash(x + i, y + j, 8) < 0.06) k -= 1;
      p.set(x + i, y + j, stone[clamp(k, 1, 5)]);
    }
  };
  block(2, 34, 40, 6); block(6, 29, 32, 5); block(14, 14, 16, 15); block(11, 11, 22, 3);
  // carved rune
  [[21, 17], [20, 18], [22, 18], [19, 19], [23, 19], [21, 19], [21, 20], [21, 21], [20, 22], [22, 22], [21, 23]].forEach(([x, y]) => p.set(x, y, C.n2));
  // bowl
  for (let j = 0; j < 7; j++) {
    const hw = 13 - j * 1.4;
    for (let i = -Math.round(hw); i <= Math.round(hw); i++) {
      const u = (i + hw) / (hw * 2);
      p.set(22 + i, 4 + j, j === 0 ? C.y3 : u < 0.2 ? C.b6 : u < 0.6 ? C.b5 : u < 0.85 ? C.b4 : C.b3);
    }
  }
  p.hline(9, 35, 4, C.y4); p.hline(10, 34, 5, C.b3);
  // moss
  for (let x = 2; x < 42; x++) if (noise1(x * 0.33, 12) > 0.5) { p.setOn(x, 34, C.g4); p.setOn(x, 35, C.g3); }
  for (let x = 6; x < 38; x++) if (noise1(x * 0.4, 14) > 0.6) p.setOn(x, 29, C.g4);
  return p.outline(C.ink);
})();

// corrupted crystal growths near the boss
export const CRYSTALS = [
  art(`
....K.....
...KLK....
...JLK..K.
..JKLKJ.LK
..JKMLJJLK
.IJKLKJJKK
.IJKKKIJKJ
IIJJKJIIJJ`),
  art(`
..K...
.KLK..
.JLKJ.
IJMKJ.
IJKKJI
IIJJII`),
];

// hanging vine strip (drawn under ledges)
export function makeVine(len, seed) {
  const p = new Pix(5, len);
  for (let k = 0; k < len; k++) {
    const x = 2 + Math.round(Math.sin(k * 0.45 + seed) * 1);
    p.set(x, k, k % 3 ? C.g3 : C.g4);
    if (k % 4 === 1) p.set(x - 1, k, C.g4);
    if (k % 4 === 3) p.set(x + 1, k, C.g5);
  }
  p.set(2, len - 1, C.g5);
  return p;
}

// playfield trees, pre-rendered in a few variants
export function makeTrees() {
  const out = {};
  out.oak = [1, 2, 3].map((s) => treeSprite({ h: 44 + s * 6, tw: 9, R: 26 + s * 2, seed: 100 + s * 7, leaf: LEAF_GREEN, bark: BARK }));
  out.autumn = [1, 2].map((s) => treeSprite({ h: 38 + s * 8, tw: 8, R: 22 + s * 3, seed: 200 + s * 5, leaf: LEAF_AUTUMN, bark: BARK }));
  out.deep = [1, 2, 3].map((s) => treeSprite({ h: 70 + s * 10, tw: 11, R: 30 + s * 2, seed: 300 + s * 3, leaf: LEAF_TEAL, bark: [C.n1, C.b1, C.b2, C.b3] }));
  out.gloom = [1, 2].map((s) => treeSprite({ h: 50 + s * 8, tw: 9, R: 22 + s * 2, seed: 400 + s * 9, leaf: LEAF_GLOOM, bark: BARK_PALE }));
  out.pine = [1, 2].map((s) => { const p = new Pix(40, 96); drawPine(p, 20, 95, { h: 70 + s * 10, w: 30, seed: s, leaf: LEAF_TEAL, bark: BARK }); return { pix: p, ox: 20, oy: 95 }; });
  out.dead = [1, 2].map((s) => { const p = new Pix(70, 80); drawDeadTree(p, 35, 79, { h: 70, tw: 7, seed: 50 + s, bark: BARK_PALE }); return { pix: p, ox: 35, oy: 79 }; });
  out.bush = [1, 2, 3, 4].map((s) => { const p = new Pix(48, 22); drawBush(p, 24, 20, { R: 6 + s, seed: 500 + s * 3, leaf: s === 4 ? LEAF_TEAL : LEAF_GREEN, clumps: 3 + (s % 2) }); return { pix: p, ox: 24, oy: 21 }; });
  return out;
}

export function gallery(section) {
  const c = (p, label) => ({ canvas: p.toCanvas(), label });
  section('items', [...COIN.map((p, i) => c(p, 'c' + i)), c(HEART, 'hp'), c(POTION, 'pot'), c(GEM, 'gem'), ...EMBER_ORB.map((p) => c(p, 'orb'))]);
  section('flora', [...TUFTS.map((p) => c(p, 't')), ...FLOWERS.map((p) => c(p, 'f')), ...MUSHROOMS.map((p) => c(p, 'm')), ...GLOWSHROOMS.map((p) => c(p, 'g')), ...ROCKS.map((p) => c(p, 'r')), c(FERN, 'fern')]);
  section('village', [c(CRATE, 'crate'), c(BARREL, 'barrel'), c(SIGNPOST, 'sign'), c(FENCE, 'fence'), c(HAY, 'hay'), c(LAMP.pix, 'lamp'), ...PAPER_LANTERNS.map((p) => c(p, 'pl')), c(WELL, 'well'), c(makeSign('anvil'), 'smith'), c(makeSign('potion'), 'shop'), c(CAMPFIRE_BASE, 'fire'), c(CHEST.closed, 'chest'), c(CHEST.open, 'open')]);
  section('houses', [
    c(makeHouse({ w: 70, h: 40, roofH: 26, roof: 'slate', door: 12, windows: [40], upperWindows: [14, 48], chimney: 46, seed: 3, shutter: [C.t2, C.t3, C.t4], ivy: true }).pix, 'cottage'),
    c(makeHouse({ w: 54, h: 30, roofH: 22, roof: 'clay', door: 30, windows: [8], chimney: 8, seed: 9, upper: false, shutter: [C.u1, C.u2, C.u3] }).pix, 'smithy'),
    c(makeHouse({ w: 86, h: 46, roofH: 30, roof: 'plum', door: 38, windows: [10, 64], upperWindows: [12, 40, 66], chimney: 62, seed: 14, posts: [28, 56], shutter: [C.r1, C.r2, C.r3] }).pix, 'inn'),
  ]);
  section('ruins', [c(makePillar(60, false, 3), 'pillar'), c(makePillar(34, true, 5), 'broken'), c(makePillar(80, false, 8, 14), 'tall'), c(STATUE, 'statue'), c(SHRINE, 'shrine'), ...CRYSTALS.map((p) => c(p, 'cry')), c(makeVine(22, 1), 'vine')]);
  const t = makeTrees();
  section('trees', Object.entries(t).flatMap(([k, arr]) => arr.map((s) => c(s.pix, k))));
}

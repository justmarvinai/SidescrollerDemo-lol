// Overhead sprites for Flamingo Drive: cars, people and street props, all drawn facing
// north and then rotated in software so every angle keeps a crisp one-pixel outline.
import { C } from '../../src/gfx/palette.js';
import { Pix, makeCanvas, ctx2d, silhouette, rng, hash, noise1, clamp } from '../../src/gfx/pixel.js';

// ------------------------------------------------------------------ rotation
// Upscale 4x with Scale2x, sample the rotated grid by majority vote, then ink the outline
// afterwards. Quarter turns are copied exactly so the artwork is untouched at 0/90/180/270.
export function rotSet(pix, n = 32, ink = C.ink) {
  const big = pix.scale2x().scale2x();
  const size = (Math.ceil(Math.hypot(pix.w, pix.h)) | 1) + 4, c = size / 2;
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
    const exact = (k * 4) % n === 0;
    const p = new Pix(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const ox = cs * dx + sn * dy + pix.w / 2, oy = -sn * dx + cs * dy + pix.h / 2;
      if (ox < 0 || oy < 0 || ox >= pix.w || oy >= pix.h) continue;
      const near = pix.d[Math.floor(oy + 1e-6) * pix.w + Math.floor(ox + 1e-6)];
      if (exact) { if (near) p.d[y * size + x] = near; continue; }
      // vote among the four upscaled texels around the sample point; ties keep the original pixel
      const bx = Math.round(ox * 4) - 1, by = Math.round(oy * 4) - 1;
      const v = [big.get(bx, by), big.get(bx + 1, by), big.get(bx, by + 1), big.get(bx + 1, by + 1)];
      let best = near, bc = 1;
      for (let i = 0; i < 4; i++) { let cnt = 0; for (let j = 0; j < 4; j++) if (v[j] === v[i]) cnt++; if (cnt > bc || (cnt === bc && v[i] === near)) { bc = cnt; best = v[i]; } }
      if (bc < 3) best = near;
      if (best) p.d[y * size + x] = best;
    }
    out.push((ink ? p.outline(ink, 'ink', false) : p).toCanvas());
  }
  return { can: out, size, n, half: size >> 1 };
}
export const angleIndex = (a, n) => ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;

// ------------------------------------------------------------------ cars
// Drawn as the left half plus centre column and mirrored. a-d = body ramp, dark to light.
const BODY = [C.s0, C.s1, C.s2, C.s3];
const CL = {
  a: BODY[0], b: BODY[1], c: BODY[2], d: BODY[3],
  g: C.u1, G: C.u3, k: C.n1, m: C.n5, M: C.n6, h: C.y5, r: C.r4, s: C.b3, S: C.b5, x: C.white, y: C.y4,
};
function mirror(rows) {
  const lines = rows.trim().split('\n').map((s) => s.trim());
  const w = lines[0].length * 2 - 1, p = new Pix(w, lines.length);
  lines.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch === '.') continue; p.set(x, y, CL[ch]); p.set(w - 1 - x, y, CL[ch]); } });
  // light falls from the west: lift the left flank a step, drop the right one, streak the glass
  for (let y = 0; y < p.h; y++) for (let x = 0; x < w; x++) {
    const v = p.get(x, y), i = BODY.indexOf(v);
    if (i >= 0) { if (x >= 3 && x <= 4 && i < 3 && i > 0) p.set(x, y, BODY[i + 1]); else if (x >= w - 3 && i > 0) p.set(x, y, BODY[i - 1]); }
    else if (v === C.u3 && x <= 4) p.set(x, y, (x + y) % 3 === 0 ? C.u6 : C.u4);
  }
  return p;
}
const SHAPES = {
  sedan: mirror(`
..mmmmm
.hhbbbb
.bbbccc
kbbcccc
kbbcccc
.bbcccc
.bbbbbb
.bggggg
.bgGGGG
abgGGGG
.bbbccc
.bcccdd
.bcccdd
.bcccdd
.bbbccc
.bggggg
.bgGGGG
.bbbbbb
kbbbccc
kbbbccc
.bbbbbb
.rrbbbb
..mmmmm`),
  coupe: mirror(`
...mmmm
..hbbbb
.hbbccc
.bbcccc
kbbccdd
kbbccdd
.bbccdd
.bbcccc
.bbbbbb
.bggggg
abgGGGG
.bgGGGG
.bcccdd
.bcccdd
.bggggg
.bbbbbb
kbbcccc
kbbcccc
.bbbbbb
aaaaaaa
.rrbbbb
..mmmmm`),
  cabrio: mirror(`
..mmmmm
.hhbbbb
.bbbccc
kbbcccc
kbbcccc
.bbcccc
.bbbbbb
.bggggg
abgGGGG
.bkkkkk
.bsSSsk
.bsSSsk
.bkkkkk
.bsSSSS
.bsSSSS
.bbbbbb
.bbbccc
kbbbccc
kbbbccc
.bbbbbb
.rrbbbb
..mmmmm`),
  van: mirror(`
.mmmmmm
hhbbbbb
bbbcccc
bbggggg
bgGGGGG
bgGGGGG
bbbbbbb
kbccccc
kbcdddd
.bcdddd
.bcdddd
.bcdddd
.bcccdd
.bcdddd
.bcdddd
.bcdddd
.bcdddd
.bcccdd
kbcdddd
kbcdddd
.bccccc
.bbbbbb
.rbbbbb
.mmmmmm`),
};
// driver's head shows in the open-top
SHAPES.cabrio.rect(3, 10, 3, 3, C.b2); SHAPES.cabrio.set(4, 10, C.sk4); SHAPES.cabrio.set(3, 11, C.b3);

export const PAINTS = {
  red: [C.r1, C.r2, C.r3, C.r4], pink: [C.m1, C.m2, C.m3, C.m4], cyan: [C.a2, C.a3, C.a4, C.a5], cream: [C.b5, C.b6, C.b7, C.white],
  purple: [C.p2, C.p3, C.p4, C.p5], yellow: [C.y2, C.y3, C.y4, C.y5], white: [C.n5, C.n6, C.n7, C.white], black: [C.n1, C.n2, C.n3, C.n4],
  teal: [C.t2, C.t3, C.t4, C.t5], blue: [C.u2, C.u3, C.u4, C.u5], orange: [C.y1, C.y2, C.y3, C.y4], green: [C.g2, C.g3, C.g4, C.g5],
};
export const MODELS = {
  sedan: { shape: 'sedan', name: 'Pelican', top: 2.7, acc: 0.055, turn: 0.046, hp: 100, grip: 0.8 },
  coupe: { shape: 'coupe', name: 'Marlin GT', top: 3.5, acc: 0.075, turn: 0.05, hp: 80, grip: 0.84 },
  cabrio: { shape: 'cabrio', name: 'Sunray', top: 3.0, acc: 0.06, turn: 0.048, hp: 90, grip: 0.8 },
  van: { shape: 'van', name: 'Brick', top: 2.3, acc: 0.045, turn: 0.04, hp: 140, grip: 0.78 },
  taxi: { shape: 'sedan', name: 'Dune Cab', top: 2.8, acc: 0.058, turn: 0.047, hp: 100, grip: 0.8, paint: 'yellow' },
  cop: { shape: 'sedan', name: 'Patrol', top: 3.15, acc: 0.07, turn: 0.05, hp: 130, grip: 0.86, paint: 'white' },
};

function carPix(model, paint) {
  const m = MODELS[model], ramp = PAINTS[m.paint || paint] || PAINTS.red;
  const map = {}; BODY.forEach((b, i) => { map[b] = ramp[i]; });
  const p = SHAPES[m.shape].remap(map);
  if (model === 'taxi') { p.rect(5, 11, 3, 3, C.ink); p.set(5, 11, C.white); p.set(7, 11, C.white); p.set(6, 12, C.white); p.set(5, 13, C.white); p.set(7, 13, C.white); }
  if (model === 'cop') {
    // black bonnet and boot, light bar across the roof
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const v = p.get(x, y), i = ramp.indexOf(v); if (i >= 0 && (y < 7 || y > 16)) p.set(x, y, PAINTS.black[Math.max(0, i - 0)]); }
    p.rect(2, 11, 9, 2, C.n2); p.rect(2, 11, 4, 2, C.r3); p.rect(7, 11, 4, 2, C.u4);
  }
  return p;
}
const carCache = new Map();
export function carSprites(model, paint) {
  const key = model + ':' + (MODELS[model].paint || paint);
  let s = carCache.get(key);
  if (!s) {
    const pix = carPix(model, paint), rs = rotSet(pix, 48);
    s = { ...rs, shadow: rs.can.map((c) => silhouette(c, '#120a24')), w: pix.w, l: pix.h };
    carCache.set(key, s);
  }
  return s;
}

// ------------------------------------------------------------------ people (seen from above, facing north)
const PL = (o) => ({ s: C.sk4, h: o.hair[0], H: o.hair[1], t: o.shirt[0], T: o.shirt[1], k: C.n1, g: C.n2, G: C.n6 });
const POSES = {
  idle: `
...........
....sss....
...hHHHh...
..ThHHHhT..
.TThHHHhTT.
.TTthhhtTT.
.tTTTTTTTt.
..ttTTTtt..
...........
...........`,
  walkA: `
...k.......
...k.sss.s.
...hHHHh.T.
..ThHHHhTT.
.TThHHHhTT.
sTTthhhtTT.
.tTTTTTTTt.
..ttTTTtt..
......k....
......k....`,
  walkB: `
.......k...
.s.sss.k...
.T.hHHHh...
.TThHHHhT..
.TThHHHhTT.
.TTthhhtTTs
.tTTTTTTTt.
..ttTTTtt..
....k......
....k......`,
  gun: `
.....G.....
....TgT....
...TsssT...
...hHHHh...
..ThHHHhT..
.TThHHHhTT.
.TTthhhtTT.
.tTTTTTTTt.
..ttTTTtt..
...........`,
  down: `
....sss....
...hHHHh...
s..hHHHh..s
TT.thhht.TT
.TTTTTTTTT.
..TTTTTTT..
..tTTTTTt..
..tt...tt..
..kk...kk..
...........`,
};
export const LOOKS = {
  hero: { hair: [C.b2, C.b4], shirt: [C.m2, C.m3] },
  cop: { hair: [C.u1, C.u2], shirt: [C.u2, C.u3] },
  crew: { hair: [C.n1, C.n2], shirt: [C.p2, C.p4] },
  a: { hair: [C.b1, C.b2], shirt: [C.a3, C.a4] }, b: { hair: [C.y2, C.y4], shirt: [C.n6, C.white] }, c: { hair: [C.r1, C.r2], shirt: [C.y3, C.y4] },
  d: { hair: [C.n2, C.n3], shirt: [C.g3, C.g5] }, e: { hair: [C.b2, C.b3], shirt: [C.r2, C.r4] }, f: { hair: [C.n5, C.n6], shirt: [C.u3, C.u5] },
};
const pedCache = new Map();
export function pedSprites(look) {
  let s = pedCache.get(look);
  if (!s) {
    s = {};
    for (const k in POSES) s[k] = rotSet(Pix.fromArt(POSES[k], PL(LOOKS[look])), 32);
    pedCache.set(look, s);
  }
  return s;
}

// ------------------------------------------------------------------ street furniture (overhead)
const U = { 0: C.ink, 8: C.white };
const ramp = (chars, name) => chars.split('').forEach((ch, i) => { U[ch] = C[name + (i + 1)]; });
ramp('1234567', 'n'); ramp('abcdefg', 'b'); ramp('hijklmn', 'g'); ramp('opqrst', 't'); ramp('ABCDEFG', 'u');
ramp('HIJKLM', 'p'); ramp('NOPQR', 'r'); ramp('STUVWX', 'y'); ramp('uvwxy', 'sk'); ramp('YZz$%', 'm'); ramp('!@#=+*', 'd'); ramp('()<>[]', 'a');
const art = (s, ink = C.ink) => Pix.fromArt(s, U).outline(ink);
const raw = (s) => Pix.fromArt(s, U);

export const PROPS = {
  hydrant: art(`
.Q.
QRQ
PQP
.P.`),
  bin: art(`
.444.
45554
45354
44444
.333.`),
  bench: art(`
dfffffffffd
cdddddddddc
dfffffffffd`, C.b1),
  box: art(`
EFFE
EDDE
EDDE
DDDD`),
  booth: art(`
.>[[[>.
>]88]>.
[8]]8[.
[8]]8[.
>]88]>.
.>[[[>.`, C.a1),
  cone: art(`
.T.
T8T
TTT`),
  tires: art(`
.222..
21112.
212122
211212
.21112
..222.`),
  crate: art(`
eeeeeee
edcdcde
ecdddce
eddcdde
ecdddce
edcdcde
eeeeeee`, C.b1),
  dumpster: art(`
jjjjjjjjjjjj
jkkkkkkkkkkj
jklkkkklkkkj
jkkkkkkkkkkj
jkklkkkkklkj
jkkkkkkkkkkj
iiiiiiiiiiii`),
  pump: art(`
.555.
56865
5RRR5
56665
.555.`),
  lounger: art(`
.888.
8EEE8
8FFF8
8EEE8
8FFF8
8EEE8
8FFF8
.888.`, C.n3),
  planter: art(`
.dddd.
dkllkd
dlmlld
dklmkd
.dddd.`, C.b1),
  cash: art(`
..VV...
.jkkj..
jklVkj.
jkVVlkj
jklVkkj
.jkkkj.`),
  heart: art(`
.Q.Q.
QRQQP
QQQQP
.QQP.
..P..`),
  star: raw(`
...V...
..VWV..
VVWWWVV
.VWWWV.
.VWVWV.
VV...VV`),
  starOff: raw(`
...3...
..3.3..
333.333
.3...3.
.3.3.3.
33...33`),
};

// Palm crown seen from straight above: a star of tapered fronds.
export function palmTop(seed, R = 13) {
  const size = R * 2 + 6, p = new Pix(size, size), c = size / 2, r = rng(seed);
  const n = 9, fronds = [];
  for (let i = 0; i < n; i++) fronds.push({ a: (i / n) * Math.PI * 2 + r.range(-0.18, 0.18), len: R * r.range(0.82, 1.05) });
  fronds.sort((a, b) => (Math.cos(b.a) + Math.sin(b.a)) - (Math.cos(a.a) + Math.sin(a.a)));
  for (const f of fronds) {
    const lit = Math.cos(f.a) + Math.sin(f.a) < -0.1;
    const lo = lit ? C.g4 : C.g3, hi = lit ? C.g6 : C.g4, rib = lit ? C.g3 : C.g2, tip = lit ? C.g7 : C.g5;
    const bend = r.range(-0.25, 0.25);
    for (let s = 0.5; s <= f.len; s += 0.5) {
      const t = s / f.len, a = f.a + bend * t * t;
      const x = c + Math.cos(a) * s, y = c + Math.sin(a) * s;
      const hw = 2.7 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02 + 0.04)), 0.6);
      for (let k = -hw; k <= hw; k += 0.5) {
        if (Math.floor(s) % 3 === 2 && Math.abs(k) > hw - 1.4) continue;
        const qx = Math.round(x - Math.sin(a) * k), qy = Math.round(y + Math.cos(a) * k);
        let col = Math.abs(k) < 0.5 ? rib : (k < 0) === (Math.cos(a) > 0) ? hi : lo;
        if (t > 0.84 && col !== rib) col = tip;
        p.set(qx, qy, col);
      }
    }
  }
  p.disc(c, c, 2.2, C.b3); p.set(Math.round(c) - 1, Math.round(c) - 1, C.b5);
  return p.outline(C.g1, 'ink', false);
}

// Parasol from above.
export function parasol(c1, c2, R = 8) {
  const size = R * 2 + 3, p = new Pix(size, size), c = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
    if (d > R) continue;
    const wedge = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 2 === 0;
    const shade = dx + dy > R * 0.5 ? 0 : dx + dy < -R * 0.5 ? 2 : 1;
    p.set(x, y, (wedge ? c1 : c2)[shade]);
  }
  p.set(Math.floor(c), Math.floor(c), C.n2);
  return p.outline(C.ink, 'ink', false);
}

// Cone of light in front of a car, pre-rotated. Drawn additively into the light map.
export function headlightCones(n = 48, len = 78) {
  const size = len * 2 + 4, c = size / 2, out = [];
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2;
    const can = makeCanvas(size, size), g = ctx2d(can), img = g.createImageData(size, size), d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, dist = Math.hypot(dx, dy);
      if (dist > len || dist < 2) continue;
      let da = Math.atan2(dy, dx) - a;
      while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      const spread = 0.42;
      if (Math.abs(da) > spread) continue;
      const v = Math.pow(1 - dist / len, 1.1) * (1 - Math.pow(Math.abs(da) / spread, 2)) * 4;
      const lo = Math.floor(v), lvl = (lo + (v - lo > (B[((y & 3) << 2) | (x & 3)] + 0.5) / 16 ? 1 : 0)) / 4;
      if (lvl <= 0) continue;
      const i = (y * size + x) * 4;
      d[i] = 255; d[i + 1] = 240; d[i + 2] = 200; d[i + 3] = Math.round(Math.min(1, lvl) * 200);
    }
    g.putImageData(img, 0, 0);
    out.push(can);
  }
  return { can: out, half: size / 2, n };
}

export function gallery(section) {
  const items = [];
  for (const [model, paint] of [['sedan', 'red'], ['sedan', 'cyan'], ['coupe', 'pink'], ['coupe', 'yellow'], ['cabrio', 'cream'], ['cabrio', 'purple'], ['van', 'teal'], ['van', 'white'], ['taxi', ''], ['cop', '']]) {
    const s = carSprites(model, paint);
    items.push({ canvas: s.can[0], label: model }, { canvas: s.can[4], label: '30' }, { canvas: s.can[6], label: '45' });
  }
  section('cars', items);
  const people = [];
  for (const look of ['hero', 'cop', 'crew', 'a', 'b', 'c', 'd']) { const s = pedSprites(look); for (const pose of ['idle', 'walkA', 'gun', 'down']) people.push({ canvas: s[pose].can[pose === 'gun' ? 3 : 0], label: pose === 'idle' ? look : pose[0] }); }
  section('people', people);
  section('props', [...Object.entries(PROPS).map(([k, p]) => ({ canvas: p.toCanvas(), label: k })), { canvas: palmTop(3).toCanvas(), label: 'palm' }, { canvas: palmTop(9, 11).toCanvas(), label: 'palm' },
    { canvas: parasol([C.r2, C.r3, C.r4], [C.n5, C.n7, C.white]).toCanvas(), label: 'parasol' }, { canvas: parasol([C.a2, C.a3, C.a5], [C.y2, C.y4, C.y5]).toCanvas(), label: 'parasol' }]);
}

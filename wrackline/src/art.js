// All top-down (3/4 view) art for Wrackline. Small things are hand-drawn ASCII grids;
// the hut, lighthouse, palms, rocks and pier are painted procedurally.
import { C } from '../../src/gfx/palette.js';
import { Pix, rng, hash, noise1, noise2, bayer, lerp, clamp } from '../../src/gfx/pixel.js';

// One character per palette entry.
// 0 ink | 1-7 greys | 8 white | a-g browns | h-n greens | o-t teals | A-G blues | H-M purples
// N-R reds | S-X yellows | u-y skin | Y Z z $ % pinks | ! @ # = + * sand | ( ) < > [ ] sea
export const U = { 0: C.ink, 8: C.white };
const ramp = (chars, name) => chars.split('').forEach((ch, i) => { U[ch] = C[name + (i + 1)]; });
ramp('1234567', 'n'); ramp('abcdefg', 'b'); ramp('hijklmn', 'g'); ramp('opqrst', 't'); ramp('ABCDEFG', 'u');
ramp('HIJKLM', 'p'); ramp('NOPQR', 'r'); ramp('STUVWX', 'y'); ramp('uvwxy', 'sk'); ramp('YZz$%', 'm');
ramp('!@#=+*', 'd'); ramp('()<>[]', 'a');

const raw = (s) => Pix.fromArt(s, U);
const art = (s, col = C.ink) => raw(s).outline(col);

// ------------------------------------------------------------------ things the tide leaves behind
// value = coins, w = spawn weight, tier = 0 common .. 3 treasure
export const ITEMS = [
  { id: 'cockle', name: 'Cockle', value: 1, w: 30, tier: 0, pix: art(`
..%%%..
.%$%$%.
%$%$%$%
%$%z%$%
.%zzz%.
..ZzZ..`) },
  { id: 'winkle', name: 'Periwinkle', value: 1, w: 24, tier: 0, pix: art(`
..KL..
.KLMK.
KLMLKJ
KLKKJJ
.JJJI.
..II..`) },
  { id: 'scallop', name: 'Scallop', value: 2, w: 20, tier: 0, pix: art(`
..WVWVW..
.WVWVWVW.
WVWVWVWVW
VWVWUWVWV
.VWUUUWV.
..UTTTU..
...TST...`) },
  { id: 'glass', name: 'Sea Glass', value: 3, w: 12, tier: 1, pix: art(`
.]]].
][>>]
]>><>
.><<.
..<..`) },
  { id: 'dollar', name: 'Sand Dollar', value: 4, w: 10, tier: 1, pix: art(`
..7887..
.788887.
78868887
88676788
78686887
.786687.
..7777..`) },
  { id: 'star', name: 'Starfish', value: 6, w: 8, tier: 1, pix: art(`
....T....
....U....
...TUT...
TTUUVUUTT
.TUVVVUT.
..UVUVU..
..UU.UU..
.TU...UT.
.T.....T.`) },
  { id: 'conch', name: 'Conch', value: 9, w: 6, tier: 1, pix: art(`
...$%$....
..$%%%$...
.$%$%$%z..
$%$%$%zzz.
$%%$zzzZZ.
.$$zzZZZY.
..zzZZYY..
...ZYY....`) },
  { id: 'pearl', name: 'Pearl Oyster', value: 18, w: 3, tier: 2, pix: art(`
..555555..
.56676665.
5667886675
5668888665
.56688665.
.45666654.
..444444..`) },
  { id: 'bottle', name: 'Message Bottle', value: 28, w: 2, tier: 2, pix: art(`
..kkkkkkk....
.kllgggllkdd.
kllgg8gglkded
.kllgggllkdd.
..kkkkkkk....`) },
  { id: 'coin', name: 'Old Doubloon', value: 45, w: 1.2, tier: 3, pix: art(`
..UUU..
.UWWVU.
UWXVVVT
UWVUVUT
UVVVUUT
.UVUUT.
..TTT..`) },
  { id: 'crown', name: 'Sunken Crown', value: 120, w: 0.35, tier: 3, pix: art(`
V..V..V..V
VU.VU.VU.V
VVUVVUVVUV
VWVQWVZWVU
UVVVVVVVVT
.TTTTTTTT.`) },
];

// ------------------------------------------------------------------ the beachcomber
// Built from parts so the walk cycle stays on-model in all three facings.
const HAT = raw(`
....WWWWWWWW....
...WVVVVVVVVW...
...VVVVVVVVVV...
...QQQQQQQQQQ...
.WWWWWWWWWWWWWW.
WVVVVVVVVVVVVVVW
.UVVVVVVVVVVVVU.`);
const HAT_SIDE = raw(`
...WWWWWWWW.....
..WVVVVVVVVW....
..VVVVVVVVVV....
..QQQQQQQQQQ....
.WWWWWWWWWWWWWW.
WVVVVVVVVVVVVVVW
.UVVVVVVVVVVVVU.`);
const FACE_FRONT = raw(`
..cUUUUUUUUUUc..
..cxxxxxxxxxxc..
..cx0xxxxxx0xc..
...xzxxxxxxzx...
....xxxxxxxx....`);
const FACE_BACK = raw(`
..cUUUUUUUUUUc..
..cddddddddddc..
..cdcddddddcdc..
...cddddddddc...
....cccccccc....`);
const FACE_SIDE = raw(`
..cUUUUUUUUUU...
..cddxxxxxxxx...
..cddxxxxx0xx...
...cdxxxxxxzx...
....cxxxxxxx....`);
const BODY_FRONT = raw(`
..x8888888x.
..xDDDDDDDx.
..x8888888x.
...BBBBBBB..`);
const BODY_BACK = raw(`
..xeeeeeeex.
..xefefefex.
..xeeeeeeex.
...BdddddB..`);
const BODY_SIDE = raw(`
.ee.88888...
efe.DDxDD...
eee.88x88...
.dd.BBBBB...`);
// legs: [stand, step A, pass, step B]
const LEGS_FRONT = [`
...BB...BB..
...xx...xx..
...dd...dd..`, `
...BB...BB..
...xx...dd..
...dd.......`, `
...BB...BB..
...xx...xx..
...dd...dd..`, `
...BB...BB..
...dd...xx..
........dd..`].map(raw);
const LEGS_SIDE = [`
....BBBB....
....xx.x....
....dd.dd...`, `
....BBBB....
...xx..xx...
..dd....dd..`, `
....BBBB....
.....xx.....
.....ddd....`, `
....BBBB....
...xx..xx...
..dd....dd..`].map(raw);

function heroFrame(dir, step) {
  // dir: 0 down, 1 up, 2 side (facing right). 16 wide, 20 tall before the outline.
  const p = new Pix(18, 22);
  const bob = step === 1 || step === 3 ? 0 : step === 2 ? -1 : 0;
  const legs = (dir === 2 ? LEGS_SIDE : LEGS_FRONT)[step];
  const body = dir === 0 ? BODY_FRONT : dir === 1 ? BODY_BACK : BODY_SIDE;
  const face = dir === 0 ? FACE_FRONT : dir === 1 ? FACE_BACK : FACE_SIDE;
  p.blit(legs, 3, 18);
  p.blit(body, 3, 14 + bob);
  // swinging arms on the front/back views
  if (dir !== 2 && (step === 1 || step === 3)) {
    const lx = step === 1 ? 5 : 13;
    p.set(lx, 17 + bob, C.sk4);
  }
  p.blit(face, 1, 8 + bob);
  p.blit(dir === 2 ? HAT_SIDE : HAT, 1, 2 + bob);
  if (dir === 1) { p.set(8, 5 + bob, C.r2); p.set(9, 5 + bob, C.r2); p.set(8, 6 + bob, C.r3); p.set(10, 6 + bob, C.r3); } // ribbon bow
  return p.outline(C.ink, 'ink', false);
}
export const HERO = { ox: 9, oy: 21, frames: [0, 1, 2].map((d) => [0, 1, 2, 3].map((s) => heroFrame(d, s))) };

// ------------------------------------------------------------------ critters
export const CRAB = [art(`
.8........8.
.0........0.
QQ..QRRQ..QQ
QRQQRRRRQQRQ
.Q.QRRRRQ.Q.
..PQRRRRQP..
.P..PPPP..P.
P..P....P..P`), art(`
.8........8.
.0........0.
QQ..QRRQ..QQ
QRQQRRRRQQRQ
.Q.QRRRRQ.Q.
..PQRRRRQP..
..P.PPPP.P..
.P.P....P.P.`)];

export const GULL = {
  stand: [art(`
...88....
..8808...
..888TT..
.688888..
66666888.
.6666888.
..55688..
...T.T...`), art(`
.........
...88....
..8808...
..888....
.68888T..
6666688T.
.6666888.
...T.T...`)],
  fly: [art(`
5.............5
65...........56
.665...8...566.
..66688888666..
....6888886....
......8T8......`), art(`
......8T8......
...6688888666..
.666.88888.666.
66....888....66
5.............5`)],
};

// ------------------------------------------------------------------ small scenery
export const TUFTS = [raw(`
.m...l..m
.lm..lm.l
kl.l.l.lk
.kklkklk.
..kkkkk..`), raw(`
..m...l
l.lm.lk
klk.lk.
.kkkkk.`), raw(`
m....m...l.
lm..lm..lm.
.l.l.lk.l.k
.kklkkklkk.
..kkkkkkk..`)];
export const FLOWERS = [raw(`
.%z.
z8z%
.zZ.
.k..
.kl.`), raw(`
.WV.
V8VW
.VU.
..k.
.lk.`), raw(`
z.%.
.z8z
%.zZ
.kk.
.lk.`)];
export const PEBBLES = [raw(`
.56.
5665
.44.`), raw(`
.67.
.55.`), raw(`
..566.
.56665
.45554
..444.`), raw(`
.#=.
#==#
.##.`)];
export const SEAWEED = [raw(`
.j..k....
jk.jkj..j
.kjk.kjk.
..j.k..kj
.....j...`), raw(`
k..j.
.kjk.
jk.kj
.j...`)];

export const BUCKET = art(`
..3333333..
.3.......3.
.QQQQQQQQQ.
.QRRRRRQQP.
.QR8RRRQQP.
..QRRRQQP..
..QQQQQPP..
...PPPPP...`);
export const SPADE = art(`
..d.....
..d.....
..d.....
.FFF....
.FGF....
.FFF....
..F.....`);
export const SANDCASTLE = art(`
.....Q.........
.....QQ........
.....6.........
....*+*...*+*..
....+++...+=+..
.*+*+++*+*+=+..
.+++*+++++===..
.+=++0++=+=#=..
*++=+0+==+=##=.
+=+==+===##=##=
.=#==#=###=##=.`, C.d1);
export const DRIFTWOOD = art(`
....ff............ee..
..ffggfffeeffffffeffe.
.fggggfffeeeeffeeeeedd
.eefeeeeddeeeeddddddd.
..ddddd...dddd..dd....`, C.b1);
export const LIFERING = art(`
..Q88Q..
.Q8888Q.
88....88
88....88
.Q8888Q.
..Q88Q..`);
export const SIGNPOST = art(`
.ggggggggggg.
gffffffffffed
gfzZfffWVffed
gfZzfffVUffed
gffffffffffed
.eeeeeeeeeed.
.....ed......
.....ed......
.....ed......
.....ed......`, C.b1);
export const BALL = art(`
..Q88E..
.QQ88EE.
QQQ88EEE
VVV88lll
VVV88lll
.VV88ll.
..V88l..`);
export const CRATE = art(`
eeeeeeeeeeee
ed%ddVdddzde
edddddddd$de
eeeeeeeeeeee
edddceedcddc
eddcddddcedc
eedcddddddcc
ecccccccccdc
cccccccccccc`, C.b1);
export const BOAT = art(`
....eeeeeeeeeeeeeeeeeeee......
..eeFFFFFFFFFFFFFFFFFFFFee....
.eFFEEEEEEEEEEEEEEEEEEEEFFe...
eFEEddddddddddddddddddddEEFee.
eFEdccfffccccccccfffccccdEEFFe
eFEdccfffccccccccfffccccdEEFe.
.eFEdddddddddddddddddddEEFe...
..eFFEEEEEEEEEEEEEEEEEEFFe....
....eeDDDDDDDDDDDDDDDDee......
......dddddddddddddddd........`, C.b1);
export const TOWEL = raw(`
EEEEEEEEEEEEEEEEEE
8888888888888888888
EEEEEEEEEEEEEEEEEE
EFFFFFFFFFFFFFFFFE
EEEEEEEEEEEEEEEEEE
8888888888888888888
EEEEEEEEEEEEEEEEEE
EFFFFFFFFFFFFFFFFE
EEEEEEEEEEEEEEEEEE
8888888888888888888
EEEEEEEEEEEEEEEEEE`.replace(/8888888888888888888/g, '888888888888888888')).outline(C.u1);
export const SURFBOARD = art(`
..VV..
.VVVV.
.VWWV.
VVWWVV
VVWWVV
QQQQQQ
VVWWVV
VVWWVV
VVWWVV
VVWWVV
VVWWVV
QQQQQQ
VVWWVV
VVWWVV
.VWWV.
.VVVV.
..UU..`);
export const POST = art(`
.ff.
feed
eeed
.dd.
.dc.
.dc.
.dc.`, C.b1);

// ------------------------------------------------------------------ procedural props
const STONE = [C.n1, C.n2, C.n3, C.n4, C.n5, C.n6, C.n7];

// A boulder lit from the upper left. `sea` adds a weed skirt for rocks that sit in the water.
export function makeRock(w, h, seed, sea = false) {
  const p = new Pix(w + 2, h + 2), cx = w / 2 + 0.5, cy = h / 2 + 1;
  for (let y = 0; y < h + 2; y++) for (let x = 0; x < w + 2; x++) {
    const dx = (x - cx) / (w / 2), dy = (y - cy) / (h / 2);
    const ang = Math.atan2(dy, dx);
    const r = 1 + (noise1(ang * 1.9 + seed, seed) - 0.5) * 0.36;
    const d = Math.hypot(dx, dy) / r;
    if (d > 1) continue;
    // the upper third reads as the top face, the rest as the front face
    const facet = Math.floor((ang + Math.PI) * 1.6 + noise1(d * 3 + seed, seed + 7) * 1.4);
    let l = -dx * 0.5 - dy * 0.9 + (hash(facet, seed) - 0.5) * 0.5;
    let k = l > 0.55 ? 6 : l > 0.2 ? 5 : l > -0.2 ? 4 : l > -0.55 ? 3 : 2;
    if (d > 0.86 && dy > 0) k = Math.min(k, 2);
    if (hash(x, y, seed) < 0.05) k = Math.max(2, k - 1);
    // cracks along facet seams
    const f2 = Math.floor((ang + Math.PI) * 1.6 + noise1(d * 3 + 0.25 + seed, seed + 7) * 1.4);
    if (f2 !== facet && d > 0.25 && d < 0.9 && hash(facet, 3, seed) < 0.6) k = Math.max(1, k - 2);
    let c = STONE[k];
    if (sea && dy > 0.35 && noise1(x * 0.5, seed + 2) > 0.35) c = dy > 0.7 ? C.g2 : (x + y) % 2 ? C.g3 : C.g4;
    else if (!sea && dy < -0.2 && noise2(x * 0.4, y * 0.4, seed) > 0.75) c = C.n7;
    p.set(x, y, c);
  }
  return p.outline(C.n1, 'ink', false);
}

// Coconut palm; `sway` -1..1 bends the fronds for the wind animation.
export function makePalm(seed, sway = 0) {
  const W = 88, H = 86, p = new Pix(W, H), r = rng(seed);
  const bx = 44, by = H - 2, Ht = 36, lean = r.range(-8, 8);
  const top = [bx + lean, by - Ht];
  // trunk: stacked ring segments
  for (let i = 0; i <= Ht; i++) {
    const t = i / Ht, cx = bx + lean * t * t, y = by - i;
    const hw = lerp(2.6, 1.6, t) + (i < 3 ? (3 - i) * 0.5 : 0);
    for (let dx = -Math.ceil(hw); dx <= Math.ceil(hw); dx++) {
      if (Math.abs(dx) > hw + 0.3) continue;
      const u = (dx + hw) / (hw * 2);
      let c = u < 0.25 ? C.b6 : u < 0.65 ? C.b5 : C.b4;
      if (i % 4 === 0) c = u < 0.25 ? C.b5 : u < 0.65 ? C.b4 : C.b3;
      p.set(Math.round(cx + dx), y, c);
    }
  }
  // fronds are tapered blades with a rib and a serrated edge; far ones go down first
  const n = 8, fronds = [];
  for (let i = 0; i < n; i++) fronds.push({ a: ((i + 0.5) / n) * Math.PI * 2 + r.range(-0.16, 0.16), len: r.range(24, 30), ph: r.range(0, 6) });
  fronds.sort((a, b) => Math.sin(b.a) - Math.sin(a.a));
  for (const f of fronds) {
    const back = Math.sin(f.a) > 0.25, lit = Math.cos(f.a) < 0.3;
    const rib = back ? C.g2 : C.g3, lo = back ? C.g3 : lit ? C.g5 : C.g4, hi = back ? C.g4 : lit ? C.g6 : C.g5, tip = back ? C.g5 : lit ? C.g7 : C.g6;
    const droop = (back ? 5 : 13) + Math.sin(f.ph) * 1.5 + sway * Math.sin(f.a + 1) * 1.6;
    let px = top[0], py = top[1];
    for (let s = 0.5; s <= f.len; s += 0.5) {
      const t = s / f.len;
      const x = top[0] + Math.cos(f.a) * f.len * t + sway * t * t * 2.4;
      const y = top[1] - Math.sin(f.a) * f.len * t * 0.5 - 5 * Math.sin(t * Math.PI) * (back ? 1 : 0.55) + droop * t * t;
      const tx = x - px, ty = y - py, tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
      const hw = 3.3 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04 + 0.03)), 0.6);
      for (let k = -hw; k <= hw; k += 0.5) {
        if (Math.floor(s) % 3 === 2 && Math.abs(k) > hw - 1.7) continue; // notches between leaflets
        const qx = Math.round(x + nx * k), qy = Math.round(y + ny * k);
        let c = Math.abs(k) < 0.5 ? rib : y + ny * k < y - 0.2 ? hi : lo;
        if (t > 0.82 && c !== rib) c = tip;
        p.set(qx, qy, c);
      }
      px = x; py = y;
    }
  }
  // coconuts at the heart
  for (const [ox, oy] of [[-2, 1], [1, 2], [2, -1]]) { p.rect(Math.round(top[0] + ox), Math.round(top[1] + oy), 2, 2, C.b3); p.set(Math.round(top[0] + ox), Math.round(top[1] + oy), C.b5); }
  const out = p.outline(C.g1, 'ink', false);
  // re-ink the trunk outline in brown so it does not go green
  for (let y = Math.round(top[1]) + 8; y < H; y++) for (let x = 0; x < W; x++) if (out.d[y * W + x] === C.g1 && Math.abs(x - bx - lean * Math.pow((by - y) / Ht, 2)) < 6) out.d[y * W + x] = C.b1;
  return { pix: out, ox: bx, oy: by, top: [top[0] - bx, top[1] - by] };
}

// Thatched beach hut that sells supplies. Returns { pix, ox, oy } with oy at the foot of the wall.
export function makeHut() {
  const W = 76, H = 72, p = new Pix(W, H);
  const wallTop = 34, wallBot = 66, x0 = 8, x1 = 67;
  // whitewashed plank wall
  for (let y = wallTop; y <= wallBot; y++) for (let x = x0; x <= x1; x++) {
    const seam = (x - x0) % 6 === 5;
    let c = seam ? C.n5 : (x - x0) % 6 === 0 ? C.white : C.n7;
    if (y - wallTop < 5) c = seam ? C.n4 : y - wallTop < 3 ? C.n5 : C.n6;
    if (hash(x, y, 3) < 0.025) c = C.n6;
    if (y > wallBot - 2) c = seam ? C.n4 : C.n5;
    p.set(x, y, c);
  }
  // teal trim: corner posts and a skirting board
  for (let y = wallTop; y <= wallBot; y++) { p.set(x0, y, C.t4); p.set(x0 + 1, y, C.t3); p.set(x1, y, C.t3); p.set(x1 - 1, y, C.t4); }
  for (let x = x0; x <= x1; x++) { p.set(x, wallBot, C.t2); p.set(x, wallBot - 1, C.t3); }
  // serving hatch with shelves inside
  const hx0 = 14, hx1 = 46, hy0 = 40, hy1 = 54;
  for (let y = hy0; y <= hy1; y++) for (let x = hx0; x <= hx1; x++) p.set(x, y, y < hy0 + 2 ? C.ink : C.b1);
  for (let x = hx0 + 1; x < hx1; x++) p.set(x, hy0 + 7, C.b3);
  const jar = (x, y, c1, c2) => { p.rect(x, y, 3, 4, c1); p.set(x, y, c2); p.set(x + 1, y - 1, C.b6); };
  jar(17, 43, C.m3, C.m5); jar(22, 43, C.y3, C.y5); jar(27, 43, C.a4, C.a6); jar(32, 43, C.p4, C.p6); jar(38, 43, C.r4, C.m4);
  p.rect(41, 48, 4, 6, C.y4); p.set(42, 49, C.y6); p.set(42, 47, C.n3); // lantern
  for (let x = hx0 - 1; x <= hx1 + 1; x++) { p.set(x, hy0 - 1, C.t4); p.set(x, hy1 + 1, C.b6); p.set(x, hy1 + 2, C.b5); p.set(x, hy1 + 3, C.b3); }
  for (let y = hy0; y <= hy1; y++) { p.set(hx0 - 1, y, C.t4); p.set(hx1 + 1, y, C.t3); }
  // a few shells displayed on the counter
  [[18, C.m4], [24, C.y4], [30, C.m5], [36, C.p5]].forEach(([x, c]) => { p.set(x, hy1, c); p.set(x + 1, hy1, c); p.set(x, hy1 - 1, C.white); });
  // door
  for (let y = 44; y <= wallBot - 1; y++) for (let x = 52; x <= 62; x++) {
    let c = x === 52 || x === 62 ? C.t2 : (x - 52) % 4 === 0 ? C.t3 : C.t4;
    if (y === 44) c = C.t2;
    p.set(x, y, c);
  }
  p.rect(55, 47, 5, 5, C.u2); p.set(55, 47, C.u5); p.set(56, 47, C.u4); p.set(60, 56, C.y4);
  // striped awning over the hatch, with a scalloped hem and the shadow it throws
  for (let j = 0; j < 9; j++) {
    const y = 31 + j, ext = Math.round(j * 0.6);
    for (let x = hx0 - 4 - ext; x <= hx1 + 4 + ext; x++) {
      const stripe = Math.floor((x - hx0 + 40 + j * 0.0) / 5) % 2 === 0;
      let c = stripe ? (j < 2 ? C.r5 : j > 6 ? C.r3 : C.r4) : j < 2 ? C.white : j > 6 ? C.n6 : C.n7;
      if (j === 8 && (x - hx0 + 40) % 5 === 4) continue;
      p.set(x, y, c);
    }
  }
  for (let x = hx0 - 8; x <= hx1 + 8; x++) for (let k = 0; k < 2; k++) {
    const y = 40 + k, cur = p.get(x, y);
    if (cur === C.n7 || cur === C.white) p.set(x, y, C.n5); else if (cur === C.b1) p.set(x, y, C.ink);
  }
  // thatched roof
  for (let j = 0; j <= 30; j++) {
    const y = 3 + j, t = j / 30;
    const l = Math.round(lerp(18, 2, t)), rr = Math.round(lerp(57, 73, t));
    for (let x = l; x <= rr; x++) {
      const strand = hash(x + Math.round(Math.sin(y * 0.4 + x) * 0.6), 0, 11);
      let c = strand < 0.22 ? C.y3 : strand < 0.93 ? C.y4 : C.y5;
      const row = j % 8;
      if (row === 7) c = C.b5; else if (row === 0 && j > 0 && strand > 0.35) c = C.y5; else if (row === 6 && strand < 0.5) c = C.y3;
      if (x > rr - 7 && c !== C.b5) c = c === C.y5 ? C.y4 : c === C.y4 ? C.y3 : C.b6;
      if (j === 30 && hash(x, 5) < 0.45) continue; // ragged eave
      if (j < 3) c = j === 0 ? C.b6 : C.b5;
      p.set(x, y, c);
    }
  }
  // sign board on the ridge
  p.rect(28, 0, 20, 9, C.b5); for (let x = 28; x < 48; x++) { p.set(x, 0, C.b6); p.set(x, 8, C.b3); }
  p.set(28, 0, 0); p.set(47, 0, 0);
  const shell = ['..%%%..', '.%$%$%.', '%$%$%$%', '.%zzz%.', '..ZZZ..'];
  shell.forEach((row, yy) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') p.set(34 + i, 2 + yy, U[row[i]]); });
  return { pix: p.outline(C.ink, 'ink', false), ox: 38, oy: wallBot + 1, hatch: [30 - 38, 0] };
}

// The lighthouse. lit = lamp burning.
export function makeLighthouse(lit) {
  const W = 60, H = 118, p = new Pix(W, H), cx = 30;
  const base = H - 14, topY = 34;
  // tower
  for (let y = topY; y <= base; y++) {
    const t = (y - topY) / (base - topY), hw = lerp(8, 13, t);
    const band = Math.floor((y - topY) / 13) % 2 === 0;
    for (let dx = -Math.round(hw); dx <= Math.round(hw); dx++) {
      const u = (dx + hw) / (hw * 2);
      let lv = u < 0.14 ? 3 : u < 0.5 ? 2 : u < 0.8 ? 1 : 0;
      const edge = u < 0.14 ? (0.14 - u) / 0.14 : u < 0.5 ? (0.5 - u) / 0.36 : u < 0.8 ? (0.8 - u) / 0.3 : 1;
      if (lv < 3 && edge > 0.75 && bayer(cx + dx, y) > 0.5) lv++;
      const red = [C.r1, C.r2, C.r3, C.r4], white = [C.n4, C.n6, C.n7, C.white];
      p.set(cx + dx, y, (band ? red : white)[lv]);
    }
    if ((y - topY) % 13 === 12) for (let dx = -Math.round(hw); dx <= Math.round(hw); dx++) p.set(cx + dx, y, band ? C.r1 : C.n4);
  }
  // windows and door
  const win = (y) => { p.rect(cx - 2, y, 4, 6, C.u1); p.set(cx - 2, y, C.n3); p.set(cx + 1, y, C.n3); p.rect(cx - 1, y + 1, 1, 2, lit ? C.y5 : C.u4); };
  win(topY + 17); win(topY + 43);
  for (let y = base - 11; y <= base; y++) for (let dx = -3; dx <= 3; dx++) { if (y === base - 11 && Math.abs(dx) === 3) continue; p.set(cx + dx, y, dx === -3 || dx === 3 ? C.b2 : dx === 0 ? C.b2 : C.b4); }
  p.set(cx + 2, base - 5, C.y4);
  // gallery deck and railing
  for (let dx = -12; dx <= 12; dx++) { p.set(cx + dx, topY - 1, C.n3); p.set(cx + dx, topY - 2, dx < -6 ? C.n5 : C.n4); p.set(cx + dx, topY, C.n2); }
  for (let dx = -12; dx <= 12; dx += 3) for (let k = 3; k <= 6; k++) p.set(cx + dx, topY - k, C.n3);
  for (let dx = -12; dx <= 12; dx++) p.set(cx + dx, topY - 7, C.n4);
  // lantern room
  for (let y = topY - 17; y <= topY - 3; y++) for (let dx = -6; dx <= 6; dx++) {
    const mull = dx === -6 || dx === 6 || dx === -2 || dx === 2;
    let c;
    if (lit) c = mull ? C.y2 : Math.abs(dx) < 2 ? C.white : C.y5;
    else c = mull ? C.n2 : dx < -2 ? C.u4 : dx < 2 ? C.u3 : C.u2;
    if (!lit && !mull && (dx + y) % 7 === 0) c = C.u5;
    if (p.get(cx + dx, y) === C.n3 || p.get(cx + dx, y) === C.n4) continue; // keep the railing in front
    p.set(cx + dx, y, c);
  }
  // dome and finial
  for (let j = 0; j < 8; j++) {
    const hw = Math.round(Math.sqrt(1 - Math.pow((7 - j) / 8, 2)) * 8);
    for (let dx = -hw; dx <= hw; dx++) p.set(cx + dx, topY - 25 + j, dx < -hw * 0.4 ? C.r4 : dx < hw * 0.4 ? C.r3 : C.r2);
  }
  for (let dx = -8; dx <= 8; dx++) p.set(cx + dx, topY - 17, C.r1);
  p.rect(cx - 1, topY - 28, 2, 3, C.n3); p.set(cx - 1, topY - 30, C.y4); p.set(cx, topY - 30, C.y3); p.set(cx - 1, topY - 29, C.y4); p.set(cx, topY - 29, C.y3);
  const out = p.outline(C.ink, 'ink', false);
  return { pix: out, ox: cx, oy: base + 1, lamp: [0, topY - 10 - (base + 1)] };
}

// Wooden pier running south into the sea. Returns Pix with (ox, 0) at the top centre.
export function makePier(len) {
  const w = 22, tw = 40, th = 16, W = tw + 2, H = len + th + 2, p = new Pix(W, H), cx = W >> 1;
  const plank = (x0, x1, y) => {
    const b = Math.floor(y / 4), row = y % 4;
    for (let x = x0; x <= x1; x++) {
      const v = hash(b, 0, 21);
      let c = v < 0.3 ? C.b5 : v < 0.75 ? C.b6 : C.d4;
      if (row === 3) c = C.b3; else if (row === 0) c = v < 0.3 ? C.b6 : C.d5;
      if (hash(x, b, 22) < 0.07 && row === 1) c = C.b5;
      if ((x === x0 + 2 || x === x1 - 2) && row === 1) c = C.n3;
      if (x === x0 || x === x1) c = C.b3;
      if ((hash(b, 1, 23) * (x1 - x0) | 0) + x0 === x && row < 3) c = C.b4; // board joint
      p.set(x, y, c);
    }
  };
  for (let y = 0; y < len; y++) plank(cx - (w >> 1), cx + (w >> 1) - 1, y);
  for (let y = len; y < len + th; y++) plank(cx - (tw >> 1), cx + (tw >> 1) - 1, y);
  return { pix: p.outline(C.b1, 'ink', false), ox: cx + 0, w, tw, th };
}

export function makeUmbrella() {
  const W = 34, H = 34, p = new Pix(W, H), cx = 17, cy = 11;
  // pole and its foot in the sand
  for (let y = cy; y < H - 2; y++) { p.set(cx, y, C.n6); p.set(cx + 1, y, C.n4); }
  // canopy: an ellipse split into coloured wedges
  for (let y = 0; y < 24; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / 16, dy = (y - cy) / 10;
    const d = Math.hypot(dx, dy);
    if (d > 1) continue;
    const ang = Math.atan2(dy * 1.25, dx) + Math.PI;
    const wedge = Math.floor((ang / (Math.PI * 2)) * 8 + 0.5) % 2 === 0;
    const front = dy > 0.15;
    let c = wedge ? (front ? C.r3 : dy < -0.4 ? C.r5 : C.r4) : front ? C.n6 : dy < -0.4 ? C.white : C.n7;
    if (d > 0.9) c = wedge ? C.r2 : C.n5;
    p.set(x, y, c);
  }
  p.set(cx, cy - 1, C.y4); p.set(cx + 1, cy - 1, C.y3); p.set(cx, cy, C.y3);
  return { pix: p.outline(C.ink, 'ink', false), ox: cx, oy: H - 2 };
}

// Rock-rimmed pool left by the tide.
export function makeTidePool(seed) {
  const W = 40, H = 26, p = new Pix(W, H), cx = 20, cy = 13;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / 17, dy = (y - cy) / 10, ang = Math.atan2(dy, dx);
    const d = Math.hypot(dx, dy) / (1 + (noise1(ang * 2.2, seed) - 0.5) * 0.3);
    if (d > 1) continue;
    let c;
    if (d > 0.72) {
      const k = Math.floor(ang * 2.6 + seed);
      const l = -dx * 0.5 - dy * 0.8 + (hash(k, seed) - 0.5) * 0.5;
      c = l > 0.3 ? C.n6 : l > -0.1 ? C.n5 : l > -0.5 ? C.n4 : C.n3;
      if (Math.abs((ang * 2.6 + seed) % 1) < 0.14) c = C.n2;
    } else if (d > 0.62) c = dy < 0 ? C.a1 : C.a5;
    else c = d > 0.4 ? C.a3 : C.a2;
    p.set(x, y, c);
  }
  // life in the pool
  [[-6, -2, C.m3], [5, 2, C.y3], [-1, 3, C.m4], [8, -3, C.p5]].forEach(([ox, oy, c]) => { p.set(cx + ox, cy + oy, c); p.set(cx + ox + 1, cy + oy, c); p.set(cx + ox, cy + oy - 1, C.white); });
  p.set(cx - 3, cy - 4, C.a6); p.set(cx - 2, cy - 4, C.a6); p.set(cx + 6, cy + 4, C.a5);
  return { pix: p.outline(C.n1, 'ink', false), ox: cx, oy: H - 3 };
}

// ------------------------------------------------------------------ icons (9x9) for the shop & HUD
const icon = (s) => art(s);
export const ICONS = {
  reach: icon(`
........e
.......e.
......e..
.....e...
3.3.e....
3333.....
3.3.3....
3...3....
.........`),
  basket: icon(`
..eeeee..
.e.....e.
effffffe.
efefefee.
effffffe.
.efefee..
.eeeeee..`),
  speed: icon(`
....ee...
...effe..
..efffe..
.effdfe..
efffdfe..
efffffe..
.eeeee...`),
  tide: icon(`
...[[....
..[]][...
.[]..][..
[>....>[.
>>>[[>>>[
<>>>><>>>
<<<<<<<<<`),
  luck: icon(`
...VV....
..VWWV...
VVVWWVVV.
VWWWWWWV.
.VWWWWV..
.VWVVWV..
VVV..VVV.`),
  crab: icon(`
8......8.
0......0.
QQ.QQ.QQ.
QRQRRQRQ.
.QRRRRQ..
.P.PP.P..`),
  lamp: icon(`
...QQ....
..QRRQ...
..VXXV...
..VXXV...
.333333..
..8QQ8...
..8QQ8...
..QQQQ...
.555555..`),
  coin: icon(`
..%%%..
.%$%$%.
%$%$%$%
%$%z%$%
.%zzz%.
..ZzZ..`),
};

// ------------------------------------------------------------------ gallery hook
export function gallery(section) {
  const c = (p, label) => ({ canvas: p.toCanvas(), label });
  section('finds', ITEMS.map((it) => c(it.pix, it.id)));
  section('beachcomber', HERO.frames.flatMap((dir, d) => dir.map((f, i) => c(f, 'dw'[d] ?? 's' + i))));
  section('critters', [...CRAB.map((p) => c(p, 'crab')), ...GULL.stand.map((p) => c(p, 'gull')), ...GULL.fly.map((p) => c(p, 'fly'))]);
  section('small', [...TUFTS.map((p) => c(p, 't')), ...FLOWERS.map((p) => c(p, 'f')), ...PEBBLES.map((p) => c(p, 'p')), ...SEAWEED.map((p) => c(p, 'w')),
    c(BUCKET, 'bucket'), c(SPADE, 'spade'), c(SANDCASTLE, 'castle'), c(DRIFTWOOD, 'driftwood'), c(LIFERING, 'ring'), c(SIGNPOST, 'sign'), c(BALL, 'ball'), c(CRATE, 'crate'), c(BOAT, 'boat'), c(TOWEL, 'towel'), c(SURFBOARD, 'board'), c(POST, 'post')]);
  section('icons', Object.entries(ICONS).map(([k, p]) => c(p, k)));
  section('rocks', [c(makeRock(26, 18, 1), 'r'), c(makeRock(16, 12, 2), 'r'), c(makeRock(34, 24, 3), 'r'), c(makeRock(22, 16, 4, true), 'sea'), c(makeRock(12, 9, 5), 'r'), c(makeTidePool(3).pix, 'pool')]);
  section('big', [c(makeHut().pix, 'hut'), c(makeUmbrella().pix, 'umbrella'), c(makePalm(3, 0).pix, 'palm'), c(makePalm(8, 1).pix, 'palm'), c(makeLighthouse(false).pix, 'dark'), c(makeLighthouse(true).pix, 'lit'), c(makePier(60).pix, 'pier')]);
}

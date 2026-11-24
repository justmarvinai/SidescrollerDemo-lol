// The hero, Wren the lamplighter. Head, torso, boots and sword are hand-drawn;
// limbs are posed with a tiny 2-bone IK rig so every animation stays on-model.
import { C } from './palette.js';
import { Pix } from './pixel.js';

const L = {
  d: C.r1, h: C.r2, H: C.r3, L: C.r4, l: C.r5,
  s: C.sk4, S: C.sk3, w: C.sk5, e: C.ink, q: C.sk2,
  y: C.y4, Y: C.y3,
  b: C.b3, B: C.b4, C: C.b5, n: C.n2, k: C.ink,
  W: C.white, V: C.u6, v: C.u5, g: C.y4, G: C.b4, p: C.y3,
  t: C.u2, T: C.u3, U: C.u4, c: C.b3, m: C.m3,
};

const HEAD = Pix.fromArt(`
....hHHHHh..
..hHHLLLllh.
.hHHLLLLLllh
.hHHLLLLLLLh
hHHHdddddddL
hHHdYyyyyysL
hHHdyysssssL
hhHdysesseSL
.hHdSsesseSh
.hhHdmsssmh.
..hhHddddh..`, L);

const HEAD_BLINK = Pix.fromArt(`
....hHHHHh..
..hHHLLLllh.
.hHHLLLLLllh
.hHHLLLLLLLh
hHHHdddddddL
hHHdYyyyyysL
hHHdyysssssL
hhHdyssssssL
.hHdSsqssqSh
.hhHdssssSh.
..hhHddddh..`, L);

const HEAD_HURT = Pix.fromArt(`
....hHHHHh..
..hHHLLLllh.
.hHHLLLLLllh
.hHHLLLLLLLh
hHHHdddddddL
hHHdYyyyyysL
hHHdyysssssL
hhHdyeesseeL
.hHdSsssssSh
.hhHdsseeSh.
..hhHddddh..`, L);

const TORSO = Pix.fromArt(`
.hHLLLh.
hHLLLLLh
hhHLLLHh
.tTTUTt.
.tTTUTt.
.cccycc.
.tTTTTt.`, L);

const BOOT = Pix.fromArt(`
BB..
BBBC
bbbb`, L);
const BOOT_BACK = BOOT.remap({ [C.b4]: C.b3, [C.b5]: C.b4, [C.b3]: C.b2 });

// sword pointing right; pivot = hand
const SW0 = Pix.fromArt(`
...g...........
.GGgWWWWWWWWWW.
pGGgVVVVVVVVVv.
...g...........`, L);
const SW45 = Pix.fromArt(`
..........WW
.........WV.
........WV..
.......WV...
......WV....
.....WV.....
.g..WV......
..gWV.......
..GGg.......
.GG..g......
pp..........`, L);

// 8 sword directions (0 = right, counter-clockwise, 45 degree steps) with hand pivots
function swordSet() {
  const a = { s: SW0, px: 1, py: 1 };
  const b = { s: SW45, px: 2, py: 8 };
  const fh = (o) => ({ s: o.s.flipH(), px: o.s.w - 1 - o.px, py: o.py });
  const fv = (o) => ({ s: o.s.flipV(), px: o.px, py: o.s.h - 1 - o.py });
  const tr = (o) => ({ s: o.s.transpose(), px: o.py, py: o.px });
  return [a, b, fv(tr(a)), fh(b), fh(a), fv(fh(b)), tr(a), fv(b)];
}
const SWORDS = swordSet();
// unit vectors for each direction (tip offset from the hand)
const SW_VEC = [[13, 0], [9, -9], [0, -13], [-9, -9], [-13, 0], [-9, 9], [0, 13], [9, 9]];

export const HERO = { W: 48, H: 42, OX: 24, OY: 38 };

function ik(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.05;
  if (d > max) d = max;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / Math.hypot(dx, dy || 0.001), uy = dy / Math.hypot(dx || 0.001, dy);
  return [ax + ux * a - uy * hgt * bend, ay + uy * a + ux * hgt * bend];
}

// draws `part` then rims it with `rim` wherever it sits on top of existing pixels
function layer(dst, part, rim) {
  const { w, h } = dst;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (part.d[y * w + x]) continue;
      if (!dst.d[y * w + x]) continue;
      if (part.get(x - 1, y) || part.get(x + 1, y) || part.get(x, y - 1) || part.get(x, y + 1)) dst.d[y * w + x] = rim;
    }
  dst.blit(part, 0, 0);
}

function leg(p, hx, hy, ax, ay, back, toeDown) {
  const tmp = new Pix(p.w, p.h);
  const [kx, ky] = ik(hx, hy, ax, ay, 2.6, 2.6, -1);
  const col = back ? C.b5 : C.b6;
  tmp.line(hx, hy, kx, ky, col, 2);
  tmp.line(hx - 1, hy, kx - 1, ky, col, 2);
  tmp.line(kx, ky, ax, ay, col, 2);
  if (!back) { tmp.setOn(Math.round(kx) + 1, Math.round(ky), C.b7); tmp.setOn(Math.round(hx) + 1, Math.round(hy) + 1, C.b7); }
  const boot = back ? BOOT_BACK : BOOT;
  if (toeDown) tmp.blit(boot.transpose(), Math.round(ax) - 1, Math.round(ay) - 1);
  else tmp.blit(boot, Math.round(ax) - 1, Math.round(ay));
  if (back) p.blit(tmp, 0, 0); else layer(p, tmp, C.ink);
}

function arm(p, sx, sy, hx, hy, back, bend = 1) {
  const tmp = new Pix(p.w, p.h);
  const [ex, ey] = ik(sx, sy, hx, hy, 2.7, 2.7, bend);
  const col = back ? C.n5 : C.n7;
  tmp.line(sx, sy, ex, ey, col, 2);
  tmp.line(ex, ey, hx, hy, col, 2);
  if (!back) tmp.setOn(Math.round(ex), Math.round(ey) + 1, C.n6), tmp.setOn(Math.round(ex) + 1, Math.round(ey) + 1, C.n6);
  tmp.rect(Math.round(hx), Math.round(hy), 2, 2, back ? C.sk3 : C.sk4);
  if (!back) tmp.set(Math.round(hx), Math.round(hy), C.sk5);
  if (back) p.blit(tmp, 0, 0); else layer(p, tmp, C.n3);
}

function sword(p, dir, hx, hy, behind) {
  const s = SWORDS[dir];
  const tmp = new Pix(p.w, p.h);
  tmp.blit(s.s, Math.round(hx) - s.px, Math.round(hy) - s.py);
  if (behind) p.blit(tmp, 0, 0); else layer(p, tmp, C.ink);
}

// Pose description -> finished, outlined frame
// o: { by, lean, hx, hy, head, legF:[x,lift,toe], legB, armF:[dx,dy,bend], armB, sw:dir, swBack }
function pose(o) {
  const p = new Pix(HERO.W, HERO.H);
  const gx = HERO.OX, gy = HERO.OY;
  const hipX = gx + (o.bx || 0), hipY = gy - 7 + (o.by || 0);
  const lean = o.lean || 0;
  const shX = hipX + lean, shY = hipY - 4;
  const aB = o.armB || [-1, 4];
  const aF = o.armF || [1, 4];
  const lF = o.legF || [1, 0], lB = o.legB || [-2, 0];

  const handB = [shX - 1 + aB[0], shY + aB[1]];
  const handF = [shX + aF[0], shY + aF[1]];
  if (o.sw !== undefined && o.swBack) sword(p, o.sw, handF[0], handF[1], true);
  arm(p, shX - 1, shY, handB[0], handB[1], true, aB[2] || 1);
  leg(p, hipX - 1, hipY, gx + lB[0], gy - 3 + (lB[1] || 0), true, lB[2]);
  leg(p, hipX + 1, hipY, gx + lF[0], gy - 3 + (lF[1] || 0), false, lF[2]);

  // little belt lantern on the back hip
  const lx = hipX + lean - 5 + (o.lan || 0), ly = hipY - 1;
  p.rect(lx, ly - 1, 2, 1, C.n3);
  p.rect(lx, ly, 2, 2, C.y4); p.set(lx, ly, C.y6); p.set(lx + 1, ly + 1, C.y3);

  const torso = new Pix(p.w, p.h);
  torso.blit(TORSO, hipX + lean - 4, hipY - 6);
  layer(p, torso, C.ink);
  const head = new Pix(p.w, p.h);
  head.blit(o.head || HEAD, hipX + lean + (o.hx || 0) - 5, hipY - 16 + (o.hy || 0));
  layer(p, head, C.r1);

  if (o.sw !== undefined && !o.swBack) sword(p, o.sw, handF[0], handF[1], false);
  arm(p, shX, shY, handF[0], handF[1], false, aF[2] || 1);

  const out = p.outline(C.ink, 'ink', false);
  const v = SW_VEC[o.sw || 0];
  return {
    pix: out,
    neck: [hipX + lean - 4 - gx, hipY - 6 - gy],
    hand: [handF[0] - gx, handF[1] - gy],
    tip: [handF[0] + v[0] - gx, handF[1] + v[1] - gy],
    lantern: [lx - gx, ly + 1 - gy],
  };
}

function build() {
  const A = {};
  // --- idle: slow breath
  A.idle = [0, 1, 2, 3].map((i) => pose({
    by: i >= 2 ? 1 : 0, hy: i === 1 ? 1 : 0,
    armF: [2, 4 + (i === 3 ? 0 : 0)], armB: [-1, 4], sw: 1,
    legF: [2, 0], legB: [-2, 0], lan: i === 1 || i === 2 ? 0 : 0,
  }));
  A.blink = [pose({ armF: [2, 4], armB: [-1, 4], sw: 1, legF: [2, 0], legB: [-2, 0], head: HEAD_BLINK })];

  // --- run: 8 frame cycle
  const foot = (ph) => {
    ph = ((ph % 1) + 1) % 1;
    if (ph < 0.5) return [5 - 20 * ph * 1.0, 0, false];
    const t = (ph - 0.5) * 2;
    return [-5 + 10 * t, -Math.round(Math.sin(Math.PI * t) * 3 + (t < 0.6 ? 1 : 0)), t < 0.45];
  };
  A.run = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8;
    const f = foot(ph), b = foot(ph + 0.5);
    const bob = [0, 1, 0, -1, 0, 1, 0, -1][i];
    const sw = Math.sin(ph * Math.PI * 2);
    A.run.push(pose({
      by: bob, lean: 1, hx: 1,
      legF: [Math.round(f[0]), f[1], f[2]], legB: [Math.round(b[0]) - 1, b[1], b[2]],
      armF: [-2 + Math.round(-sw * 1), 3, 1], armB: [2 + Math.round(sw * 2), 3, -1],
      sw: 4, swBack: false, lan: Math.round(-sw),
    }));
  }

  // --- air
  A.jump = [pose({ lean: 0, hy: -1, legF: [2, -3], legB: [-3, -1, true], armF: [-2, 2], armB: [3, -2, -1], sw: 5 })];
  A.fall = [pose({ lean: 0, hy: 0, legF: [3, -1], legB: [-3, -2, true], armF: [-1, -3, -1], armB: [3, -3, -1], sw: 3 })];

  // --- three-hit combo
  A.atk1 = [
    pose({ lean: -1, armF: [-2, -4, -1], armB: [2, 3, -1], sw: 3, legF: [3, 0], legB: [-3, 0] }),
    pose({ lean: 2, hx: 1, armF: [5, 0], armB: [-3, 2], sw: 0, legF: [5, 0], legB: [-4, 0], by: 1 }),
    pose({ lean: 2, hx: 1, armF: [4, 3], armB: [-3, 2], sw: 7, legF: [5, 0], legB: [-4, 0], by: 1 }),
  ];
  A.atk2 = [
    pose({ lean: 1, armF: [3, 4], armB: [-2, 3], sw: 7, legF: [4, 0], legB: [-3, 0], by: 1 }),
    pose({ lean: 2, hx: 1, armF: [5, -1], armB: [-3, 2], sw: 1, legF: [5, 0], legB: [-4, 0] }),
    pose({ lean: 1, armF: [1, -5, -1], armB: [-2, 3], sw: 2, legF: [4, 0], legB: [-3, 0] }),
  ];
  A.atk3 = [
    pose({ lean: -2, hx: -1, armF: [-4, 1, -1], armB: [3, 2, -1], sw: 0, legF: [2, 0], legB: [-4, 0], by: 1 }),
    pose({ lean: 3, hx: 1, armF: [6, 0], armB: [-4, 1], sw: 0, legF: [6, 0], legB: [-6, 0], by: 2 }),
    pose({ lean: 3, hx: 1, armF: [5, 1], armB: [-4, 2], sw: 0, legF: [6, 0], legB: [-5, 0], by: 2 }),
  ];

  // --- misc
  A.dash = [pose({ by: 2, lean: 3, hx: 2, hy: 2, legF: [3, 0], legB: [-7, -1, true], armF: [-4, 2, 1], armB: [-5, 1, 1], sw: 4, swBack: true })];
  A.hurt = [pose({ lean: -2, hx: -1, hy: -1, head: HEAD_HURT, legF: [3, -1], legB: [-2, 0], armF: [3, -2, -1], armB: [-4, -1], sw: 2 })];
  A.cast = [
    pose({ lean: 0, armF: [3, -3, -1], armB: [-1, 4], sw: 2, legF: [3, 0], legB: [-3, 0] }),
    pose({ lean: 2, hx: 1, armF: [6, -1], armB: [-2, 3], sw: 1, legF: [4, 0], legB: [-4, 0], by: 1 }),
  ];
  A.kneel = [pose({ by: 3, lean: 1, hx: 1, hy: 3, head: HEAD_BLINK, legF: [4, 0], legB: [-4, 0], armF: [3, 3], armB: [-1, 3], sw: 6 })];
  return A;
}

// name -> [{ pix, neck, hand, tip, lantern }]
export const HERO_FRAMES = build();

// Crescent-shaped sword smears. Returns Pix drawn around a pivot at its centre.
export function slashArc(r, a0, a1, thick = 5) {
  const size = r * 2 + 6, cx = size / 2, cy = size / 2;
  const p = new Pix(size, size);
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), dir = a1 > a0 ? 1 : -1;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      let ang = Math.atan2(-dy, dx);
      // unwrap into [lo, lo + 2pi)
      while (ang < lo) ang += Math.PI * 2;
      while (ang >= lo + Math.PI * 2) ang -= Math.PI * 2;
      if (ang > hi) continue;
      let t = (ang - lo) / (hi - lo);       // 0..1 along the sweep
      if (dir < 0) t = 1 - t;                // t = 1 at the leading edge
      const d = Math.hypot(dx, dy);
      const w = thick * Math.pow(t, 0.75);   // tail tapers to nothing
      const inner = r - w;
      if (d > r || d < inner) continue;
      const edge = (r - d) / Math.max(0.001, w); // 0 outer rim .. 1 inner
      let col = C.u5;
      if (edge < 0.3 && t > 0.2) col = C.white;
      else if (edge < 0.62 && t > 0.4) col = C.u7;
      else if (t > 0.55) col = C.u6;
      if (t < 0.3 && ((x + y) & 1)) continue;   // dithered tail
      p.set(x, y, col);
    }
  return p;
}

export function gallery(section) {
  const items = [];
  for (const [name, frames] of Object.entries(HERO_FRAMES))
    frames.forEach((f, i) => items.push({ canvas: f.pix.toCanvas(), label: name + i }));
  section('hero', items);
  section('slash', [
    { canvas: slashArc(17, 2.2, -0.5).toCanvas(), label: 'arc1' },
    { canvas: slashArc(17, -1.0, 1.8).toCanvas(), label: 'arc2' },
    { canvas: slashArc(20, 0.9, -0.9, 6).toCanvas(), label: 'arc3' },
  ]);
}

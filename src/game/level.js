// World layout: collision tiles plus everything that gets placed on them.
import { rng, clamp } from '../gfx/pixel.js';

export const T = 16, LW = 240, LH = 14;
export const WORLD_W = LW * T, WORLD_H = LH * T;
export const EMPTY = 0, EARTH = 1, STONE = 2, WOOD = 3;

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// zone weights by world x (px)
export function zoneOf(x) {
  const ruins = smooth(2300, 2560, x);
  const forest = smooth(880, 1150, x) * (1 - ruins);
  return { village: clamp(1 - forest - ruins, 0, 1), forest, ruins };
}
// time of day by world x: 0 golden hour, 1 dusk, 2 night
export function moodAt(x) { return smooth(640, 1500, x) + smooth(2050, 2900, x); }

export const ARENA = { x0: 204 * T, x1: 224 * T, bossX: 219 * T + 8, gateX: 203 * T };
export const ZONES = [
  { x: 0, name: 'Lanternwick', sub: 'the last lit village' },
  { x: 62 * T, name: 'Thornwood', sub: 'where the light thins' },
  { x: 153 * T, name: 'The Old Shrine', sub: 'stones that remember fire' },
];

export function buildLevel() {
  const tiles = new Uint8Array(LW * LH);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < LW && y < LH) tiles[y * LW + x] = v; };
  const fill = (x0, x1, row, type = EARTH) => { for (let x = x0; x <= x1; x++) for (let y = row; y < LH; y++) set(x, y, type); };
  const block = (x0, x1, r0, r1, type = EARTH) => { for (let x = x0; x <= x1; x++) for (let y = r0; y <= r1; y++) set(x, y, type); };
  const wood = (x0, x1, row) => { for (let x = x0; x <= x1; x++) set(x, row, WOOD); };

  // ---- terrain
  fill(0, 1, 0);
  fill(2, 61, 11);
  fill(62, 70, 10);
  wood(71, 73, 10); wood(75, 77, 11);                 // broken bridge over the first pond
  fill(78, 92, 11);
  wood(80, 82, 9); wood(84, 85, 7); block(87, 90, 5, 6); // climb to the chest ledge
  fill(93, 99, 9);
  fill(103, 116, 10);                                  // 100-102: chasm
  wood(118, 119, 10); wood(121, 122, 9); wood(124, 125, 10); // logs over the second pond
  fill(127, 140, 11);
  fill(141, 146, 10);
  fill(147, 152, 9);
  fill(153, 161, 9, STONE);
  fill(165, 172, 10, STONE);                           // 162-164: chasm
  fill(173, 176, 9, STONE);
  fill(177, 182, 8, STONE);
  block(184, 184, 9, 9, STONE);                        // lone stepping block
  block(168, 171, 6, 6, STONE);                        // high shelf with the second chest
  wood(165, 166, 8);
  fill(186, 239, 11, STONE);
  fill(238, 239, 0, STONE);
  block(200, 203, 0, 5, STONE);                        // arena gate lintel

  const water = [
    { x0: 71 * T, x1: 78 * T, y: 11 * T + 6 },
    { x0: 117 * T, x1: 127 * T, y: 11 * T + 6 },
  ];

  const solid = (tx, ty) => { if (tx < 0 || tx >= LW) return true; if (ty < 0) return false; if (ty >= LH) return false; const v = tiles[ty * LW + tx]; return v === EARTH || v === STONE; };
  const tileAt = (tx, ty) => (tx < 0 || tx >= LW || ty < 0 || ty >= LH ? 0 : tiles[ty * LW + tx]);
  // y (px) of the first surface under a world x, scanning down from `fromY`
  const groundY = (px, fromY = 0) => {
    const tx = clamp(Math.floor(px / T), 0, LW - 1);
    for (let ty = Math.max(0, Math.floor(fromY / T)); ty < LH; ty++) {
      const v = tiles[ty * LW + tx];
      if ((v === EARTH || v === STONE || v === WOOD) && !(ty > 0 && (tiles[(ty - 1) * LW + tx] === EARTH || tiles[(ty - 1) * LW + tx] === STONE))) return ty * T;
    }
    return WORLD_H + 40;
  };
  const inWater = (px) => water.some((w) => px >= w.x0 && px < w.x1);

  // ---- props baked into the scenery. kind strings are resolved by scene.js
  const decor = [];
  const D = (kind, tx, o = {}) => decor.push({ kind, x: Math.round(tx * T), ...o });

  // village
  D('tree:oak:0', 3.4, { layer: 'far' });
  D('house:cottage', 6.2);
  D('lamp', 5);
  D('tree:autumn:0', 12.6, { layer: 'far' });
  D('fence', 12.2, { n: 3 });
  D('well', 16.4);
  D('lamp', 18.6);
  D('house:inn', 19.6);
  D('barrel', 25.9); D('barrel', 26.6, { front: true }); D('crate', 28.6); D('crate', 29.5); D('crate', 29, { dy: -12 });
  D('tree:oak:1', 28.2, { layer: 'far' });
  D('lamp', 33.4);
  D('hay', 33.9);
  D('house:smithy', 36);
  D('sign:anvil', 39.9, { dy: -30 });
  D('fence', 42.4, { n: 4 });
  D('tree:autumn:1', 44.6, { layer: 'far' });
  D('lamp', 47);
  D('tree:oak:2', 50.5, { layer: 'far' });
  D('hay', 51.6, { front: true });
  D('signpost', 56);
  D('tree:oak:0', 59.5, { layer: 'far' });
  D('string', 0, { x0: 88, y0: 100, x1: 318, y1: 96 });
  D('string', 0, { x0: 400, y0: 94, x1: 584, y1: 116 });

  // thornwood
  const forestTrees = [63.5, 68, 80, 86.5, 91, 95.5, 105, 109.5, 114, 129, 133.5, 138, 143.5, 149];
  forestTrees.forEach((tx, i) => D(i % 4 === 2 ? `tree:pine:${i % 2}` : `tree:deep:${i % 3}`, tx, { layer: 'far' }));
  [66, 83, 97, 107, 112, 131, 136, 145].forEach((tx, i) => D(`bush:${i % 4}`, tx, { front: i % 3 === 0 }));

  // ruins
  D('pillar:60', 155); D('pillar:broken', 158.5); D('statue', 160);
  D('pillar:80', 166.5); D('pillar:broken', 171.5);
  D('tree:dead:0', 174.5, { layer: 'far' }); D('pillar:60', 179); D('pillar:broken', 181.5);
  D('tree:gloom:0', 188, { layer: 'far' }); D('statue', 190.5); D('pillar:80', 193.5); D('tree:dead:1', 198, { layer: 'far' });
  D('pillar:80', 201.2); D('pillar:80', 205.2); D('tree:gloom:1', 211, { layer: 'far' }); D('pillar:broken', 214);
  D('pillar:80', 226.5); D('pillar:80', 234.5); D('tree:gloom:0', 236, { layer: 'far' });
  [189, 199, 207, 213.5, 223, 227.5].forEach((tx, i) => D(`crystal:${i % 2}`, tx, { glow: true }));

  // scatter: small flora on every walkable surface
  const r = rng(4242);
  for (let tx = 2; tx < LW - 2; tx++) {
    for (let k = 0; k < 3; k++) {
      const px = tx * T + r.int(0, T - 1);
      if (inWater(px)) continue;
      const z = zoneOf(px);
      const roll = r();
      // every surface in this column (ground and ledges)
      for (let ty = 1; ty < LH; ty++) {
        const v = tiles[ty * LW + tx];
        if (!(v === EARTH || v === STONE)) continue;
        if (solid(tx, ty - 1)) continue;
        const y = ty * T;
        const stone = v === STONE;
        if (roll < 0.34) decor.push({ kind: 'tuft', x: px, y, v: r.int(0, 3), sway: true });
        else if (roll < 0.34 + 0.11 * z.village + 0.03) decor.push({ kind: 'flower', x: px, y, v: r.int(0, 3), sway: true });
        else if (roll < 0.5 && !stone) decor.push({ kind: 'rock', x: px, y, v: r.int(1, 2) });
        else if (roll < 0.52 + 0.1 * z.forest && z.forest > 0.4) decor.push({ kind: 'glowshroom', x: px, y, v: r.int(0, 2), glow: true });
        else if (roll < 0.66 && z.forest > 0.3) decor.push({ kind: 'fern', x: px, y, front: r.chance(0.3) });
        else if (roll < 0.7 && z.forest > 0.2) decor.push({ kind: 'mushroom', x: px, y, v: r.int(0, 1) });
        else if (roll < 0.45 && z.ruins > 0.5) decor.push({ kind: 'rock', x: px, y, v: r.int(0, 2) });
        break;
      }
    }
  }
  // vines under overhangs
  for (let tx = 2; tx < LW - 2; tx++) for (let ty = 0; ty < LH - 1; ty++) {
    if (solid(tx, ty) && !solid(tx, ty + 1) && tileAt(tx, ty + 1) === EMPTY && r.chance(0.6))
      decor.push({ kind: 'vine', x: tx * T + r.int(2, 12), y: (ty + 1) * T, len: r.int(8, 26), seed: r.int(1, 99) });
  }

  // ---- living things & interactables
  const spawns = [];
  const S = (kind, tx, o = {}) => spawns.push({ kind, x: Math.round(tx * T), ...o });
  S('npc:elder', 13.5); S('npc:kid', 27.4); S('npc:cat', 29.1, { dy: -24 }); S('npc:smith', 41.2);
  S('campfire', 31.4); S('campfire', 129.5); S('campfire', 196.5);
  S('chest', 88.5, { row: 5, loot: 'ember' });
  S('chest', 169.5, { row: 6, loot: 'cache' });
  S('shrine', 231);

  [66.5, 82, 89, 96.5, 106, 131.5, 139].forEach((tx) => S('mossling', tx));
  [[108, 6], [113.5, 5], [134, 6], [144, 5], [158, 4], [169, 2.5], [180, 4], [191, 6]].forEach(([tx, row]) => S('duskwing', tx, { row }));
  [110.5, 137, 150, 156.5, 167, 179.5, 194].forEach((tx) => S('sporecap', tx));

  // coins: little arcs that teach the jumps
  const arc = (tx, row, n, lift = 1.2) => { for (let i = 0; i < n; i++) S('coin', tx + i * 0.9, { py: row * T - Math.sin((i / (n - 1 || 1)) * Math.PI) * lift * T - 6 }); };
  arc(45, 10.4, 4, 0); arc(73.2, 9.2, 4, 1); arc(80.4, 8.3, 3, 0); arc(84.2, 6.3, 2, 0);
  arc(99.6, 7.6, 4, 1.4); arc(118, 8.6, 9, 1.3); arc(162, 7.6, 4, 1.4); arc(182.8, 6.8, 4, 1.2);
  arc(174, 8.3, 3, 0); arc(165.2, 7.3, 2, 0);
  S('heart', 98, { row: 9 }); S('heart', 152, { row: 9 }); S('heart', 187.5, { row: 11 });

  return { tiles, water, solid, tileAt, groundY, inWater, decor, spawns, start: { x: 4.5 * T, y: 11 * T } };
}

// Bakes the level's static scenery into two level-sized canvases (behind / in front of
// the actors) and collects the dynamic bits: lights, glowing regions, swaying plants.
import { C, P } from './palette.js';
import { Pix, makeCanvas, ctx2d, rng } from './pixel.js';
import { skinTerrain } from './terrain.js';
import { T, WORLD_W, WORLD_H } from '../game/level.js';
import {
  makeHouse, makeTrees, makeSign, makePillar, makeVine, LAMP, PAPER_LANTERNS, WELL, CRATE, BARREL, SIGNPOST, FENCE, HAY,
  TUFTS, FLOWERS, MUSHROOMS, GLOWSHROOMS, ROCKS, FERN, STATUE, CRYSTALS,
} from './art-props.js';

const HOUSES = {
  cottage: { w: 70, h: 40, roofH: 26, roof: 'slate', door: 12, windows: [40], upperWindows: [14, 48], chimney: 46, seed: 3, shutter: [C.t2, C.t3, C.t4], ivy: true },
  inn: { w: 86, h: 46, roofH: 30, roof: 'plum', door: 38, windows: [10, 64], upperWindows: [12, 40, 66], chimney: 62, seed: 14, posts: [28, 56], shutter: [C.r1, C.r2, C.r3] },
  smithy: { w: 54, h: 30, roofH: 22, roof: 'clay', door: 30, windows: [8], chimney: 8, seed: 9, upper: false, shutter: [C.u1, C.u2, C.u3] },
};

function shear(pix, dir) {
  const out = new Pix(pix.w + 4, pix.h);
  for (let y = 0; y < pix.h; y++) {
    const k = Math.round(dir * ((pix.h - 1 - y) / Math.max(1, pix.h - 1)) * (pix.h > 5 ? 2 : 1.2));
    for (let x = 0; x < pix.w; x++) { const v = pix.d[y * pix.w + x]; if (v) out.set(x + 2 + k, y, v); }
  }
  return out.toCanvas();
}

export function buildScene(level) {
  const terr = skinTerrain(level);
  const back = makeCanvas(WORLD_W, WORLD_H), front = makeCanvas(WORLD_W, WORLD_H);
  const bg = ctx2d(back), fg = ctx2d(front);
  const lights = [], emissive = [], sway = [], smoke = [];
  const trees = makeTrees();
  const cache = new Map();
  const can = (key, make) => { let c = cache.get(key); if (!c) { c = make().toCanvas(); cache.set(key, c); } return c; };
  const WARM = '#ffb45e';

  const gy = (d) => (d.y !== undefined ? d.y : d.row !== undefined ? d.row * T : level.groundY(d.x, 2 * T)) + (d.dy || 0);
  const put = (g, c, x, y) => g.drawImage(c, Math.round(x), Math.round(y));

  const far = level.decor.filter((d) => d.layer === 'far');
  const mid = level.decor.filter((d) => d.layer !== 'far' && !d.front && !['tuft', 'flower', 'rock', 'glowshroom', 'fern', 'mushroom'].includes(d.kind));
  const small = level.decor.filter((d) => ['tuft', 'flower', 'rock', 'glowshroom', 'fern', 'mushroom'].includes(d.kind) && !d.front);
  const frontD = level.decor.filter((d) => d.front);

  const drawOne = (g, d) => {
    const [kind, a, b] = d.kind.split(':');
    const y = gy(d);
    switch (kind) {
      case 'tree': case 'bush': {
        const set = kind === 'bush' ? trees.bush : trees[a];
        const s = set[(+(kind === 'bush' ? a : b) || 0) % set.length];
        put(g, can(d.kind, () => s.pix), d.x - s.ox, y - s.oy + 2);
        break;
      }
      case 'house': {
        const key = 'house:' + a;
        let h = cache.get(key + ':obj');
        if (!h) { h = makeHouse(HOUSES[a]); cache.set(key + ':obj', h); }
        const c = can(key, () => h.pix), top = y - c.height + 2;
        put(g, c, d.x, top);
        for (const [lx, ly] of h.lights) {
          lights.push({ x: d.x + lx, y: top + ly, r: 30, color: WARM, flick: 0.04, glow: 10 });
          emissive.push({ x: d.x + lx - 6, y: top + ly - 6, w: 12, h: 12 });
        }
        if (h.chimney) smoke.push({ x: d.x + h.chimney[0], y: top + h.chimney[1] });
        break;
      }
      case 'lamp': {
        const c = can('lamp', () => LAMP.pix), top = y - c.height + 2;
        put(g, c, d.x - 5, top);
        lights.push({ x: d.x - 5 + LAMP.light[0], y: top + LAMP.light[1], r: 52, color: WARM, flick: 0.08, glow: 16 });
        emissive.push({ x: d.x - 5 + 9, y: top + 10, w: 7, h: 7 });
        break;
      }
      case 'string': {
        // catenary rope with paper lanterns
        const n = Math.round(Math.hypot(d.x1 - d.x0, d.y1 - d.y0));
        const sag = n * 0.09;
        g.fillStyle = P.b2;
        let k = 0;
        for (let i = 0; i <= n; i++) {
          const t = i / n, x = Math.round(d.x0 + (d.x1 - d.x0) * t), yy = Math.round(d.y0 + (d.y1 - d.y0) * t + Math.sin(t * Math.PI) * sag);
          g.fillRect(x, yy, 1, 1);
          if (i % 17 === 9) {
            const v = k++ % 3, c = can('pl' + v, () => PAPER_LANTERNS[v]);
            put(g, c, x - 1, yy + 1);
            lights.push({ x, y: yy + 3, r: 17, color: ['#ff7a4d', '#ffcf5a', '#7ff0c8'][v], flick: 0.12, glow: 7, ph: i });
            emissive.push({ x: x - 1, y: yy + 1, w: 3, h: 5 });
          }
        }
        break;
      }
      case 'well': put(g, can('well', () => WELL), d.x - 15, y - WELL.h + 2); break;
      case 'crate': put(g, can('crate', () => CRATE), d.x - 7, y - CRATE.h + 1); break;
      case 'barrel': put(g, can('barrel', () => BARREL), d.x - 6, y - BARREL.h + 1); break;
      case 'hay': put(g, can('hay', () => HAY), d.x - 9, y - HAY.h + 2); break;
      case 'signpost': put(g, can('signpost', () => SIGNPOST), d.x - 8, y - SIGNPOST.h + 2); break;
      case 'fence': { const c = can('fence', () => FENCE); for (let i = 0; i < (d.n || 1); i++) put(g, c, d.x + i * 16, y - c.height + 1); break; }
      case 'sign': put(g, can(d.kind, () => makeSign(a)), d.x, y - 14); break;
      case 'pillar': {
        const key = d.kind + ':' + d.x;
        const c = can(key, () => (a === 'broken' ? makePillar(26 + (d.x % 17), true, d.x) : makePillar(+a + (d.x % 9), false, d.x, +a > 70 ? 14 : 12)));
        put(g, c, d.x - (c.width >> 1), y - c.height + 2);
        break;
      }
      case 'statue': put(g, can('statue', () => STATUE), d.x - 9, y - STATUE.h + 2); break;
      case 'crystal': {
        const c = can(d.kind, () => CRYSTALS[+a]);
        put(g, c, d.x - (c.width >> 1), y - c.height + 2);
        lights.push({ x: d.x, y: y - 5, r: 30, color: '#b06cff', flick: 0.2, glow: 12, ph: d.x });
        emissive.push({ x: d.x - (c.width >> 1), y: y - c.height + 2, w: c.width, h: c.height });
        break;
      }
      case 'vine': put(g, can('vine' + d.len + ':' + d.seed, () => makeVine(d.len, d.seed)), d.x, d.y - 1); break;
      case 'tuft': case 'flower': {
        const src = (kind === 'tuft' ? TUFTS : FLOWERS)[d.v];
        const key = kind + d.v;
        let fr = cache.get(key);
        if (!fr) { fr = [shear(src, -1), shear(src, 0), shear(src, 1)]; cache.set(key, fr); }
        sway.push({ fr, x: d.x - (src.w >> 1) - 2, y: y - src.h + 1, cx: d.x, ph: (d.x * 0.37) % 6.28 });
        break;
      }
      case 'rock': { const s = ROCKS[d.v]; put(g, can('rock' + d.v, () => s), d.x - (s.w >> 1), y - s.h + 2); break; }
      case 'mushroom': { const s = MUSHROOMS[d.v]; put(g, can('mush' + d.v, () => s), d.x - (s.w >> 1), y - s.h + 1); break; }
      case 'fern': put(g, can('fern', () => FERN), d.x - 6, y - FERN.h + 1); break;
      case 'glowshroom': {
        const s = GLOWSHROOMS[d.v];
        put(g, can('glow' + d.v, () => s), d.x - (s.w >> 1), y - s.h + 1);
        lights.push({ x: d.x, y: y - 4, r: 20, color: '#5fe6c2', flick: 0.25, glow: 8, ph: d.x * 0.7, slow: true });
        emissive.push({ x: d.x - (s.w >> 1), y: y - s.h + 1, w: s.w, h: Math.min(4, s.h) });
        break;
      }
      default: console.warn('unknown decor', d.kind);
    }
  };

  far.forEach((d) => drawOne(bg, d));
  mid.forEach((d) => drawOne(bg, d));
  put(bg, terr.back.toCanvas(), 0, 0);
  small.forEach((d) => drawOne(bg, d));
  frontD.forEach((d) => drawOne(fg, d));
  put(fg, terr.front.toCanvas(), 0, 0);

  sway.sort((a, b) => a.x - b.x);
  lights.sort((a, b) => a.x - b.x);
  return { back, front, lights, emissive, sway, smoke };
}

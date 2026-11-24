// Frame composition: backdrop -> lit scenery -> glowing bits -> lit actors -> water -> glow -> foreground.
import { makeCanvas, ctx2d, clamp, lerp, fbm2, bayer } from '../gfx/pixel.js';
import { mix } from '../gfx/palette.js';
import { buildBackdrop, drawBackdrop, drawForeground, MOODS, MOOD_NAMES, VIEW_W, VIEW_H } from '../gfx/art-bg.js';
import { buildScene } from '../gfx/scene.js';
import { Lighting } from '../gfx/light.js';
import { WORLD_W, WORLD_H, zoneOf } from './level.js';

const WATER = [
  { deep: '#2c5fa8', top: '#bfe6f5', line: '#ffffff' },
  { deep: '#3a2f86', top: '#f08a8a', line: '#ffd9b0' },
  { deep: '#0f1f55', top: '#5f9be0', line: '#d2f0fb' },
];

export function moodLerp(t, key) {
  t = clamp(t, 0, 2);
  const i = Math.min(1, Math.floor(t)), f = t - i;
  const a = MOODS[MOOD_NAMES[i]][key], b = MOODS[MOOD_NAMES[i + 1]][key];
  return typeof a === 'number' ? lerp(a, b, f) : mix(a, b, f);
}

// soft ground fog, drawn as ordered-dither wisps
function makeMist(color) {
  const w = 384, h = 30, c = makeCanvas(w, h), g = ctx2d(c);
  g.fillStyle = color;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // tileable noise: blend two samples across the seam
    const t = x / w;
    const n = fbm2(x * 0.035, y * 0.2, 5) * (1 - t) + fbm2((x - w) * 0.035, y * 0.2, 5) * t;
    const fall = Math.sin((y / (h - 1)) * Math.PI);
    const d = (n - 0.42) * 2.4 * fall;
    if (d > 0 && Math.round(Math.min(1, d) * 2) / 2 * 0.99 > bayer(x, y)) g.fillRect(x, y, 1, 1);
  }
  return c;
}
function makeVignette() {
  const c = makeCanvas(VIEW_W, VIEW_H), g = ctx2d(c);
  g.fillStyle = '#0e0b16';
  for (let y = 0; y < VIEW_H; y++) for (let x = 0; x < VIEW_W; x++) {
    const dx = (x - VIEW_W / 2) / (VIEW_W / 2), dy = (y - VIEW_H / 2) / (VIEW_H / 2);
    const v = (Math.hypot(dx * 0.9, dy * 0.95) - 0.98) / 0.42;
    if (v > 0 && Math.round(Math.min(1, v) * 4) / 4 * 0.8 > bayer(x, y)) g.fillRect(x, y, 1, 1);
  }
  return c;
}

export class Renderer {
  constructor(level) {
    this.level = level;
    this.scene = buildScene(level);
    this.backdrop = buildBackdrop(WORLD_W, zoneOf);
    this.light = new Lighting(VIEW_W, VIEW_H);
    this.out = makeCanvas(VIEW_W, VIEW_H); this.g = ctx2d(this.out);
    this.bufA = makeCanvas(VIEW_W, VIEW_H); this.a = ctx2d(this.bufA);
    this.bufB = makeCanvas(VIEW_W, VIEW_H); this.b = ctx2d(this.bufB);
    this.snap = makeCanvas(VIEW_W, VIEW_H); this.sg = ctx2d(this.snap);
    this.mist = makeMist('#dfe8ff'); this.vignette = makeVignette();
  }

  draw(game) {
    const { g, a, b, scene, light } = this;
    const camX = Math.round(game.cam.x), camY = Math.round(game.cam.y);
    const lift = WORLD_H - VIEW_H - camY;
    const mood = game.mood, time = game.time;
    const dark = game.darkness || 0; // extra gloom (boss arena)

    drawBackdrop(g, this.backdrop, camX, lift, mood, time);
    if (dark > 0) { g.fillStyle = `rgba(12,6,30,${dark * 0.55})`; g.fillRect(0, 0, VIEW_W, VIEW_H); }

    // a fog bank drifting between the parallax forest and the playfield
    const z = zoneOf(camX + VIEW_W / 2);
    const fog = clamp(z.forest * 0.6 + z.ruins, 0, 1) * clamp(mood, 0.3, 1.5) * (1 - (game.dawn || 0) * 2);
    if (fog > 0.03) {
      for (let k = 0; k < 2; k++) {
        const sx = Math.floor(((camX * (0.7 + k * 0.2) + time * (4 + k * 3) + k * 150) % 384 + 384) % 384);
        const y = 96 + k * 12 + Math.round(lift * 0.8);
        g.globalAlpha = Math.min(0.22, fog * (0.13 + k * 0.05));
        g.drawImage(this.mist, sx, 0, Math.min(VIEW_W, 384 - sx), 30, 0, y, Math.min(VIEW_W, 384 - sx), 30);
        if (384 - sx < VIEW_W) g.drawImage(this.mist, 0, 0, VIEW_W - (384 - sx), 30, 384 - sx, y, VIEW_W - (384 - sx), 30);
      }
      g.globalAlpha = 1;
    }

    // ---- light map
    let ambient = moodLerp(mood, 'ambient');
    if (dark > 0) ambient = mix(ambient, '#4a4590', dark * 0.6);
    if (game.dawn > 0) ambient = mix(ambient, '#ffe9c8', game.dawn);
    const power = clamp(0.25 + mood * 0.5 + dark * 0.3, 0, 1);
    light.begin(ambient);
    for (const l of scene.lights) {
      if (l.x < camX - 70 || l.x > camX + VIEW_W + 70) continue;
      const fl = 1 + Math.sin(time * (l.slow ? 1.7 : 9) + (l.ph || l.x)) * l.flick * 0.5 + Math.sin(time * (l.slow ? 0.9 : 23) + l.x) * l.flick * 0.5;
      light.add(l.x - camX, l.y - camY, l.r * fl, l.color, power * (l.slow ? 0.75 + 0.25 * Math.sin(time * 1.3 + l.x) : 1), l.glow);
    }
    for (const l of game.lights) light.add(l.x - camX, l.y - camY, l.r, l.color, (l.i ?? 1) * (l.always ? 1 : Math.max(power, 0.35)), l.glow || 0);
    light.finish();

    // ---- layer A: scenery
    a.clearRect(0, 0, VIEW_W, VIEW_H);
    a.drawImage(scene.back, camX, camY, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    const hero = game.hero;
    for (const s of scene.sway) {
      if (s.x < camX - 16) continue;
      if (s.x > camX + VIEW_W) break;
      let v = Math.sin(time * 1.7 + s.ph) * 0.8 + Math.sin(time * 0.6 + s.ph * 2) * 0.5;
      if (hero) { const dx = s.cx - hero.x; if (Math.abs(dx) < 12 && Math.abs(hero.y - (s.y + 6)) < 14) v = dx > 0 ? 1.4 : -1.4; }
      a.drawImage(s.fr[v > 0.55 ? 2 : v < -0.55 ? 0 : 1], s.x - camX, s.y - camY);
    }
    game.drawBack?.(a, camX, camY);
    light.apply(this.bufA, a);
    g.drawImage(this.bufA, 0, 0);

    // glowing regions of the scenery come back at full brightness
    for (const e of scene.emissive) {
      if (e.x + e.w < camX || e.x > camX + VIEW_W) continue;
      g.drawImage(scene.back, e.x, e.y, e.w, e.h, e.x - camX, e.y - camY, e.w, e.h);
    }
    game.drawEmissiveBack?.(g, camX, camY);

    // ---- layer B: actors, then the grass that overlaps their feet
    b.clearRect(0, 0, VIEW_W, VIEW_H);
    game.drawActors?.(b, camX, camY);
    b.drawImage(scene.front, camX, camY, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    light.apply(this.bufB, b);
    g.drawImage(this.bufB, 0, 0);
    game.drawEmissive?.(g, camX, camY);

    this.water(camX, camY, time, mood);
    light.glow(g, clamp(moodLerp(mood, 'glow') + dark * 0.5, 0, 1));
    game.drawOverlay?.(g, camX, camY);
    drawForeground(g, this.backdrop, camX, lift, mood);
    g.globalAlpha = clamp(mood * 0.3 + dark * 0.2 - (game.dawn || 0), 0, 0.8);
    g.drawImage(this.vignette, 0, 0);
    g.globalAlpha = 1;
    return this.out;
  }

  water(camX, camY, time, mood) {
    const { g } = this;
    let snapped = false;
    const i0 = Math.min(1, Math.floor(clamp(mood, 0, 2))), f = clamp(mood, 0, 2) - i0;
    const deep = mix(WATER[i0].deep, WATER[i0 + 1].deep, f), top = mix(WATER[i0].top, WATER[i0 + 1].top, f), line = mix(WATER[i0].line, WATER[i0 + 1].line, f);
    for (const w of this.level.water) {
      const x0 = Math.max(0, w.x0 - camX), x1 = Math.min(VIEW_W, w.x1 - camX);
      const sy = w.y - camY;
      if (x1 <= x0 || sy >= VIEW_H) continue;
      if (!snapped) { this.sg.globalCompositeOperation = 'copy'; this.sg.drawImage(this.out, 0, 0); snapped = true; }
      const wd = x1 - x0, hgt = VIEW_H - sy;
      g.fillStyle = deep; g.fillRect(x0, sy, wd, hgt);
      // mirrored, rippling rows of whatever is above the surface
      g.save(); g.beginPath(); g.rect(x0, sy, wd, hgt); g.clip();
      g.globalAlpha = 0.62;
      for (let i = 0; i < hgt; i++) {
        const srcY = sy - 1 - Math.floor(i * 1.25);
        if (srcY < 0) break;
        const off = Math.round(Math.sin(time * 2.1 + i * 0.6) * Math.min(3, 0.5 + i * 0.13));
        g.drawImage(this.snap, x0, srcY, wd, 1, x0 + off, sy + i, wd, 1);
      }
      g.globalAlpha = 1;
      // depth bands
      g.fillStyle = deep;
      g.globalAlpha = 0.28; g.fillRect(x0, sy + 10, wd, hgt);
      g.globalAlpha = 0.3; g.fillRect(x0, sy + 24, wd, hgt);
      g.globalAlpha = 1;
      // surface line with travelling glints
      g.fillStyle = top; g.fillRect(x0, sy, wd, 1);
      g.fillStyle = line;
      for (let x = x0; x < x1; x++) {
        const wx = x + camX;
        const n = Math.sin(wx * 0.31 + time * 2.4) + Math.sin(wx * 0.13 - time * 1.3);
        if (n > 1.1) g.fillRect(x, sy, 1, 1);
        if (n < -1.5) { g.globalAlpha = 0.5; g.fillRect(x, sy + 2 + ((wx >> 2) % 3) * 3, 2, 1); g.globalAlpha = 1; }
      }
      g.restore();
    }
  }
}

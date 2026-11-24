// Particles and floating combat text.
import { P } from '../gfx/palette.js';
import { drawText, SMALL } from '../gfx/font.js';

export const FIRE = [P.y6, P.y5, P.y4, P.y3, P.y2, P.y1, P.r2];
export const SPARK = [P.white, P.y5, P.y4, P.y2];
export const DUST = [P.n6, P.n5, P.n4];
export const GLOOM = [P.p6, P.p5, P.p4, P.p3, P.p2];
export const SLIME = [P.g7, P.g6, P.g5, P.g4];
export const GOLD = [P.y6, P.y5, P.y4, P.y3];
export const LEAVES = [[P.g5, P.g4], [P.g6, P.g4], [P.y3, P.y2], [P.r4, P.r3]];

export class Particles {
  constructor() { this.p = []; this.texts = []; }
  add(o) {
    const q = { x: 0, y: 0, vx: 0, vy: 0, life: 30, g: 0, drag: 1, size: 1, colors: DUST, em: false, flutter: 0, shrink: false, ...o };
    q.max = q.life;
    if (this.p.length < 900) this.p.push(q);
    return q;
  }
  burst(x, y, n, o = {}) {
    const sp = o.speed ?? 1.5, up = o.up ?? 0;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = sp * (0.3 + Math.random() * 0.7);
      this.add({ ...o, x: x + (Math.random() - 0.5) * (o.spread ?? 4), y: y + (Math.random() - 0.5) * (o.spread ?? 4), vx: Math.cos(a) * s, vy: Math.sin(a) * s - up, life: (o.life ?? 24) * (0.6 + Math.random() * 0.6) });
    }
  }
  dust(x, y, n = 4, dir = 0) {
    for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - 0.5) * 8, y: y - Math.random() * 2, vx: (Math.random() - 0.5) * 0.8 - dir * 0.5, vy: -0.15 - Math.random() * 0.35, life: 16 + Math.random() * 12, drag: 0.93, colors: DUST, size: Math.random() < 0.4 ? 2 : 1, shrink: true });
  }
  sparks(x, y, n = 8, colors = SPARK, speed = 2.2) { this.burst(x, y, n, { colors, speed, g: 0.1, drag: 0.94, em: true, life: 18 }); }
  poof(x, y, colors, n = 14) {
    this.burst(x, y, n, { colors, speed: 1.6, drag: 0.9, life: 26, size: 2, shrink: true, spread: 8 });
    this.burst(x, y, n >> 1, { colors: DUST, speed: 0.9, drag: 0.92, life: 30, up: 0.3, spread: 10 });
  }
  splash(x, y, colors = [P.u7, P.u6, P.u5]) {
    for (let i = 0; i < 16; i++) this.add({ x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 2.2, vy: -1.4 - Math.random() * 2.2, g: 0.18, life: 26 + Math.random() * 10, colors });
  }
  flame(x, y, power = 1) {
    this.add({ x: x + (Math.random() - 0.5) * 7 * power, y: y - Math.random() * 2, vx: (Math.random() - 0.5) * 0.25, vy: -0.35 - Math.random() * 0.5 * power, life: 18 + Math.random() * 16 * power, colors: FIRE, size: Math.random() < 0.55 ? 2 : 1, em: true, shrink: true, drag: 0.985 });
    if (Math.random() < 0.12) this.add({ x: x + (Math.random() - 0.5) * 6, y: y - 6, vx: (Math.random() - 0.5) * 0.5, vy: -0.8 - Math.random() * 0.7, life: 40 + Math.random() * 30, colors: [P.y5, P.y4, P.y2, P.r3], em: true, flutter: 0.06 });
  }
  smoke(x, y) {
    this.add({ x: x + (Math.random() - 0.5) * 2, y, vx: 0.08 + Math.random() * 0.12, vy: -0.22 - Math.random() * 0.1, life: 90 + Math.random() * 40, colors: [P.n6, P.n5, P.n5, P.n4, P.n3], size: 2, alpha: 0.5, grow: true, drag: 0.995 });
  }
  text(x, y, str, color = P.white, o = {}) { this.texts.push({ x, y, str: String(str), color, life: o.life ?? 42, max: o.life ?? 42, vy: o.vy ?? -0.55, big: !!o.big }); }

  update() {
    const p = this.p;
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      if (--q.life <= 0) { p[i] = p[p.length - 1]; p.pop(); continue; }
      q.vy += q.g; q.vx *= q.drag; q.vy *= q.drag;
      if (q.flutter) q.vx += Math.sin(q.life * 0.19 + q.x * 0.1) * q.flutter;
      q.x += q.vx; q.y += q.vy;
      if (q.floor !== undefined && q.y > q.floor) { q.y = q.floor; q.vy *= -0.35; q.vx *= 0.6; }
    }
    const t = this.texts;
    for (let i = t.length - 1; i >= 0; i--) { const q = t[i]; q.y += q.vy; q.vy *= 0.94; if (--q.life <= 0) t.splice(i, 1); }
  }
  draw(g, camX, camY, em) {
    for (const q of this.p) {
      if (q.em !== em) continue;
      const k = 1 - q.life / q.max;
      const x = Math.round(q.x - camX), y = Math.round(q.y - camY);
      if (x < -4 || y < -4 || x > 324 || y > 184) continue;
      g.fillStyle = q.colors[Math.min(q.colors.length - 1, Math.floor(k * q.colors.length))];
      let s = q.size;
      if (q.shrink && k > 0.6) s = Math.max(1, s - 1);
      if (q.grow && k > 0.4) s += 1;
      if (q.alpha) { g.globalAlpha = q.alpha * (1 - k); g.fillRect(x, y, s, s); g.globalAlpha = 1; }
      else g.fillRect(x, y, s, s);
    }
  }
  drawTexts(g, camX, camY) {
    for (const q of this.texts) {
      if (q.life < 8 && q.life % 2) continue;
      drawText(g, q.str, q.x - camX, q.y - camY, { font: q.big ? undefined : SMALL, color: q.color, outline: P.ink, align: 'center' });
    }
  }
}

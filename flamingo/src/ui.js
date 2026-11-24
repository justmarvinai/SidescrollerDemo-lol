// HUD, radar, prompts, big state banners and the neon title for Flamingo Drive.
import { C, P } from '../../src/gfx/palette.js';
import { Pix } from '../../src/gfx/pixel.js';
import { drawText, textWidth, FONT, SMALL } from '../../src/gfx/font.js';
import { PROPS } from './sprites.js';
import { VIEW, T } from './city.js';

const cache = new Map();
const can = (pix) => { let c = cache.get(pix); if (!c) { c = pix.toCanvas(); cache.set(pix, c); } return c; };
const spaced = (s) => s.toUpperCase().split('').join(' ');
export const money = (n) => '$' + Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function keycap(g, x, y, label) {
  const w = Math.max(9, textWidth(label, SMALL) + 6);
  g.fillStyle = P.ink; g.fillRect(x, y + 1, w, 9); g.fillRect(x + 1, y, w - 2, 11);
  g.fillStyle = P.m2; g.fillRect(x + 1, y + 1, w - 2, 9);
  g.fillStyle = P.m4; g.fillRect(x + 1, y + 1, w - 2, 7);
  drawText(g, label, x + (w >> 1) + 1, y + 2, { font: SMALL, color: P.ink, align: 'center' });
  return w;
}

function radar(g, game) {
  const x = 5, y = 5, w = 58, h = 43, mini = game.city.mini;
  g.fillStyle = P.ink; g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = P.m3; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = P.ink; g.fillRect(x, y, w, h);
  g.globalAlpha = 0.9; g.drawImage(mini, x, y); g.globalAlpha = 1;
  const dot = (wx, wy, col, big) => { const px = x + Math.floor(wx / T), py = y + Math.floor(wy / T); g.fillStyle = col; g.fillRect(px - (big ? 1 : 0), py - (big ? 1 : 0), big ? 3 : 2, big ? 3 : 2); };
  for (const p of game.pickups) if (p.kind === 'bag') dot(p.x, p.y, P.g6);
  for (const c of game.cars) if (c.mode === 'cop' && !c.calm) dot(c.x, c.y, Math.floor(game.frame / 8) % 2 ? P.r4 : P.u5);
  const t = game.target();
  if (t && Math.floor(game.frame / 12) % 2) dot(t.x, t.y, P.y4, true);
  const f = game.focus();
  dot(f.x, f.y, P.white, true);
}

function status(g, game) {
  const R = VIEW.w - 6;
  drawText(g, money(game.cash), R, 6, { color: P.g6, outline: P.ink, align: 'right' });
  for (let i = 0; i < 3; i++) {
    const on = i < game.wanted, fading = game.wanted > 0 && game.evadeT > 150 && Math.floor(game.frame / 10) % 2;
    g.drawImage(can(on && !fading ? PROPS.star : PROPS.starOff), R - 9 - (2 - i) * 10, 18);
  }
  g.fillStyle = P.ink; g.fillRect(R - 43, 28, 44, 6);
  g.fillStyle = P.n2; g.fillRect(R - 42, 29, 42, 4);
  const hw = Math.round(42 * Math.max(0, game.player.hp) / 100);
  g.fillStyle = game.player.hp < 30 && Math.floor(game.frame / 10) % 2 ? P.white : P.m3; g.fillRect(R - 42, 29, hw, 4);
  g.fillStyle = P.m4; g.fillRect(R - 42, 29, hw, 1);
  const car = game.player.car;
  if (car) {
    g.fillStyle = P.ink; g.fillRect(R - 43, 36, 44, 4);
    g.fillStyle = car.hp < car.m.hp * 0.3 ? P.r4 : P.a4; g.fillRect(R - 42, 37, Math.round(42 * Math.max(0, car.hp) / car.m.hp), 2);
  }
}

function texts(g, game) {
  // job line and timer
  const job = game.job;
  if (job && job.text) {
    const w = textWidth(job.text, SMALL) + 12;
    g.fillStyle = 'rgba(14,11,22,0.6)'; g.fillRect((VIEW.w - w) >> 1, VIEW.h - 15, w, 11);
    drawText(g, job.text, VIEW.w / 2, VIEW.h - 12, { font: SMALL, color: P.y4, align: 'center' });
  }
  if (job && job.timer !== undefined) {
    const s = Math.max(0, Math.ceil(job.timer / 60));
    drawText(g, Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'), VIEW.w / 2, 8, { color: s <= 10 ? P.r5 : P.white, outline: P.ink, align: 'center' });
  }
  const sub = game.sub;
  if (sub) {
    const a = Math.min(1, sub.t / 8, (sub.dur - sub.t) / 14);
    g.globalAlpha = Math.max(0, a);
    const w = textWidth(sub.text) + 14;
    g.fillStyle = 'rgba(14,11,22,0.72)'; g.fillRect((VIEW.w - w) >> 1, VIEW.h - 34, w, 14);
    drawText(g, sub.text, VIEW.w / 2, VIEW.h - 31, { color: P.white, align: 'center' });
    g.globalAlpha = 1;
  }
  const b = game.big;
  if (b) {
    const k = Math.min(1, b.t / 12);
    g.fillStyle = `rgba(14,11,22,${0.55 * k})`; g.fillRect(0, 84, VIEW.w, 44);
    g.fillStyle = b.color; g.fillRect(0, 84, VIEW.w * k, 1); g.fillRect(VIEW.w * (1 - k), 127, VIEW.w * k, 1);
    if (b.t > 6) {
      drawText(g, spaced(b.title), VIEW.w / 2 + 1, 95, { color: P.ink, align: 'center' });
      drawText(g, spaced(b.title), VIEW.w / 2, 94, { color: b.color, outline: P.ink, align: 'center' });
      if (b.subtitle) drawText(g, b.subtitle, VIEW.w / 2, 110, { font: SMALL, color: P.white, outline: P.ink, align: 'center' });
    }
  }
  const n = game.carName;
  if (n && n.t > 0) { g.globalAlpha = Math.min(1, n.t / 20); drawText(g, n.text, VIEW.w - 6, VIEW.h - 30, { color: P.a5, outline: P.ink, align: 'right' }); g.globalAlpha = 1; }
}

function prompts(g, game) {
  const pr = game.prompt;
  if (pr) {
    const x = Math.round(pr.x - game.cam.x), y = Math.round(pr.y - game.cam.y - 16 + Math.sin(game.time * 5) * 1.2);
    const w = 12 + textWidth(pr.label, SMALL);
    const kx = Math.round(x - w / 2);
    keycap(g, kx, y - 6, 'E');
    drawText(g, pr.label, kx + 12, y - 4, { font: SMALL, color: P.white, outline: P.ink });
  }
  // arrow at the screen edge toward the current objective
  const t = game.target();
  if (t) {
    const f = game.focus(), sx = t.x - game.cam.x, sy = t.y - game.cam.y;
    if (sx < 8 || sx > VIEW.w - 8 || sy < 8 || sy > VIEW.h - 8) {
      const a = Math.atan2(t.y - f.y, t.x - f.x), cx = VIEW.w / 2, cy = VIEW.h / 2;
      const k = Math.min((cx - 14) / Math.abs(Math.cos(a) || 1e-6), (cy - 14) / Math.abs(Math.sin(a) || 1e-6));
      const px = cx + Math.cos(a) * k, py = cy + Math.sin(a) * k;
      for (let i = 0; i < 6; i++) for (let j = -i; j <= i; j++) {
        const qx = Math.round(px - Math.cos(a) * i - Math.sin(a) * j * 0.6), qy = Math.round(py - Math.sin(a) * i + Math.cos(a) * j * 0.6);
        g.fillStyle = i === 5 || Math.abs(j) === i ? P.ink : Math.floor(game.frame / 10) % 2 ? P.y5 : P.y4; g.fillRect(qx, qy, 1, 1);
      }
      drawText(g, Math.round(Math.hypot(t.x - f.x, t.y - f.y) / 4) + 'M', Math.round(px - Math.cos(a) * 14), Math.round(py - Math.sin(a) * 14) - 2, { font: SMALL, color: P.y5, outline: P.ink, align: 'center' });
    }
  }
}

// ---------------------------------------------------------------- neon logo
const rep = (row, n) => Array(n).fill(row);
const diag = (w, fn) => Array.from({ length: 16 }, (_, r) => { const row = Array(w).fill('.'); fn(r).forEach(([a, b]) => { for (let i = a; i <= b; i++) if (i >= 0 && i < w) row[i] = '#'; }); return row.join(''); });
const LETTERS = {
  F: [...rep('##########', 3), ...rep('####......', 3), ...rep('########..', 4), ...rep('####......', 6)],
  L: [...rep('####......', 13), ...rep('##########', 3)],
  A: ['...######...', '..########..', '.##########.', ...rep('####....####', 4), ...rep('############', 3), ...rep('####....####', 6)],
  M: ['####......####', '#####....#####', '######..######', '##############', '##############', '####.####.####', '####..##..####', ...rep('####......####', 9)],
  I: rep('####', 16),
  N: diag(13, (r) => [[0, 3], [9, 12], [Math.round(1 + r * (8 / 15)), Math.round(4 + r * (8 / 15))]]),
  G: ['...######...', '..########..', '.##########.', '####....####', ...rep('####........', 3), ...rep('####..######', 3), ...rep('####....####', 3), '.##########.', '..########..', '...######...'],
  O: ['...######...', '..########..', '.##########.', ...rep('####....####', 10), '.##########.', '..########..', '...######...'],
  D: ['#########...', '##########..', '###########.', ...rep('####....####', 10), '###########.', '##########..', '#########...'],
  R: ['##########..', '###########.', '############', ...rep('####....####', 3), '############', '###########.', '##########..', '####.####...', '####..####..', '####...####.', ...rep('####....####', 4)],
  V: diag(14, (r) => [[Math.round(r * 0.34), Math.round(r * 0.34) + 3], [10 - Math.round(r * 0.34), 13 - Math.round(r * 0.34)]]),
  E: [...rep('##########', 3), ...rep('####......', 3), ...rep('########..', 4), ...rep('####......', 3), ...rep('##########', 3)],
};
// hollow letters drawn as glowing tubes with a soft halo
function neonWord(word, tube, core, halo) {
  let W = 6; for (const ch of word) W += LETTERS[ch][0].length + 3;
  const p = new Pix(W + 2, 24), mask = new Pix(W + 2, 24);
  let x = 4;
  for (const ch of word) {
    const rows = LETTERS[ch];
    rows.forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') mask.set(x + i, y + 4, 1); });
    x += rows[0].length + 3;
  }
  for (let y = 0; y < 24; y++) for (let i = 0; i < p.w; i++) {
    const m = mask.get(i, y);
    const edge = m && !(mask.get(i - 1, y) && mask.get(i + 1, y) && mask.get(i, y - 1) && mask.get(i, y + 1));
    if (edge) p.set(i, y, !mask.get(i, y - 1) || !mask.get(i - 1, y) ? core : tube);
    else if (m) p.set(i, y, C.ink);
    else {
      let near = 9;
      for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) if (mask.get(i + a, y + b)) near = Math.min(near, Math.max(Math.abs(a), Math.abs(b)));
      if (near === 1) p.set(i, y, halo[0]); else if (near === 2 && (i + y) % 2) p.set(i, y, halo[1]);
    }
  }
  return { can: p.toCanvas(), w: p.w };
}
const LOGO = [neonWord('FLAMINGO', C.m3, C.m5, [C.m1, C.m1]), neonWord('DRIVE', C.a5, C.a6, [C.a2, C.a1])];

function title(g, game) {
  g.fillStyle = 'rgba(14,11,22,0.5)'; g.fillRect(0, 0, VIEW.w, VIEW.h);
  const fl = (k) => (Math.floor(game.time * 30 + k * 7) % 97 < 3 ? 0.55 : 1);
  const y0 = 52 + Math.round(Math.sin(game.time * 1.2) * 1.5);
  g.globalAlpha = fl(0); g.drawImage(LOGO[0].can, (VIEW.w - LOGO[0].w) >> 1, y0);
  g.globalAlpha = fl(5); g.drawImage(LOGO[1].can, ((VIEW.w - LOGO[1].w) >> 1) + 26, y0 + 24);
  g.globalAlpha = 1;
  drawText(g, spaced('a tiny top-down crime sandbox'), VIEW.w / 2, y0 + 54, { font: SMALL, color: P.y5, outline: P.ink, align: 'center' });
  if (Math.floor(game.stateT / 28) % 2 === 0) drawText(g, 'Click or press any key to start', VIEW.w / 2, 140, { color: P.white, outline: P.ink, align: 'center' });
  drawText(g, 'ON FOOT  WASD MOVE   MOUSE AIM   CLICK SHOOT   E ENTER CAR', VIEW.w / 2, 186, { font: SMALL, color: P.n7, outline: P.ink, align: 'center' });
  drawText(g, 'DRIVING  W S THROTTLE   A D STEER   SPACE HANDBRAKE   E EXIT', VIEW.w / 2, 195, { font: SMALL, color: P.n7, outline: P.ink, align: 'center' });
  drawText(g, 'every pixel on screen is generated by code', VIEW.w / 2, 205, { font: SMALL, color: P.m4, outline: P.ink, align: 'center' });
}

function pause(g) {
  g.fillStyle = 'rgba(14,11,22,0.62)'; g.fillRect(0, 0, VIEW.w, VIEW.h);
  drawText(g, spaced('Paused'), VIEW.w / 2, 60, { color: P.m3, outline: P.ink, align: 'center' });
  const rows = [['WASD / ARROWS', 'Walk, or throttle and steer'], ['MOUSE', 'Aim and shoot on foot'], ['SPACE', 'Shoot on foot, handbrake in a car'], ['E', 'Enter or leave a car, take a job'], ['M / F', 'Mute / fullscreen'], ['ESC', 'Resume']];
  rows.forEach(([k, v], i) => {
    drawText(g, k, VIEW.w / 2 - 8, 82 + i * 11, { font: SMALL, color: P.a5, outline: P.ink, align: 'right' });
    drawText(g, v, VIEW.w / 2, 82 + i * 11, { font: SMALL, color: P.white, outline: P.ink });
  });
}

function touchPad(g, game) {
  const tp = game.input.touch;
  if (!tp || !tp.on) return;
  const ring = (cx, cy, r, col, a) => { g.globalAlpha = a; g.fillStyle = col; for (let i = 0; i < 40; i++) { const an = (i / 40) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r), 1, 1); } g.globalAlpha = 1; };
  if (tp.stick) { ring(tp.stick.ox, tp.stick.oy, 16, P.white, 0.5); g.globalAlpha = 0.6; g.fillStyle = P.m3; g.fillRect(Math.round(tp.stick.ox + tp.stick.dx * 16) - 3, Math.round(tp.stick.oy + tp.stick.dy * 16) - 3, 6, 6); g.globalAlpha = 1; }
  for (const b of tp.buttons) { ring(b.x, b.y, b.r, b.down ? P.y4 : P.white, 0.7); drawText(g, b.label(game), b.x, b.y - 2, { font: SMALL, color: b.down ? P.y4 : P.white, outline: P.ink, align: 'center' }); }
}

export function drawUI(g, game) {
  if (game.state === 'title') title(g, game);
  else {
    radar(g, game); status(g, game); prompts(g, game); texts(g, game); touchPad(g, game);
    if (game.state === 'pause') pause(g);
  }
  if (game.fade > 0) { g.fillStyle = `rgba(14,11,22,${Math.min(1, game.fade)})`; g.fillRect(0, 0, VIEW.w, VIEW.h); }
  if (game.flash > 0) { g.fillStyle = `rgba(255,240,220,${Math.min(1, game.flash)})`; g.fillRect(0, 0, VIEW.w, VIEW.h); }
  if (game.muted) drawText(g, 'MUTED', 6, VIEW.h - 8, { font: SMALL, color: P.n6, outline: P.ink });
}

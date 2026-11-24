// HUD, shop panel, title and ending card. Painted in the same palette as the world.
import { C, P } from '../../src/gfx/palette.js';
import { Pix, bayer } from '../../src/gfx/pixel.js';
import { drawText, textWidth, SMALL } from '../../src/gfx/font.js';
import { ICONS, ITEMS } from './art.js';
import { VIEW } from './beach.js';

const cache = new Map();
const can = (pix) => { let c = cache.get(pix); if (!c) { c = pix.toCanvas(); cache.set(pix, c); } return c; };
const spaced = (s) => s.toUpperCase().split('').join(' ');

// cream paper panel with a driftwood frame
function paper(g, x, y, w, h) {
  const key = 'paper' + w + 'x' + h;
  let c = cache.get(key);
  if (!c) {
    const p = new Pix(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const edge = Math.min(i, j, w - 1 - i, h - 1 - j);
      const corner = edge === 0 && ((i < 2 || i > w - 3) && (j < 2 || j > h - 3)) && (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
      if (corner) continue;
      let v;
      if (edge === 0) v = C.ink;
      else if (edge === 1) v = j === 1 || i === 1 ? C.b6 : C.b4;
      else if (edge === 2) v = j === 2 || i === 2 ? C.b5 : C.b3;
      else if (edge === 3) v = C.b2;
      else v = (h - j) < 12 && (12 - (h - j)) / 12 * 0.7 > bayer(i, j) ? C.d5 : C.d6;
      p.set(i, j, v);
    }
    for (const [cx, cy] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) p.set(cx, cy, C.n6);
    c = p.toCanvas(); cache.set(key, c);
  }
  g.drawImage(c, Math.round(x), Math.round(y));
}

// small wooden badge behind HUD numbers
function plank(g, x, y, w, h) {
  g.fillStyle = P.ink; g.fillRect(x, y + 1, w, h - 2); g.fillRect(x + 1, y, w - 2, h);
  g.fillStyle = P.b3; g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = P.b4; g.fillRect(x + 1, y + 1, w - 2, h - 4);
  g.fillStyle = P.b5; g.fillRect(x + 2, y + 1, w - 4, 1);
}
function meter(g, x, y, w, h, frac, cols) {
  g.fillStyle = P.ink; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = P.b1; g.fillRect(x, y, w, h);
  const fw = Math.max(0, Math.min(w, Math.round(w * frac)));
  if (fw > 0) {
    g.fillStyle = cols[1]; g.fillRect(x, y, fw, h);
    g.fillStyle = cols[2]; g.fillRect(x, y, fw, 1);
    if (h > 2) { g.fillStyle = cols[0]; g.fillRect(x, y + h - 1, fw, 1); }
  }
}

function hud(g, game) {
  const p = game.player;
  // purse
  const coins = String(Math.floor(game.coins));
  const w1 = textWidth(coins) + 20;
  plank(g, 4, 4, w1, 13);
  g.drawImage(can(ICONS.coin), 6, 6 - (game.coinPop > 0 ? 1 : 0));
  drawText(g, coins, 17, 7, { color: P.y5, shadow: P.b1 });
  // basket
  const cap = game.stat.basket, full = p.bag.length >= cap;
  const label = p.bag.length + '/' + cap;
  const w2 = Math.max(50, textWidth(label, SMALL) + 40);
  plank(g, 4, 19, w2, 12);
  g.drawImage(can(ICONS.basket), 5, 20);
  meter(g, 17, 23, 22, 4, p.bag.length / cap, full ? [P.r2, P.r4, P.r5] : [P.y2, P.y4, P.y5]);
  drawText(g, label, 43, 23, { font: SMALL, color: full ? P.r5 : P.white, shadow: P.b1 });
  // the long-term goal
  if (!game.lit && !game.shopOpen) {
    const cost = game.lampCost, lw = 76, x = VIEW.w - lw - 4;
    plank(g, x, 4, lw, 13);
    g.drawImage(can(ICONS.lamp), x + 1, 3);
    meter(g, x + 13, 9, lw - 18, 4, Math.min(1, game.coins / cost), [P.a2, P.a4, P.a6]);
    drawText(g, 'LIGHTHOUSE LAMP', x + 13, 2, { font: SMALL, color: P.d6, outline: P.ink });
  }
  // tide clock: how long until the next big wave
  const tw = 60, tx = 4, ty = VIEW.h - 13;
  plank(g, tx, ty, tw, 10);
  g.drawImage(can(ICONS.tide), tx, ty - 2);
  const f = game.tide.surgeProgress();
  meter(g, tx + 13, ty + 3, tw - 17, 4, f, f > 0.92 && Math.floor(game.time * 8) % 2 ? [P.a4, P.white, P.white] : [P.a2, P.a4, P.a6]);
}

export const SHOP = { x: 166, y: 6, w: 150, row: 19, top: 21 };
export function shopRowAt(game, mx, my) {
  if (!game.shopOpen) return -1;
  const i = Math.floor((my - SHOP.y - SHOP.top) / SHOP.row);
  if (mx < SHOP.x + 3 || mx > SHOP.x + SHOP.w - 3 || i < 0 || i >= game.upgrades.length) return -1;
  return i;
}
function shop(g, game) {
  if (!game.shopOpen) return;
  const list = game.upgrades, h = SHOP.top + list.length * SHOP.row + 20;
  const x = SHOP.x + Math.round((1 - game.shopSlide) * 160), y = SHOP.y;
  paper(g, x, y, SHOP.w, h);
  g.fillStyle = P.a2; g.fillRect(x + 4, y + 4, SHOP.w - 8, 13);
  g.fillStyle = P.a3; g.fillRect(x + 4, y + 4, SHOP.w - 8, 1);
  g.fillStyle = P.a1; g.fillRect(x + 4, y + 16, SHOP.w - 8, 1);
  drawText(g, spaced('Seaside Supplies'), x + SHOP.w / 2, y + 7, { font: SMALL, color: P.white, align: 'center' });
  list.forEach((u, i) => {
    const ry = y + SHOP.top + i * SHOP.row, lvl = game.level[u.id], maxed = lvl >= u.max;
    const cost = game.costOf(u), afford = !maxed && game.coins >= cost, hot = game.shopHover === i;
    if (hot) { g.fillStyle = P.d5; g.fillRect(x + 4, ry, SHOP.w - 8, SHOP.row - 1); g.fillStyle = P.d4; g.fillRect(x + 4, ry + SHOP.row - 2, SHOP.w - 8, 1); }
    else if (i % 2) { g.fillStyle = 'rgba(180,150,107,0.14)'; g.fillRect(x + 4, ry, SHOP.w - 8, SHOP.row - 1); }
    if (u.flash > 0) { g.fillStyle = `rgba(255,251,221,${u.flash / 14})`; g.fillRect(x + 4, ry, SHOP.w - 8, SHOP.row - 1); }
    // key cap
    g.fillStyle = P.b2; g.fillRect(x + 6, ry + 4, 9, 10);
    g.fillStyle = afford ? P.y4 : P.d4; g.fillRect(x + 7, ry + 4, 7, 8);
    g.fillStyle = afford ? P.y6 : P.d5; g.fillRect(x + 7, ry + 4, 7, 1);
    drawText(g, String(i + 1), x + 11, ry + 6, { font: SMALL, color: P.b1, align: 'center' });
    g.globalAlpha = maxed ? 0.55 : 1;
    g.drawImage(can(ICONS[u.icon]), x + 18, ry + 3);
    g.globalAlpha = 1;
    drawText(g, u.name, x + 32, ry + 2, { color: maxed ? P.b4 : P.b1 });
    // level pips
    if (u.max > 1) for (let k = 0; k < u.max; k++) { g.fillStyle = k < lvl ? P.a3 : P.d4; g.fillRect(x + 32 + k * 5, ry + 13, 4, 2); if (k < lvl) { g.fillStyle = P.a5; g.fillRect(x + 32 + k * 5, ry + 13, 4, 1); } }
    if (maxed) drawText(g, u.max > 1 ? 'MAX' : 'DONE', x + SHOP.w - 8, ry + 6, { font: SMALL, color: P.y2, align: 'right' });
    else {
      const t = String(cost), tx = x + SHOP.w - 8 - textWidth(t);
      drawText(g, t, tx, ry + 5, { color: afford ? P.g3 : P.r3 });
      g.drawImage(can(ICONS.coin), tx - 10, ry + 3);
    }
  });
  const hov = list[game.shopHover] || null;
  const tip = hov ? hov.desc : 'Press a number or click to buy';
  drawText(g, tip, x + SHOP.w / 2, y + h - 14, { font: SMALL, color: P.b3, align: 'center' });
}

function toast(g, game) {
  const t = game.toastInfo;
  if (!t) return;
  const a = Math.min(1, t.t / 10, (t.dur - t.t) / 20);
  if (a <= 0) return;
  const w = textWidth(t.text) + 18, x = (VIEW.w - w) >> 1, y = 132 - Math.round(Math.min(1, t.t / 10) * 4);
  g.globalAlpha = a;
  paper(g, x, y, w, 18);
  drawText(g, t.text, VIEW.w / 2, y + 5, { color: P.b1, align: 'center' });
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- logo
const rep = (row, n) => Array(n).fill(row);
const M = ['####......####', '#####....#####', '######..######', '##############', '##############', '####.####.####', '####..##..####', ...rep('####......####', 9)];
const diag = (w, fn) => Array.from({ length: 16 }, (_, r) => { const row = Array(w).fill('.'); fn(r).forEach(([a, b]) => { for (let i = a; i <= b; i++) if (i >= 0 && i < w) row[i] = '#'; }); return row.join(''); });
const LETTERS = {
  W: [...M].reverse(),
  R: ['##########..', '###########.', '############', ...rep('####....####', 3), '############', '###########.', '##########..', '####.####...', '####..####..', '####...####.', ...rep('####....####', 4)],
  A: ['...######...', '..########..', '.##########.', ...rep('####....####', 4), ...rep('############', 3), ...rep('####....####', 6)],
  C: ['...######...', '..########..', '.##########.', '####....####', ...rep('####........', 8), '####....####', '.##########.', '..########..', '...######...'],
  K: diag(12, (r) => [[0, 3], r < 8 ? [8 - Math.round(r * 0.57), 11 - Math.round(r * 0.57)] : [4 + Math.round((r - 8) * 0.57), 7 + Math.round((r - 8) * 0.57)]]),
  L: [...rep('####......', 13), ...rep('##########', 3)],
  I: rep('####', 16),
  N: diag(13, (r) => [[0, 3], [9, 12], [Math.round(1 + r * (8 / 15)), Math.round(4 + r * (8 / 15))]]),
  E: [...rep('##########', 3), ...rep('####......', 3), ...rep('########..', 4), ...rep('####......', 3), ...rep('##########', 3)],
};
function makeLogo() {
  const word = 'WRACKLINE';
  let W = 4; for (const ch of word) W += LETTERS[ch][0].length + 2;
  const p = new Pix(W + 2, 24);
  const sand = [C.y6, C.y5, C.y4, C.y3, C.y2], sea = [C.a6, C.a5, C.a4, C.a3, C.a2];
  const band = (y) => (y < 2 ? 0 : y < 6 ? 1 : y < 11 ? 2 : y < 14 ? 3 : 4);
  let x = 3;
  [...word].forEach((ch, idx) => {
    const rows = LETTERS[ch], rampc = idx < 5 ? sand : sea;
    rows.forEach((row, y) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== '#') continue;
        const up = y > 0 && rows[y - 1][i] === '#', dn = y < rows.length - 1 && rows[y + 1][i] === '#', lf = i > 0 && row[i - 1] === '#';
        let c = rampc[band(y)];
        if (!up) c = rampc[0]; else if (!dn) c = rampc[4]; else if (!lf && y > 1) c = rampc[Math.max(0, band(y) - 1)];
        // a waterline runs through the sea-coloured half
        if (idx >= 5 && y === 9 && (i + idx) % 3 !== 0) c = C.white;
        p.set(x + i, y + 3, c);
      }
    });
    x += rows[0].length + 2;
  });
  const out = p.outline(C.ink, 'ink', false);
  const sh = new Pix(out.w, out.h + 3);
  for (let y = 0; y < out.h; y++) for (let i = 0; i < out.w; i++) if (out.d[y * out.w + i]) { sh.set(i, y + 2, C.ink); sh.set(i, y + 3, C.a1); }
  sh.blit(out, 0, 0);
  return { can: sh.toCanvas(), w: sh.w, h: sh.h };
}
const LOGO = makeLogo();

function title(g, game) {
  g.fillStyle = 'rgba(16,58,94,0.28)'; g.fillRect(0, 0, VIEW.w, VIEW.h);
  const lx = (VIEW.w - LOGO.w) >> 1, ly = 40 + Math.round(Math.sin(game.time * 1.3) * 1.5);
  g.drawImage(LOGO.can, lx, ly);
  drawText(g, spaced('a tiny beachcombing incremental'), VIEW.w / 2, ly + 29, { font: SMALL, color: P.d6, outline: P.ink, align: 'center' });
  // a row of finds under the title
  const show = [0, 2, 5, 6, 3, 7, 4, 1];
  show.forEach((idx, i) => { const c = can(ITEMS[idx].pix); g.drawImage(c, Math.round(VIEW.w / 2 - 68 + i * 18 - c.width / 2 + 5), Math.round(ly + 44 - c.height / 2 + Math.sin(game.time * 2 + i * 0.8) * 1.5)); });
  if (Math.floor(game.stateT / 28) % 2 === 0) drawText(g, game.hasSave ? 'Click or press any key to continue' : 'Click or press any key to begin', VIEW.w / 2, 118, { color: P.white, outline: P.ink, align: 'center' });
  drawText(g, 'WALK WASD OR ARROWS, OR HOLD THE MOUSE    SELL AND SHOP AT THE HUT', VIEW.w / 2, 163, { font: SMALL, color: P.d6, outline: P.ink, align: 'center' });
  drawText(g, 'every pixel on screen is generated by code', VIEW.w / 2, 171, { font: SMALL, color: P.a6, outline: P.ink, align: 'center' });
}

function ending(g, game) {
  const e = game.end;
  if (!e || e.t < 260 || e.done) return;
  g.globalAlpha = Math.min(1, (e.t - 260) / 50);
  const w = 216, h = 78, x = (VIEW.w - w) >> 1, y = VIEW.h - h - 6;
  paper(g, x, y, w, h);
  drawText(g, spaced('The light is back'), VIEW.w / 2, y + 9, { color: P.b1, align: 'center' });
  g.fillStyle = P.b4; g.fillRect(x + 40, y + 21, w - 80, 1);
  const s = Math.floor(game.playTime / 60);
  drawText(g, 'Ships will find the cove again tonight.', VIEW.w / 2, y + 27, { color: P.b2, align: 'center' });
  drawText(g, `Finds ${game.totalFinds}    Coins earned ${Math.floor(game.totalEarned)}    Time ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, VIEW.w / 2, y + 41, { font: SMALL, color: P.b3, align: 'center' });
  drawText(g, 'Thank you for playing', VIEW.w / 2, y + 52, { color: P.a2, align: 'center' });
  if (e.t > 360 && Math.floor(e.t / 28) % 2 === 0) drawText(g, 'CLICK OR PRESS ANY KEY TO KEEP COMBING', VIEW.w / 2, y + 66, { font: SMALL, color: P.b4, align: 'center' });
  g.globalAlpha = 1;
}

function pause(g, game) {
  g.fillStyle = 'rgba(14,11,22,0.5)'; g.fillRect(0, 0, VIEW.w, VIEW.h);
  const w = 190, h = 112, x = (VIEW.w - w) >> 1, y = (VIEW.h - h) >> 1;
  paper(g, x, y, w, h);
  drawText(g, spaced('Paused'), VIEW.w / 2, y + 9, { color: P.b1, align: 'center' });
  g.fillStyle = P.b4; g.fillRect(x + 50, y + 21, w - 100, 1);
  const rows = [['WASD / ARROWS', 'Walk'], ['HOLD MOUSE', 'Walk toward the pointer'], ['1 - 7 / CLICK', 'Buy at the hut'], ['M', 'Mute'], ['F', 'Fullscreen'], ['ESC', 'Resume'], ['N', 'Start over (wipes progress)']];
  rows.forEach(([k, v], i) => {
    drawText(g, k, x + 76, y + 30 + i * 10, { font: SMALL, color: P.a2, align: 'right' });
    drawText(g, v, x + 84, y + 30 + i * 10, { font: SMALL, color: P.b2 });
  });
}

export function drawUI(g, game) {
  if (game.state === 'title') title(g, game);
  else {
    if (!game.end || game.end.done) hud(g, game);
    shop(g, game);
    toast(g, game);
    ending(g, game);
    if (game.state === 'pause') pause(g, game);
  }
  if (game.fade > 0) { g.fillStyle = `rgba(14,11,22,${Math.min(1, game.fade)})`; g.fillRect(0, 0, VIEW.w, VIEW.h); }
  if (game.whiteout > 0) { g.fillStyle = `rgba(255,246,220,${Math.min(1, game.whiteout)})`; g.fillRect(0, 0, VIEW.w, VIEW.h); }
  if (game.muted) drawText(g, 'MUTED', VIEW.w - 5, VIEW.h - 8, { font: SMALL, color: P.d6, outline: P.ink, align: 'right' });
}

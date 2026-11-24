// Everything drawn on top of the world: HUD, prompts, dialogue, banners, menus.
import { P } from '../gfx/palette.js';
import { drawText, textWidth, wrapText, FONT, SMALL } from '../gfx/font.js';
import { panel, bar, BAR, keycap, portrait, badge, ICON, LOGO, ornament } from '../gfx/ui.js';
import { VIEW_W, VIEW_H } from '../gfx/art-bg.js';
import { FIRE } from './fx.js';

const spaced = (s) => s.toUpperCase().split('').join(' ');

function hud(g, game) {
  const h = game.hero;
  badge(g, 5, 5);
  bar(g, 27, 6, 58, 5, h.hp / h.maxHp, BAR.hp, h.hpLag / h.maxHp);
  bar(g, 27, 14, 40, 3, h.mp / h.maxMp, BAR.mp);
  bar(g, 27, 20, 40, 2, h.xp / h.xpNext, BAR.xp);
  drawText(g, h.hp + '/' + h.maxHp, 88, 6, { font: SMALL, color: P.white, outline: P.ink });
  drawText(g, 'LV ' + h.lvl, 71, 15, { font: SMALL, color: P.y4, outline: P.ink });

  // purse
  let x = VIEW_W - 6;
  const coins = String(h.coins);
  x -= textWidth(coins); drawText(g, coins, x, 6, { color: P.y5, outline: P.ink });
  x -= 11; g.drawImage(ICON.coin, x, 4);
  x -= 8; const pots = String(h.potions);
  x -= textWidth(pots); drawText(g, pots, x, 6, { color: h.potions ? P.white : P.n5, outline: P.ink });
  x -= 11; g.drawImage(ICON.potion, x, 2);
  if (h.hasSpell) { x -= 14; g.globalAlpha = h.mp >= 3 ? 1 : 0.4; g.drawImage(ICON.ember, x, 3); g.globalAlpha = 1; }

  if (game.quest.text) {
    g.fillStyle = P.y4; g.fillRect(6, 30, 3, 3); g.fillStyle = P.ink; g.fillRect(7, 31, 1, 1);
    drawText(g, game.quest.text, 12, 29, { font: SMALL, color: P.y5, outline: P.ink });
  }
}

function prompt(g, game) {
  const it = game.focus;
  if (!it || game.state !== 'play') return;
  const x = Math.round(it.x - game.cam.x), y = Math.round(it.y + it.interact.dy - game.cam.y + Math.sin(game.time * 5) * 1.5);
  const label = it.interact.label, key = game.input.touch ? 'E' : 'E';
  const w = 11 + textWidth(label, SMALL) + 3;
  const kx = Math.round(x - w / 2);
  keycap(g, kx, y - 8, key);
  drawText(g, label, kx + 12, y - 6, { font: SMALL, color: P.white, outline: P.ink });
}

function bossBar(g, game) {
  const b = game.boss;
  if (!b || !game.arenaLocked || b.mode === 'sleep') return;
  const w = 180, x = (VIEW_W - w) >> 1, y = VIEW_H - 14;
  drawText(g, spaced(b.name), VIEW_W / 2, y - 10, { font: SMALL, color: P.p6, outline: P.ink, align: 'center' });
  bar(g, x, y, w, 4, Math.max(0, b.hp / b.maxHp), BAR.boss);
  g.fillStyle = P.ink; g.fillRect(x - 3, y - 2, 2, 8); g.fillRect(x + w + 1, y - 2, 2, 8);
  g.fillStyle = P.p5; g.fillRect(x - 3, y, 1, 4); g.fillRect(x + w + 2, y, 1, 4);
}

function banner(g, game) {
  const b = game.bannerInfo;
  if (!b) return;
  const t = b.t, dur = b.dur;
  const a = Math.min(1, t / 20, (dur - t) / 30);
  if (a <= 0) return;
  g.globalAlpha = a;
  const y = 46 - Math.round((1 - Math.min(1, t / 20)) * 6);
  const title = spaced(b.title);
  const half = Math.round(textWidth(title) / 2) + 10;
  g.fillStyle = 'rgba(14,11,22,0.38)'; g.fillRect(0, y - 9, VIEW_W, b.sub ? 33 : 24);
  drawText(g, title, VIEW_W / 2, y, { color: b.color || P.y5, outline: P.ink, align: 'center' });
  ornament(g, VIEW_W / 2, y + 12, half, b.color || P.y4);
  if (b.sub) drawText(g, b.sub, VIEW_W / 2, y + 16, { font: SMALL, color: P.n7, outline: P.ink, align: 'center' });
  g.globalAlpha = 1;
}

function toast(g, game) {
  const t = game.toastInfo;
  if (!t) return;
  const a = Math.min(1, t.t / 10, (t.dur - t.t) / 20);
  const w = textWidth(t.text) + 16, x = (VIEW_W - w) >> 1, y = 150 - Math.round(Math.min(1, t.t / 10) * 4);
  g.globalAlpha = Math.max(0, a);
  panel(g, x, y, w, 16);
  drawText(g, t.text, VIEW_W / 2, y + 4, { color: t.color || P.y5, align: 'center' });
  g.globalAlpha = 1;
}

function dialog(g, game) {
  const d = game.dialog;
  if (!d) return;
  const line = d.lines[d.i];
  const bx = 10, by = 14, bw = 300, bh = 52;
  panel(g, bx, by, bw, bh);
  let tx = bx + 10;
  if (line.face) { portrait(g, bx + 9, by + 10, line.face); tx = bx + 44; }
  if (line.who) {
    const w = textWidth(line.who) + 12;
    panel(g, bx + 6, by - 9, w, 15);
    drawText(g, line.who, bx + 12, by - 6, { color: P.y5 });
  }
  const lines = wrapText(line.text, bx + bw - 12 - tx);
  let left = Math.floor(d.chars);
  lines.forEach((ln, i) => {
    if (left <= 0) return;
    drawText(g, ln.slice(0, left), tx, by + 10 + i * 11, { color: P.white, shadow: P.u1 });
    left -= ln.length + 1;
  });
  if (d.chars >= line.text.length && Math.floor(game.time * 3) % 2) drawText(g, '▼', bx + bw - 14, by + bh - 12, { color: P.y4 });
}

function title(g, game) {
  const t = game.stateT;
  // darken the top so the logo reads
  g.fillStyle = 'rgba(14,11,22,0.35)'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  const lx = (VIEW_W - LOGO.w) >> 1, ly = 34 + Math.round(Math.sin(game.time * 1.4) * 1.5);
  g.drawImage(LOGO.can, lx, ly);
  // the "I" is a candle: draw its flame live
  const fx = lx + LOGO.flame[0], fy = ly + LOGO.flame[1];
  const fl = Math.floor(game.time * 9) % 3;
  g.fillStyle = FIRE[4]; g.fillRect(fx - 2, fy - 3 - (fl === 1 ? 1 : 0), 4, 5);
  g.fillStyle = FIRE[2]; g.fillRect(fx - 1, fy - 4 - fl, 2, 6);
  g.fillStyle = FIRE[0]; g.fillRect(fx - 1 + (fl === 2 ? 1 : 0), fy - 1, 1, 2);
  g.fillStyle = FIRE[3]; g.fillRect(fx - 1 + (fl % 2), fy - 6 - fl, 1, 2);
  drawText(g, spaced('a tiny pixel-art adventure'), VIEW_W / 2, ly + 28, { font: SMALL, color: P.y5, outline: P.ink, align: 'center' });
  ornament(g, VIEW_W / 2, ly + 39, 62, P.y3);
  if (Math.floor(t / 28) % 2 === 0) drawText(g, game.input.touch ? 'Tap to begin' : 'Click or press any key to begin', VIEW_W / 2, 112, { color: P.white, outline: P.ink, align: 'center' });
  drawText(g, 'MOVE A D   JUMP SPACE   ATTACK J   DASH L   USE E', VIEW_W / 2, 160, { font: SMALL, color: P.n6, outline: P.ink, align: 'center' });
  drawText(g, 'every pixel on screen is generated by code', VIEW_W / 2, 169, { font: SMALL, color: P.n5, outline: P.ink, align: 'center' });
}

function pause(g, game) {
  const h = game.hero;
  g.fillStyle = 'rgba(14,11,22,0.6)'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  const w = 216, hh = 132, x = (VIEW_W - w) >> 1, y = (VIEW_H - hh) >> 1;
  panel(g, x, y, w, hh);
  drawText(g, spaced('Paused'), VIEW_W / 2, y + 8, { color: P.y5, align: 'center' });
  ornament(g, VIEW_W / 2, y + 20, 50, P.y3);
  portrait(g, x + 12, y + 30, 'hero');
  drawText(g, 'Wren', x + 44, y + 30, { color: P.white });
  drawText(g, 'Lamplighter  Lv ' + h.lvl, x + 44, y + 41, { font: SMALL, color: P.n6 });
  drawText(g, `HP ${h.hp}/${h.maxHp}   MP ${h.mp}/${h.maxMp}   ATK ${h.atk}`, x + 44, y + 49, { font: SMALL, color: P.y5 });
  const rows = [['A D / ARROWS', 'Move'], ['SPACE', 'Jump (hold = higher)'], ['J', 'Sword combo'], ['L', 'Dash through danger'], ['K', h.hasSpell ? 'Ember Spark (3 MP)' : '???'], ['E', 'Talk / use'], ['Q', 'Drink tonic'], ['M / F', 'Mute / fullscreen']];
  rows.forEach(([k, v], i) => {
    drawText(g, k, x + 86, y + 64 + i * 8, { font: SMALL, color: P.y4, align: 'right' });
    drawText(g, v, x + 94, y + 64 + i * 8, { font: SMALL, color: P.n7 });
  });
}

function ending(g, game) {
  const e = game.end;
  if (!e || e.t < 200) return;
  const a = Math.min(1, (e.t - 200) / 60);
  g.globalAlpha = a;
  const w = 220, hh = 84, x = (VIEW_W - w) >> 1, y = 4;
  panel(g, x, y, w, hh);
  drawText(g, spaced('The Ember burns again'), VIEW_W / 2, y + 9, { color: P.y5, align: 'center' });
  ornament(g, VIEW_W / 2, y + 21, 70, P.y3);
  const h = game.hero, s = Math.floor(game.playTime / 60);
  const lines = [
    'Lanternwick will see another dawn.',
    '',
    `Level ${h.lvl}    Foes felled ${h.kills}    Coins ${h.coins}`,
    `Time ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  ].filter((l, i) => i !== 1);
  lines.forEach((ln, i) => drawText(g, ln, VIEW_W / 2, y + 27 + i * 9, { color: i < 1 ? P.white : P.n7, align: 'center' }));
  drawText(g, 'Thank you for playing', VIEW_W / 2, y + 66, { color: P.y4, align: 'center' });
  if (e.t > 320 && Math.floor(e.t / 28) % 2 === 0) drawText(g, 'Press E to keep exploring', VIEW_W / 2, y + hh + 4, { font: SMALL, color: P.white, outline: P.ink, align: 'center' });
  g.globalAlpha = 1;
}

export function drawUI(g, game) {
  if (game.state === 'title') { title(g, game); }
  else {
    if ((!game.end || game.end.done) && !game.dialog) hud(g, game);
    prompt(g, game);
    bossBar(g, game);
    banner(g, game);
    toast(g, game);
    dialog(g, game);
    if (game.levelFlash > 0) {
      const t = game.levelFlash;
      const y = Math.round(game.hero.y - game.cam.y - 40 - (90 - t) * 0.15);
      if (t > 12 || t % 2) drawText(g, spaced('Level up'), Math.round(game.hero.x - game.cam.x), y, { color: P.y5, outline: P.ink, align: 'center' });
    }
    ending(g, game);
    if (game.state === 'pause') pause(g, game);
  }
  // screen fades & flashes
  if (game.fade > 0) { g.fillStyle = `rgba(14,11,22,${Math.min(1, game.fade)})`; g.fillRect(0, 0, VIEW_W, VIEW_H); }
  if (game.whiteout > 0) { g.fillStyle = `rgba(255,246,220,${Math.min(1, game.whiteout)})`; g.fillRect(0, 0, VIEW_W, VIEW_H); }
  if (game.muted) drawText(g, 'MUTED', VIEW_W - 5, VIEW_H - 8, { font: SMALL, color: P.n5, outline: P.ink, align: 'right' });
}

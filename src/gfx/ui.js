// UI art: framed panels, bars, key caps and the title logo.
import { C, P } from './palette.js';
import { Pix, makeCanvas, ctx2d, bayer } from './pixel.js';
import { drawText, textWidth, SMALL } from './font.js';
import { PORTRAITS } from './art-chars.js';
import { COIN, POTION, EMBER_ORB } from './art-props.js';

const panels = new Map();
export function panel(g, x, y, w, h, style = 'night') {
  const key = w + 'x' + h + style;
  let c = panels.get(key);
  if (!c) {
    const p = new Pix(w, h);
    const fill = style === 'night' ? [C.u1, C.u2] : [C.n1, C.n2];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const edge = Math.min(i, j, w - 1 - i, h - 1 - j);
      const corner = (i < 2 && j < 2 && i + j < 2) || (i > w - 3 && j < 2 && (w - 1 - i) + j < 2) || (i < 2 && j > h - 3 && i + (h - 1 - j) < 2) || (i > w - 3 && j > h - 3 && (w - 1 - i) + (h - 1 - j) < 2);
      if (corner && edge === 0) continue;
      let c2;
      if (edge === 0) c2 = C.ink;
      else if (edge === 1) c2 = j === 1 || i === 1 ? C.b7 : C.b5;
      else if (edge === 2) c2 = C.ink;
      else c2 = j < 9 && (9 - j) / 9 * 0.8 > bayer(i, j) ? fill[1] : fill[0];
      p.set(i, j, c2);
    }
    // corner studs
    for (const [cx, cy] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) {
      p.set(cx, cy, C.y5); p.set(cx - 1, cy, C.y3); p.set(cx + 1, cy, C.y3); p.set(cx, cy - 1, C.y3); p.set(cx, cy + 1, C.y3);
    }
    c = p.toCanvas(); panels.set(key, c);
  }
  g.drawImage(c, Math.round(x), Math.round(y));
}

export const BAR = {
  hp: [P.r2, P.r4, P.r5, P.m4],
  mp: [P.u2, P.u4, P.u5, P.u7],
  xp: [P.y1, P.y3, P.y4, P.y6],
  boss: [P.p2, P.p4, P.p5, P.p6],
};
export function bar(g, x, y, w, h, frac, cols, lag = 0) {
  g.fillStyle = P.ink; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = P.n2; g.fillRect(x, y, w, h);
  g.fillStyle = P.n1; g.fillRect(x, y, w, 1);
  const fw = Math.max(0, Math.min(w, Math.round(w * frac)));
  if (lag > frac) { g.fillStyle = P.y5; g.fillRect(x, y, Math.min(w, Math.round(w * lag)), h); }
  if (fw > 0) {
    g.fillStyle = cols[1]; g.fillRect(x, y, fw, h);
    g.fillStyle = cols[2]; g.fillRect(x, y, fw, Math.max(1, h >> 1));
    if (h > 2) { g.fillStyle = cols[0]; g.fillRect(x, y + h - 1, fw, 1); }
    g.fillStyle = cols[3]; g.fillRect(x + Math.max(0, fw - 1), y, 1, Math.max(1, h - 1));
    if (h > 3 && fw > 4) g.fillRect(x + 1, y + 1, Math.min(fw - 2, 3), 1);
  }
}

export function keycap(g, x, y, label) {
  const w = Math.max(9, textWidth(label, SMALL) + 6);
  g.fillStyle = P.ink; g.fillRect(x, y + 1, w, 9); g.fillRect(x + 1, y, w - 2, 11);
  g.fillStyle = P.n5; g.fillRect(x + 1, y + 1, w - 2, 9);
  g.fillStyle = P.n7; g.fillRect(x + 1, y + 1, w - 2, 7);
  g.fillStyle = P.white; g.fillRect(x + 2, y + 1, w - 4, 1);
  drawText(g, label, x + (w >> 1) + 1, y + 2, { font: SMALL, color: P.n1, align: 'center' });
  return w;
}

function toCan(pix) { return pix.toCanvas(); }
export const ICON = {
  coin: toCan(COIN[0]), potion: toCan(POTION), ember: toCan(EMBER_ORB[0].outline(C.ink)),
  face: {},
};
for (const k in PORTRAITS) ICON.face[k] = toCan(PORTRAITS[k]);

// framed portrait
export function portrait(g, x, y, who) {
  g.fillStyle = P.ink; g.fillRect(x - 2, y - 2, 28, 28);
  g.fillStyle = P.b6; g.fillRect(x - 1, y - 1, 26, 26);
  g.fillStyle = P.b4; g.fillRect(x, y - 1 + 25, 25, 1); g.fillRect(x + 24, y, 1, 25);
  const bg = { hero: P.t2, elder: P.p1, smith: P.b2, kid: P.u2, cat: P.g2 }[who] || P.u1;
  g.fillStyle = bg; g.fillRect(x, y, 24, 24);
  if (ICON.face[who]) g.drawImage(ICON.face[who], x, y);
}
// small round-ish hero badge for the HUD
export function badge(g, x, y) {
  g.fillStyle = P.ink; g.fillRect(x - 1, y, 20, 18); g.fillRect(x, y - 1, 18, 20);
  g.fillStyle = P.b6; g.fillRect(x, y, 18, 18);
  g.fillStyle = P.b4; g.fillRect(x + 1, y + 17, 17, 1); g.fillRect(x + 17, y + 1, 1, 17);
  g.fillStyle = P.t2; g.fillRect(x + 1, y + 1, 16, 16);
  g.drawImage(ICON.face.hero, 4, 2, 16, 16, x + 1, y + 1, 16, 16);
}

// ---------------------------------------------------------------- logo
const rep = (row, n) => Array(n).fill(row);
const LETTERS = {
  M: ['####......####', '#####....#####', '######..######', '##############', '##############', '####.####.####', '####..##..####', ...rep('####......####', 9)],
  O: ['...######...', '..########..', '.##########.', ...rep('####....####', 10), '.##########.', '..########..', '...######...'],
  S: ['..########..', '.##########.', '############', '####....####', '####........', '####........', '#####.......', '.########...', '...########.', '.......#####', '........####', '........####', '####....####', '############', '.##########.', '..########..'],
  L: [...rep('####......', 13), ...rep('##########', 3)],
  I: [...rep('....', 5), '####', ...rep('####', 10)],
  G: ['...######...', '..########..', '.##########.', '####....####', '####........', '####........', '####........', '####..######', '####..######', '####..######', ...rep('####....####', 3), '.##########.', '..########..', '...######...'],
  H: [...rep('####....####', 6), ...rep('############', 4), ...rep('####....####', 6)],
  T: [...rep('############', 4), ...rep('....####....', 12)],
};
function makeLogo() {
  const word = 'MOSSLIGHT';
  let W = 4; for (const ch of word) W += LETTERS[ch][0].length + 2;
  const p = new Pix(W + 2, 24);
  const green = [C.g7, C.g6, C.g5, C.g4, C.g3], gold = [C.y6, C.y5, C.y4, C.y3, C.y2];
  const band = (y) => (y < 2 ? 0 : y < 6 ? 1 : y < 11 ? 2 : y < 14 ? 3 : 4);
  let x = 3, flame = 0;
  [...word].forEach((ch, idx) => {
    const rows = LETTERS[ch], ramp = idx < 4 ? green : gold;
    if (ch === 'I') flame = x + 2;
    rows.forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') p.set(x + i, y + 3, ramp[band(y)]); });
    // bevel
    rows.forEach((row, y) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== '#') continue;
        const up = y > 0 && rows[y - 1][i] === '#', dn = y < rows.length - 1 && rows[y + 1][i] === '#';
        const lf = i > 0 && row[i - 1] === '#';
        if (!up) p.set(x + i, y + 3, ramp[0]);
        else if (!dn) p.set(x + i, y + 3, ramp[4]);
        else if (!lf && y > 1) p.set(x + i, y + 3, ramp[Math.max(0, band(y) - 1)]);
      }
    });
    // moss creeping over the first word
    if (idx < 4) for (let i = 0; i < rows[0].length; i++) {
      if (rows[0][i] !== '#' && rows[1][i] !== '#') continue;
      const hgt = (i * 7 + idx * 3) % 5;
      for (let k = 0; k < hgt - 1; k++) p.setOn(x + i, 3 + k + (rows[0][i] === '#' ? 0 : 1), k === 0 ? C.g7 : C.t5);
    }
    x += rows[0].length + 2;
  });
  let out = p.outline(C.ink, 'ink', false);
  // heavy drop shadow
  const sh = new Pix(out.w, out.h + 3);
  for (let y = 0; y < out.h; y++) for (let i = 0; i < out.w; i++) if (out.d[y * out.w + i]) { sh.set(i, y + 2, C.ink); sh.set(i, y + 3, C.u1); }
  sh.blit(out, 0, 0);
  return { can: sh.toCanvas(), flame: [flame, 6], w: sh.w, h: sh.h };
}
export const LOGO = makeLogo();

// ornamental divider used under banners
export function ornament(g, cx, y, half, color = P.y4) {
  g.fillStyle = color;
  g.fillRect(cx - half, y, half - 4, 1); g.fillRect(cx + 5, y, half - 4, 1);
  g.fillRect(cx, y - 2, 1, 5); g.fillRect(cx - 2, y, 5, 1); g.fillRect(cx - 1, y - 1, 3, 3);
  g.fillStyle = P.ink; g.fillRect(cx, y, 1, 1);
  g.fillStyle = color; g.fillRect(cx - half - 2, y - 1, 1, 3); g.fillRect(cx + half + 2, y - 1, 1, 3);
}

export function gallery(section) {
  section('ui', [
    { label: 'logo', canvas: LOGO.can },
    { label: 'panel', w: 120, h: 40, draw: (g) => { panel(g, 0, 0, 120, 40); portrait(g, 6, 6, 'elder'); bar(g, 40, 8, 60, 5, 0.7, BAR.hp, 0.85); bar(g, 40, 17, 44, 3, 0.5, BAR.mp); bar(g, 40, 24, 44, 2, 0.3, BAR.xp); keycap(g, 90, 22, 'E'); } },
    { label: 'badge', w: 20, h: 20, draw: (g) => badge(g, 1, 1) },
    ...Object.keys(PORTRAITS).map((k) => ({ label: k, w: 28, h: 28, draw: (g) => portrait(g, 2, 2, k) })),
  ]);
}

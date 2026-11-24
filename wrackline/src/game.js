// Wrackline: walk the beach, gather what the tide leaves, sell it, upgrade, relight the lighthouse.
import { P, mix } from '../../src/gfx/palette.js';
import { makeCanvas, ctx2d, flipCanvas, rng, hash, noise1, clamp, lerp } from '../../src/gfx/pixel.js';
import { Lighting } from '../../src/gfx/light.js';
import { drawText, SMALL } from '../../src/gfx/font.js';
import { Particles, GOLD, SPARK } from '../../src/game/fx.js';
import { SONGS } from '../../src/audio.js';
import * as A from './art.js';
import { WORLD, VIEW, duneEdge, shoreBase, paintBeach, makeSea, castShadow } from './beach.js';
import { drawUI, shopRowAt, SHOP } from './ui.js';

const W = WORLD.w, H = WORLD.h, VW = VIEW.w, VH = VIEW.h;
const HUT = { x: 92, y: 72 };
const SELL = { x0: 64, x1: 120, y0: 72, y1: 92 };
const DROP = { x: 84, y: 76 };
const PIER = { x: 286, top: 200, len: 62, w: 22, tw: 40, th: 16 };
const TOWER = { x: 462, y: 104 };
const SQUASH = 0.72; // ground circles look this flat in the 3/4 view
const SAVE_KEY = 'wrackline.save.v1';

export const UPGRADES = [
  { id: 'reach', name: 'Longer Rake', desc: 'Pick things up from further away', icon: 'reach', base: 8, growth: 1.72, max: 8 },
  { id: 'basket', name: 'Bigger Basket', desc: 'Carry more before you have to sell', icon: 'basket', base: 10, growth: 1.68, max: 8 },
  { id: 'speed', name: 'Quick Sandals', desc: 'Walk faster', icon: 'speed', base: 15, growth: 1.8, max: 6 },
  { id: 'tide', name: 'Rich Tides', desc: 'Every wave leaves more behind', icon: 'tide', base: 28, growth: 1.85, max: 6 },
  { id: 'luck', name: 'Lucky Currents', desc: 'Rare finds wash up more often', icon: 'luck', base: 40, growth: 1.95, max: 5 },
  { id: 'crab', name: 'Helper Crab', desc: 'A crab that fetches shells for you', icon: 'crab', base: 60, growth: 2.2, max: 4 },
  { id: 'lamp', name: 'Lighthouse Lamp', desc: 'Relight the old lighthouse', icon: 'lamp', base: 2500, growth: 1, max: 1 },
];

SONGS.beach = {
  bpm: 96, len: 64, leadType: 'triangle', leadVol: 0.12, leadLen: 2.4,
  chords: [[60, 64, 67], [65, 69, 72], [57, 60, 64], [67, 71, 74]],
  lead: [
    72, null, 76, null, 79, null, 76, 72, null, null, 76, null, 79, null, null, null,
    77, null, 81, null, 84, null, 81, 77, null, null, 81, null, 77, null, null, null,
    76, null, 72, null, 69, null, 72, 76, null, null, 72, null, 69, null, null, null,
    74, null, 71, null, 67, null, 71, 74, null, null, 79, null, 74, null, null, null,
  ],
  bass: [1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 0, 2, 0],
  arp: [0, null, 1, null, 2, null, 1, null, 0, null, 2, null, 1, null, 2, null], arpVol: 0.05,
  drum: [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 2, 2, 0],
};
SONGS.night = {
  bpm: 72, len: 64, leadType: 'triangle', leadVol: 0.11, leadLen: 5, vib: 2,
  chords: [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]],
  lead: [
    79, null, null, null, 76, null, null, null, 72, null, null, null, 76, null, null, null,
    76, null, null, null, 72, null, null, null, 69, null, null, null, 72, null, null, null,
    77, null, null, null, 72, null, null, null, 69, null, null, null, 77, null, null, null,
    79, null, null, null, 74, null, null, null, 71, null, null, null, 74, null, null, null,
  ],
  bass: [1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0],
  arp: [0, null, 1, null, 2, null, 3, null, 2, null, 1, null, 2, null, 1, null], arpVol: 0.045,
};

// ---------------------------------------------------------------- the sea
class Tide {
  constructor() {
    this.t = 0; this.waves = [];
    this.nextSwash = 1.5; this.nextSurge = 20; this.surgeGap = 30; this.lastSurge = -10;
    this.wy = new Float32Array(W); this.wetY = new Float32Array(W); this.foamY = new Float32Array(W); this.foamA = new Float32Array(W);
    this.base = new Float32Array(W);
    for (let x = 0; x < W; x++) { this.base[x] = shoreBase(x); this.wy[x] = this.base[x]; this.wetY[x] = this.base[x] - 7; this.foamY[x] = this.base[x]; }
  }
  // fast run-up, slow drain
  static profile(s) {
    if (s <= 0 || s >= 1) return 0;
    if (s < 0.28) { const u = s / 0.28; return 1 - (1 - u) * (1 - u); }
    const u = (s - 0.28) / 0.72;
    return 1 - u * u * (3 - 2 * u);
  }
  reachOf(w, x, s) { return w.amp * Tide.profile(s) * (0.7 + 0.6 * noise1(x * 0.012 + w.seed * 9, w.seed)); }
  surgeProgress() { return clamp((this.t - this.lastSurge) / (this.nextSurge - this.lastSurge), 0, 1); }
  update(dt, game) {
    this.t += dt;
    if (this.t >= this.nextSwash) {
      this.waves.push({ t0: this.t, dur: 4.2, amp: 9 + Math.random() * 8, seed: Math.random() * 100 | 0, surge: false });
      this.nextSwash = this.t + 4.4 + Math.random() * 2;
      game.onWave(false);
    }
    if (this.t >= this.nextSurge) {
      this.waves.push({ t0: this.t, dur: 9, amp: 46 + Math.random() * 10, seed: Math.random() * 100 | 0, surge: true });
      this.lastSurge = this.t; this.nextSurge = this.t + this.surgeGap; this.nextSwash = Math.max(this.nextSwash, this.t + 7);
      game.onWave(true);
    }
    for (const w of this.waves) {
      w.s = (this.t - w.t0) / w.dur;
      if (!w.dropped && w.s >= 0.3) { w.dropped = true; game.deposit(w); }
    }
    this.waves = this.waves.filter((w) => w.s < 1);
    const t = this.t;
    for (let x = 0; x < W; x++) {
      let reach = 0;
      for (const w of this.waves) reach = Math.max(reach, this.reachOf(w, x, w.s));
      const y = this.base[x] - reach + Math.sin(x * 0.07 + t * 1.7) * 1.2 + Math.sin(x * 0.19 - t * 2.3) * 0.6;
      this.wy[x] = y;
      if (y < this.wetY[x]) { this.wetY[x] = y; this.foamY[x] = y; this.foamA[x] = 1; }
      else this.wetY[x] = Math.min(y, this.wetY[x] + 0.03);
      this.foamA[x] *= 0.993;
    }
  }
  // how far a wave will climb at x when it peaks
  peakAt(w, x) { return this.base[x] - this.reachOf(w, x, 0.28); }
}

// ---------------------------------------------------------------- game
export class Game {
  constructor(input, audio, opts = {}) {
    this.input = input; this.audio = audio; this.opts = opts;
    this.out = makeCanvas(VW, VH); this.g = ctx2d(this.out);
    this.shBuf = makeCanvas(VW, VH); this.sg = ctx2d(this.shBuf);
    this.ground = paintBeach(); this.sea = makeSea();
    this.light = new Lighting(VW, VH);
    this.fx = new Particles();
    this.upgrades = UPGRADES.map((u) => ({ ...u, flash: 0 }));
    this.lampCost = UPGRADES.find((u) => u.id === 'lamp').base;
    const two = (pix) => { const r = pix.toCanvas(); return { r, l: flipCanvas(r), w: pix.w, h: pix.h }; };
    this.itemCan = A.ITEMS.map((it) => two(it.pix));
    this.heroCan = A.HERO.frames.map((dir) => dir.map(two));
    this.crabCan = A.CRAB.map(two);
    this.gullCan = { stand: A.GULL.stand.map(two), fly: A.GULL.fly.map(two) };
    this.frame = 0; this.time = 0;
    this.buildWorld();
    this.reset();
    this.hasSave = this.load();
  }

  // ------------------------------------------------------------ world
  buildWorld() {
    const props = this.props = [], solids = this.solids = [];
    const add = (pix, x, y, ox, oy, o = {}) => {
      const pr = { can: pix.toCanvas(), x, y, ox, oy, sort: y + (o.z || 0), w: pix.w, h: pix.h, ...o };
      if (o.cast) pr.sh = castShadow(pix, oy - (o.lift || 0));
      props.push(pr);
      return pr;
    };
    const ell = (x, y, rx, ry) => solids.push({ x, y, rx, ry });
    const rect = (x0, y0, x1, y1) => solids.push({ x0, y0, x1, y1 });

    // the hut and the clutter around it
    const hut = A.makeHut();
    add(hut.pix, HUT.x, HUT.y, hut.ox, hut.oy, { cast: true });
    rect(HUT.x - 31, HUT.y - 30, HUT.x + 31, HUT.y + 1);
    add(A.LIFERING, HUT.x - 24, HUT.y + 0.5, 5, 8, { lift: 13 });
    add(A.SURFBOARD, HUT.x + 37, HUT.y - 1, 4, 18, { cast: true }); ell(HUT.x + 37, HUT.y - 2, 4, 3);
    add(A.CRATE, HUT.x + 48, HUT.y + 3, 7, 10, { cast: true }); rect(HUT.x + 41, HUT.y - 4, HUT.x + 55, HUT.y + 3);
    add(A.CRATE, HUT.x - 44, HUT.y - 2, 7, 10, { cast: true }); rect(HUT.x - 51, HUT.y - 9, HUT.x - 37, HUT.y - 2);
    add(A.BUCKET, 130, 96, 6, 9, { cast: true }); add(A.SPADE, 138, 97, 4, 8);
    add(A.SIGNPOST, 152, 82, 7, 11, { cast: true }); ell(152, 81, 3, 2);
    // a deck in front of the serving hatch marks where you sell
    const dg = ctx2d(this.ground.dry), wg = ctx2d(this.ground.wet);
    for (const g of [dg, wg]) for (let j = 0; j < 14; j++) for (let i = 0; i < 52; i++) {
      const row = j % 5, v = hash(Math.floor(j / 5), 1, 40);
      let c = v < 0.4 ? P.b5 : P.b6;
      if (row === 4) c = P.b3; else if (row === 0) c = P.d4;
      if (i === 0 || i === 51) c = P.b3;
      if ((i === 3 || i === 48) && row === 2) c = P.n3;
      if ((hash(Math.floor(j / 5), 2, 41) * 40 | 0) + 6 === i && row < 4) c = P.b4;
      g.fillStyle = c; g.fillRect(HUT.x - 26 + i, HUT.y + 2 + j, 1, 1);
    }

    // palms (three wind frames each)
    this.palms = [];
    [[24, 62, 3], [170, 50, 8], [238, 58, 5], [322, 46, 12], [394, 56, 2], [130, 44, 21], [28, 44, 17]].forEach(([x, y, seed], i) => {
      const fr = [-1, 0, 1].map((s) => A.makePalm(seed, s));
      const pr = add(fr[1].pix, x, y, fr[1].ox, fr[1].oy, { cast: true, palm: fr.map((f) => f.pix.toCanvas()), ph: i * 1.7 });
      pr.shs = fr.map((f) => castShadow(f.pix, f.oy));
      ell(x, y - 1, 3, 2);
      this.palms.push(pr);
    });

    // things people left on the sand
    const um = A.makeUmbrella();
    add(um.pix, 198, 104, um.ox, um.oy, { cast: true }); ell(198, 103, 2, 2);
    this.flat = [{ can: A.TOWEL.toCanvas(), x: 172, y: 100 }, { can: A.DRIFTWOOD.toCanvas(), x: 40, y: 172 }, { can: A.DRIFTWOOD.toCanvas(), x: 338, y: 186 }];
    add(A.BALL, 216, 112, 5, 8, { cast: true });
    add(A.SANDCASTLE, 262, 136, 8, 12, { cast: true }); ell(262, 133, 7, 3);

    // rocks, pools and the lighthouse headland in the east
    const rock = (x, y, w, h, seed, sea = false) => { const p = A.makeRock(w, h, seed, sea); add(p, x, y, p.w >> 1, p.h - 2, { cast: !sea, sea }); ell(x, y - h * 0.3, w * 0.46, h * 0.3); };
    const lh = [A.makeLighthouse(false), A.makeLighthouse(true)];
    rock(444, 100, 26, 16, 11); rock(482, 101, 24, 15, 12);
    this.tower = add(lh[0].pix, TOWER.x, TOWER.y, lh[0].ox, lh[0].oy, { cast: true, lit: lh[1].pix.toCanvas(), lamp: lh[0].lamp });
    ell(TOWER.x, TOWER.y - 3, 15, 5);
    rock(462, 111, 34, 13, 13); rock(430, 152, 22, 15, 14); rock(492, 168, 26, 18, 15); rock(376, 120, 14, 10, 19);
    rock(474, 232, 24, 16, 16, true); rock(504, 216, 18, 13, 17, true); rock(408, 246, 20, 13, 18, true);
    rock(18, 240, 22, 14, 20, true); rock(150, 262, 18, 12, 21, true); rock(214, 250, 12, 9, 22, true);
    for (const [x, y, seed] of [[404, 168, 3], [456, 200, 6]]) { const tp = A.makeTidePool(seed); add(tp.pix, x, y, tp.ox, tp.oy, { z: -30 }); ell(x, y - 9, 16, 8); }

    // pier, its posts and the boat tied to it
    const pier = A.makePier(PIER.len);
    this.pier = { can: pier.pix.toCanvas(), ox: pier.ox, w: pier.pix.w, h: pier.pix.h };
    this.perches = [];
    for (let k = 0; k < 4; k++) for (const side of [-1, 1]) {
      const x = PIER.x + side * 11, y = PIER.top + 6 + k * 19;
      add(A.POST, x, y, 3, 8, {}); this.perches.push({ x, y: y - 0.5, lift: 8 });
    }
    this.boat = { can: A.BOAT.toCanvas(), x: 318, y: 262 };
    for (const [x, y] of [[60, 190], [226, 176], [352, 150], [300, 96], [120, 140], [420, 124]]) this.perches.push({ x, y, lift: 0 });

    this.shadowCans = new Map();
  }

  onPier(x, y) {
    return (Math.abs(x - PIER.x) <= PIER.w / 2 - 1 && y >= PIER.top - 2 && y <= PIER.top + PIER.len + PIER.th - 2)
      || (Math.abs(x - PIER.x) <= PIER.tw / 2 - 1 && y >= PIER.top + PIER.len && y <= PIER.top + PIER.len + PIER.th - 2);
  }
  blocked(x, y) {
    for (const s of this.solids) {
      if (s.rx !== undefined) { const dx = (x - s.x) / s.rx, dy = (y - s.y) / s.ry; if (dx * dx + dy * dy < 1) return true; }
      else if (x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1) return true;
    }
    return false;
  }
  depthAt(x, y) { return y - this.tide.wy[clamp(Math.round(x), 0, W - 1)]; }
  canStand(x, y) {
    if (x < 6 || x > W - 6 || y > H - 5) return false;
    if (y < duneEdge(x) + 3) return false;
    if (this.blocked(x, y)) return false;
    if (!this.onPier(x, y) && this.depthAt(x, y) > 11) return false;
    return true;
  }

  // ------------------------------------------------------------ state
  reset() {
    this.coins = 0; this.totalEarned = 0; this.totalFinds = 0; this.playTime = 0;
    this.level = {}; for (const u of UPGRADES) this.level[u.id] = 0;
    this.lit = false; this.night = 0; this.end = null;
    this.tide = new Tide();
    this.player = { x: 112, y: 104, face: 0, walk: 0, moving: false, bag: [], full: 0, sell: 0, streak: 0, streakT: 0, step: 0 };
    this.items = []; this.flies = []; this.prints = []; this.crabs = []; this.gulls = [];
    this.cam = { x: 0, y: 0 };
    this.state = 'title'; this.stateT = 0;
    this.shopOpen = false; this.shopSlide = 0; this.shopHover = -1;
    this.toastInfo = null; this.fade = 0; this.whiteout = 0; this.shakeT = 0; this.coinPop = 0;
    this.sold = 0; this.muted = this.audio.muted; this.tips = {};
    this.recalc();
    const r = rng(77);
    for (let i = 0; i < 46; i++) {
      const x = r.range(12, W - 12), y = lerp(duneEdge(x) + 16, shoreBase(x) - 4, Math.pow(r(), 0.7));
      if (!this.blocked(x, y)) this.items.push({ x, y, type: this.rollType(false, r), st: 0, t: 0 });
    }
    for (let i = 0; i < 3; i++) { const p = this.perches[(i * 5 + 1) % this.perches.length]; this.gulls.push({ x: p.x, y: p.y, lift: p.lift, st: 'stand', t: i * 90, face: i % 2 ? 1 : -1, alt: 0 }); }
  }
  recalc() {
    const L = this.level;
    this.stat = { reach: 10 + L.reach * 3.6, basket: 10 + L.basket * 8, speed: 0.95 * (1 + L.speed * 0.11), swash: 2 + L.tide, surge: 12 + L.tide * 6, luck: L.luck };
    while (this.crabs.length < L.crab) this.crabs.push({ x: DROP.x + this.crabs.length * 8, y: DROP.y + 10, st: 'seek', carry: [], t: 0, target: null, face: 1 });
    this.crabs.length = L.crab;
    this.lit = L.lamp > 0;
  }
  costOf(u) { return Math.round(u.base * Math.pow(u.growth, this.level[u.id])); }
  save() {
    const data = { v: 1, coins: this.coins, earned: this.totalEarned, finds: this.totalFinds, time: this.playTime, level: this.level, done: !!(this.end && this.end.done) };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage is optional */ }
    return data;
  }
  load(data) {
    try {
      const s = data || JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s || s.v !== 1) return false;
      this.coins = s.coins || 0; this.totalEarned = s.earned || 0; this.totalFinds = s.finds || 0; this.playTime = s.time || 0;
      for (const u of UPGRADES) this.level[u.id] = Math.min(u.max, (s.level && s.level[u.id]) || 0);
      this.recalc();
      if (this.lit) { this.night = 1; this.end = { t: 999, done: true }; }
      return this.totalEarned > 0;
    } catch { return false; }
  }
  wipe() { try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing stored */ } this.reset(); this.hasSave = false; this.begin(); }

  toast(text, dur = 190) { this.toastInfo = { text, t: 0, dur }; }
  tipOnce(key, text) { if (!this.tips[key]) { this.tips[key] = 1; this.toast(text, 260); } }
  sfx(name) { this.audio.sfx(name); }

  rollType(surge, rnd = Math.random) {
    const L = this.stat.luck;
    const mul = [1, 1 + 0.35 * L, 1 + 0.9 * L, 1 + 1.6 * L];
    const boost = surge ? [1, 1.4, 2, 2.6] : [1, 1, 1, 1];
    let total = 0;
    const ws = A.ITEMS.map((it) => { const w = it.w * mul[it.tier] * boost[it.tier]; total += w; return w; });
    let pick = rnd() * total;
    for (let i = 0; i < ws.length; i++) { pick -= ws[i]; if (pick <= 0) return i; }
    return 0;
  }

  // a wave has just peaked: leave its cargo along the line it reached
  deposit(w) {
    const n = w.surge ? this.stat.surge : this.stat.swash;
    for (let i = 0; i < n && this.items.length < 340; i++) {
      for (let tries = 0; tries < 6; tries++) {
        const x = 10 + Math.random() * (W - 20);
        const peak = this.tide.peakAt(w, Math.round(x)), base = this.tide.base[Math.round(x)];
        const y = peak + 2 + Math.pow(Math.random(), 1.8) * Math.max(4, base - peak - 4);
        if (this.blocked(x, y) || this.onPier(x, y) || y < duneEdge(x) + 6) continue;
        this.items.push({ x, y, type: this.rollType(w.surge), st: 0, t: 0, fresh: 40 });
        break;
      }
    }
  }
  onWave(surge) {
    const near = clamp(1 - (this.tide.wy[clamp(Math.round(this.player.x), 0, W - 1)] - this.player.y) / 150, 0.25, 1);
    if (surge) {
      this.audio.noise(4.5, { freq: 500, slide: 2.2, vol: 0.16 * near, q: 0.4, attack: 1.4 });
      this.audio.noise(3, { freq: 160, vol: 0.12 * near, type: 'lowpass', attack: 1 });
      if (this.state === 'play') this.tipOnce('surge', 'A big wave! It leaves the best finds.');
    } else this.audio.noise(2.6, { freq: 800, slide: 1.9, vol: 0.05 * near, q: 0.4, attack: 0.8 });
  }

  earn(value, x, y, big) {
    const v = value * (this.lit ? 2 : 1);
    this.coins += v; this.totalEarned += v; this.coinPop = 6;
    if (big) this.fx.text(x, y, '+' + v, P.y5, { big: true });
    return v;
  }
  buy(i) {
    const u = this.upgrades[i];
    if (!u) return;
    const cost = this.costOf(u);
    if (this.level[u.id] >= u.max || this.coins < cost) { this.audio.tone(150, 0.1, { type: 'sawtooth', vol: 0.07 }); return; }
    this.coins -= cost; this.level[u.id]++; u.flash = 14;
    this.recalc(); this.save();
    this.sfx('levelup');
    this.fx.burst(this.player.x, this.player.y - 12, 16, { colors: GOLD, speed: 1.6, up: 0.8, em: true, life: 34, drag: 0.94 });
    if (u.id === 'lamp') this.startEnding();
    else this.fx.text(this.player.x, this.player.y - 30, u.id === 'crab' ? 'Crab hired!' : u.name + ' ' + this.level[u.id], P.y5, { big: true, life: 70 });
  }
  startEnding() { this.state = 'ending'; this.end = { t: 0, done: false }; this.shopOpen = false; this.audio.music(null); }

  begin() {
    this.audio.unlock();
    this.state = 'play'; this.stateT = 0; this.fade = 1;
    this.audio.music(this.lit ? 'night' : 'beach');
    this.audio.sfx('select');
    if (!this.hasSave) this.toast('Walk over shells to gather them', 280);
  }

  // ------------------------------------------------------------ simulation
  step() {
    this.frame++; this.time += 1 / 60; this.stateT++;
    const inp = this.input;
    if (inp.take('KeyM')) this.muted = this.audio.toggleMute();
    this.audio.tick();
    if (this.toastInfo && ++this.toastInfo.t > this.toastInfo.dur) this.toastInfo = null;
    if (this.fade > 0) this.fade = Math.max(0, this.fade - 0.04);
    if (this.whiteout > 0) this.whiteout = Math.max(0, this.whiteout - 0.018);
    if (this.shakeT > 0) this.shakeT *= 0.88;
    if (this.coinPop > 0) this.coinPop--;
    for (const u of this.upgrades) if (u.flash > 0) u.flash--;
    if (this.state === 'pause') {
      if (inp.take('Escape') || inp.take('KeyP') || inp.click) { this.state = 'play'; inp.click = false; }
      else if (inp.take('KeyN')) this.wipe();
      return;
    }
    this.tide.update(1 / 60, this);
    this.updateGulls();
    this.fx.update();
    for (let i = this.prints.length - 1; i >= 0; i--) if (--this.prints[i].life <= 0) this.prints.splice(i, 1);
    for (const it of this.items) if (it.fresh > 0) it.fresh--;

    if (this.state === 'title') {
      const tx = (W - VW) * (0.5 + 0.5 * Math.sin(this.time * 0.13 - 1.3)), ty = (H - VH) * 0.62;
      this.cam.x += (tx - this.cam.x) * 0.05; this.cam.y += (ty - this.cam.y) * 0.05;
      if (inp.any && this.stateT > 20) this.begin();
      return;
    }
    if (this.state === 'ending') { this.updateEnding(); this.updateCrabs(); this.updateFlies(); return; }
    if (inp.take('Escape') || inp.take('KeyP')) { this.state = 'pause'; this.sfx('select'); return; }
    this.playTime++;
    this.updatePlayer();
    this.updateCrabs();
    this.updateFlies();
    const p = this.player;
    const tx = clamp(p.x - VW / 2, 0, W - VW), ty = clamp(p.y - VH / 2 - 6, 0, H - VH);
    this.cam.x += (tx - this.cam.x) * 0.12; this.cam.y += (ty - this.cam.y) * 0.12;
    if (this.frame % 600 === 0) this.save();
  }

  updatePlayer() {
    const inp = this.input, p = this.player;
    // ---- shop
    const atHut = p.x > SELL.x0 && p.x < SELL.x1 && p.y > SELL.y0 && p.y < SELL.y1;
    this.shopOpen = atHut;
    this.shopSlide += ((atHut ? 1 : 0) - this.shopSlide) * 0.25;
    let overUI = false;
    this.shopHover = -1;
    if (atHut) {
      const mx = inp.px, my = inp.py;
      overUI = mx >= SHOP.x && mx <= SHOP.x + SHOP.w && my >= SHOP.y && my <= SHOP.y + SHOP.top + this.upgrades.length * SHOP.row + 20;
      this.shopHover = shopRowAt(this, mx, my);
      if (inp.click && this.shopHover >= 0) this.buy(this.shopHover);
      for (let i = 0; i < this.upgrades.length; i++) if (inp.take('Digit' + (i + 1)) || inp.take('Numpad' + (i + 1))) this.buy(i);
    }
    // ---- movement: keys, or hold the pointer to walk toward it
    let mx = (inp.down('ArrowRight') || inp.down('KeyD') ? 1 : 0) - (inp.down('ArrowLeft') || inp.down('KeyA') ? 1 : 0);
    let my = (inp.down('ArrowDown') || inp.down('KeyS') ? 1 : 0) - (inp.down('ArrowUp') || inp.down('KeyW') ? 1 : 0);
    if (!mx && !my && inp.pdown && !overUI) {
      const dx = inp.px + this.cam.x - p.x, dy = inp.py + this.cam.y - (p.y - 6), d = Math.hypot(dx, dy);
      if (d > 5) { mx = dx / d; my = dy / d; }
    }
    const len = Math.hypot(mx, my);
    p.moving = len > 0.1;
    if (p.moving) {
      mx /= len; my /= len;
      const depth = this.onPier(p.x, p.y) ? 0 : Math.max(0, this.depthAt(p.x, p.y));
      const sp = this.stat.speed * (1 - Math.min(0.4, depth * 0.035));
      const nx = p.x + mx * sp, ny = p.y + my * sp * 0.86;
      if (this.canStand(nx, p.y)) p.x = nx;
      if (this.canStand(p.x, ny)) p.y = ny;
      p.face = Math.abs(mx) > Math.abs(my) * 1.1 ? (mx > 0 ? 2 : 3) : my > 0 ? 0 : 1;
      p.walk += sp * 0.13;
      p.step += sp;
      if (p.step > 9) {
        p.step = 0;
        const d2 = this.depthAt(p.x, p.y), pier = this.onPier(p.x, p.y);
        if (pier) this.audio.tone(140 + Math.random() * 30, 0.04, { type: 'triangle', vol: 0.05 });
        else if (d2 > 0) { this.audio.noise(0.12, { freq: 1600, vol: 0.05, q: 0.5 }); this.fx.add({ x: p.x, y: p.y - 1, vx: (Math.random() - 0.5) * 0.8, vy: -0.9, g: 0.08, life: 16, colors: [P.white, P.a6, P.a5] }); }
        else { this.audio.noise(0.03, { freq: 700 + Math.random() * 300, vol: 0.025 }); this.prints.push({ x: p.x + (Math.floor(p.walk) % 2 ? -2 : 1), y: p.y - 1, life: 520, wet: p.y > this.tide.wetY[Math.round(p.x)] }); }
      }
    } else p.walk = 0;
    // being pushed out if the sea rises past the wading limit
    if (!this.onPier(p.x, p.y) && this.depthAt(p.x, p.y) > 13 && this.canStand(p.x, p.y - 1.2)) p.y -= 1.2;

    // ---- gather
    const cap = this.stat.basket, R = this.stat.reach;
    if (p.streakT > 0 && --p.streakT === 0) p.streak = 0;
    let flying = 0;
    for (const it of this.items) if (it.st === 1) flying++;
    for (const it of this.items) {
      if (it.st !== 0) continue;
      const dx = it.x - p.x, dy = (it.y - (p.y - 2)) / SQUASH;
      if (dx * dx + dy * dy > R * R) continue;
      if (p.bag.length + flying >= cap) { if (p.full <= 0) { p.full = 70; this.audio.tone(196, 0.09, { vol: 0.06 }); this.audio.tone(165, 0.12, { vol: 0.06, when: 0.1 }); this.tipOnce('full', 'Basket full! Sell at the hut.'); } break; }
      it.st = 1; it.t = 0; it.sx = it.x; it.sy = it.y; flying++;
      if (it.claim) it.claim.target = null;
    }
    if (p.full > 0) p.full--;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.st !== 1) continue;
      it.t++;
      const k = it.t / 11, e = k * k;
      it.x = lerp(it.sx, p.x, e); it.y = lerp(it.sy, p.y - 9, e) - Math.sin(k * Math.PI) * 7;
      if (it.t >= 11) {
        this.items.splice(i, 1);
        p.bag.push(it.type); this.totalFinds++;
        p.streak = Math.min(16, p.streak + 1); p.streakT = 40;
        const def = A.ITEMS[it.type];
        this.audio.tone(620 * Math.pow(2, p.streak / 12), 0.06, { vol: 0.06, type: def.tier >= 2 ? 'triangle' : 'square' });
        if (def.tier >= 2) { this.fx.text(p.x, p.y - 26, def.name + '!', def.tier === 3 ? P.y4 : P.a6); this.fx.sparks(p.x, p.y - 10, 10, GOLD, 1.6); this.sfx('heart'); }
        else this.fx.add({ x: p.x, y: p.y - 12, vy: -0.5, life: 12, colors: SPARK, em: true });
      }
    }

    // ---- sell: shells stream from the basket to the hatch
    if (atHut && p.bag.length) {
      if (++p.sell >= 3) {
        p.sell = 0;
        const type = p.bag.pop(), def = A.ITEMS[type];
        this.sold += this.earn(def.value, 0, 0, false);
        this.soldN = (this.soldN || 0) + 1;
        this.flies.push({ type, x0: p.x, y0: p.y - 10, x1: HUT.x - 8 + Math.random() * 14, y1: HUT.y - 18, t: 0, dur: 14 });
        this.audio.tone(700 * Math.pow(2, (this.soldN % 13) / 12), 0.05, { vol: 0.05 });
        if (!p.bag.length) {
          this.fx.text(HUT.x - 2, HUT.y - 34, '+' + this.sold, P.y5, { big: true, life: 60 });
          this.sfx('coin'); this.sold = 0; this.soldN = 0; this.save();
        }
      }
    }
  }

  updateFlies() {
    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i];
      if (++f.t >= f.dur) { this.flies.splice(i, 1); this.fx.add({ x: f.x1, y: f.y1, vy: -0.4, life: 10, colors: GOLD, em: true }); }
    }
  }

  updateCrabs() {
    for (const c of this.crabs) {
      c.t++;
      let tx, ty;
      if (c.st === 'seek') {
        const tg = c.target;
        if (!tg || tg.st !== 0 || tg.gone) {
          c.target = null;
          let best = 1e9;
          for (const it of this.items) {
            if (it.st !== 0 || (it.claim && it.claim.target === it && it.claim !== c)) continue;
            const d = Math.hypot(it.x - c.x, it.y - c.y) + Math.hypot(it.x - DROP.x, it.y - DROP.y) * 0.4;
            if (d < best) { best = d; c.target = it; }
          }
          if (c.target) c.target.claim = c;
        }
        if (c.target) { tx = c.target.x; ty = c.target.y; }
        else if (c.carry.length) c.st = 'home';
        else { tx = DROP.x + 20 + Math.sin(c.t * 0.01 + c.x) * 30; ty = DROP.y + 26 + Math.cos(c.t * 0.013) * 10; }
      }
      if (c.st === 'home') { tx = DROP.x + 4; ty = DROP.y + 6; }
      if (tx === undefined) continue;
      const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
      if (d > 2.5) {
        const sp = 0.62 + this.level.speed * 0.03;
        const nx = c.x + (dx / d) * sp, ny = c.y + (dy / d) * sp * 0.86;
        if (!this.blocked(nx, c.y)) c.x = nx; else c.y += dy > 0 ? sp : -sp;
        if (!this.blocked(c.x, ny)) c.y = ny; else c.x += dx > 0 ? sp : -sp;
        c.moving = true; c.face = dx > 0 ? 1 : -1;
      } else {
        c.moving = false;
        if (c.st === 'seek' && c.target) {
          const it = c.target; it.gone = true; c.target = null;
          const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1);
          c.carry.push(it.type); this.totalFinds++;
          if (c.carry.length >= 3) c.st = 'home';
        } else if (c.st === 'home') {
          let sum = 0;
          for (const type of c.carry) sum += this.earn(A.ITEMS[type].value, 0, 0, false);
          if (sum) { this.fx.text(c.x, c.y - 10, '+' + sum, P.y5); if (Math.abs(c.x - this.cam.x - VW / 2) < 180) this.audio.tone(990, 0.05, { vol: 0.03 }); }
          c.carry.length = 0; c.st = 'seek';
        }
      }
    }
  }

  updateGulls() {
    const p = this.player;
    for (const b of this.gulls) {
      b.t++;
      if (b.st === 'stand') {
        const scared = this.state === 'play' && Math.hypot(p.x - b.x, p.y - b.y) < 26;
        if (scared || b.t > 700 + (b.x % 200)) {
          let spot = this.perches[Math.floor(Math.random() * this.perches.length)];
          for (let i = 0; i < 6 && (Math.hypot(spot.x - b.x, spot.y - b.y) < 70 || this.gulls.some((o) => o !== b && (o.tx === spot.x || (o.x === spot.x && o.st === 'stand')))); i++) spot = this.perches[Math.floor(Math.random() * this.perches.length)];
          b.st = 'fly'; b.t = 0; b.sx = b.x; b.sy = b.y; b.sl = b.lift; b.tx = spot.x; b.ty = spot.y; b.tl = spot.lift;
          b.dur = Math.max(50, Math.hypot(b.tx - b.sx, b.ty - b.sy) / 1.5);
          b.face = b.tx > b.x ? 1 : -1;
          if (scared && Math.abs(b.x - this.cam.x - VW / 2) < 200) { this.audio.tone(1500, 0.16, { slide: 0.7, vol: 0.03, vib: 70 }); this.audio.tone(1350, 0.2, { slide: 0.7, vol: 0.03, vib: 70, when: 0.2 }); }
        }
      } else {
        const k = Math.min(1, b.t / b.dur), e = k * k * (3 - 2 * k);
        b.x = lerp(b.sx, b.tx, e); b.y = lerp(b.sy, b.ty, e);
        b.lift = lerp(b.sl, b.tl, e); b.alt = Math.sin(k * Math.PI) * 22;
        if (k >= 1) { b.st = 'stand'; b.t = 0; b.alt = 0; }
      }
    }
  }

  updateEnding() {
    const e = this.end;
    e.t++;
    const tx = clamp(TOWER.x - VW / 2, 0, W - VW), ty = clamp(TOWER.y - 100, 0, H - VH);
    this.cam.x += (tx - this.cam.x) * 0.035; this.cam.y += (ty - this.cam.y) * 0.035;
    if (e.t === 130) {
      this.whiteout = 1; this.shakeT = 5; this.sfx('ember');
      this.fx.burst(TOWER.x, TOWER.y - 82, 60, { colors: GOLD, speed: 3, em: true, life: 70, drag: 0.96, size: 2, shrink: true });
    }
    if (e.t > 130) this.night = Math.min(1, (e.t - 130) / 230);
    if (e.t === 230) this.audio.music('night');
    if (e.t > 360 && (this.input.any || this.input.click)) {
      e.done = true; this.state = 'play'; this.night = 1; this.save();
      this.toast('Moonlit tides: every find is worth double', 300);
    }
  }

  // ------------------------------------------------------------ rendering
  ambient() {
    const day = clamp(this.totalEarned / (this.lampCost * 1.25), 0, 1);
    let c = '#ffffff';
    if (day > 0.35) c = mix('#ffffff', '#ffe8c2', clamp((day - 0.35) / 0.3, 0, 1));
    if (day > 0.65) c = mix(c, '#ffc7a6', clamp((day - 0.65) / 0.35, 0, 1));
    if (this.night > 0) c = mix(c, '#7f8cdc', this.night);
    return c;
  }

  render() {
    const g = this.g, tide = this.tide, sea = this.sea, t = this.time;
    let cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    if (this.shakeT > 0.4 && !this.opts.calm) { cx = clamp(cx + Math.round((Math.random() - 0.5) * this.shakeT * 2), 0, W - VW); cy = clamp(cy + Math.round((Math.random() - 0.5) * this.shakeT * 2), 0, H - VH); }
    const p = this.player, night = this.night;

    // ---- sand: dry everywhere, then the wet band the last waves reached
    g.drawImage(this.ground.dry, cx, cy, VW, VH, 0, 0, VW, VH);
    for (let sx = 0; sx < VW; sx++) {
      const x = sx + cx, wy0 = Math.floor(tide.wetY[x]), sy = wy0 - cy;
      if (sy >= VH) continue;
      const top = Math.max(0, sy), hgt = VH - top;
      g.drawImage(this.ground.wet, x, wy0 + (top - sy), 1, hgt, sx, top, 1, hgt);
      if (sy >= 2) g.drawImage(this.ground.fringe, x, wy0 - 2, 1, 2, sx, sy - 2, 1, 2);
    }
    // foam the last wave left at its high-water mark
    g.fillStyle = P.white;
    for (let sx = 0; sx < VW; sx++) {
      const x = sx + cx, a = tide.foamA[x];
      if (a < 0.15 || hash(x, Math.floor(tide.foamY[x]), 5) < 0.3) continue;
      g.globalAlpha = a > 0.6 ? 0.9 : a > 0.3 ? 0.55 : 0.28;
      g.fillRect(sx, Math.floor(tide.foamY[x]) - cy, 1, 1);
    }
    g.globalAlpha = 1;
    for (const f of this.prints) {
      g.globalAlpha = Math.min(1, f.life / 200) * 0.5;
      g.fillStyle = f.wet ? P.d1 : P.d3;
      g.fillRect(Math.round(f.x - cx), Math.round(f.y - cy), 2, 1);
      g.fillRect(Math.round(f.x - cx), Math.round(f.y - cy) + 1, 1, 1);
    }
    g.globalAlpha = 1;
    for (const f of this.flat) g.drawImage(f.can, f.x - cx, f.y - cy);

    // ---- finds lying on the sand
    for (const it of this.items) {
      if (it.st !== 0) continue;
      const sx = it.x - cx, sy = it.y - cy;
      if (sx < -10 || sx > VW + 10 || sy < -10 || sy > VH + 10) continue;
      const c = this.itemCan[it.type];
      g.drawImage(c.r, Math.round(sx - c.w / 2), Math.round(sy - c.h + 2));
    }

    // ---- shadows, composited once so overlaps do not double up
    const sg = this.sg;
    sg.clearRect(0, 0, VW, VH);
    sg.fillStyle = '#2b2440';
    const blob = (x, y, rx) => { sg.fillRect(Math.round(x - rx - cx), Math.round(y - cy), rx * 2, 2); sg.fillRect(Math.round(x - rx - cx) + 1, Math.round(y - cy) - 1, rx * 2 - 2, 4); };
    for (const pr of this.props) {
      if (!pr.sh || pr.x < cx - 120 || pr.x > cx + VW + 40) continue;
      const sh = pr.palm ? pr.shs[this.palmFrame(pr)] : pr.sh;
      sg.drawImage(sh.can, Math.round(pr.x - pr.ox - cx), Math.round(pr.y + sh.dy - cy));
    }
    if (this.state !== 'title') blob(p.x + 2, p.y - 1, 6);
    for (const c of this.crabs) blob(c.x + 1, c.y - 1, 5);
    for (const b of this.gulls) blob(b.x + b.alt * 0.5 + (b.lift ? 3 : 0), b.y + b.alt * 0.25, b.alt > 2 ? 5 : 3);
    g.globalAlpha = 0.24 * (1 - night * 0.8);
    g.drawImage(this.shBuf, 0, 0);
    g.globalAlpha = 1;

    // ---- the sea, drawn column by column from the moving waterline
    const crestOff = Math.floor(t * 9) % sea.CP, drift = Math.floor(t * 4);
    for (let sx = 0; sx < VW; sx++) {
      const x = sx + cx, sy = Math.floor(tide.wy[x]) - cy;
      if (sy >= VH) continue;
      const top = Math.max(0, sy), skip = top - sy, hgt = Math.min(sea.DH - skip, VH - top);
      if (hgt > 0) g.drawImage(sea.depth, x & 7, skip, 1, hgt, sx, top, 1, hgt);
      const ct = Math.max(0, sy + 8), cskip = ct - (sy + 8), ch = Math.min(VH - ct, sea.CP * 6 - cskip);
      if (ch > 0) g.drawImage(sea.crest, (x + drift) & 127, crestOff + cskip, 1, ch, sx, ct, 1, ch);
    }
    // glints far out
    g.fillStyle = P.white;
    for (let i = 0; i < 26; i++) {
      const slot = Math.floor(t * 2.5 + i * 0.37);
      const x = Math.floor(hash(i, slot, 61) * W), y = Math.floor(lerp(232, H, hash(i, slot, 62)));
      if (y - tide.wy[x] < 22) continue;
      const sx = x - cx, sy = y - cy;
      if (sx < 0 || sx >= VW || sy < 0 || sy >= VH) continue;
      g.fillRect(sx, sy, hash(i, slot, 63) < 0.4 ? 2 : 1, 1);
    }

    // ---- pier and boat sit on top of the water
    const pr = this.pier, px = PIER.x - pr.ox - cx, py = PIER.top - 1 - cy;
    g.fillStyle = 'rgba(16,30,70,0.32)';
    for (let j = 0; j < pr.h; j++) { const wyv = tide.wy[PIER.x]; if (PIER.top + j > wyv) { g.fillRect(PIER.x - (j >= PIER.len ? PIER.tw : PIER.w) / 2 + 5 - cx, PIER.top + j + 4 - cy, j >= PIER.len ? PIER.tw : PIER.w, 1); } }
    g.drawImage(pr.can, px, py);
    const bob = Math.round(Math.sin(t * 1.6) * 1.2);
    g.fillStyle = P.d3; for (let k = 0; k < 9; k++) g.fillRect(this.boat.x - 12 + k - cx, this.boat.y - 8 + Math.round(Math.sin(k * 0.4) * 2) + (k > 5 ? bob : 0) - cy, 1, 1);
    g.fillStyle = 'rgba(16,30,70,0.3)'; g.fillRect(this.boat.x - 2 - cx, this.boat.y + 6 + bob - cy, 30, 3);
    g.drawImage(this.boat.can, this.boat.x - cx, this.boat.y - 6 + bob - cy);

    // ---- reach ring on the ground
    if (this.state === 'play' || this.state === 'ending') {
      const R = this.stat.reach, full = p.bag.length >= this.stat.basket;
      const n = Math.max(24, Math.round(R * 2.8));
      for (let i = 0; i < n; i++) {
        const k = Math.floor(i / 3 + t * 4) % 3;
        if (k === 0) continue;
        const a = (i / n) * Math.PI * 2;
        // light and dark dashes alternate so the ring reads on sand and on water alike
        g.fillStyle = full ? (k === 1 ? P.r5 : P.r2) : k === 1 ? P.white : P.b2;
        g.globalAlpha = k === 1 ? 0.95 : 0.7;
        g.fillRect(Math.round(p.x + Math.cos(a) * R - cx), Math.round(p.y - 2 + Math.sin(a) * R * SQUASH - cy), 1, 1);
      }
      g.globalAlpha = 1;
    }

    // ---- everything that stands up, sorted north to south
    const list = [];
    for (const o of this.props) if (o.x > cx - 90 && o.x < cx + VW + 90) list.push(o);
    if (this.state !== 'title') list.push({ sort: p.y, hero: true });
    for (const c of this.crabs) list.push({ sort: c.y, crab: c });
    for (const b of this.gulls) if (b.st === 'stand') list.push({ sort: b.y + 0.2, gull: b });
    list.sort((a, b) => a.sort - b.sort);
    for (const o of list) {
      if (o.hero) this.drawHero(g, cx, cy);
      else if (o.crab) {
        const c = o.crab, s = this.crabCan[c.moving ? Math.floor(c.t / 5) % 2 : 0];
        const depth = this.depthAt(c.x, c.y), clip = this.onPier(c.x, c.y) ? 0 : clamp(Math.round(depth * 0.5), 0, 4);
        g.drawImage(s.r, 0, 0, s.w, s.h - clip, Math.round(c.x - s.w / 2 - cx), Math.round(c.y - s.h + 1 - cy), s.w, s.h - clip);
        c.carry.forEach((type, i) => { const ic = this.itemCan[type]; g.drawImage(ic.r, Math.round(c.x - ic.w / 2 - cx), Math.round(c.y - s.h - ic.h + 4 - i * 3 - cy)); });
      } else if (o.gull) {
        const b = o.gull, s = this.gullCan.stand[b.t % 160 > 140 ? 1 : 0];
        g.drawImage(b.face > 0 ? s.r : s.l, Math.round(b.x - s.w / 2 - cx), Math.round(b.y - b.lift - s.h + 1 - cy));
      } else {
        let can = o.can;
        if (o.palm) can = o.palm[this.palmFrame(o)];
        else if (o === this.tower && this.lit && (!this.end || this.end.t >= 130)) can = o.lit;
        g.drawImage(can, Math.round(o.x - o.ox - cx), Math.round(o.y - o.oy - (o.lift || 0) - cy));
        if (o.sea) {
          // a ring of foam breathing around rocks that stand in the water
          const wv = tide.wy[clamp(Math.round(o.x), 0, W - 1)];
          if (o.y > wv + 2) { g.fillStyle = P.white; const ph = Math.floor(t * 2 + o.x) % 2; for (let i = -(o.w >> 1); i < (o.w >> 1); i++) if ((i + ph + (o.x | 0)) % 3 !== 0) g.fillRect(Math.round(o.x + i - cx), Math.round(o.y - 1 + (Math.abs(i) > o.w * 0.35 ? -1 : 0) - cy), 1, 1); }
        }
      }
    }

    // ---- things in the air
    for (const f of this.flies) {
      const k = f.t / f.dur, c = this.itemCan[f.type];
      g.drawImage(c.r, Math.round(lerp(f.x0, f.x1, k) - c.w / 2 - cx), Math.round(lerp(f.y0, f.y1, k) - Math.sin(k * Math.PI) * 12 - c.h / 2 - cy));
    }
    for (const it of this.items) {
      if (it.st !== 1) continue;
      const c = this.itemCan[it.type];
      g.drawImage(c.r, Math.round(it.x - c.w / 2 - cx), Math.round(it.y - c.h + 2 - cy));
    }
    for (const b of this.gulls) {
      if (b.st !== 'fly') continue;
      const s = this.gullCan.fly[Math.floor(b.t / 7) % 2];
      g.drawImage(b.face > 0 ? s.r : s.l, Math.round(b.x - s.w / 2 - cx), Math.round(b.y - b.lift - b.alt - s.h - cy));
    }
    this.fx.draw(g, cx, cy, false);

    // ---- light: the day warms toward sunset as you earn, then night falls when the lamp is lit
    const amb = this.ambient();
    if (amb !== '#ffffff') {
      const L = this.light;
      L.begin(amb);
      if (night > 0.02) {
        L.add(HUT.x - 8 - cx, HUT.y - 18 - cy, 56, '#ffb45e', night, 14);
        L.add(p.x - cx, p.y - 10 - cy, 46, '#ffd9a0', night * 0.7);
        const lx = TOWER.x - cx, ly = TOWER.y + this.tower.lamp[1] - cy;
        L.add(lx, ly, 46, '#fff0b0', night, 30);
        // the beam sweeps the ground in a wide ellipse around the tower
        const a = t * 0.7, bx = Math.cos(a), by = Math.sin(a) * 0.55;
        for (const [d, r] of [[60, 34], [120, 52], [190, 70], [260, 84]]) L.add(TOWER.x + bx * d - cx, TOWER.y - 10 + by * d - cy, r, '#f5e9b8', night * 0.75);
      }
      L.finish();
      L.apply(this.out, g);
      if (night > 0.02) L.glow(g, night);
    }
    // glints on valuables and anything that glows by itself
    for (const it of this.items) {
      if (it.st !== 0) continue;
      const tier = A.ITEMS[it.type].tier;
      if (tier < 2 && !(it.fresh > 0)) continue;
      const sx = Math.round(it.x - cx), sy = Math.round(it.y - cy) - 4;
      if (sx < 0 || sx > VW || sy < 0 || sy > VH) continue;
      const ph = (this.frame + Math.floor(it.x * 7)) % (tier >= 2 ? 50 : 30);
      if (ph < 6 || it.fresh > 0 && ph < 12) { g.fillStyle = P.white; g.fillRect(sx - 1 + (ph % 3), sy, 1, 1); if (ph < 3) { g.fillRect(sx - 2, sy, 3, 1); g.fillRect(sx - 1, sy - 1, 1, 3); } }
    }
    if (this.lit && (!this.end || this.end.t >= 130)) {
      const o = this.tower;
      g.drawImage(o.lit, 20, 14, 20, 20, Math.round(o.x - o.ox - cx) + 20, Math.round(o.y - o.oy - cy) + 14, 20, 20);
    }
    this.fx.draw(g, cx, cy, true);
    this.fx.drawTexts(g, cx, cy);
    if (p.full > 0 && Math.floor(p.full / 8) % 2 === 0 && this.state === 'play') drawText(g, 'FULL', p.x - cx, p.y - 31 - cy, { font: SMALL, color: P.r5, outline: P.ink, align: 'center' });
    drawUI(g, this);
    return this.out;
  }

  palmFrame(pr) { const s = Math.sin(this.time * 0.9 + pr.ph) + Math.sin(this.time * 2.3 + pr.ph * 2) * 0.4; return s > 0.5 ? 2 : s < -0.5 ? 0 : 1; }

  drawHero(g, cx, cy) {
    const p = this.player;
    const dir = p.face === 3 ? 2 : p.face;
    const step = p.moving ? [1, 2, 3, 2][Math.floor(p.walk) % 4] : 0;
    const s = this.heroCan[dir][step];
    const depth = this.onPier(p.x, p.y) ? 0 : this.depthAt(p.x, p.y);
    const clip = clamp(Math.round(depth * 0.55), 0, 7);
    const dx = Math.round(p.x - A.HERO.ox - cx), dy = Math.round(p.y - A.HERO.oy - cy);
    g.drawImage(p.face === 3 ? s.l : s.r, 0, 0, s.w, s.h - clip, dx, dy + (clip ? 1 : 0), s.w, s.h - clip);
    if (clip > 0) {
      // ripples where the legs meet the water
      const ph = Math.floor(this.time * 4) % 2;
      g.fillStyle = P.white;
      g.fillRect(dx + 3 - ph, dy + s.h - clip + 1, 4, 1); g.fillRect(dx + 11 + ph, dy + s.h - clip + 1, 4, 1);
      g.fillStyle = P.a6; g.fillRect(dx + 6, dy + s.h - clip + 2, 6, 1);
    }
  }
}

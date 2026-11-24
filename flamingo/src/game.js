// Flamingo Drive: a tiny top-down crime sandbox. Steal cars, drive, dodge the police, run three jobs.
import { P } from '../../src/gfx/palette.js';
import { makeCanvas, ctx2d, clamp, lerp, hash, bayer } from '../../src/gfx/pixel.js';
import { Lighting } from '../../src/gfx/light.js';
import { Particles, FIRE, SPARK, GOLD } from '../../src/game/fx.js';
import { SONGS } from '../../src/audio.js';
import { buildCity, WORLD, VIEW, ROAD_X, ROAD_Y, RW, CELL, SW, SH, SEA_X, blockRect } from './city.js';
import { carSprites, pedSprites, angleIndex, MODELS, PAINTS, PROPS, headlightCones } from './sprites.js';
import { drawUI, money } from './ui.js';

const W = WORLD.w, H = WORLD.h, VW = VIEW.w, VH = VIEW.h, TAU = Math.PI * 2;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const heading = (dx, dy) => Math.atan2(dx, -dy);
const STARS = [0, 1, 3, 6]; // heat needed for each wanted level

SONGS.neon = {
  bpm: 112, len: 64, leadType: 'sawtooth', leadVol: 0.04, leadLen: 2.2,
  chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
  lead: [
    69, null, null, 72, null, null, 76, null, 74, null, 72, null, 69, null, null, null,
    65, null, null, 69, null, null, 72, null, 76, null, 72, null, 69, null, null, null,
    67, null, null, 72, null, null, 76, null, 79, null, 76, null, 72, null, null, null,
    67, null, null, 71, null, null, 74, null, 79, null, 78, null, 74, null, 71, null,
  ],
  bass: [1, 0, 1, 0, 1, 0, 1, 2, 1, 0, 1, 0, 1, 0, 2, 1],
  arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 1], arpVol: 0.03,
  drum: [1, 0, 2, 0, 3, 0, 2, 0, 1, 0, 2, 1, 3, 0, 2, 2],
};

const JOBS = [
  { name: 'Hot Pink', intro: ['RICO: See the pink Marlin outside Hotel Azul?', 'RICO: Bring it to my garage. Try not to dent it.'], reward: 600 },
  { name: 'Loose Change', intro: ['RICO: My courier dropped seven bags across town.', 'RICO: Scoop them up before the street does.'], reward: 900 },
  { name: 'Pier Nine', intro: ['RICO: The Riptide crew is squatting on Pier 9.', 'RICO: Clear them out. Then lose the cops.'], reward: 1800 },
];

let NEXT_ID = 1;
class Car {
  constructor(model, paint, x, y, a) {
    this.id = NEXT_ID++; this.model = model; this.paint = paint; this.m = MODELS[model]; this.spr = carSprites(model, paint);
    this.x = x; this.y = y; this.a = a; this.vx = 0; this.vy = 0;
    this.hp = this.m.hp; this.mode = 'parked'; this.steer = 0; this.thr = 0; this.hand = false; this.skid = false;
    this.half = this.spr.l / 2; this.rad = this.spr.w / 2 - 0.5; this.burn = 0; this.dead = false; this.t = 0; this.far = 0; this.lights = false;
  }
  get speed() { return Math.hypot(this.vx, this.vy); }
  pts() { const fx = Math.sin(this.a), fy = -Math.cos(this.a), o = this.half - this.rad; return [[this.x + fx * o, this.y + fy * o], [this.x, this.y], [this.x - fx * o, this.y - fy * o]]; }
}

export class Game {
  constructor(input, audio, opts = {}) {
    this.input = input; this.audio = audio; this.opts = opts;
    this.out = makeCanvas(VW, VH); this.g = ctx2d(this.out);
    this.city = buildCity();
    this.gg = ctx2d(this.city.ground); // skid marks are painted straight onto the street
    this.light = new Lighting(VW, VH);
    this.cones = headlightCones(48, 78);
    this.fx = new Particles(VW, VH);
    this.sea = this.makeSea();
    this.props = {}; for (const k of ['cash', 'heart']) this.props[k] = PROPS[k].toCanvas();
    this.frame = 0; this.time = 0;
    this.reset();
  }

  reset() {
    const c = this.city;
    this.cars = []; this.peds = []; this.crew = []; this.bullets = []; this.pickups = [];
    for (const p of c.parked) this.cars.push(new Car(p.model, p.paint, p.x, p.y, p.a));
    this.player = { x: c.spots.home.x, y: c.spots.home.y, a: 0, hp: 100, car: null, walk: 0, moving: false, cool: 0, inv: 0, regen: 0 };
    this.cam = { x: clamp(this.player.x - VW / 2, 0, W - VW), y: clamp(this.player.y - VH / 2, 0, H - VH) };
    this.cash = 0; this.heat = 0; this.wanted = 0; this.evadeT = 0; this.crimeCd = 0;
    this.jobIndex = 0; this.job = null; this.sub = null; this.subQueue = []; this.big = null; this.carName = null; this.prompt = null;
    this.state = 'title'; this.stateT = 0; this.fade = 0; this.flash = 0; this.shakeT = 0; this.downT = 0; this.downKind = null;
    this.tempLights = []; this.muted = this.audio.muted; this.finished = false; this.sirenT = 0;
    for (let i = 0; i < 12; i++) this.spawnPed(true);
    for (let i = 0; i < 7; i++) this.spawnTraffic(true);
  }

  // ------------------------------------------------------------ small helpers
  sfx(n) { this.audio.sfx(n); }
  say(lines) { this.subQueue.push(...lines); }
  banner(title, subtitle, color = P.m3, dur = 170) { this.big = { title, subtitle, color, t: 0, dur }; }
  shake(n) { if (!this.opts.calm) this.shakeT = Math.max(this.shakeT, n); }
  focus() { return this.player.car || this.player; }
  solidAt(x, y) { const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); return cx < 0 || cy < 0 || cx >= SW || cy >= SH ? 1 : this.city.solid[cy * SW + cx]; }
  los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 6);
    for (let i = 1; i < n; i++) if (this.solidAt(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n) === 1) return false;
    return true;
  }
  // push a circle out of walls (and optionally street furniture); returns the correction or null
  pushOut(x, y, r, props) {
    let dx = 0, dy = 0, hit = false;
    const solid = this.city.solid;
    for (let pass = 0; pass < 2; pass++) {
      const x0 = Math.floor((x + dx - r) / CELL), x1 = Math.floor((x + dx + r) / CELL), y0 = Math.floor((y + dy - r) / CELL), y1 = Math.floor((y + dy + r) / CELL);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        if (cx >= 0 && cy >= 0 && cx < SW && cy < SH && !solid[cy * SW + cx]) continue;
        const px = x + dx, py = y + dy;
        const qx = clamp(px, cx * CELL, cx * CELL + CELL), qy = clamp(py, cy * CELL, cy * CELL + CELL);
        let ex = px - qx, ey = py - qy;
        const d2 = ex * ex + ey * ey;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 < 1e-6) {
          const l = px - cx * CELL, rt = cx * CELL + CELL - px, t = py - cy * CELL, b = cy * CELL + CELL - py, m = Math.min(l, rt, t, b);
          if (m === l) dx -= m + r; else if (m === rt) dx += m + r; else if (m === t) dy -= m + r; else dy += m + r;
          continue;
        }
        const d = Math.sqrt(d2);
        dx += (ex / d) * (r - d); dy += (ey / d) * (r - d);
      }
    }
    if (props) for (const c of this.city.circles) {
      const ex = x + dx - c.x, ey = y + dy - c.y, rr = r + c.r;
      if (Math.abs(ex) > rr || Math.abs(ey) > rr) continue;
      const d = Math.hypot(ex, ey);
      if (d < rr && d > 0.001) { dx += (ex / d) * (rr - d); dy += (ey / d) * (rr - d); hit = true; }
    }
    if (!hit) return null;
    const d = Math.hypot(dx, dy) || 1;
    return { dx, dy, nx: dx / d, ny: dy / d };
  }
  boom(x, y, r, color = '#ffb060') { this.tempLights.push({ x, y, r, color, life: 14, max: 14 }); }
  noiseAt(x, y, rad) { for (const p of this.peds) if (p.state === 'walk' && Math.hypot(p.x - x, p.y - y) < rad) this.scare(p, x, y); }
  scare(p, x, y) { p.state = 'flee'; p.t = 150 + Math.random() * 90; const a = Math.atan2(p.y - y, p.x - x) + (Math.random() - 0.5); p.vx = Math.cos(a) * 1.05; p.vy = Math.sin(a) * 1.05; }

  // ------------------------------------------------------------ law
  crime(points) {
    this.heat = Math.min(STARS[3] + 1, this.heat + points);
    const lvl = this.heat >= STARS[3] ? 3 : this.heat >= STARS[2] ? 2 : this.heat >= STARS[1] ? 1 : 0;
    if (lvl > this.wanted) { this.wanted = lvl; this.audio.tone(880, 0.12, { vol: 0.08 }); this.audio.tone(660, 0.16, { vol: 0.08, when: 0.12 }); }
    this.evadeT = 0;
  }
  updateLaw() {
    const f = this.focus(), cops = this.cars.filter((c) => c.mode === 'cop' && !c.calm && !c.dead);
    if (this.crimeCd > 0) this.crimeCd--;
    if (this.wanted > 0) {
      let seen = false;
      for (const c of cops) if (Math.hypot(c.x - f.x, c.y - f.y) < 210 && this.los(c.x, c.y, f.x, f.y)) { seen = true; break; }
      if (seen) this.evadeT = 0; else this.evadeT++;
      if (this.evadeT > 520) { this.wanted--; this.heat = STARS[this.wanted]; this.evadeT = 260; if (this.wanted === 0) { this.heat = 0; for (const c of cops) c.calm = true; this.say(['You lost them.']); } }
      if (cops.length < this.wanted && this.frame % 50 === 0) this.spawnCop();
      // caught: boxed in and stopped
      const slow = f.speed !== undefined ? f.speed < 0.35 : false;
      const near = cops.some((c) => Math.hypot(c.x - f.x, c.y - f.y) < 30 && c.speed < 0.8);
      this.bustT = near && (slow || !this.player.car) ? (this.bustT || 0) + 1 : Math.max(0, (this.bustT || 0) - 2);
      if (this.bustT > (this.player.car ? 100 : 55)) this.takeDown('busted');
    } else this.bustT = 0;
    // sirens
    const loud = cops.some((c) => Math.hypot(c.x - f.x, c.y - f.y) < 260);
    if (loud && this.state === 'play') { if (++this.sirenT % 36 === 0) this.audio.tone(this.sirenT % 72 === 0 ? 740 : 560, 0.3, { type: 'triangle', vol: 0.05, slide: this.sirenT % 72 === 0 ? 0.8 : 1.25 }); } else this.sirenT = 0;
  }
  spawnCop() {
    const f = this.focus();
    for (let tries = 0; tries < 12; tries++) {
      const i = Math.floor(Math.random() * 4), j = Math.floor(Math.random() * 4);
      const x = ROAD_X[i] + 24, y = ROAD_Y[j] + 24, d = Math.hypot(x - f.x, y - f.y);
      if (d < 230 || d > 460 || this.cars.some((o) => Math.hypot(o.x - x, o.y - y) < 40)) continue;
      const c = new Car('cop', 'white', x, y, heading(f.x - x, f.y - y));
      c.mode = 'cop'; c.lights = true; c.ai = { stuck: 0, rev: 0 };
      this.cars.push(c);
      return;
    }
  }
  takeDown(kind) {
    if (this.downKind) return;
    this.downKind = kind; this.downT = 0;
    if (kind === 'busted') { this.banner('Busted', 'The precinct keeps a tenth of your cash', P.u5, 150); this.audio.tone(330, 0.5, { type: 'triangle', vol: 0.18, slide: 0.5 }); }
    else { this.banner('Wiped out', 'The clinic keeps a tenth of your cash', P.r4, 150); this.sfx('die'); }
    if (this.job) this.failJob(true);
  }

  // ------------------------------------------------------------ spawning
  spawnTraffic(anywhere) {
    const f = this.focus();
    for (let tries = 0; tries < 10; tries++) {
      const vertical = Math.random() < 0.5, ri = Math.floor(Math.random() * 4), dir = vertical ? (Math.random() < 0.5 ? 0 : 2) : Math.random() < 0.5 ? 1 : 3;
      let x, y;
      const along = (list) => { const k = Math.floor(Math.random() * 3); return list[k] + RW + 20 + Math.random() * (list[k + 1] - list[k] - RW - 40); };
      if (vertical) { x = ROAD_X[ri] + (dir === 0 ? 36 : 12); y = along(ROAD_Y); } else { y = ROAD_Y[ri] + (dir === 1 ? 36 : 12); x = along(ROAD_X); }
      const d = Math.hypot(x - f.x, y - f.y);
      const onScreen = Math.abs(x - this.cam.x - VW / 2) < VW / 2 + 30 && Math.abs(y - this.cam.y - VH / 2) < VH / 2 + 30;
      if (!anywhere && (onScreen || d > 520)) continue;
      if (anywhere && d < 60) continue;
      if (this.cars.some((o) => Math.hypot(o.x - x, o.y - y) < 50)) continue;
      const roll = Math.random();
      const model = roll < 0.4 ? 'sedan' : roll < 0.55 ? 'taxi' : roll < 0.7 ? 'van' : roll < 0.86 ? 'cabrio' : 'coupe';
      const paints = Object.keys(PAINTS);
      const c = new Car(model, paints[Math.floor(Math.random() * paints.length)], x, y, (dir * Math.PI) / 2);
      c.mode = 'rail'; c.lights = true; c.driver = true;
      c.rail = { dir, ri, speed: 1, cruise: 1.15 + Math.random() * 0.45, turn: null, cool: 0, wait: 0, ghost: 0 };
      this.cars.push(c);
      return;
    }
  }
  spawnPed(anywhere) {
    const f = this.focus();
    for (let tries = 0; tries < 10; tries++) {
      const i = Math.floor(Math.random() * 3), j = Math.floor(Math.random() * 3), k = Math.floor(Math.random() * 4);
      const cs = this.corners(i, j), a = cs[k], n = cs[(k + 1) % 4], t = Math.random();
      const x = lerp(a[0], n[0], t), y = lerp(a[1], n[1], t);
      const onScreen = Math.abs(x - this.cam.x - VW / 2) < VW / 2 + 16 && Math.abs(y - this.cam.y - VH / 2) < VH / 2 + 16;
      if (!anywhere && (onScreen || Math.hypot(x - f.x, y - f.y) > 420)) continue;
      const cw = Math.random() < 0.5 ? 1 : -1;
      this.peds.push({ x, y, a: 0, look: 'abcdef'[Math.floor(Math.random() * 6)], state: 'walk', t: 0, vx: 0, vy: 0, bi: i, bj: j, corner: cw > 0 ? (k + 1) % 4 : k, cw, speed: 0.3 + Math.random() * 0.14, walk: Math.random() * 9, far: 0 });
      return;
    }
  }
  corners(i, j) { const b = blockRect(i, j); return [[b.x + 7, b.y + 7], [b.x + b.w - 8, b.y + 7], [b.x + b.w - 8, b.y + b.h - 8], [b.x + 7, b.y + b.h - 8]]; }

  // ------------------------------------------------------------ jobs
  target() {
    const s = this.city.spots, j = this.job;
    if (this.state !== 'play') return null;
    if (!j) return this.jobIndex < JOBS.length ? s.phone : null;
    if (j.id === 0) return j.stage === 0 || this.player.car !== j.car ? j.car : s.garage;
    if (j.id === 1) { let best = null, bd = 1e9; const f = this.focus(); for (const p of this.pickups) if (p.kind === 'bag') { const d = Math.hypot(p.x - f.x, p.y - f.y); if (d < bd) { bd = d; best = p; } } return best; }
    if (j.id === 2) { if (j.stage === 0) { const alive = this.crew.filter((c) => c.hp > 0); return alive.length ? alive[0] : s.docks; } return null; }
    return null;
  }
  startJob() {
    const id = this.jobIndex, def = JOBS[id], s = this.city.spots;
    this.job = { id, stage: 0, text: '' };
    this.say(def.intro);
    this.banner(def.name, 'Job ' + (id + 1) + ' of ' + JOBS.length, P.y4, 120);
    this.sfx('select');
    if (id === 0) {
      const c = new Car('coupe', 'pink', s.jobCar.x, s.jobCar.y, s.jobCar.a); c.job = true; this.cars.push(c);
      this.job.car = c; this.job.text = 'Steal the pink Marlin at Hotel Azul';
    } else if (id === 1) {
      for (const p of s.cash) this.pickups.push({ x: p.x, y: p.y, kind: 'bag', t: Math.random() * 60 });
      this.job.timer = 85 * 60; this.job.total = s.cash.length; this.job.text = 'Collect the bags: 0/' + s.cash.length;
    } else {
      this.crew = s.crew.map((p) => ({ x: p.x, y: p.y, a: Math.random() * TAU, hp: 20, cool: 60 + Math.random() * 60, flash: 0, t: 0, home: p }));
      this.job.text = 'Clear Pier 9: ' + this.crew.length + ' left';
    }
  }
  passJob() {
    const def = JOBS[this.job.id];
    this.cash += def.reward; this.job = null; this.jobIndex++;
    this.sfx('levelup');
    if (this.jobIndex >= JOBS.length) { this.banner('That is the demo', money(def.reward) + ' paid. Port Coral is yours: keep driving.', P.m3, 420); this.finished = true; }
    else this.banner('Job done', '+' + money(def.reward) + '   Next job at the phone booth', P.g6, 190);
  }
  failJob(quiet) {
    const j = this.job; this.job = null;
    if (!j) return;
    this.pickups = this.pickups.filter((p) => p.kind !== 'bag');
    this.crew = [];
    if (j.car) j.car.job = false;
    if (!quiet) { this.banner('Job failed', 'Try again at the phone booth', P.r4, 150); this.audio.tone(220, 0.4, { type: 'sawtooth', vol: 0.1, slide: 0.6 }); }
  }
  updateJob() {
    const j = this.job, p = this.player, s = this.city.spots;
    if (!j) return;
    if (j.id === 0) {
      if (j.car.dead) return this.failJob();
      if (j.stage === 0 && p.car === j.car) { j.stage = 1; this.crime(1); this.say(['The alarm is howling. Get it to the garage.']); }
      j.text = j.stage === 0 ? 'Steal the pink Marlin at Hotel Azul' : p.car === j.car ? "Deliver it to Rico's garage" : 'Get back in the Marlin';
      if (j.stage === 1 && p.car === j.car && Math.hypot(j.car.x - s.garage.x, j.car.y - s.garage.y) < 13 && j.car.speed < 0.6) {
        // hand the car over
        p.car = null; p.x = s.garage.x + 20; p.y = s.garage.y + 4; this.cars = this.cars.filter((c) => c !== j.car);
        this.fade = 1; this.passJob();
      }
    } else if (j.id === 1) {
      const left = this.pickups.filter((q) => q.kind === 'bag').length;
      j.text = 'Collect the bags: ' + (j.total - left) + '/' + j.total;
      if (left === 0) return this.passJob();
      if (--j.timer <= 0) this.failJob();
    } else if (j.id === 2) {
      const alive = this.crew.filter((c) => c.hp > 0).length;
      if (j.stage === 0) {
        j.text = 'Clear Pier 9: ' + alive + ' left';
        if (alive === 0) { j.stage = 1; this.heat = Math.max(this.heat, STARS[2]); this.crime(0); this.say(['Someone called it in. Lose the cops.']); }
      } else { j.text = 'Lose the cops'; if (this.wanted === 0) this.passJob(); }
    }
  }

  // ------------------------------------------------------------ main step
  begin() { this.audio.unlock(); this.state = 'play'; this.stateT = 0; this.fade = 1; this.audio.music('neon'); this.sfx('select'); this.say(['Port Coral, 11:40 pm. Rico left word at the phone booth.']); }
  step() {
    this.frame++; this.time += 1 / 60; this.stateT++;
    const inp = this.input;
    if (inp.take('KeyM')) this.muted = this.audio.toggleMute();
    this.audio.tick();
    if (this.fade > 0) this.fade = Math.max(0, this.fade - 0.04);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.06);
    if (this.shakeT > 0) this.shakeT *= 0.86;
    if (this.big && ++this.big.t > this.big.dur) this.big = null;
    if (this.carName && this.carName.t > 0) this.carName.t--;
    if (this.sub) { if (++this.sub.t > this.sub.dur) this.sub = null; } else if (this.subQueue.length) { const text = this.subQueue.shift(); this.sub = { text, t: 0, dur: 110 + text.length * 2 }; }
    for (let i = this.tempLights.length - 1; i >= 0; i--) if (--this.tempLights[i].life <= 0) this.tempLights.splice(i, 1);

    if (this.state === 'pause') { if (inp.take('Escape') || inp.take('KeyP') || inp.click) this.state = 'play'; return; }
    if (this.state === 'title') {
      const tx = (W - VW) * (0.5 + 0.45 * Math.sin(this.time * 0.1)), ty = (H - VH) * (0.5 + 0.45 * Math.sin(this.time * 0.07 + 1));
      this.cam.x += (tx - this.cam.x) * 0.03; this.cam.y += (ty - this.cam.y) * 0.03;
      this.updateTraffic(); this.updatePeds(); this.fx.update();
      if (inp.any && this.stateT > 20) { this.begin(); this.cam.x = clamp(this.player.x - VW / 2, 0, W - VW); this.cam.y = clamp(this.player.y - VH / 2, 0, H - VH); }
      return;
    }
    if (inp.take('Escape') || inp.take('KeyP')) { this.state = 'pause'; return; }

    if (this.downKind) {
      // slow fade, then wake up at the motel
      if (++this.downT === 130) this.fade = 1.6;
      if (this.downT > 150) this.respawn();
    } else this.updatePlayer();
    this.updateTraffic();
    this.updatePeds();
    this.updateCrew();
    this.updateBullets();
    this.updatePickups();
    this.updateLaw();
    this.updateJob();
    this.fx.update();

    // camera leads the car
    const f = this.focus(), lead = this.player.car ? 24 : 0;
    const tx = clamp(f.x + (f.vx || 0) * lead - VW / 2, 0, W - VW), ty = clamp(f.y + (f.vy || 0) * lead - VH / 2, 0, H - VH);
    this.cam.x += (tx - this.cam.x) * 0.09; this.cam.y += (ty - this.cam.y) * 0.09;
  }

  respawn() {
    const p = this.player, s = this.city.spots;
    this.cash = Math.floor(this.cash * 0.9);
    p.car = null; p.x = s.home.x; p.y = s.home.y; p.hp = 100; p.inv = 90;
    this.heat = 0; this.wanted = 0; this.downKind = null; this.bustT = 0;
    this.cars = this.cars.filter((c) => c.mode !== 'cop' && !c.dead);
    this.bullets = [];
    this.cam.x = clamp(p.x - VW / 2, 0, W - VW); this.cam.y = clamp(p.y - VH / 2, 0, H - VH);
    this.fade = 1;
  }

  // ------------------------------------------------------------ player
  updatePlayer() {
    const inp = this.input, p = this.player, tp = inp.touch;
    if (p.inv > 0) p.inv--;
    if (p.cool > 0) p.cool--;
    if (this.wanted === 0 && p.hp < 100 && ++p.regen > 40) { p.regen = 0; p.hp++; }
    let mx = (inp.down('ArrowRight') || inp.down('KeyD') ? 1 : 0) - (inp.down('ArrowLeft') || inp.down('KeyA') ? 1 : 0);
    let my = (inp.down('ArrowDown') || inp.down('KeyS') ? 1 : 0) - (inp.down('ArrowUp') || inp.down('KeyW') ? 1 : 0);
    const stick = tp && tp.stick;
    const use = inp.take('KeyE') || inp.take('KeyF') || inp.take('Enter') || (tp && tp.use);
    if (tp) tp.use = false;
    const fireBtn = tp && tp.fire;
    this.prompt = null;

    if (p.car) {
      const c = p.car;
      if (stick && (stick.dx || stick.dy)) {
        // touch: point the stick where you want to go
        const diff = wrap(heading(stick.dx, stick.dy) - c.a), mag = Math.min(1, Math.hypot(stick.dx, stick.dy));
        if (Math.abs(diff) > 2.3 && c.speed < 1) { c.thr = -1; c.steer = clamp(-diff, -1, 1); } else { c.thr = mag; c.steer = clamp(diff * 1.8, -1, 1); }
      } else { c.thr = -my; c.steer += (mx - c.steer) * 0.3; }
      c.hand = inp.down('Space') || !!fireBtn;
      if (fireBtn && !stick) c.thr = -1;
      this.drive(c);
      p.x = c.x; p.y = c.y;
      if (c.skid && c.speed > 1) this.skidMarks(c);
      if (use && c.speed < 1.2) this.leaveCar();
      this.engine(c);
      // respray bay clears the heat when nobody is watching
      const sp = this.city.spots.spray;
      if (Math.hypot(c.x - sp.x, c.y - sp.y) < 13 && c.speed < 0.5 && (this.wanted > 0 || c.hp < c.m.hp) && !c.sprayed) {
        if (this.wanted > 0 && this.evadeT < 40) this.say(['Not while they can see you.']);
        else if (this.cash < 100) this.say(['A respray is $100.']);
        else {
          this.cash -= 100; this.heat = 0; this.wanted = 0; c.hp = c.m.hp; c.job || (c.paint = Object.keys(PAINTS).filter((k) => k !== c.paint)[Math.floor(Math.random() * 11)]);
          c.spr = carSprites(c.model, c.paint); for (const o of this.cars) if (o.mode === 'cop') o.calm = true;
          this.fade = 1; this.sfx('rest'); this.say(['Fresh paint, clean record.  -$100']);
        }
        c.sprayed = 120;
      }
      if (c.sprayed > 0 && Math.hypot(c.x - sp.x, c.y - sp.y) > 20) c.sprayed = 0;
      return;
    }
    this.engine(null);

    // ---- on foot
    if (stick && (stick.dx || stick.dy)) { mx = stick.dx; my = stick.dy; }
    const len = Math.hypot(mx, my);
    p.moving = len > 0.15;
    if (p.moving) {
      const sp = 1.15 * Math.min(1, len);
      p.x += (mx / len) * sp; p.y += (my / len) * sp;
      p.walk += 0.2;
      if (Math.floor(p.walk) % 4 === 0 && Math.floor(p.walk - 0.2) % 4 !== 0) this.audio.noise(0.03, { freq: 600 + Math.random() * 300, vol: 0.02 });
    }
    const res = this.pushOut(p.x, p.y, 3, true);
    if (res) { p.x += res.dx; p.y += res.dy; }
    for (const c of this.cars) for (const [qx, qy] of c.pts()) { const dx = p.x - qx, dy = p.y - qy, d = Math.hypot(dx, dy), rr = c.rad + 2.5; if (d < rr && d > 0.01) { p.x += (dx / d) * (rr - d); p.y += (dy / d) * (rr - d); } }
    // aim with the mouse while it is in use, otherwise face the way you walk
    let aimed = false;
    if (inp.mouseT < 240) { const dx = inp.px + this.cam.x - p.x, dy = inp.py + this.cam.y - p.y; if (Math.hypot(dx, dy) > 4) { p.a = heading(dx, dy); aimed = true; } }
    if (!aimed && p.moving) p.a = heading(mx, my);
    if (tp && tp.on && fireBtn) { const t = this.nearestThreat(); if (t) p.a = heading(t.x - p.x, t.y - p.y); }
    p.aiming = aimed || p.cool > 0;
    if ((inp.pdown && inp.mouseT < 600 && !inp.isTouch) || inp.down('Space') || inp.down('KeyJ') || fireBtn) this.shoot();

    // interactions: jobs, then cars
    const s = this.city.spots;
    if (!this.job && this.jobIndex < JOBS.length && Math.hypot(p.x - s.phone.x, p.y - s.phone.y) < 13) {
      this.prompt = { x: s.phone.x, y: s.phone.y - 6, label: 'TAKE JOB' };
      if (use) return this.startJob();
    }
    let best = null, bd = 17;
    for (const c of this.cars) { if (c.dead || (c.mode === 'cop' && !c.calm)) continue; let d = 1e9; for (const [qx, qy] of c.pts()) d = Math.min(d, Math.hypot(p.x - qx, p.y - qy)); if (d < bd && c.speed < 1.6) { bd = d; best = c; } }
    if (best && !this.prompt) {
      this.prompt = { x: best.x, y: best.y - 8, label: best.driver ? 'STEAL' : 'DRIVE' };
      if (use) this.enterCar(best);
    }
  }
  nearestThreat() { const p = this.player; let best = null, bd = 130; for (const c of this.crew) if (c.hp > 0) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } } return best; }
  enterCar(c) {
    const p = this.player;
    if (c.driver) {
      // throw the driver out
      const rx = Math.cos(c.a), ry = Math.sin(c.a);
      const ped = { x: c.x - rx * 10, y: c.y - ry * 10, a: 0, look: 'abcdef'[c.id % 6], state: 'walk', t: 0, vx: 0, vy: 0, bi: 1, bj: 1, corner: 0, cw: 1, speed: 0.36, walk: 0, far: 0 };
      this.peds.push(ped); this.scare(ped, c.x, c.y);
      this.crime(1); c.driver = false;
      this.audio.tone(300, 0.1, { type: 'sawtooth', vol: 0.06 });
    } else if (c.model === 'cop') this.crime(2);
    c.mode = 'player'; c.rail = null; c.lights = true; c.calm = false; c.thr = 0; c.steer = 0;
    p.car = c;
    this.carName = { text: c.m.name, t: 130 };
    this.audio.noise(0.08, { freq: 300, vol: 0.14, type: 'lowpass' }); this.audio.tone(90, 0.3, { type: 'sawtooth', vol: 0.06, slide: 1.6 });
  }
  leaveCar() {
    const p = this.player, c = p.car, rx = Math.cos(c.a), ry = Math.sin(c.a);
    for (const side of [-1, 1]) {
      const x = c.x + rx * side * 11, y = c.y + ry * side * 11;
      if (this.solidAt(x, y) || this.pushOut(x, y, 3, true)) continue;
      p.x = x; p.y = y; p.car = null; c.mode = 'loose'; c.thr = 0; c.hand = true; c.steer = 0;
      this.audio.noise(0.08, { freq: 300, vol: 0.12, type: 'lowpass' });
      return;
    }
  }
  shoot() {
    const p = this.player;
    if (p.cool > 0) return;
    p.cool = 13;
    const fx = Math.sin(p.a), fy = -Math.cos(p.a), sp = (Math.random() - 0.5) * 0.05;
    const a = p.a + sp;
    this.bullets.push({ x: p.x + fx * 7, y: p.y + fy * 7, vx: Math.sin(a) * 7, vy: -Math.cos(a) * 7, life: 40, mine: true });
    this.boom(p.x + fx * 9, p.y + fy * 9, 34, '#fff0b0');
    this.audio.noise(0.12, { freq: 1800, slide: 0.3, vol: 0.2, q: 0.6 }); this.audio.tone(160, 0.07, { type: 'square', vol: 0.1, slide: 0.5 });
    this.noiseAt(p.x, p.y, 130);
    if (this.crimeCd === 0 && (this.peds.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 150) || this.wanted > 0)) { this.crime(1); this.crimeCd = 240; }
  }
  hurt(n) {
    const p = this.player;
    if (p.inv > 0 || this.downKind) return;
    p.hp -= n; p.inv = 26; p.regen = -200;
    this.fx.sparks(p.x, p.y, 6, [P.white, P.m3, P.r4], 1.4);
    this.shake(3); this.sfx('hurt');
    if (p.hp <= 0) { p.hp = 0; this.takeDown('wiped'); }
  }
  engine(c) {
    // one sustained oscillator whose pitch follows the revs
    const ctx = this.audio.ctx;
    if (!ctx) return;
    if (!this.eng) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(this.audio.sfxGain); o.start();
      this.eng = { o, g };
    }
    const t = ctx.currentTime;
    this.eng.g.gain.setTargetAtTime(c && this.state === 'play' ? 0.035 + Math.abs(c.thr) * 0.02 : 0, t, 0.08);
    if (c) this.eng.o.frequency.setTargetAtTime(48 + c.speed * 34 + (c.skid ? 12 : 0), t, 0.06);
  }

  // ------------------------------------------------------------ cars
  drive(c) {
    const m = c.m;
    const vf0 = c.vx * Math.sin(c.a) - c.vy * Math.cos(c.a);
    c.a += c.steer * m.turn * clamp(vf0 / 1.3, -1, 1) * (c.hand ? 1.3 : 1);
    const fx = Math.sin(c.a), fy = -Math.cos(c.a), rx = Math.cos(c.a), ry = Math.sin(c.a);
    let vf = c.vx * fx + c.vy * fy, vl = c.vx * rx + c.vy * ry;
    const top = m.top * (c.hp < m.hp * 0.3 ? 0.75 : 1);
    if (c.thr > 0) { if (vf < top) vf += m.acc * c.thr; }
    else if (c.thr < 0) { if (vf > 0.15) vf -= 0.1; else if (vf > -top * 0.45) vf -= m.acc * 0.7; }
    else vf *= 0.985;
    vf *= c.hand ? 0.972 : 0.994;
    const grip = c.hand ? 0.95 : Math.abs(vf) > top * 0.75 ? Math.min(0.93, m.grip + 0.07) : m.grip;
    c.skid = Math.abs(vl) > 0.5 || (c.hand && Math.abs(vf) > 1);
    vl *= grip;
    c.vx = fx * vf + rx * vl; c.vy = fy * vf + ry * vl;
    if (Math.abs(c.vx) < 0.004 && Math.abs(c.vy) < 0.004) c.vx = c.vy = 0;
    c.x += c.vx; c.y += c.vy;
    const pts = c.pts();
    for (let i = 0; i < 3; i++) {
      const res = this.pushOut(pts[i][0], pts[i][1], c.rad, true);
      if (!res) continue;
      c.x += res.dx; c.y += res.dy;
      const vn = c.vx * res.nx + c.vy * res.ny;
      if (vn < 0) {
        c.vx -= 1.3 * vn * res.nx; c.vy -= 1.3 * vn * res.ny;
        if (-vn > 0.5) this.carHit(c, -vn, pts[i][0] - res.nx * c.rad, pts[i][1] - res.ny * c.rad);
        if (i !== 1) c.a += (i === 0 ? 1 : -1) * (fx * res.ny - fy * res.nx) * 0.05 * Math.min(2, -vn + 0.4);
      }
    }
  }
  carHit(c, imp, x, y) {
    if (c.dead) return;
    c.hp -= imp * imp * 2.6;
    const mine = c === this.player.car, near = Math.abs(x - this.cam.x - VW / 2) < 240;
    this.fx.sparks(x, y, Math.min(12, 3 + imp * 3), SPARK, 1 + imp * 0.6);
    if (near) { this.audio.noise(0.16, { freq: 900, slide: 0.3, vol: Math.min(0.3, 0.06 + imp * 0.07) }); this.audio.tone(80, 0.12, { type: 'triangle', vol: Math.min(0.25, imp * 0.07), slide: 0.5 }); }
    if (mine) this.shake(Math.min(7, imp * 2));
    if (c.hp <= 0 && !c.burn) { c.hp = 0; c.burn = 1; }
  }
  explode(c) {
    c.dead = true; c.mode = 'wreck'; c.vx *= 0.3; c.vy *= 0.3; c.lights = false; c.driver = false; c.far = 0;
    this.fx.burst(c.x, c.y, 46, { colors: FIRE, speed: 3.2, em: true, life: 44, drag: 0.93, size: 2, shrink: true });
    this.fx.burst(c.x, c.y, 18, { colors: [P.n4, P.n3, P.n2], speed: 1.6, life: 70, drag: 0.95, size: 2, up: 0.3 });
    this.fx.sparks(c.x, c.y, 24, SPARK, 4);
    this.boom(c.x, c.y, 130); this.flash = 0.5; this.shake(10); this.sfx('boom'); this.sfx('slam');
    for (const o of this.cars) { if (o === c || o.dead) continue; const d = Math.hypot(o.x - c.x, o.y - c.y); if (d < 46) { o.hp -= 70 * (1 - d / 60); o.vx += ((o.x - c.x) / (d || 1)) * 2; o.vy += ((o.y - c.y) / (d || 1)) * 2; if (o.mode === 'rail') this.offRail(o); if (o.hp <= 0 && !o.burn) { o.hp = 0; o.burn = 1; } } }
    for (const q of this.peds) if (q.state !== 'down' && Math.hypot(q.x - c.x, q.y - c.y) < 44) this.knock(q, q.x - c.x, q.y - c.y, false);
    for (const q of this.crew) if (q.hp > 0 && Math.hypot(q.x - c.x, q.y - c.y) < 44) this.hitCrew(q, 40);
    const p = this.player;
    if (p.car === c) { p.car = null; this.takeDown('wiped'); }
    else if (!p.car && Math.hypot(p.x - c.x, p.y - c.y) < 44) this.hurt(45, c.x, c.y);
    if (c.mode === 'wreck' && c.model === 'cop') this.crime(3);
    this.noiseAt(c.x, c.y, 200);
  }
  offRail(c) { c.mode = 'loose'; c.rail = null; c.thr = 0; c.hand = true; c.steer = 0; }
  skidMarks(c) {
    const g = this.gg, fx = Math.sin(c.a), fy = -Math.cos(c.a), rx = Math.cos(c.a), ry = Math.sin(c.a);
    g.fillStyle = 'rgba(14,11,22,0.5)';
    for (const s of [-1, 1]) g.fillRect(Math.round(c.x - fx * (c.half - 4) + rx * s * 4), Math.round(c.y - fy * (c.half - 4) + ry * s * 4), 1, 1);
    if (this.frame % 5 === 0) { this.fx.add({ x: c.x - fx * c.half, y: c.y - fy * c.half, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, life: 22, colors: [P.n6, P.n5, P.n4], size: 2, alpha: 0.5, grow: true }); }
    if (this.frame % 9 === 0) this.audio.noise(0.14, { freq: 2400 + Math.random() * 500, vol: 0.035, q: 4 });
  }

  updateTraffic() {
    const f = this.focus(), p = this.player;
    for (const c of this.cars) {
      c.t++;
      if (c.mode === 'rail') this.railStep(c);
      else if (c.mode === 'cop') { this.copStep(c); this.drive(c); }
      else if (c.mode !== 'player') { if (c.vx || c.vy || c.mode === 'loose') { c.thr = 0; c.steer = 0; c.hand = true; this.drive(c); } }
      // damage states
      if (c.burn && !c.dead) {
        c.burn++;
        if (c.burn % 2 === 0) this.fx.flame(c.x + Math.sin(c.a) * c.half * 0.6, c.y - Math.cos(c.a) * c.half * 0.6, 1.1);
        if (c.burn > 170) this.explode(c);
      } else if (!c.dead && c.hp < c.m.hp * 0.45 && c.t % (c.hp < c.m.hp * 0.25 ? 4 : 9) === 0) {
        this.fx.add({ x: c.x + Math.sin(c.a) * c.half * 0.7, y: c.y - Math.cos(c.a) * c.half * 0.7, vx: (Math.random() - 0.5) * 0.3, vy: -0.3 - Math.random() * 0.3, life: 40, colors: c.hp < c.m.hp * 0.25 ? [P.n2, P.n1, P.n1] : [P.n6, P.n5, P.n4], size: 2, alpha: 0.6, grow: true });
      } else if (c.dead && c.t % 12 === 0 && c.far < 400) this.fx.add({ x: c.x, y: c.y, vx: 0.1, vy: -0.4, life: 50, colors: [P.n2, P.n1], size: 2, alpha: 0.5, grow: true });
      // run people over
      if (c.speed > 0.9 && !c.dead) {
        for (const q of this.peds) { if (q.state === 'down') continue; for (const [qx, qy] of c.pts()) if (Math.hypot(q.x - qx, q.y - qy) < c.rad + 2) { this.knock(q, c.vx, c.vy, c === p.car); break; } }
        if (c === p.car) for (const q of this.crew) if (q.hp > 0 && Math.hypot(q.x - c.x, q.y - c.y) < c.rad + 5) this.hitCrew(q, 40);
        if (!p.car && c !== p.car && !this.downKind) for (const [qx, qy] of c.pts()) if (Math.hypot(p.x - qx, p.y - qy) < c.rad + 2.5) { this.hurt(Math.round(8 + c.speed * 9), c.x, c.y); p.x += c.vx * 3; p.y += c.vy * 3; break; }
      }
      const d = Math.hypot(c.x - f.x, c.y - f.y);
      c.far = d > 520 ? c.far + 1 : 0;
    }
    this.carPairs();
    // keep the streets stocked without letting the list grow
    const off = (c) => Math.abs(c.x - this.cam.x - VW / 2) > VW / 2 + 40 || Math.abs(c.y - this.cam.y - VH / 2) > VH / 2 + 40;
    for (const c of this.cars) c.idle = c.mode === 'loose' || c.mode === 'wreck' ? (c.idle || 0) + 1 : 0;
    this.cars = this.cars.filter((c) => c === p.car || c.job || !((c.mode === 'rail' && c.far > 30) || (c.mode === 'loose' && (c.far > 240 || (c.idle > 1500 && off(c)))) || (c.mode === 'wreck' && (c.far > 120 || (c.idle > 1200 && off(c)))) || (c.mode === 'cop' && c.calm && c.far > 20) || (c.mode === 'cop' && c.far > 500)));
    if (this.frame % 40 === 0 && this.cars.filter((c) => c.mode === 'rail').length < 9) this.spawnTraffic(false);
  }

  railStep(c) {
    const R = c.rail, fx = Math.sin(c.a), fy = -Math.cos(c.a), rx = Math.cos(c.a), ry = Math.sin(c.a);
    let blocked = false;
    const look = 26 + R.speed * 14;
    const test = (ox, oy, rad) => { const dx = ox - c.x, dy = oy - c.y, df = dx * fx + dy * fy; if (df < 6 || df > look + rad) return; if (Math.abs(dx * rx + dy * ry) < 7.5 + rad) blocked = true; };
    if (R.ghost > 0) R.ghost--;
    else {
      for (const o of this.cars) if (o !== c && Math.abs(o.x - c.x) < 70 && Math.abs(o.y - c.y) < 70) for (const [qx, qy] of o.pts()) test(qx, qy, 5);
      for (const q of this.peds) if (q.state !== 'down') test(q.x, q.y, 2);
      if (!this.player.car && this.state === 'play') test(this.player.x, this.player.y, 3);
    }
    R.speed += clamp((blocked ? 0 : R.turn ? 0.85 : R.cruise) - R.speed, -0.1, 0.025);
    if (blocked) { if (++R.wait > 300) { R.ghost = 120; R.wait = 0; } } else R.wait = 0;
    if (R.speed < 0.02) { c.vx = c.vy = 0; return; }
    if (R.turn) {
      const tn = R.turn; tn.u += R.speed / tn.len;
      if (tn.u >= 1) { c.vx = tn.p2[0] - c.x; c.vy = tn.p2[1] - c.y; c.x = tn.p2[0]; c.y = tn.p2[1]; R.dir = tn.nd; R.ri = tn.nri; c.a = (R.dir * Math.PI) / 2; R.turn = null; R.cool = 24; return; }
      const u = tn.u, iu = 1 - u;
      const nx = iu * iu * tn.p0[0] + 2 * iu * u * tn.p1[0] + u * u * tn.p2[0], ny = iu * iu * tn.p0[1] + 2 * iu * u * tn.p1[1] + u * u * tn.p2[1];
      const tx = iu * (tn.p1[0] - tn.p0[0]) + u * (tn.p2[0] - tn.p1[0]), ty = iu * (tn.p1[1] - tn.p0[1]) + u * (tn.p2[1] - tn.p1[1]);
      c.vx = nx - c.x; c.vy = ny - c.y; c.x = nx; c.y = ny; c.a = heading(tx, ty);
      return;
    }
    const d = DIRS[R.dir];
    c.x += d[0] * R.speed; c.y += d[1] * R.speed; c.vx = d[0] * R.speed; c.vy = d[1] * R.speed; c.a = (R.dir * Math.PI) / 2;
    if (R.cool > 0) { R.cool--; return; }
    if (R.dir % 2 === 0) {
      for (let j = 0; j < 4; j++) { const edge = R.dir === 0 ? ROAD_Y[j] + RW : ROAD_Y[j]; if (Math.abs(c.y - edge) <= R.speed + 0.5) { this.planTurn(c, R.ri, j); break; } }
    } else for (let i = 0; i < 4; i++) { const edge = R.dir === 3 ? ROAD_X[i] + RW : ROAD_X[i]; if (Math.abs(c.x - edge) <= R.speed + 0.5) { this.planTurn(c, i, R.ri); break; } }
  }
  planTurn(c, i, j) {
    const R = c.rail, opts = [];
    if (j > 0 && R.dir !== 2) opts.push(0);
    if (i < 3 && R.dir !== 3) opts.push(1);
    if (j < 3 && R.dir !== 0) opts.push(2);
    if (i > 0 && R.dir !== 1) opts.push(3);
    let nd = opts[Math.floor(Math.random() * opts.length)];
    if (opts.includes(R.dir) && Math.random() < 0.45) nd = R.dir;
    const X = ROAD_X[i], Y = ROAD_Y[j];
    const exit = [[X + 36, Y], [X + RW, Y + 36], [X + 12, Y + RW], [X, Y + 12]][nd];
    const p0 = [c.x, c.y];
    const p1 = nd === R.dir ? [(p0[0] + exit[0]) / 2, (p0[1] + exit[1]) / 2] : R.dir % 2 === 0 ? [p0[0], exit[1]] : [exit[0], p0[1]];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(exit[0] - p1[0], exit[1] - p1[1]);
    R.turn = { p0, p1, p2: exit, u: 0, len: Math.max(8, len * (nd === R.dir ? 1 : 0.86)), nd, nri: nd % 2 === 0 ? i : j };
  }

  copStep(c) {
    const f = this.focus(), ai = c.ai;
    let tx, ty;
    const near = (v, list) => { let b = 0; for (let k = 1; k < 4; k++) if (Math.abs(v - list[k] - 24) < Math.abs(v - list[b] - 24)) b = k; return b; };
    if (c.calm) {
      // stand down: roll off toward a far corner and get culled off-screen
      if (!ai.goal || Math.hypot(c.x - ai.goal[0], c.y - ai.goal[1]) < 30) ai.goal = [ROAD_X[Math.floor(Math.random() * 4)] + 24, ROAD_Y[Math.floor(Math.random() * 4)] + 24];
      const ci = near(c.x, ROAD_X), cj = near(c.y, ROAD_Y), gi = near(ai.goal[0], ROAD_X), gj = near(ai.goal[1], ROAD_Y);
      const ni = ci + Math.sign(gi - ci), nj = cj + (ni === ci ? Math.sign(gj - cj) : 0);
      tx = ROAD_X[ni] + 24; ty = ROAD_Y[nj] + 24;
    } else {
      const d = Math.hypot(f.x - c.x, f.y - c.y);
      if (d < 90 || this.los(c.x, c.y, f.x, f.y)) { tx = f.x + (f.vx || 0) * 8; ty = f.y + (f.vy || 0) * 8; }
      else {
        // follow the street grid toward the junction nearest the suspect
        const ci = near(c.x, ROAD_X), cj = near(c.y, ROAD_Y), pi = near(f.x, ROAD_X), pj = near(f.y, ROAD_Y);
        const nx = ROAD_X[ci] + 24, ny = ROAD_Y[cj] + 24;
        if (Math.hypot(c.x - nx, c.y - ny) > 34) { tx = nx; ty = ny; }
        else if (Math.abs(ci - pi) >= Math.abs(cj - pj) && ci !== pi) { tx = ROAD_X[ci + Math.sign(pi - ci)] + 24; ty = ny; }
        else if (cj !== pj) { tx = nx; ty = ROAD_Y[cj + Math.sign(pj - cj)] + 24; }
        else { tx = f.x; ty = f.y; }
      }
    }
    const diff = wrap(heading(tx - c.x, ty - c.y) - c.a);
    if (ai.rev > 0) { ai.rev--; c.thr = -1; c.steer = -Math.sign(diff || 1); c.hand = false; return; }
    c.steer = clamp(diff * 2.4, -1, 1);
    c.thr = c.calm ? 0.45 : Math.abs(diff) > 1.5 ? 0.35 : 1;
    c.hand = !c.calm && Math.abs(diff) > 1.9 && c.speed > 1.6;
    if (c.speed < 0.25) { if (++ai.stuck > 45) { ai.rev = 50; ai.stuck = 0; } } else ai.stuck = 0;
    // a stopped suspect right in front: hold position instead of grinding against them
    if (!c.calm && Math.hypot(f.x - c.x, f.y - c.y) < 26 && (f.speed === undefined || f.speed < 0.5)) { c.thr = 0; c.hand = true; ai.stuck = 0; }
  }

  carPairs() {
    const cars = this.cars, p = this.player;
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (Math.abs(a.x - b.x) > 32 || Math.abs(a.y - b.y) > 32) continue;
      if (a.mode === 'rail' && b.mode === 'rail') continue;
      let best = 0, nx = 0, ny = 0;
      for (const [ax, ay] of a.pts()) for (const [bx, by] of b.pts()) {
        const dx = ax - bx, dy = ay - by, d = Math.hypot(dx, dy), ov = a.rad + b.rad - d;
        if (ov > best && d > 0.001) { best = ov; nx = dx / d; ny = dy / d; }
      }
      if (best <= 0) continue;
      const ha = a.mode === 'wreck' ? 0.15 : 0.5, hb = b.mode === 'wreck' ? 0.15 : 0.5, tot = ha + hb;
      a.x += nx * best * (ha / tot); a.y += ny * best * (ha / tot); b.x -= nx * best * (hb / tot); b.y -= ny * best * (hb / tot);
      const rvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rvn >= 0) continue;
      const jimp = (-(1.3) * rvn) / 2;
      a.vx += jimp * nx; a.vy += jimp * ny; b.vx -= jimp * nx; b.vy -= jimp * ny;
      const imp = -rvn;
      if (imp > 0.45) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.carHit(a, imp * 0.75, mx, my); this.carHit(b, imp * 0.75, mx, my);
        for (const c of [a, b]) if (c.mode === 'rail') this.offRail(c);
        const mine = a === p.car ? b : b === p.car ? a : null;
        if (mine && this.crimeCd === 0) {
          if (mine.model === 'cop' && mine.mode === 'cop') { this.crime(2); this.crimeCd = 90; }
          else if (mine.driver && imp > 1.4) { this.crime(1); this.crimeCd = 240; }
        }
      }
    }
  }

  // ------------------------------------------------------------ people
  knock(q, vx, vy, byPlayer) {
    q.state = 'down'; q.t = 0; const d = Math.hypot(vx, vy) || 1; q.vx = (vx / d) * 1.8; q.vy = (vy / d) * 1.8; q.a = heading(vx, vy);
    this.audio.tone(140, 0.1, { type: 'triangle', vol: 0.12, slide: 0.6 });
    this.fx.sparks(q.x, q.y, 5, [P.white, P.y5], 1.2);
    if (Math.random() < 0.7) this.pickups.push({ x: q.x, y: q.y, kind: 'cash', value: 10 + Math.floor(Math.random() * 4) * 10, t: 0 });
    if (byPlayer) { this.crime(2); this.noiseAt(q.x, q.y, 90); }
  }
  updatePeds() {
    const f = this.focus();
    for (const q of this.peds) {
      q.far = Math.hypot(q.x - f.x, q.y - f.y) > 440 ? q.far + 1 : 0;
      if (q.state === 'down') { q.t++; q.x += q.vx; q.y += q.vy; q.vx *= 0.85; q.vy *= 0.85; const r = this.pushOut(q.x, q.y, 3, false); if (r) { q.x += r.dx; q.y += r.dy; } continue; }
      if (q.state === 'flee') {
        q.x += q.vx; q.y += q.vy; q.walk += 0.3; q.a = heading(q.vx, q.vy);
        const r = this.pushOut(q.x, q.y, 3, true);
        if (r) { q.x += r.dx; q.y += r.dy; const a = Math.atan2(q.vy, q.vx) + (Math.random() < 0.5 ? 1.2 : -1.2); q.vx = Math.cos(a) * 1.05; q.vy = Math.sin(a) * 1.05; }
        if (--q.t <= 0) { q.state = 'walk'; let bi = 0, bj = 0, bd = 1e9; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const b = blockRect(i, j), d = Math.hypot(q.x - b.x - b.w / 2, q.y - b.y - b.h / 2); if (d < bd) { bd = d; bi = i; bj = j; } } q.bi = bi; q.bj = bj; let bc = 0; bd = 1e9; this.corners(bi, bj).forEach((c, k) => { const d = Math.hypot(q.x - c[0], q.y - c[1]); if (d < bd) { bd = d; bc = k; } }); q.corner = bc; }
        continue;
      }
      const tgt = this.corners(q.bi, q.bj)[q.corner], dx = tgt[0] - q.x, dy = tgt[1] - q.y, d = Math.hypot(dx, dy);
      if (d < 1.5) {
        // at a corner: usually carry on round the block, sometimes cross to the next one
        const k = q.corner;
        const hop = [[[-1, 0, 1], [0, -1, 3]], [[1, 0, 0], [0, -1, 2]], [[1, 0, 3], [0, 1, 1]], [[-1, 0, 2], [0, 1, 0]]][k][Math.random() < 0.5 ? 0 : 1];
        const ni = q.bi + hop[0], nj = q.bj + hop[1];
        if (Math.random() < 0.28 && ni >= 0 && ni < 3 && nj >= 0 && nj < 3) { q.bi = ni; q.bj = nj; q.corner = hop[2]; }
        else q.corner = (k + q.cw + 4) % 4;
      } else { q.x += (dx / d) * q.speed; q.y += (dy / d) * q.speed; q.a = heading(dx, dy); q.walk += q.speed * 0.5; }
      // jump out of the way of fast cars
      for (const c of this.cars) if (c.speed > 1.7 && Math.abs(c.x - q.x) < 40 && Math.abs(c.y - q.y) < 40) { const ax = q.x - c.x, ay = q.y - c.y; if (ax * c.vx + ay * c.vy > 0 && Math.abs(ax * c.vy - ay * c.vx) / c.speed < 12) { this.scare(q, c.x, c.y); break; } }
    }
    this.peds = this.peds.filter((q) => !(q.far > 60 || (q.state === 'down' && q.t > 600)));
    if (this.frame % 30 === 0 && this.peds.filter((q) => q.state !== 'down').length < 13) this.spawnPed(false);
  }
  hitCrew(q, dmg) {
    q.hp -= dmg; q.flash = 5; q.alert = 600;
    this.fx.sparks(q.x, q.y, 5, [P.white, P.p5, P.m3], 1.4);
    if (q.hp <= 0) { q.t = 0; this.sfx('pop'); this.pickups.push({ x: q.x, y: q.y, kind: 'cash', value: 60, t: 0 }); if (this.crimeCd === 0) { this.crime(1); this.crimeCd = 120; } }
    for (const o of this.crew) if (o.hp > 0) o.alert = 600;
  }
  updateCrew() {
    const f = this.focus();
    for (const q of this.crew) {
      q.t++; if (q.flash > 0) q.flash--;
      if (q.hp <= 0) continue;
      const d = Math.hypot(f.x - q.x, f.y - q.y), see = d < 135 && this.los(q.x, q.y, f.x, f.y);
      if (see) q.alert = 400; else if (q.alert > 0) q.alert--;
      if (q.alert > 0 && see) {
        q.a += wrap(heading(f.x - q.x, f.y - q.y) - q.a) * 0.2;
        // sidestep a little so they are not static targets
        const side = Math.sin(q.t * 0.05 + q.home.x) * 0.35, rx = Math.cos(q.a), ry = Math.sin(q.a);
        q.x += rx * side; q.y += ry * side;
        const r = this.pushOut(q.x, q.y, 3, true); if (r) { q.x += r.dx; q.y += r.dy; }
        if (--q.cool <= 0 && !this.downKind) {
          q.cool = 52 + Math.random() * 40;
          const a = q.a + (Math.random() - 0.5) * 0.22;
          this.bullets.push({ x: q.x + Math.sin(q.a) * 7, y: q.y - Math.cos(q.a) * 7, vx: Math.sin(a) * 5, vy: -Math.cos(a) * 5, life: 50, mine: false });
          this.boom(q.x + Math.sin(q.a) * 9, q.y - Math.cos(q.a) * 9, 28, '#ffd0ff');
          if (d < 260) this.audio.noise(0.1, { freq: 1500, slide: 0.3, vol: 0.12, q: 0.6 });
        }
      } else if (q.t % 120 === 0) q.a += (Math.random() - 0.5) * 1.5;
    }
  }
  updateBullets() {
    const p = this.player;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let dead = --b.life <= 0;
      for (let s = 0; s < 2 && !dead; s++) {
        b.x += b.vx / 2; b.y += b.vy / 2;
        if (this.solidAt(b.x, b.y) === 1) { dead = true; this.fx.sparks(b.x, b.y, 4, SPARK, 1.4); break; }
        for (const c of this.cars) {
          if (Math.abs(c.x - b.x) > 16 || Math.abs(c.y - b.y) > 16 || (b.mine && c === p.car)) continue;
          if (c.pts().some(([qx, qy]) => Math.hypot(b.x - qx, b.y - qy) < c.rad)) {
            dead = true; this.fx.sparks(b.x, b.y, 5, SPARK, 1.6);
            if (!c.dead) { c.hp -= 9; if (c.hp <= 0 && !c.burn) { c.hp = 0; c.burn = 1; } if (c.mode === 'rail') { this.offRail(c); } if (b.mine && c.mode === 'cop' && this.crimeCd === 0) { this.crime(2); this.crimeCd = 120; } }
            if (!b.mine && c === p.car) this.shake(2);
            break;
          }
        }
        if (dead) break;
        if (b.mine) {
          for (const q of this.crew) if (q.hp > 0 && Math.hypot(q.x - b.x, q.y - b.y) < 5) { this.hitCrew(q, 10); dead = true; break; }
          if (!dead) for (const q of this.peds) if (q.state !== 'down' && Math.hypot(q.x - b.x, q.y - b.y) < 4.5) { this.knock(q, b.vx, b.vy, true); dead = true; break; }
        } else if (!p.car && Math.hypot(p.x - b.x, p.y - b.y) < 4.5) { this.hurt(8, b.x, b.y); dead = true; }
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }
  updatePickups() {
    const f = this.focus();
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const q = this.pickups[i]; q.t++;
      if (Math.hypot(q.x - f.x, q.y - f.y) < (this.player.car ? 15 : 9)) {
        this.pickups.splice(i, 1);
        if (q.kind === 'bag') { this.sfx('chest'); this.fx.sparks(q.x, q.y, 12, GOLD, 2); this.boom(q.x, q.y, 50, '#fff0a0'); }
        else { this.cash += q.value; this.sfx('coin'); this.fx.text(q.x, q.y - 8, '+$' + q.value, P.g6); }
      } else if (q.kind === 'cash' && q.t > 900) this.pickups.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ rendering
  makeSea() {
    const DW = 96, c = makeCanvas(DW, 8), g = ctx2d(c);
    const bands = [[0, P.white], [2, '#2f77a8'], [9, P.u3], [24, P.u2], [52, P.u1]];
    for (let y = 0; y < 8; y++) for (let x = 0; x < DW; x++) {
      let i = 0; while (i < bands.length - 1 && x >= bands[i + 1][0]) i++;
      if (i < bands.length - 1) { const span = Math.min(8, (bands[i + 1][0] - bands[i][0]) * 0.6), fr = (x - (bands[i + 1][0] - span)) / span; if (fr > 0 && Math.round(fr * 4) / 4 > bayer(x, y)) i++; }
      if (x === 1 && bayer(x, y) < 0.4) i = 1;
      g.fillStyle = bands[i][1]; g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  drawCar(g, c, cx, cy) {
    const s = c.spr, k = angleIndex(c.a, s.n), x = Math.round(c.x - cx) - s.half, y = Math.round(c.y - cy) - s.half;
    g.globalAlpha = 0.5; g.drawImage(s.shadow[k], x + 2, y + 3); g.globalAlpha = 1;
    g.drawImage(c.dead ? s.shadow[k] : s.can[k], x, y);
    if (c.dead) { g.globalAlpha = 0.35; g.drawImage(s.can[k], x, y); g.globalAlpha = 1; }
  }
  drawPed(g, set, pose, a, x, y) { const s = set[pose], k = angleIndex(a, s.n); g.drawImage(s.can[k], Math.round(x) - s.half, Math.round(y) - s.half); }

  render() {
    const g = this.g, city = this.city, t = this.time, p = this.player;
    let cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    if (this.shakeT > 0.4) { cx = clamp(cx + Math.round((Math.random() - 0.5) * this.shakeT * 2), 0, W - VW); cy = clamp(cy + Math.round((Math.random() - 0.5) * this.shakeT * 2), 0, H - VH); }
    g.drawImage(city.ground, cx, cy, VW, VH, 0, 0, VW, VH);

    // surf along the beach, one row at a time
    if (cx + VW > SEA_X - 24) {
      for (let sy = 0; sy < VH; sy++) {
        const y = sy + cy, wx = Math.round(SEA_X - 8 + Math.sin(y * 0.06 + t * 1.1) * 3 + Math.sin(t * 0.45 + y * 0.011) * 6) - cx;
        if (wx < VW) g.drawImage(this.sea, 0, y & 7, 96, 1, wx, sy, 96, 1);
        if (wx + 96 < VW) { g.fillStyle = P.u1; g.fillRect(wx + 96, sy, VW - wx - 96, 1); }
      }
      for (let i = 0; i < 26; i++) {
        const slot = Math.floor(t * 3 + i * 0.4), x = SEA_X + 14 + Math.floor(hash(i, slot, 71) * 60), y = Math.floor(hash(i, slot, 72) * H);
        if (y < cy || y >= cy + VH || x >= cx + VW) continue;
        g.fillStyle = [P.m3, P.a5, P.white, P.p5][i % 4]; g.fillRect(x - cx, y - cy, hash(i, slot, 73) < 0.5 ? 2 : 1, 1);
      }
    }

    // job markers on the ground
    const marks = [];
    const s = city.spots;
    if (this.state === 'play') {
      if (!this.job && this.jobIndex < JOBS.length) marks.push([s.phone.x, s.phone.y, P.y4, 9]);
      if (this.job && this.job.id === 0 && this.job.stage === 1) marks.push([s.garage.x, s.garage.y, P.y4, 12]);
      if (this.wanted > 0 || (p.car && p.car.hp < p.car.m.hp * 0.6)) marks.push([s.spray.x, s.spray.y, P.a5, 12]);
    }
    for (const q of this.peds) if (q.state === 'down') this.drawPed(g, pedSprites(q.look), 'down', q.a, q.x - cx, q.y - cy);
    for (const q of this.crew) if (q.hp <= 0) this.drawPed(g, pedSprites('crew'), 'down', q.a, q.x - cx, q.y - cy);

    // people
    for (const q of this.peds) { if (q.state === 'down' || Math.abs(q.x - cx - VW / 2) > VW / 2 + 12 || Math.abs(q.y - cy - VH / 2) > VH / 2 + 12) continue; this.drawPed(g, pedSprites(q.look), Math.floor(q.walk) % 2 ? 'walkA' : 'walkB', q.a, q.x - cx, q.y - cy); }
    for (const q of this.crew) if (q.hp > 0) { this.drawPed(g, pedSprites('crew'), 'gun', q.a, q.x - cx, q.y - cy); }
    if (!p.car && this.state !== 'title' && !(this.downKind === 'wiped') && !(p.inv > 0 && (p.inv >> 2) % 2)) this.drawPed(g, pedSprites('hero'), p.aiming ? 'gun' : p.moving ? (Math.floor(p.walk) % 2 ? 'walkA' : 'walkB') : 'idle', p.a, p.x - cx, p.y - cy);
    else if (this.downKind === 'wiped' && !p.car) this.drawPed(g, pedSprites('hero'), 'down', p.a, p.x - cx, p.y - cy);
    // cars
    for (const c of this.cars) { if (Math.abs(c.x - cx - VW / 2) > VW / 2 + 24 || Math.abs(c.y - cy - VH / 2) > VH / 2 + 24) continue; this.drawCar(g, c, cx, cy); }
    this.fx.draw(g, cx, cy, false);
    // roofs, awnings, palms and lamp arms go over the top
    g.drawImage(city.roofs, cx, cy, VW, VH, 0, 0, VW, VH);

    // ---- night: one ambient colour, then every lamp, sign, headlight and muzzle flash
    const L = this.light;
    L.begin('#5c58a6');
    for (const l of city.lights) {
      if (l.x < cx - 70 || l.x > cx + VW + 70 || l.y < cy - 70 || l.y > cy + VH + 70) continue;
      L.add(l.x - cx, l.y - cy, l.r, l.color, 0.8, l.glow);
    }
    for (const c of this.cars) {
      if (!c.lights || c.dead || Math.abs(c.x - cx - VW / 2) > VW / 2 + 90 || Math.abs(c.y - cy - VH / 2) > VH / 2 + 90) continue;
      const fx = Math.sin(c.a), fy = -Math.cos(c.a);
      L.add(c.x - fx * c.half - cx, c.y - fy * c.half - cy, c.thr < 0 || c.hand ? 18 : 12, '#ff3048', 0.8, c.thr < 0 ? 7 : 0);
      if (c.mode === 'cop' && !c.calm) { const ph = Math.floor(this.frame / 7 + c.id) % 2; L.add(c.x - cx, c.y - cy, 56, ph ? '#ff3048' : '#3c7cff', 0.95, 10); }
    }
    for (const m of marks) L.add(m[0] - cx, m[1] - cy, 30, m[2] === P.a5 ? '#58e8ff' : '#ffd84a', 0.7 + Math.sin(t * 5) * 0.2, 0);
    for (const q of this.pickups) L.add(q.x - cx, q.y - cy, q.kind === 'bag' ? 30 : 14, q.kind === 'bag' ? '#b6ff7a' : '#ffe07a', 0.8, q.kind === 'bag' ? 10 : 0);
    for (const b of this.bullets) L.add(b.x - cx, b.y - cy, 12, '#fff0a0', 0.8);
    for (const tl of this.tempLights) L.add(tl.x - cx, tl.y - cy, tl.r, tl.color, tl.life / tl.max, tl.r / 4);
    L.finish();
    const mg = L.mg;
    mg.globalCompositeOperation = 'lighter'; mg.globalAlpha = 0.85;
    for (const c of this.cars) {
      if (!c.lights || c.dead || Math.abs(c.x - cx - VW / 2) > VW / 2 + 90 || Math.abs(c.y - cy - VH / 2) > VH / 2 + 90) continue;
      const fx = Math.sin(c.a), fy = -Math.cos(c.a), k = angleIndex(c.a, this.cones.n);
      mg.drawImage(this.cones.can[k], Math.round(c.x + fx * (c.half - 2) - cx - this.cones.half), Math.round(c.y + fy * (c.half - 2) - cy - this.cones.half));
    }
    mg.globalAlpha = 1; mg.globalCompositeOperation = 'source-over';
    L.apply(this.out, g);

    // ---- things that glow on their own
    g.drawImage(city.em, cx, cy, VW, VH, 0, 0, VW, VH);
    for (const c of this.cars) {
      if (c.dead || !c.lights || Math.abs(c.x - cx - VW / 2) > VW / 2 + 20 || Math.abs(c.y - cy - VH / 2) > VH / 2 + 20) continue;
      const fx = Math.sin(c.a), fy = -Math.cos(c.a), rx = Math.cos(c.a), ry = Math.sin(c.a), w = c.rad - 1;
      for (const sd of [-1, 1]) {
        g.fillStyle = P.y6; g.fillRect(Math.round(c.x + fx * (c.half - 1.5) + rx * sd * w - cx), Math.round(c.y + fy * (c.half - 1.5) + ry * sd * w - cy), 1, 1);
        g.fillStyle = c.thr < 0 || c.hand ? '#ff6a7a' : P.r4; g.fillRect(Math.round(c.x - fx * (c.half - 1.5) + rx * sd * w - cx), Math.round(c.y - fy * (c.half - 1.5) + ry * sd * w - cy), 1, 1);
      }
      if (c.mode === 'cop' && !c.calm) { const ph = Math.floor(this.frame / 7 + c.id) % 2; g.fillStyle = ph ? '#ff5060' : '#6aa0ff'; g.fillRect(Math.round(c.x + rx * (ph ? -2 : 2) - cx) - 1, Math.round(c.y + ry * (ph ? -2 : 2) - cy) - 1, 2, 2); }
    }
    for (const m of marks) {
      const r = m[3] + Math.sin(t * 4) * 1.5;
      g.fillStyle = m[2];
      for (let i = 0; i < 28; i++) { if ((i + Math.floor(t * 8)) % 4 === 0) continue; const a = (i / 28) * TAU; g.fillRect(Math.round(m[0] + Math.cos(a) * r - cx), Math.round(m[1] + Math.sin(a) * r - cy), 1, 1); }
    }
    for (const q of this.pickups) {
      const c = this.props.cash, bobY = Math.round(Math.sin(q.t * 0.12) * 1.5);
      if (q.kind === 'cash' && q.t > 700 && (q.t >> 3) % 2) continue;
      g.drawImage(c, Math.round(q.x - cx - c.width / 2), Math.round(q.y - cy - c.height / 2 + bobY));
    }
    for (const q of this.crew) if (q.hp > 0 && q.flash > 0) { g.fillStyle = P.white; g.fillRect(Math.round(q.x - cx) - 3, Math.round(q.y - cy) - 3, 6, 6); }
    for (const b of this.bullets) {
      g.fillStyle = b.mine ? P.y5 : P.m4;
      const d = Math.hypot(b.vx, b.vy);
      for (let k = 0; k < 4; k++) g.fillRect(Math.round(b.x - (b.vx / d) * k - cx), Math.round(b.y - (b.vy / d) * k - cy), 1, 1);
    }
    this.fx.draw(g, cx, cy, true);
    L.glow(g, 1);
    // beams have to add light as well, or they vanish on dark asphalt
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.2;
    for (const c of this.cars) {
      if (!c.lights || c.dead || Math.abs(c.x - cx - VW / 2) > VW / 2 + 90 || Math.abs(c.y - cy - VH / 2) > VH / 2 + 90) continue;
      const fx = Math.sin(c.a), fy = -Math.cos(c.a), k = angleIndex(c.a, this.cones.n);
      g.drawImage(this.cones.can[k], Math.round(c.x + fx * (c.half - 2) - cx - this.cones.half), Math.round(c.y + fy * (c.half - 2) - cy - this.cones.half));
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    this.fx.drawTexts(g, cx, cy);
    // crosshair
    if (this.state === 'play' && !p.car && this.input.mouseT < 240 && !this.input.isTouch) {
      const mx = Math.round(this.input.px), my = Math.round(this.input.py);
      g.fillStyle = P.white; g.fillRect(mx - 4, my, 3, 1); g.fillRect(mx + 2, my, 3, 1); g.fillRect(mx, my - 4, 1, 3); g.fillRect(mx, my + 2, 1, 3);
    }
    drawUI(g, this);
    return this.out;
  }
}

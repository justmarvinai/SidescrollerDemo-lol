// Everything that moves: the hero, creatures, the boss, pickups and interactables.
import { T, WOOD, WORLD_H, ARENA } from './level.js';
import { P } from '../gfx/palette.js';
import { flipCanvas, silhouette, clamp } from '../gfx/pixel.js';
import { HERO, HERO_FRAMES, slashArc } from '../gfx/art-hero.js';
import { MOSSLING, DUSKWING, SPORECAP, ELDER, STAFF, SMITH, KID, CAT, BOSS, ROOT_SPIKE } from '../gfx/art-chars.js';
import { COIN, HEART, CHEST, CAMPFIRE_BASE, SHRINE, SIGNPOST } from '../gfx/art-props.js';
import { SPARK, GLOOM, SLIME, GOLD, FIRE, DUST } from './fx.js';

// ---------------------------------------------------------------- sprites
const cache = new Map();
export function spr(pix) {
  let s = cache.get(pix);
  if (!s) { const r = pix.toCanvas(); s = { r, l: flipCanvas(r), w: pix.w, h: pix.h }; cache.set(pix, s); }
  return s;
}
function white(s, left) {
  if (!s.wr) { s.wr = silhouette(s.r, '#ffffff'); s.wl = silhouette(s.l, '#ffffff'); }
  return left ? s.wl : s.wr;
}
function blit(g, s, x, y, left, flash) {
  g.drawImage(flash ? white(s, left) : left ? s.l : s.r, Math.round(x), Math.round(y));
}
function shadow(g, x, y, w) {
  g.fillStyle = 'rgba(14,11,22,0.3)';
  g.fillRect(Math.round(x - w / 2), Math.round(y), w, 1);
  g.fillRect(Math.round(x - w / 2) + 1, Math.round(y) + 1, w - 2, 1);
}
const overlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];

// ---------------------------------------------------------------- physics
export function moveBody(e, lv) {
  const hw = e.hw, h = e.h;
  e.hitWall = 0;
  if (e.vx) {
    e.x += e.vx;
    const top = Math.floor((e.y - h) / T), bot = Math.floor((e.y - 0.01) / T);
    const tx = Math.floor((e.x + (e.vx > 0 ? hw : -hw)) / T);
    for (let ty = top; ty <= bot; ty++) {
      if (!lv.solid(tx, ty)) continue;
      e.x = e.vx > 0 ? tx * T - hw - 0.001 : (tx + 1) * T + hw + 0.001;
      e.hitWall = Math.sign(e.vx); e.vx = 0;
      break;
    }
  }
  const prevY = e.y;
  e.y += e.vy;
  e.onGround = false;
  const lx = Math.floor((e.x - hw + 0.01) / T), rx = Math.floor((e.x + hw - 0.01) / T);
  if (e.vy >= 0) {
    const ty = Math.floor(e.y / T);
    for (let tx = lx; tx <= rx; tx++) {
      const v = lv.tileAt(tx, ty);
      if (lv.solid(tx, ty) || (v === WOOD && prevY <= ty * T + 0.01 && !(e.drop > 0))) {
        e.y = ty * T; e.vy = 0; e.onGround = true; e.onWood = v === WOOD;
        break;
      }
    }
  } else {
    const ty = Math.floor((e.y - h) / T);
    for (let tx = lx; tx <= rx; tx++) if (lv.solid(tx, ty)) { e.y = (ty + 1) * T + h + 0.001; e.vy = 0; break; }
  }
}

// ---------------------------------------------------------------- hero
const RUN = 1.72, GRAV = 0.26, JUMP = -4.8, MAXFALL = 5.4;
const ARCS = [
  { s: spr(slashArc(17, 2.3, -0.6)), dmg: 1 },
  { s: spr(slashArc(17, -1.1, 1.9)), dmg: 1 },
  { s: spr(slashArc(21, 1.0, -1.0, 7)), dmg: 1.7 },
];

export class Player {
  constructor(x, y) {
    Object.assign(this, { x, y, vx: 0, vy: 0, dir: 1, hw: 4, h: 18, onGround: true });
    this.maxHp = 20; this.hp = 20; this.maxMp = 6; this.mp = 6;
    this.lvl = 1; this.xp = 0; this.xpNext = 18; this.atk = 3;
    this.coins = 0; this.potions = 0; this.hasSpell = false;
    this.state = 'idle'; this.t = 0; this.runPh = 0;
    this.coyote = 0; this.jumpBuf = 0; this.inv = 0; this.flash = 0;
    this.combo = 1; this.queued = false; this.dashCd = 0; this.airDash = true; this.jumping = false;
    this.safe = { x, y }; this.checkpoint = { x, y };
    this.hpLag = 20; this.mpT = 0; this.kills = 0;
    this.scarf = Array.from({ length: 9 }, (_, i) => ({ x: x - i * 2, y: y - 14, px: x - i * 2, py: y - 14 }));
    this.hitIds = new Set();
    this.F = {};
    for (const [k, arr] of Object.entries(HERO_FRAMES)) this.F[k] = arr.map((f) => ({ s: spr(f.pix), m: f }));
  }
  box() { return [this.x - this.hw, this.y - this.h, this.hw * 2, this.h]; }
  set(state) { this.state = state; this.t = 0; }

  update(game) {
    const inp = game.input, lv = game.level, ctl = game.control && this.state !== 'dead';
    this.t++;
    if (this.inv > 0) this.inv--;
    if (this.flash > 0) this.flash--;
    if (this.dashCd > 0) this.dashCd--;
    if (this.drop > 0) this.drop--;
    if (this.hpLag > this.hp) this.hpLag = Math.max(this.hp, this.hpLag - 0.12); else this.hpLag = this.hp;
    if (++this.mpT >= 210) { this.mpT = 0; if (this.mp < this.maxMp) this.mp++; }

    const move = ctl ? (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0) : 0;
    if (ctl && (inp.hit('jump') || (inp.hit('up') && !game.focus))) this.jumpBuf = 7; else if (this.jumpBuf > 0) this.jumpBuf--;
    if (this.onGround) { this.coyote = 6; this.airDash = true; } else if (this.coyote > 0) this.coyote--;
    const st = this.state;
    let gravity = true;

    if (st === 'dead') {
      this.vx *= 0.85;
      if (this.t === 50) game.fx.burst(this.x, this.y - 10, 26, { colors: GOLD, speed: 1.2, up: 0.6, em: true, life: 50, drag: 0.96 });
      if (this.t > 95) game.respawn();
    } else if (st === 'hurt') {
      this.vx *= 0.93;
      if (this.t > 15) this.set('idle');
    } else if (st === 'dash') {
      gravity = false;
      this.vx = this.dir * 3.6; this.vy = 0;
      if (this.t % 3 === 1) game.afterimage(this);
      if (this.t >= 13) { this.set('idle'); this.vx = this.dir * 1.5; }
    } else if (st === 'atk') {
      const last = this.combo === 3, dur = last ? 23 : 18;
      if (this.onGround) this.vx *= 0.8; else if (move) this.vx += (move * RUN * 0.8 - this.vx) * 0.1;
      if (this.t === 5) {
        this.hitIds.clear();
        this.vx += this.dir * (last ? 2.6 : 1.5);
        game.sfx(last ? 'swing2' : 'swing');
      }
      if (this.t >= 5 && this.t <= 10) this.strike(game);
      if (ctl && this.t >= 3 && inp.hit('attack')) this.queued = true;
      if (ctl && this.t >= 6 && inp.hit('dash') && this.canDash()) this.startDash(game, move);
      else if (this.t >= dur || (this.queued && this.t >= dur - 5)) {
        if (this.queued && this.combo < 3) { this.combo++; this.queued = false; if (move) this.dir = move; this.set('atk'); }
        else { this.set('idle'); this.combo = 1; this.queued = false; }
      }
    } else if (st === 'cast') {
      this.vx *= 0.8;
      if (this.t === 6) {
        const m = this.F.cast[1].m.tip;
        game.spawn(new EmberBolt(this.x + this.dir * (m[0] + 2), this.y + m[1] + 4, this.dir, Math.round(this.atk * 1.8 + 3)));
        game.sfx('cast');
        this.vx -= this.dir * 1.2;
      }
      if (this.t >= 18) this.set('idle');
    } else {
      // free movement
      if (move) { this.vx += (move * RUN - this.vx) * (this.onGround ? 0.28 : 0.15); this.dir = move; }
      else this.vx *= this.onGround ? 0.68 : 0.95;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
      if (this.jumpBuf > 0 && this.coyote > 0) {
        if (inp.down('down') && this.onWood) { this.drop = 12; this.jumpBuf = 0; this.coyote = 0; }
        else {
          this.vy = JUMP; this.jumpBuf = 0; this.coyote = 0; this.jumping = true; this.onGround = false;
          game.sfx('jump'); game.fx.dust(this.x, this.y, 4);
        }
      }
      if (ctl) {
        if (inp.hit('attack')) { this.combo = 1; this.queued = false; this.set('atk'); }
        else if (inp.hit('dash') && this.canDash()) this.startDash(game, move);
        else if (inp.hit('spell')) {
          if (this.hasSpell && this.mp >= 3) { this.mp -= 3; this.set('cast'); }
          else if (this.hasSpell) game.fx.text(this.x, this.y - 30, 'no mp', P.u6);
        }
        if (inp.hit('potion')) this.drink(game);
      }
      if (this.state === 'idle' || this.state === 'run' || this.state === 'air') {
        const next = this.onGround ? (Math.abs(this.vx) > 0.35 ? 'run' : 'idle') : 'air';
        if (next !== this.state) { this.state = next; if (next !== 'run') this.t = 0; }
      }
      if (this.state === 'run') {
        const before = Math.floor(this.runPh / 4);
        this.runPh += Math.abs(this.vx) * 0.17;
        if (Math.floor(this.runPh / 4) !== before) { game.sfx('step'); game.fx.dust(this.x - this.dir * 3, this.y, 1, this.dir); }
      }
    }

    if (this.jumping && this.vy < -1.9 && !inp.down('jump') && !inp.down('up')) this.vy = -1.9;
    if (this.vy >= 0) this.jumping = false;
    if (gravity) this.vy = Math.min(MAXFALL, this.vy + GRAV);
    const wasAir = !this.onGround, fallV = this.vy;
    moveBody(this, lv);
    if (wasAir && this.onGround && fallV > 2) { game.fx.dust(this.x, this.y, 5); game.sfx('land'); }

    // arena walls during the boss fight
    if (game.arenaLocked) this.x = clamp(this.x, ARENA.x0 + 8, ARENA.bossX - 22);

    if (this.onGround && !this.onWood && this.state !== 'dead' && game.frame % 8 === 0 && !lv.inWater(this.x)) this.safe = { x: this.x, y: this.y };
    // water & chasms
    const w = lv.water.find((q) => this.x >= q.x0 && this.x < q.x1);
    if (w && this.y > w.y + 12 && this.state !== 'dead') { game.fx.splash(this.x, w.y); game.sfx('splash'); game.fellOut(); }
    else if (this.y > WORLD_H + 30 && this.state !== 'dead') game.fellOut();

    this.updateScarf(game.time);
  }

  canDash() { return this.dashCd === 0 && (this.onGround || this.airDash); }
  startDash(game, move) {
    if (move) this.dir = move;
    if (!this.onGround) this.airDash = false;
    this.dashCd = 34; this.inv = Math.max(this.inv, 15);
    this.set('dash'); game.sfx('dash'); game.fx.dust(this.x, this.y, 6, this.dir);
  }
  drink(game) {
    if (this.potions <= 0 || this.hp >= this.maxHp) return;
    this.potions--;
    const heal = Math.ceil(this.maxHp * 0.6);
    this.hp = Math.min(this.maxHp, this.hp + heal);
    game.fx.text(this.x, this.y - 28, '+' + heal, P.g6);
    game.fx.burst(this.x, this.y - 10, 14, { colors: [P.g7, P.g6, P.t5], speed: 1, up: 0.8, em: true, life: 34, drag: 0.95 });
    game.sfx('potion');
  }
  strike(game) {
    const arc = ARCS[this.combo - 1];
    const reach = this.combo === 3 ? 30 : 25;
    const box = [this.dir > 0 ? this.x - 2 : this.x - reach, this.y - 30, reach + 2, 36];
    for (const e of game.ents) {
      if (!e.isEnemy || e.dead || this.hitIds.has(e)) continue;
      if (!overlap(box, e.hurtbox())) continue;
      this.hitIds.add(e);
      const crit = Math.random() < 0.12;
      const dmg = Math.max(1, Math.round((this.atk + Math.random() * 1.5) * arc.dmg * (crit ? 1.8 : 1)));
      e.hit(dmg, this.dir, game, this.combo === 3 ? 1.6 : 1, crit);
      if (this.mp < this.maxMp && Math.random() < 0.35) { this.mp++; }
      game.hitstop(this.combo === 3 ? 5 : 3);
      game.shake(this.combo === 3 ? 3 : 1.5);
    }
  }
  damage(n, fromX, game) {
    if (this.inv > 0 || this.state === 'dead' || game.state !== 'play') return false;
    this.hp = Math.max(0, this.hp - n);
    this.inv = 75; this.flash = 6;
    this.vx = (this.x < fromX ? -1 : 1) * 2.5; this.vy = -2.7; this.onGround = false;
    game.fx.text(this.x, this.y - 26, '-' + n, P.r5, { big: true });
    game.fx.sparks(this.x, this.y - 10, 8, [P.white, P.r5, P.r4]);
    game.shake(5); game.hitstop(6); game.sfx('hurt');
    if (this.hp <= 0) { this.set('dead'); game.sfx('die'); game.onDeath(); }
    else this.set('hurt');
    return true;
  }
  gainXp(n, game) {
    this.xp += n;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext; this.lvl++;
      this.xpNext = Math.round(this.xpNext * 1.55 + 4);
      this.maxHp += 5; this.maxMp += 1; this.atk += 1;
      this.hp = this.maxHp; this.mp = this.maxMp;
      game.levelUp();
    }
  }

  frame() {
    const F = this.F;
    switch (this.state) {
      case 'run': return F.run[Math.floor(this.runPh) % 8];
      case 'air': return this.vy < 0.6 ? F.jump[0] : F.fall[0];
      case 'atk': return F['atk' + this.combo][this.t < 5 ? 0 : this.t < 11 ? 1 : 2];
      case 'dash': return F.dash[0];
      case 'hurt': return F.hurt[0];
      case 'cast': return F.cast[this.t < 6 ? 0 : 1];
      case 'dead': return F.kneel[0];
      default: return this.t % 230 > 222 ? F.blink[0] : F.idle[Math.floor(this.t / 13) % 4];
    }
  }
  updateScarf(time) {
    const m = this.frame().m.neck, s = this.scarf;
    s[0].x = this.x + this.dir * (m[0] + 1); s[0].y = this.y + m[1] + 1;
    for (let i = 1; i < s.length; i++) {
      const n = s[i], vx = (n.x - n.px) * 0.84, vy = (n.y - n.py) * 0.84;
      n.px = n.x; n.py = n.y;
      n.x += vx - this.dir * 0.2 + Math.sin(time * 6 + i * 0.8) * 0.06;
      n.y += vy + 0.022 + Math.cos(time * 7 + i * 1.1) * 0.09;
    }
    for (let k = 0; k < 4; k++) for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001, diff = (d - 2.1) / d;
      b.x -= dx * diff; b.y -= dy * diff;
    }
  }
  draw(g, cx, cy) {
    if (this.inv > 0 && this.state !== 'dash' && this.state !== 'dead' && (this.inv >> 2) % 2 === 0 && this.flash === 0) return;
    if (this.state === 'dead' && this.t > 50) return;
    if (this.onGround) shadow(g, this.x - cx, this.y - cy, 10);
    // scarf: ink pass then colour; a thin ribbon that flares at the tail
    const s = this.scarf, pts = [];
    for (let i = 1; i < s.length; i++) for (let k = 0; k < 3; k++) {
      const t = k / 3;
      pts.push([Math.round(s[i - 1].x + (s[i].x - s[i - 1].x) * t - cx), Math.round(s[i - 1].y + (s[i].y - s[i - 1].y) * t - cy), i]);
    }
    const last = s.length - 1;
    g.fillStyle = P.ink;
    for (const [x, y, i] of pts) g.fillRect(x - 1, y - 1, 3, i >= last - 1 ? 4 : 3);
    for (const [x, y, i] of pts) {
      g.fillStyle = i < 3 ? P.y4 : P.y5; g.fillRect(x, y, 1, 1);
      if (i >= last - 1) { g.fillStyle = P.y3; g.fillRect(x, y + 1, 1, 1); }
    }
    const f = this.frame();
    blit(g, f.s, this.x - HERO.OX - cx, this.y - HERO.OY - cy, this.dir < 0, this.flash > 0);
  }
  drawEm(g, cx, cy) {
    if (this.state === 'atk' && this.t >= 5 && this.t <= 11) {
      const a = ARCS[this.combo - 1].s;
      if (this.t > 9) g.globalAlpha = 0.55;
      g.drawImage(this.dir < 0 ? a.l : a.r, Math.round(this.x + this.dir * 5 - a.w / 2 - cx), Math.round(this.y - 12 - a.h / 2 - cy));
      g.globalAlpha = 1;
    }
  }
  light(out) {
    out.push({ x: this.x, y: this.y - 10, r: 54, color: '#ffc27a', i: 0.9 });
    out.push({ x: this.x - this.dir * 5, y: this.y - 7, r: 12, color: '#ffd98a', glow: 6, i: 0.8 });
  }
}

// ---------------------------------------------------------------- projectiles & hazards
export class EmberBolt {
  constructor(x, y, dir, dmg) { Object.assign(this, { x, y, dir, dmg, t: 0, dead: false }); }
  update(game) {
    this.t++;
    this.x += this.dir * 3.6; this.y += Math.sin(this.t * 0.5) * 0.3;
    game.fx.add({ x: this.x - this.dir * 2, y: this.y + (Math.random() - 0.5) * 3, vx: -this.dir * 0.3, vy: (Math.random() - 0.5) * 0.4, life: 14, colors: FIRE, em: true, size: Math.random() < 0.5 ? 2 : 1 });
    let hit = game.level.solid(Math.floor(this.x / T), Math.floor(this.y / T)) || this.t > 80;
    for (const e of game.ents) {
      if (!e.isEnemy || e.dead) continue;
      if (overlap([this.x - 4, this.y - 4, 8, 8], e.hurtbox())) { e.hit(this.dmg, this.dir, game, 1.3, false, true); hit = true; break; }
    }
    if (hit) {
      this.dead = true;
      game.fx.sparks(this.x, this.y, 16, FIRE, 2.4);
      game.fx.burst(this.x, this.y, 8, { colors: [P.white, P.y5], speed: 1, em: true, life: 10, size: 2 });
      game.flashLight(this.x, this.y, 60, '#ffb060');
      game.sfx('boom'); game.shake(2);
    }
  }
  draw() {}
  drawEm(g, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    g.fillStyle = P.y2; g.fillRect(x - 3, y - 2, 6, 4); g.fillRect(x - 2, y - 3, 4, 6);
    g.fillStyle = P.y4; g.fillRect(x - 2, y - 2, 4, 4);
    g.fillStyle = P.y6; g.fillRect(x - 1 + (this.dir > 0 ? 1 : -1), y - 1, 2, 2);
  }
  light(out) { out.push({ x: this.x, y: this.y, r: 42, color: '#ffa850', glow: 14, always: true }); }
}

class Shockwave {
  constructor(x, y, dir) { Object.assign(this, { x, y, dir, t: 0, dead: false }); }
  update(game) {
    this.t++;
    this.x += this.dir * 2.5;
    if (this.t % 2 === 0) game.fx.add({ x: this.x, y: this.y - Math.random() * 12, vx: -this.dir * 0.4, vy: -0.6 - Math.random(), life: 18, colors: GLOOM, em: true, size: 2, g: 0.06 });
    if (this.t % 3 === 0) game.fx.dust(this.x, this.y, 1);
    if (this.t > 120 || game.level.solid(Math.floor(this.x / T), Math.floor((this.y - 4) / T))) this.dead = true;
    if (overlap([this.x - 5, this.y - 13, 10, 13], game.hero.box())) game.hero.damage(5, this.x, game);
  }
  draw() {}
  drawEm(g, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const hgt = 9 + Math.round(Math.sin(this.t * 0.6) * 3);
    g.fillStyle = P.p3; g.fillRect(x - 4, y - hgt + 3, 8, hgt - 3);
    g.fillStyle = P.p4; g.fillRect(x - 3, y - hgt, 6, hgt);
    g.fillStyle = P.p5; g.fillRect(x - 2, y - hgt - 2, 4, hgt);
    g.fillStyle = P.p6; g.fillRect(x - 1 + this.dir, y - hgt - 3, 2, hgt - 2);
  }
  light(out) { out.push({ x: this.x, y: this.y - 6, r: 28, color: '#b06cff', glow: 10, always: true }); }
}

class RootSpike {
  constructor(x, y, delay = 0) { Object.assign(this, { x, y, t: -delay, dead: false }); this.fr = ROOT_SPIKE.map(spr); }
  update(game) {
    this.t++;
    if (this.t < 0) return;
    if (this.t < 36) { if (this.t % 4 === 0) game.fx.add({ x: this.x + (Math.random() - 0.5) * 12, y: this.y, vy: -0.5 - Math.random() * 0.6, life: 16, colors: GLOOM, em: true }); }
    if (this.t === 36) { game.sfx('spike'); game.fx.dust(this.x, this.y, 8); game.shake(2); }
    if (this.t >= 37 && this.t < 62 && overlap([this.x - 4, this.y - 22, 8, 22], game.hero.box())) game.hero.damage(6, this.x + (game.hero.x < this.x ? 6 : -6), game);
    if (this.t > 78) this.dead = true;
  }
  draw(g, cx, cy) {
    if (this.t < 0) return;
    let f = -1;
    if (this.t >= 36) f = this.t < 38 ? 1 : this.t < 40 ? 2 : this.t < 64 ? 3 : this.t < 70 ? 2 : this.t < 75 ? 1 : 0;
    else if (this.t > 22) f = 0;
    if (f >= 0) { const s = this.fr[f]; g.drawImage(s.r, Math.round(this.x - 7 - cx), Math.round(this.y - 26 - cy)); }
  }
  drawEm(g, cx, cy) {
    if (this.t < 0 || this.t >= 36) return;
    // warning crack
    const w = Math.min(10, this.t / 3);
    g.fillStyle = (this.t >> 2) % 2 ? P.p5 : P.p6;
    g.fillRect(Math.round(this.x - w - cx), Math.round(this.y - cy), Math.round(w * 2), 1);
    g.fillRect(Math.round(this.x - w / 2 - cx), Math.round(this.y - 1 - cy), Math.round(w), 1);
  }
  light(out) { if (this.t >= 0 && this.t < 40) out.push({ x: this.x, y: this.y - 2, r: 18, color: '#b06cff', glow: 8, always: true }); }
}

// ---------------------------------------------------------------- pickups
export class Pickup {
  constructor(kind, x, y, pop = false) {
    Object.assign(this, { kind, x, y, vx: 0, vy: 0, hw: 3, h: 6, t: (x * 7) % 60 | 0, dead: false, loose: pop, wait: pop ? 22 : 0 });
    if (pop) { this.vx = (Math.random() - 0.5) * 2.6; this.vy = -2.2 - Math.random() * 1.8; }
    this.fr = kind === 'coin' ? COIN.map(spr) : [spr(HEART)];
  }
  update(game) {
    this.t++;
    const h = game.hero;
    if (this.wait > 0) this.wait--;
    if (this.loose) {
      this.vy = Math.min(4, this.vy + 0.2); this.vx *= 0.97;
      moveBody(this, game.level);
      if (this.onGround) { this.vx *= 0.7; }
      if (this.y > WORLD_H + 20 || this.t > 60 * 14) this.dead = true;
    }
    const dx = h.x - this.x, dy = h.y - 10 - (this.y - 4), d = Math.hypot(dx, dy);
    if (this.wait === 0 && d < 34 && h.state !== 'dead') {
      this.loose = false; this.mag = true;
      this.x += (dx / d) * Math.min(d, 3.2); this.y += (dy / d) * Math.min(d, 3.2);
    }
    if (this.wait === 0 && d < 9 && h.state !== 'dead') {
      this.dead = true;
      if (this.kind === 'coin') { h.coins++; game.sfx('coin'); game.fx.sparks(this.x, this.y - 4, 4, GOLD, 1.2); }
      else { const n = 6; h.hp = Math.min(h.maxHp, h.hp + n); game.sfx('heart'); game.fx.text(h.x, h.y - 28, '+' + n, P.g6); game.fx.sparks(this.x, this.y - 4, 6, [P.white, P.m4, P.r5], 1.2); }
    }
  }
  draw() {}
  drawEm(g, cx, cy) {
    if (this.loose && this.t > 60 * 11 && (this.t >> 2) % 2) return;
    const s = this.fr[this.kind === 'coin' ? Math.floor(this.t / 7) % 4 : 0];
    const bob = this.loose || this.mag ? 0 : Math.round(Math.sin(this.t * 0.09) * 1.5);
    g.drawImage(s.r, Math.round(this.x - s.w / 2 - cx), Math.round(this.y - s.h + bob - cy));
  }
}

// ---------------------------------------------------------------- creatures
class Enemy {
  constructor(x, y) {
    Object.assign(this, { x, y, vx: 0, vy: 0, dir: -1, flash: 0, stun: 0, dead: false, isEnemy: true, onGround: false, kb: 1 });
    this.t = Math.floor((x * 13) % 97); this.home = x;
  }
  hurtbox() { return [this.x - this.hw, this.y - this.h, this.hw * 2, this.h]; }
  hit(dmg, dir, game, kb = 1, crit = false, fire = false) {
    this.hp -= dmg; this.flash = 6; this.stun = 12;
    this.vx = dir * 1.9 * kb * this.kb; if (this.kb > 0.3) this.vy = Math.min(this.vy, -1.6 * this.kb);
    game.fx.text(this.x, this.y - this.h - 4, dmg + (crit ? '!' : ''), crit ? P.y4 : fire ? P.y2 : P.white, { big: crit });
    game.fx.sparks(this.x, this.y - this.h / 2, crit ? 10 : 5, fire ? FIRE : SPARK);
    game.sfx('hit');
    if (this.hp <= 0) this.die(game);
  }
  die(game) {
    this.dead = true;
    game.fx.poof(this.x, this.y - this.h / 2, this.colors, 16);
    game.sfx('pop');
    const n = this.coinDrop[0] + Math.floor(Math.random() * (this.coinDrop[1] - this.coinDrop[0] + 1));
    for (let i = 0; i < n; i++) game.spawn(new Pickup('coin', this.x, this.y - 6, true));
    if (Math.random() < 0.2) game.spawn(new Pickup('heart', this.x, this.y - 6, true));
    game.hero.kills++;
    game.fx.text(this.x, this.y - this.h - 12, '+' + this.xp + ' xp', P.u6);
    game.hero.gainXp(this.xp, game);
  }
  touch(game) { if (!this.dead && this.stun < 6 && overlap(this.hurtbox(), game.hero.box())) game.hero.damage(this.atk, this.x, game); }
  common() { this.t++; if (this.flash > 0) this.flash--; if (this.stun > 0) this.stun--; }
  far(game) { return Math.abs(this.x - game.hero.x) > 260; }
}

export class Mossling extends Enemy {
  constructor(x, y) {
    super(x, y);
    Object.assign(this, { hw: 6, h: 9, hp: 8, atk: 3, xp: 6, colors: SLIME, coinDrop: [1, 2], wait: 40 + (this.t % 50), land: 0 });
    this.S = { rest: spr(MOSSLING.rest), squash: spr(MOSSLING.squash), stretch: spr(MOSSLING.stretch) };
  }
  update(game) {
    this.common();
    if (this.far(game)) return;
    const h = game.hero;
    if (this.land > 0) this.land--;
    if (this.onGround) {
      this.vx *= 0.7;
      if (this.stun === 0 && --this.wait <= 0) {
        const near = Math.abs(h.x - this.x) < 130 && Math.abs(h.y - this.y) < 60;
        this.dir = near ? Math.sign(h.x - this.x) || 1 : (Math.random() < 0.5 ? -1 : 1);
        if (!near && Math.abs(this.x - this.home) > 40) this.dir = Math.sign(this.home - this.x);
        this.vx = this.dir * (near ? 1.25 : 0.7); this.vy = near ? -3.4 : -2.4;
        this.wait = 55 + Math.random() * 50; this.onGround = false;
      }
    }
    this.vy = Math.min(5, this.vy + 0.22);
    const was = this.onGround;
    moveBody(this, game.level);
    if (!was && this.onGround) { this.land = 8; game.fx.dust(this.x, this.y, 3); }
    if (this.y > WORLD_H + 20) this.dead = true;
    this.touch(game);
  }
  draw(g, cx, cy) {
    let s = this.S.rest;
    if (!this.onGround) s = this.S.stretch;
    else if (this.land > 0 || (this.wait < 12) || Math.floor(this.t / 22) % 2) s = this.land > 0 || this.wait < 12 ? this.S.squash : this.S.rest;
    if (this.onGround) shadow(g, this.x - cx, this.y - cy, 12);
    const breathe = this.onGround && this.land === 0 && this.wait >= 12 && Math.floor(this.t / 24) % 2 ? 1 : 0;
    blit(g, s, this.x - s.w / 2 - cx, this.y - s.h + 1 + breathe - cy, this.dir > 0, this.flash > 0);
  }
}

export class Duskwing extends Enemy {
  constructor(x, y) {
    super(x, y);
    Object.assign(this, { hw: 6, h: 8, hp: 6, atk: 3, xp: 7, colors: GLOOM, coinDrop: [1, 2], mode: 'hover', homeY: y, cd: 60 });
    this.S = DUSKWING.map(spr);
  }
  update(game) {
    this.common();
    if (this.far(game)) return;
    const h = game.hero;
    if (this.stun > 0) { this.vx *= 0.9; this.vy *= 0.9; this.x += this.vx; this.y += this.vy; this.mode = 'rise'; return; }
    if (this.cd > 0) this.cd--;
    if (this.mode === 'hover') {
      const tx = this.home + Math.sin(this.t * 0.021) * 34, ty = this.homeY + Math.sin(this.t * 0.06) * 6;
      this.vx += (tx - this.x) * 0.004; this.vy += (ty - this.y) * 0.01;
      this.vx *= 0.95; this.vy *= 0.9;
      if (this.cd === 0 && Math.abs(h.x - this.x) < 80 && h.y > this.y && h.y - this.y < 110) { this.mode = 'dive'; this.tx = h.x; this.ty = h.y - 10; this.dt = 0; game.sfx('screech'); }
    } else if (this.mode === 'dive') {
      const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy) || 1;
      this.vx += (dx / d * 2.3 - this.vx) * 0.12; this.vy += (dy / d * 2.3 - this.vy) * 0.12;
      if (d < 8 || ++this.dt > 70) this.mode = 'rise';
    } else {
      this.vy += (-1.3 - this.vy) * 0.08; this.vx *= 0.96;
      if (this.y <= this.homeY + 2) { this.mode = 'hover'; this.cd = 80 + Math.random() * 60; }
    }
    this.x += this.vx; this.y += this.vy;
    if (this.vx) this.dir = Math.sign(this.vx);
    this.touch(game);
  }
  draw(g, cx, cy) {
    const s = this.S[[0, 1, 2, 1][Math.floor(this.t / (this.mode === 'dive' ? 3 : 5)) % 4]];
    blit(g, s, this.x - s.w / 2 - cx, this.y - s.h - cy, false, this.flash > 0);
  }
  drawEm(g, cx, cy) {
    if (this.flash > 0) return;
    g.fillStyle = P.y4;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy) - 5 + ([0, 1, 2, 1][Math.floor(this.t / 5) % 4] === 0 ? 0 : -1);
    g.fillRect(x - 2, y, 1, 1); g.fillRect(x + 1, y, 1, 1);
  }
}

export class Sporecap extends Enemy {
  constructor(x, y) {
    super(x, y);
    Object.assign(this, { hw: 7, h: 15, hp: 18, atk: 5, xp: 14, colors: [P.r5, P.r4, P.r3, P.b7], coinDrop: [2, 4], kb: 0.45, mode: 'walk', mt: 0 });
    this.S = SPORECAP.map(spr);
  }
  update(game) {
    this.common();
    if (this.far(game)) return;
    const h = game.hero, lv = game.level;
    this.mt++;
    if (this.stun > 0) this.vx *= 0.85;
    else if (this.mode === 'walk') {
      this.vx = this.dir * 0.38;
      const ahead = this.x + this.dir * 10;
      if (this.hitWall || !lv.solid(Math.floor(ahead / T), Math.floor((this.y + 2) / T)) || Math.abs(this.x + this.dir * 4 - this.home) > 44) this.dir *= -1;
      if (this.mt > 30 && Math.abs(h.x - this.x) < 78 && Math.abs(h.y - this.y) < 26) { this.mode = 'wind'; this.mt = 0; this.dir = Math.sign(h.x - this.x) || 1; game.sfx('grunt'); }
    } else if (this.mode === 'wind') {
      this.vx = 0;
      if (this.mt > 26) { this.mode = 'charge'; this.mt = 0; }
    } else if (this.mode === 'charge') {
      this.vx = this.dir * 1.75;
      if (this.mt % 5 === 0) game.fx.dust(this.x - this.dir * 6, this.y, 1, this.dir);
      const ahead = this.x + this.dir * 9;
      if (this.mt > 46 || this.hitWall || !lv.solid(Math.floor(ahead / T), Math.floor((this.y + 2) / T))) { this.mode = 'rest'; this.mt = 0; }
    } else { this.vx *= 0.8; if (this.mt > 50) { this.mode = 'walk'; this.mt = 0; } }
    this.vy = Math.min(5, this.vy + 0.24);
    moveBody(this, lv);
    if (this.y > WORLD_H + 20) this.dead = true;
    this.touch(game);
  }
  draw(g, cx, cy) {
    const moving = Math.abs(this.vx) > 0.1;
    const s = this.S[moving ? [0, 1, 0, 2][Math.floor(this.t / (this.mode === 'charge' ? 4 : 9)) % 4] : 0];
    shadow(g, this.x - cx, this.y - cy, 14);
    const jit = this.mode === 'wind' ? (this.mt >> 1) % 2 : 0;
    blit(g, s, this.x - s.w / 2 + jit - cx, this.y - s.h + 1 - cy, this.dir > 0, this.flash > 0);
  }
}

// ---------------------------------------------------------------- the Gloomroot
export class Gloomroot extends Enemy {
  constructor(x, y) {
    super(x, y);
    Object.assign(this, { hw: 20, h: 58, maxHp: 170, hp: 170, atk: 4, xp: 120, colors: GLOOM, kb: 0, mode: 'sleep', mt: 0, arm: 2, armTarget: 2, isBoss: true, name: 'Gloomroot', next: 0, shakeX: 0 });
    this.body = BOSS.body.map(spr);
    this.arms = BOSS.arms.map((a) => ({ s: spr(a.pix), ox: a.ox, oy: a.oy, tip: a.tip }));
  }
  get phase2() { return this.hp < this.maxHp * 0.5; }
  hurtbox() { return this.mode === 'sleep' || this.mode === 'dying' || this.mode === 'wake' ? [0, -999, 0, 0] : [this.x - this.hw, this.y - this.h, this.hw * 2, this.h]; }
  wake(game) { this.mode = 'wake'; this.mt = 0; game.sfx('roar'); game.shake(8); }
  hit(dmg, dir, game, kb, crit, fire) {
    super.hit(dmg, dir, game, kb, crit, fire);
    this.shakeX = 3;
  }
  die(game) { this.mode = 'dying'; this.mt = 0; this.dead = false; this.hp = 0; game.bossDying(this); }
  update(game) {
    this.common();
    this.mt++;
    if (this.shakeX > 0) this.shakeX -= 0.4;
    const h = game.hero;
    // arm eases toward its target pose
    if (this.arm < this.armTarget) this.arm = Math.min(this.armTarget, this.arm + (this.mode === 'slam' ? 1.1 : 0.12));
    else if (this.arm > this.armTarget) this.arm = Math.max(this.armTarget, this.arm - 0.1);

    if (this.mode === 'sleep') return;
    if (this.mode === 'dying') {
      if (this.mt % 5 === 0) { game.fx.burst(this.x + (Math.random() - 0.5) * 44, this.y - Math.random() * 60, 6, { colors: this.mt > 70 ? GOLD : GLOOM, speed: 1.6, em: true, life: 34, up: 0.5, drag: 0.95 }); game.shake(2); }
      if (this.mt % 14 === 0) game.sfx('boom');
      if (this.mt > 130) { this.dead = true; game.bossDead(this); }
      return;
    }
    if (this.mode === 'wake') { if (this.mt > 80) { this.mode = 'idle'; this.mt = 0; this.next = 40; } return; }

    const fast = this.phase2;
    if (this.mode === 'idle') {
      this.armTarget = 2;
      if (this.mt > this.next) {
        const d = this.x - h.x;
        const roll = Math.random();
        const adds = game.ents.filter((e) => e instanceof Mossling && !e.dead && e.x > ARENA.x0).length;
        if (fast && adds < 2 && roll < 0.22) this.start('summon');
        else if (d < 96 && roll < 0.65) this.start('slam');
        else this.start(roll < 0.5 || d >= 96 ? 'spikes' : 'slam');
      }
    } else if (this.mode === 'slam') {
      const wind = fast ? 30 : 42;
      if (this.mt < wind) { this.armTarget = 0; if (this.mt % 6 === 0) game.fx.add({ x: this.x - 50 + (Math.random() - 0.5) * 30, y: this.y, vy: -0.8, life: 14, colors: GLOOM, em: true }); }
      else if (this.mt === wind) { this.armTarget = 4; game.sfx('whoosh'); }
      else if (this.mt === wind + 4) {
        const ix = this.x - 54;
        game.shake(9); game.sfx('slam');
        game.fx.dust(ix, this.y, 14); game.fx.sparks(ix, this.y - 2, 14, GLOOM, 2.6);
        game.spawn(new Shockwave(ix - 6, this.y, -1));
        if (overlap([this.x - 86, this.y - 34, 70, 34], h.box())) h.damage(7, this.x, game);
        this.slams = (this.slams || 0) + 1;
      } else if (this.mt > wind + (fast ? 26 : 44)) {
        if (fast && this.slams < 2) { this.mt = 8; } else { this.slams = 0; this.done(); }
      }
    } else if (this.mode === 'spikes') {
      this.armTarget = 1;
      if (this.mt === 1) game.sfx('rumble');
      const n = fast ? 5 : 3, gap = fast ? 18 : 24;
      if (this.mt % gap === 10 && this.mt < n * gap) {
        const tx = clamp(h.x + h.vx * 14, ARENA.x0 + 12, this.x - 24);
        game.spawn(new RootSpike(tx, this.y));
      }
      if (this.mt > n * gap + 50) this.done();
    } else if (this.mode === 'summon') {
      this.armTarget = 0;
      if (this.mt === 30 || this.mt === 50) {
        const m = new Mossling(ARENA.x0 + 50 + Math.random() * 150, this.y - 120);
        m.xp = 2; m.coinDrop = [0, 1];
        game.spawn(m); game.sfx('pop');
      }
      if (this.mt > 80) this.done();
    }
    // the trunk itself shoves you back
    if (overlap([this.x - 17, this.y - 50, 30, 50], h.box())) { h.damage(this.atk, this.x, game); }
  }
  start(mode) { this.mode = mode; this.mt = 0; }
  done() { this.mode = 'idle'; this.mt = 0; this.next = this.phase2 ? 34 + Math.random() * 30 : 60 + Math.random() * 40; }
  draw(g, cx, cy) {
    if (this.dead) return;
    const sx = Math.round(this.x - cx + (this.shakeX > 0 ? (this.t % 2 ? 1 : -1) * Math.ceil(this.shakeX) : 0) + (this.mode === 'dying' ? (this.t % 2 ? 2 : -2) : 0));
    const sy = Math.round(this.y - cy);
    let b = 0;
    if (this.mode === 'sleep') b = 3;
    else if (this.mode === 'wake' && this.mt < 30) b = 2;
    else if (this.mode === 'dying') b = this.t % 6 < 3 ? 2 : 0;
    else if (this.t % 140 > 134) b = 2;
    else if (this.phase2 || this.mode === 'slam' || this.mode === 'spikes') b = Math.floor(this.t / 8) % 2;
    if (this.mode === 'dying' && this.mt > 60 && (this.mt >> 1) % 2) return;
    const bs = this.body[b];
    const sway = this.mode === 'sleep' ? 0 : Math.round(Math.sin(this.t * 0.04) * 1);
    // far arm (behind the trunk), then body, then the near arm that does the slamming
    const a2 = this.arms[clamp(Math.round(4 - this.arm * 0.5), 0, 4)];
    g.drawImage(this.flash > 0 ? white(a2.s, false) : a2.s.r, sx + 14 - a2.ox, sy - 36 - a2.oy);
    blit(g, bs, sx - BOSS.W / 2 + sway, sy - BOSS.H + 1, false, this.flash > 0);
    const a = this.arms[clamp(Math.round(this.arm), 0, 4)];
    g.drawImage(this.flash > 0 ? white(a.s, true) : a.s.l, sx - 14 - (64 - a.ox), sy - 34 - a.oy);
  }
  light(out) {
    if (this.mode === 'sleep') return;
    out.push({ x: this.x - 2, y: this.y - 34, r: this.phase2 ? 60 : 46, color: '#c58bff', i: 0.75, always: true });
  }
}

// ---------------------------------------------------------------- villagers & things you can use
export class NPC {
  constructor(id, x, y) {
    const defs = {
      elder: { pix: ELDER, name: 'Elder Maren', face: 'elder' },
      smith: { pix: SMITH, name: 'Tobin the Smith', face: 'smith' },
      kid: { pix: KID, name: 'Pip', face: 'kid' },
      cat: { pix: CAT[0], name: 'Biscuit', face: 'cat' },
    };
    Object.assign(this, { id, x, y, t: (x * 3) % 100 | 0, dead: false, dir: -1, ...defs[id] });
    this.s = spr(this.pix);
    if (id === 'cat') this.s2 = spr(CAT[1]);
    if (id === 'elder') this.staff = spr(STAFF);
    this.interact = { label: id === 'cat' ? 'Pet' : 'Talk', range: 20, dy: -this.pix.h - 6, run: (game) => game.talk(this) };
  }
  update(game) { this.t++; if (this.id !== 'cat' && Math.abs(game.hero.x - this.x) < 90) this.dir = game.hero.x < this.x ? -1 : 1; }
  draw(g, cx, cy) {
    if (this.id !== 'cat') shadow(g, this.x - cx, this.y - cy, 12);
    const bob = this.id !== 'cat' && Math.floor(this.t / 34) % 2 ? 1 : 0;
    let s = this.s;
    if (this.id === 'cat' && Math.floor(this.t / 26) % 3 === 0) s = this.s2;
    if (this.staff) g.drawImage(this.staff.r, Math.round(this.x + this.dir * 8 - 3 - cx), Math.round(this.y - this.staff.h + 1 - cy));
    blit(g, s, this.x - s.w / 2 - cx, this.y - s.h + 1 + bob - cy, this.dir < 0, false);
  }
  drawEm(g, cx, cy) {
    if (!this.staff) return;
    g.drawImage(this.staff.r, 0, 0, 7, 5, Math.round(this.x + this.dir * 8 - 3 - cx), Math.round(this.y - this.staff.h + 1 - cy), 7, 5);
  }
  light(out) { if (this.staff) out.push({ x: this.x + this.dir * 8, y: this.y - this.staff.h + 3, r: 34, color: '#ffc27a', glow: 9 }); }
}

export class Campfire {
  constructor(x, y) {
    Object.assign(this, { x, y, t: 0, lit: false, dead: false });
    this.s = spr(CAMPFIRE_BASE);
    this.interact = { label: 'Rest', range: 20, dy: -20, run: (game) => game.rest(this) };
  }
  update(game) {
    this.t++;
    if (this.lit && Math.abs(this.x - game.hero.x) < 240) { game.fx.flame(this.x, this.y - 5, 1); if (this.t % 2) game.fx.flame(this.x, this.y - 4, 0.7); }
  }
  draw(g, cx, cy) { g.drawImage(this.s.r, Math.round(this.x - this.s.w / 2 - cx), Math.round(this.y - this.s.h + 2 - cy)); }
  light(out) { if (this.lit) out.push({ x: this.x, y: this.y - 10, r: 74 + Math.sin(this.t * 0.4) * 3 + Math.sin(this.t * 0.17) * 3, color: '#ffa24a', glow: 22, always: true }); }
}

export class Chest {
  constructor(x, y, loot) {
    Object.assign(this, { x, y, loot, open: false, dead: false, t: 0 });
    this.sc = spr(CHEST.closed); this.so = spr(CHEST.open);
    this.interact = { label: 'Open', range: 18, dy: -20, can: () => !this.open, run: (game) => game.openChest(this) };
  }
  update() { this.t++; }
  draw(g, cx, cy) { const s = this.open ? this.so : this.sc; g.drawImage(s.r, Math.round(this.x - s.w / 2 - cx), Math.round(this.y - s.h + 1 - cy)); }
  drawEm(g, cx, cy) {
    if (this.open || this.t % 90 > 12) return;
    // little glint so chests catch the eye
    g.fillStyle = P.y6; const x = Math.round(this.x - cx) + 3, y = Math.round(this.y - cy) - 10;
    g.fillRect(x, y - 1, 1, 3); g.fillRect(x - 1, y, 3, 1);
  }
  light(out) { if (this.open && this.t < 60) out.push({ x: this.x, y: this.y - 8, r: 40, color: '#ffd76a', glow: 14, always: true }); }
}

export class Shrine {
  constructor(x, y) {
    Object.assign(this, { x, y, lit: false, dead: false, t: 0 });
    this.s = spr(SHRINE);
    this.interact = { label: 'Rekindle', range: 32, dy: -48, can: (game) => !this.lit && game.bossDefeated, run: (game) => game.rekindle(this) };
  }
  update(game) {
    this.t++;
    if (this.lit) { for (let i = 0; i < 3; i++) game.fx.flame(this.x, this.y - 38, 1.7); }
  }
  draw(g, cx, cy) { g.drawImage(this.s.r, Math.round(this.x - this.s.w / 2 - cx), Math.round(this.y - this.s.h + 2 - cy)); }
  light(out) { if (this.lit) out.push({ x: this.x, y: this.y - 44, r: 110 + Math.sin(this.t * 0.3) * 5, color: '#ffb056', glow: 34, always: true }); }
}

export class Sign {
  constructor(x, y, lines) { Object.assign(this, { x, y, dead: false }); this.interact = { label: 'Read', range: 16, dy: -24, run: (game) => game.say(lines) }; }
  update() {} draw() {}
}

export const SPAWNERS = { mossling: Mossling, duskwing: Duskwing, sporecap: Sporecap };

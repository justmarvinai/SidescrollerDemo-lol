// Game state: the quest, dialogue, camera, ambience and the glue between systems.
import { buildLevel, moodAt, zoneOf, T, WORLD_W, WORLD_H, ARENA, ZONES } from './level.js';
import { Renderer } from './render.js';
import { Particles, GOLD, GLOOM, LEAVES, FIRE } from './fx.js';
import { Player, NPC, Campfire, Chest, Shrine, Sign, Pickup, Gloomroot, Mossling, SPAWNERS } from './entities.js';
import { drawUI } from './hud.js';
import { VIEW_W, VIEW_H } from '../gfx/art-bg.js';
import { clamp, lerp, silhouette, rng } from '../gfx/pixel.js';
import { P } from '../gfx/palette.js';

const EDGE = 32; // keeps the boundary cliffs just off-screen
const Z = (e) => (e.isBoss ? 0 : e instanceof Pickup ? 3 : e.isEnemy ? 4 : e instanceof NPC ? 2 : 1);

export class Game {
  constructor(input, audio, opts = {}) {
    this.input = input; this.audio = audio; this.opts = opts;
    this.level = buildLevel();
    this.R = new Renderer(this.level);
    this.fx = new Particles();
    this.frame = 0; this.time = 0;
    const r = rng(31337);
    this.fireflies = Array.from({ length: 70 }, () => { const x = r.range(880, 2700); return { x, y: this.level.groundY(x, 3 * T) - r.range(8, 64), ph: r.range(0, 6.28), sp: r.range(0.6, 1.4) }; });
    this.newGame();
  }

  newGame() {
    const lv = this.level;
    this.hero = new Player(lv.start.x, lv.start.y);
    this.ents = []; this.pending = [];
    for (const s of lv.spawns) this.spawnFrom(s);
    this.boss = new Gloomroot(ARENA.bossX, lv.groundY(ARENA.bossX, 7 * T));
    this.ents.push(this.boss);
    this.ents.push(new Sign(56 * T, 11 * T, [{ text: 'EAST: Thornwood, and the Old Shrine beyond.\nWEST: Lanternwick. Mind the cat.' }]));
    this.ents.sort((a, b) => Z(a) - Z(b));
    this.cam = { x: EDGE, y: WORLD_H - VIEW_H }; this.look = 0;
    this.state = 'title'; this.stateT = 0;
    this.quest = { stage: 0, text: 'Speak with Elder Maren' };
    this.flags = {}; this.zoneShown = -1;
    this.lights = []; this.tempLights = []; this.ghosts = [];
    this.shakeT = 0; this.hitstopT = 0; this.cutT = 0;
    this.fade = 0; this.whiteout = 0; this.darkness = 0; this.dawn = 0; this.dawnT = null;
    this.levelFlash = 0; this.bannerInfo = null; this.toastInfo = null; this.dialog = null; this.focus = null;
    this.arenaLocked = false; this.bossDefeated = false; this.end = null; this.playTime = 0;
    this.mood = 0; this.control = false; this.muted = this.audio.muted;
    if (this.opts.start) this.debugStart(this.opts.start);
  }

  spawnFrom(s) {
    const lv = this.level;
    const gy = s.py !== undefined ? s.py : s.row !== undefined ? s.row * T : lv.groundY(s.x, 2 * T);
    const [kind, id] = s.kind.split(':');
    let e;
    if (kind === 'npc') e = new NPC(id, s.x, gy + (s.dy || 0));
    else if (kind === 'campfire') { e = new Campfire(s.x, gy); if (s.x < 40 * T) e.lit = true; }
    else if (kind === 'chest') e = new Chest(s.x, gy, s.loot);
    else if (kind === 'shrine') { e = new Shrine(s.x, gy); this.shrine = e; }
    else if (kind === 'coin') e = new Pickup('coin', s.x, gy);
    else if (kind === 'heart') e = new Pickup('heart', s.x, gy - 4);
    else if (SPAWNERS[kind]) e = new SPAWNERS[kind](s.x, gy);
    if (e) this.ents.push(e);
  }
  spawn(e) { this.pending.push(e); }

  debugStart(where) {
    const h = this.hero;
    const spots = { forest: 64, pond: 114, ruins: 150, gate: 196, boss: 201, shrine: 226 };
    const tx = spots[where] ?? +where;
    if (!tx) return;
    h.x = tx * T; h.y = this.level.groundY(h.x, 2 * T); h.checkpoint = { x: h.x, y: h.y }; h.safe = { x: h.x, y: h.y };
    h.potions = 3; h.hasSpell = true; h.lvl = 4; h.atk = 6; h.maxHp = 35; h.hp = 35; h.maxMp = 9; h.mp = 9; h.xpNext = 90;
    for (const n of h.scarf) { n.x = n.px = h.x; n.y = n.py = h.y - 14; }
    this.quest = { stage: 1, text: 'Travel east through Thornwood' };
    if (where === 'shrine') { this.bossDefeated = true; this.boss.dead = true; this.quest = { stage: 4, text: 'Rekindle the Ember' }; }
    this.state = 'play'; this.cam.x = clamp(h.x - 160, 0, WORLD_W - VIEW_W);
    this.audio.music(tx > 60 ? 'forest' : 'village');
  }

  // ------------------------------------------------------------ helpers used by entities
  sfx(name) { this.audio.sfx(name); }
  shake(n) { this.shakeT = Math.max(this.shakeT, n); }
  hitstop(n) { this.hitstopT = Math.max(this.hitstopT, n); }
  toast(text, color) { this.toastInfo = { text, color, t: 0, dur: 170 }; }
  banner(title, sub, color, dur = 210) { this.bannerInfo = { title, sub, color, t: 0, dur }; }
  setQuest(stage, text) { if (stage > this.quest.stage) { this.quest = { stage, text }; this.sfx('select'); } }
  flashLight(x, y, r, color) { this.tempLights.push({ x, y, r, color, life: 12, max: 12 }); }
  afterimage(h) {
    const f = h.frame().s;
    if (!f.ghost) f.ghost = { r: silhouette(f.r, P.u6), l: silhouette(f.l, P.u6) };
    this.ghosts.push({ can: h.dir < 0 ? f.ghost.l : f.ghost.r, x: Math.round(h.x - 24), y: Math.round(h.y - 38), life: 14 });
  }
  say(lines, onDone) {
    this.dialog = { lines: lines.map((l) => (typeof l === 'string' ? { text: l } : l)), i: 0, chars: 0, onDone };
    this.state = 'dialog'; this.hero.vx = 0;
  }

  talk(npc) {
    const q = this.quest, f = this.flags, h = this.hero;
    const L = (text) => ({ who: npc.name, face: npc.face, text });
    const W = (text) => ({ who: 'Wren', face: 'hero', text });
    const lit = this.end && this.end.done;
    switch (npc.id) {
      case 'elder':
        if (lit) return this.say([L('Look at them, child. Every lantern in the valley, burning like it was new.'), L('Rest now. You carried the fire home.')]);
        if (q.stage === 0) return this.say([
          L('Wren! There you are. Look at that sky... dusk comes a little earlier every day.'),
          L('The Ember at the Old Shrine has gone cold. Without it, not one lantern in Lanternwick will last the night.'),
          W('Then somebody has to light it again.'),
          L('Somebody does. Follow the road east through Thornwood. And remember: fire knows its friends. Rest at any campfire you find.'),
          L('Take these tonics, and keep that sword close. The dark out there has grown teeth.'),
        ], () => { h.potions += 2; this.setQuest(1, 'Travel east through Thornwood'); this.toast('Received 2 tonics   (Q to drink)'); this.sfx('chest'); });
        return this.say([L('East, through Thornwood, to the Old Shrine. Go gently, lamplighter.')]);
      case 'smith':
        if (lit) return this.say([L('Ha! Knew that edge would hold. First round at the inn is on me.')]);
        if (!f.smith) return this.say([
          L('Evening, Wren. Off to the shrine with THAT blade? Hold still a moment.'),
          L('...There. An edge like a winter morning.'),
          L('Chain your swings: tap J three times and the last one bites hardest. And if something big winds up, dash through it with L.'),
        ], () => { f.smith = true; h.atk += 1; this.toast('Sword sharpened   ATK +1'); this.sfx('levelup'); });
        return this.say([L('Three swings, then dash. Worked for me. Mostly.')]);
      case 'kid':
        if (lit) return this.say([L('I SAW it! The whole sky went gold! Biscuit slept through it.')]);
        if (!f.kid) { f.kid = true; return this.say([L('Are you really going to the shrine? Biscuit says the woods glow at night.'), L('Biscuit is my cat. He knows things.'), L('If you find a chest out there you HAVE to open it. That is the rule.')]); }
        return this.say([L('Bring me back a glowing mushroom! ...Or do not. Mum says they are "not snacks".')]);
      case 'cat':
        if (!f.cat) { f.cat = true; return this.say([L('Mrrrow.'), { text: 'Biscuit nudges something shiny toward you with one paw, then pretends he did not.' }], () => { for (let i = 0; i < 5; i++) this.spawn(new Pickup('coin', npc.x, npc.y - 8, true)); this.sfx('coin'); }); }
        return this.say([L('...'), { text: 'Biscuit regards you with ancient, comfortable disinterest.' }]);
      default: break;
    }
  }

  rest(fire) {
    const h = this.hero, first = !fire.lit;
    fire.lit = true;
    h.hp = h.maxHp; h.mp = h.maxMp; h.checkpoint = { x: fire.x - 16, y: fire.y };
    this.sfx('rest');
    this.fx.burst(fire.x, fire.y - 8, 22, { colors: FIRE, speed: 1.4, up: 1, em: true, life: 40, drag: 0.95 });
    this.fx.burst(h.x, h.y - 10, 12, { colors: [P.g7, P.g6, P.t5], speed: 0.9, up: 0.8, em: true, life: 34, drag: 0.95 });
    this.toast(first ? 'Campfire lit. Your path is remembered.' : 'You rest by the fire.');
  }
  openChest(c) {
    const h = this.hero;
    c.open = true; c.t = 0;
    this.sfx('chest'); this.shake(2);
    this.fx.sparks(c.x, c.y - 8, 18, GOLD, 2);
    if (c.loot === 'ember') {
      h.hasSpell = true; h.mp = h.maxMp;
      this.say([
        { text: 'Inside the chest lies a coal that never cooled.\nYou learned EMBER SPARK!' },
        { text: 'Press K to hurl a bolt of fire. It costs 3 MP. Landing sword blows wins some back.' },
      ]);
    } else {
      h.potions += 1;
      for (let i = 0; i < 12; i++) this.spawn(new Pickup('coin', c.x, c.y - 8, true));
      this.toast('Found a tonic and a pile of coins');
    }
  }
  levelUp() {
    const h = this.hero;
    this.levelFlash = 100; this.sfx('levelup');
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; this.fx.add({ x: h.x, y: h.y - 10, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 30, drag: 0.92, colors: GOLD, em: true, size: 2, shrink: true }); }
    this.flashLight(h.x, h.y - 10, 80, '#ffd76a');
  }
  onDeath() { this.shake(8); }
  fellOut() {
    const h = this.hero;
    h.hp = Math.max(0, h.hp - 3);
    this.fade = 1;
    if (h.hp <= 0) { this.sfx('die'); this.respawn(); return; }
    h.x = h.safe.x; h.y = h.safe.y; h.vx = h.vy = 0; h.inv = 90; h.flash = 6; h.set('idle');
    for (const n of h.scarf) { n.x = n.px = h.x; n.y = n.py = h.y - 14; }
    this.sfx('hurt'); this.fx.text(h.x, h.y - 26, '-3', P.r5, { big: true });
  }
  respawn() {
    const h = this.hero, cp = h.checkpoint;
    h.x = cp.x; h.y = cp.y; h.vx = h.vy = 0; h.hp = h.maxHp; h.mp = h.maxMp; h.hpLag = h.hp; h.inv = 80; h.dir = 1; h.set('idle');
    for (const n of h.scarf) { n.x = n.px = h.x; n.y = n.py = h.y - 14; }
    this.fade = 1;
    if (this.arenaLocked) {
      this.arenaLocked = false;
      const b = this.boss;
      b.hp = b.maxHp; b.mode = 'sleep'; b.arm = b.armTarget = 2; b.slams = 0;
      for (const e of this.ents) if ((e instanceof Mossling && e.x > ARENA.x0) || e.constructor.name === 'RootSpike' || e.constructor.name === 'Shockwave') e.dead = true;
      this.audio.music('forest');
    }
    this.cam.x = clamp(h.x - 160, EDGE, WORLD_W - VIEW_W - EDGE);
    this.toast('The fire calls you back.');
  }
  bossDying() { this.audio.music(null); this.hitstop(24); this.whiteout = 0.7; this.shake(10); for (const e of this.ents) if (e.constructor.name === 'RootSpike' || e.constructor.name === 'Shockwave' || (e instanceof Mossling && e.x > ARENA.x0)) e.dead = true; }
  bossDead(b) {
    this.arenaLocked = false; this.bossDefeated = true;
    this.whiteout = 0.9; this.sfx('boom');
    for (let i = 0; i < 24; i++) this.spawn(new Pickup('coin', b.x - 20 + Math.random() * 20, b.y - 20 - Math.random() * 30, true));
    this.fx.burst(b.x, b.y - 30, 60, { colors: GOLD, speed: 3, em: true, life: 60, drag: 0.95, up: 0.5, size: 2, shrink: true });
    this.hero.gainXp(b.xp, this);
    this.setQuest(4, 'Rekindle the Ember');
    this.banner('The gloom lifts', 'the shrine lies open', P.y5);
    this.audio.music('forest');
  }
  rekindle(shrine) {
    this.state = 'ending'; this.end = { t: 0, shrine, done: false };
    this.audio.music(null); this.hero.vx = 0; this.hero.dir = shrine.x > this.hero.x ? 1 : -1;
  }

  // ------------------------------------------------------------ simulation
  step() {
    this.frame++; this.time += 1 / 60; this.stateT++;
    const inp = this.input;
    if (inp.take('mute')) this.muted = this.audio.toggleMute();
    this.audio.tick();
    if (this.bannerInfo && ++this.bannerInfo.t > this.bannerInfo.dur) this.bannerInfo = null;
    if (this.toastInfo && ++this.toastInfo.t > this.toastInfo.dur) this.toastInfo = null;
    if (this.levelFlash > 0) this.levelFlash--;
    if (this.fade > 0) this.fade = Math.max(0, this.fade - 0.035);
    if (this.whiteout > 0) this.whiteout = Math.max(0, this.whiteout - 0.02);
    if (this.shakeT > 0) this.shakeT *= 0.86;
    for (let i = this.tempLights.length - 1; i >= 0; i--) if (--this.tempLights[i].life <= 0) this.tempLights.splice(i, 1);
    for (let i = this.ghosts.length - 1; i >= 0; i--) if (--this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);

    switch (this.state) {
      case 'title':
        this.cam.x = 172 + Math.sin(this.time * 0.11 - 1.2) * 130; this.cam.y = WORLD_H - VIEW_H;
        this.control = false;
        for (const e of this.ents) if (!e.isEnemy) e.update(this);
        this.hero.updateScarf(this.time); this.hero.t++;
        this.ambient(); this.fx.update();
        if (inp.anyPressed && this.stateT > 20) this.begin();
        break;
      case 'pause':
        if (inp.take('pause') || inp.take('interact')) this.state = 'play';
        break;
      case 'dialog': this.stepDialog(); this.world(false); break;
      case 'ending': this.stepEnding(); this.world(false); break;
      default:
        if (inp.take('pause')) { this.state = 'pause'; this.sfx('select'); break; }
        if (this.cutT > 0) { this.cutT--; if (this.cutT === 80) { this.boss.wake(this); this.banner('Gloomroot', 'warden of the dark shrine', P.p6, 170); this.audio.music('boss'); } }
        this.world(this.cutT === 0);
    }

    const base = moodAt(this.cam.x + VIEW_W / 2);
    this.mood = this.dawnT === null ? base : lerp(base, 0, this.dawnT * this.dawnT * (3 - 2 * this.dawnT));
    this.darkness += ((this.arenaLocked ? 1 : 0) - this.darkness) * 0.03;
    this.collectLights();
  }

  begin() {
    this.audio.unlock();
    this.state = 'play'; this.stateT = 0; this.fade = 1;
    this.cam.x = clamp(this.hero.x - 160, EDGE, WORLD_W - VIEW_W - EDGE);
    this.audio.music('village'); this.sfx('select');
  }

  world(control) {
    const inp = this.input, h = this.hero;
    this.control = control;
    if (this.hitstopT > 0) { this.hitstopT--; return; }
    if (control) this.playTime++;
    if (this.opts.god) { h.hp = h.maxHp; h.mp = h.maxMp; }
    h.update(this);
    for (const e of this.ents) if (!e.dead) e.update(this);
    if (this.pending.length) { this.ents.push(...this.pending); this.pending.length = 0; this.ents.sort((a, b) => Z(a) - Z(b)); }
    if (this.frame % 10 === 0) this.ents = this.ents.filter((e) => !e.dead);

    // what can we interact with?
    this.focus = null;
    if (control && h.state !== 'dead') {
      let best = 1e9;
      for (const e of this.ents) {
        const it = e.interact;
        if (!it || e.dead || (it.can && !it.can(this))) continue;
        const d = Math.abs(e.x - h.x);
        if (d < it.range && Math.abs(e.y - h.y) < 30 && d < best) { best = d; this.focus = e; }
      }
      if (this.focus && h.onGround && (inp.take('interact') || inp.take('up'))) { this.sfx('select'); this.focus.interact.run(this); }
    }
    this.triggers();
    this.ambient();
    this.fx.update();
    this.updateCam();
  }

  triggers() {
    const h = this.hero;
    for (let i = ZONES.length - 1; i > this.zoneShown; i--) {
      if (h.x > ZONES[i].x + 24) {
        this.zoneShown = i; this.banner(ZONES[i].name, ZONES[i].sub);
        if (!this.arenaLocked && this.dawnT === null) this.audio.music(i === 0 ? 'village' : 'forest');
        if (i === 2) this.setQuest(2, 'Find the Ember Shrine');
        break;
      }
    }
    if (this.dawnT === null && !this.arenaLocked) { if (h.x < 60 * T) this.audio.music('village'); else if (h.x > 64 * T) this.audio.music('forest'); }
    if (!this.bossDefeated && !this.arenaLocked && h.x > ARENA.x0 + 36 && h.state !== 'dead') {
      this.arenaLocked = true; this.cutT = 130; h.vx = 0;
      this.setQuest(3, 'Defeat the Gloomroot');
      this.audio.music(null);
    }
  }

  stepDialog() {
    const d = this.dialog, inp = this.input;
    const line = d.lines[d.i];
    const press = inp.take('interact') || inp.take('jump') || inp.take('attack') || inp.take('up');
    if (d.chars < line.text.length) {
      const before = Math.floor(d.chars);
      d.chars = press ? line.text.length : d.chars + 0.9;
      if (Math.floor(d.chars / 3) !== Math.floor(before / 3) && line.text[Math.floor(d.chars)] !== ' ') this.sfx('talk');
    } else if (press) {
      if (++d.i >= d.lines.length) { this.dialog = null; this.state = 'play'; d.onDone && d.onDone(); }
      else d.chars = 0;
    }
  }

  stepEnding() {
    const e = this.end, s = e.shrine, inp = this.input;
    e.t++;
    if (e.t < 40 && e.t % 3 === 0) this.fx.add({ x: this.hero.x + this.hero.dir * 6, y: this.hero.y - 12, vx: (s.x - this.hero.x) / 40, vy: -1.2, g: 0.02, life: 40, colors: GOLD, em: true, size: 2 });
    if (e.t === 40) {
      s.lit = true; this.whiteout = 1; this.shake(7); this.sfx('ember');
      this.fx.burst(s.x, s.y - 40, 80, { colors: FIRE, speed: 3.4, em: true, life: 70, drag: 0.96, up: 1, size: 2, shrink: true });
      this.dawnT = 0;
    }
    if (e.t > 40) this.dawnT = Math.min(1, (e.t - 40) / 300);
    this.dawn = (this.dawnT || 0) * 0.35;
    if (e.t === 120) this.audio.music('dawn');
    if (e.t > 60 && e.t % 4 === 0) this.fx.add({ x: this.cam.x + Math.random() * VIEW_W, y: this.cam.y + VIEW_H, vx: (Math.random() - 0.5) * 0.3, vy: -0.6 - Math.random() * 0.8, life: 150, colors: GOLD, em: true, flutter: 0.03 });
    if (e.t > 320 && (inp.take('interact') || inp.take('jump') || inp.take('attack'))) {
      e.done = true; this.state = 'play'; this.quest = { stage: 5, text: 'Walk home under the lanterns' };
      for (const c of this.ents) if (c instanceof Campfire) c.lit = true;
    }
  }

  updateCam() {
    const h = this.hero;
    this.look += (h.dir * 26 - this.look) * 0.035;
    let minX = EDGE, maxX = WORLD_W - VIEW_W - EDGE;
    if (this.arenaLocked) minX = maxX = ARENA.x0;
    else if (!this.bossDefeated) maxX = ARENA.x0;
    const tx = clamp(h.x - VIEW_W / 2 + this.look, minX, maxX);
    const ty = clamp(h.y - 124, 0, WORLD_H - VIEW_H);
    this.cam.x += (tx - this.cam.x) * 0.11;
    this.cam.y += (ty - this.cam.y) * (ty > this.cam.y ? 0.14 : 0.06);
  }

  // drifting leaves, pollen, smoke, gloom motes
  ambient() {
    const cx = this.cam.x, cy = this.cam.y, z = zoneOf(cx + VIEW_W / 2), f = this.frame;
    if (z.forest > 0.25 && f % 9 === 0) {
      const set = LEAVES[Math.floor(Math.random() * (this.mood > 1 ? 2 : LEAVES.length))];
      this.fx.add({ x: cx + Math.random() * (VIEW_W + 60), y: cy - 4, vx: -0.35 - Math.random() * 0.3, vy: 0.3 + Math.random() * 0.3, life: 420, colors: set, flutter: 0.045, drag: 0.995, size: Math.random() < 0.3 ? 2 : 1 });
    }
    if (z.village > 0.3 && f % 16 === 0 && this.mood < 1.2) this.fx.add({ x: cx + Math.random() * VIEW_W, y: cy + 40 + Math.random() * 100, vx: -0.12, vy: -0.05 - Math.random() * 0.08, life: 240, colors: [P.y6, P.y5, P.y5, P.y4], em: true, flutter: 0.02 });
    if (z.village > 0.5 && f % 40 === 0) { const set = LEAVES[2 + (f % 80 === 0 ? 1 : 0)]; this.fx.add({ x: cx + Math.random() * (VIEW_W + 60), y: cy - 4, vx: -0.3, vy: 0.3 + Math.random() * 0.2, life: 420, colors: set, flutter: 0.05, drag: 0.995 }); }
    if (z.ruins > 0.4 && f % 7 === 0 && (!this.bossDefeated || cx < 2800)) this.fx.add({ x: cx + Math.random() * VIEW_W, y: cy + VIEW_H - 30 - Math.random() * 60, vx: (Math.random() - 0.5) * 0.2, vy: -0.15 - Math.random() * 0.25, life: 160, colors: GLOOM, em: true, flutter: 0.02 });
    if (f % 8 === 0) for (const s of this.R.scene.smoke) if (s.x > cx - 20 && s.x < cx + VIEW_W + 20) this.fx.smoke(s.x, s.y);
  }

  collectLights() {
    const L = this.lights = [];
    const cx = this.cam.x + VIEW_W / 2;
    if (this.state !== 'title') this.hero.light(L);
    for (const e of this.ents) if (e.light && !e.dead && Math.abs(e.x - cx) < 280) e.light(L);
    for (const t of this.tempLights) L.push({ x: t.x, y: t.y, r: t.r, color: t.color, i: t.life / t.max, always: true, glow: t.r / 3 });
    if (this.mood > 0.45) for (const f of this.fireflies) {
      if (Math.abs(f.x - cx) > 190) continue;
      const b = Math.sin(this.time * 1.6 * f.sp + f.ph * 3);
      f.sx = f.x + Math.sin(this.time * 0.6 * f.sp + f.ph) * 16; f.sy = f.y + Math.cos(this.time * 0.8 * f.sp + f.ph * 2) * 9; f.b = b;
      if (b > 0.1) L.push({ x: f.sx, y: f.sy, r: 12, color: '#d8ff7a', i: b * 0.8, glow: 5, always: true });
    }
  }

  // ------------------------------------------------------------ render hooks
  drawActors(g, cx, cy) {
    const mid = cx + VIEW_W / 2;
    for (const e of this.ents) if (!e.dead && Math.abs(e.x - mid) < 250) e.draw(g, cx, cy);
    if (this.state !== 'title') this.hero.draw(g, cx, cy);
    this.fx.draw(g, cx, cy, false);
  }
  drawEmissive(g, cx, cy) {
    const mid = cx + VIEW_W / 2;
    for (const gh of this.ghosts) { g.globalAlpha = (gh.life / 14) * 0.55; g.drawImage(gh.can, gh.x - cx, gh.y - cy); }
    g.globalAlpha = 1;
    for (const e of this.ents) if (e.drawEm && !e.dead && Math.abs(e.x - mid) < 250) e.drawEm(g, cx, cy);
    if (this.state !== 'title') this.hero.drawEm(g, cx, cy);
    this.fx.draw(g, cx, cy, true);
    if (this.mood > 0.45) for (const f of this.fireflies) {
      if (f.sx === undefined || Math.abs(f.x - mid) > 190 || f.b < 0.1) continue;
      g.fillStyle = f.b > 0.6 ? '#fffbdd' : '#d8ff7a';
      g.fillRect(Math.round(f.sx - cx), Math.round(f.sy - cy), 1, 1);
    }
  }
  drawOverlay(g, cx, cy) { this.fx.drawTexts(g, cx, cy); }

  render() {
    const bx = this.cam.x, by = this.cam.y;
    if (this.shakeT > 0.3) { this.cam.x += (Math.random() - 0.5) * this.shakeT * 2; this.cam.y = clamp(this.cam.y + (Math.random() - 0.5) * this.shakeT * 2, 0, WORLD_H - VIEW_H); }
    this.cam.x = clamp(this.cam.x, 0, WORLD_W - VIEW_W);
    const out = this.R.draw(this);
    this.cam.x = bx; this.cam.y = by;
    drawUI(this.R.g, this);
    return out;
  }
}

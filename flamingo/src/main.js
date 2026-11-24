// Boot: canvas scaling, fixed-timestep loop, keyboard, mouse and touch input.
import { Game } from './game.js';
import { Audio } from '../../src/audio.js';
import { VIEW } from './city.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const stage = document.getElementById('stage');

const input = {
  held: new Set(), pressed: new Set(), any: false, px: VIEW.w / 2, py: VIEW.h / 2, pdown: false, click: false, mouseT: 9999, isTouch: false,
  // on-screen stick and two buttons, drawn by the game in the same pixels as everything else
  touch: {
    on: false, stick: null, use: false, fire: false,
    buttons: [
      { id: 'fire', x: VIEW.w - 30, y: VIEW.h - 36, r: 17, down: false, label: (g) => (g.player.car ? 'BRAKE' : 'FIRE') },
      { id: 'use', x: VIEW.w - 70, y: VIEW.h - 22, r: 13, down: false, label: () => 'E' },
    ],
  },
  down(code) { return this.held.has(code); },
  take(code) { const v = this.pressed.has(code); this.pressed.delete(code); return v; },
  endFrame() { this.pressed.clear(); this.any = false; this.click = false; this.mouseT++; },
};
const GAME_KEYS = /^(Arrow|Key[WASDEFJMP]$|Escape$|Space$|Enter$)/;
addEventListener('keydown', (e) => {
  if (GAME_KEYS.test(e.code)) e.preventDefault();
  input.held.add(e.code);
  if (!e.repeat) { input.pressed.add(e.code); input.any = true; }
});
addEventListener('keyup', (e) => input.held.delete(e.code));
addEventListener('blur', () => { input.held.clear(); input.pdown = false; });
addEventListener('contextmenu', (e) => e.preventDefault());

const toView = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * VIEW.w, ((e.clientY - r.top) / r.height) * VIEW.h]; };
const fingers = new Map();
addEventListener('pointerdown', (e) => {
  const [x, y] = toView(e);
  input.any = true; input.click = true;
  if (e.pointerType === 'touch') {
    const tp = input.touch; tp.on = true; input.isTouch = true;
    const b = tp.buttons.find((k) => Math.hypot(x - k.x, y - k.y) < k.r + 6);
    if (b) { b.down = true; fingers.set(e.pointerId, b); if (b.id === 'use') tp.use = true; else tp.fire = true; }
    else if (!tp.stick) { tp.stick = { ox: x, oy: y, dx: 0, dy: 0 }; fingers.set(e.pointerId, tp.stick); }
    return;
  }
  input.px = x; input.py = y; input.pdown = true; input.mouseT = 0;
});
addEventListener('pointermove', (e) => {
  const [x, y] = toView(e);
  if (e.pointerType === 'touch') {
    const s = fingers.get(e.pointerId);
    if (s && s === input.touch.stick) { const dx = (x - s.ox) / 18, dy = (y - s.oy) / 18, d = Math.hypot(dx, dy); s.dx = d > 1 ? dx / d : dx; s.dy = d > 1 ? dy / d : dy; }
    return;
  }
  input.px = x; input.py = y; input.mouseT = 0;
});
const lift = (e) => {
  if (e.pointerType === 'touch') {
    const s = fingers.get(e.pointerId); fingers.delete(e.pointerId);
    if (s === input.touch.stick) input.touch.stick = null;
    else if (s) { s.down = false; if (s.id === 'fire') input.touch.fire = false; }
    return;
  }
  input.pdown = false;
};
addEventListener('pointerup', lift);
addEventListener('pointercancel', lift);

// Whole-number scaling keeps pixels square; fall back to a fractional scale only when
// the nearest whole step would leave most of the window empty.
function fit() {
  const dpr = window.devicePixelRatio || 1, cs = getComputedStyle(stage);
  const availW = (stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * dpr;
  const availH = (stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) * dpr;
  const exact = Math.min(availW / VIEW.w, availH / VIEW.h);
  let s = Math.floor(exact);
  if (s < 1 || s / exact < 0.72) s = exact;
  canvas.style.width = (VIEW.w * s) / dpr + 'px';
  canvas.style.height = (VIEW.h * s) / dpr + 'px';
}
addEventListener('resize', fit);
fit();

const audio = new Audio();
if (q.has('mute')) audio.muted = true;
const game = new Game(input, audio, { calm: matchMedia('(prefers-reduced-motion: reduce)').matches });
window.__game = game;

const unlock = () => audio.unlock();
addEventListener('keydown', unlock);
addEventListener('pointerdown', unlock);
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play') game.state = 'pause'; });

const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  if (input.take('KeyF') && game.state !== 'play') {
    try { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); } catch { /* not available here */ }
  }
  let n = 0;
  while (acc >= STEP && n < 4) { game.step(); input.endFrame(); acc -= STEP; n++; }
  if (n === 4) acc = 0;
  ctx.drawImage(game.render(), 0, 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

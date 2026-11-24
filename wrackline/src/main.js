// Boot: canvas scaling, fixed-timestep loop, keyboard and pointer input.
import { Game } from './game.js';
import { Audio } from '../../src/audio.js';
import { VIEW } from './beach.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const stage = document.getElementById('stage');

// Keys are tracked by code; the pointer doubles as "hold to walk there" and as the shop cursor.
const input = {
  held: new Set(), pressed: new Set(), any: false, px: -99, py: -99, pdown: false, click: false,
  down(code) { return this.held.has(code); },
  take(code) { const v = this.pressed.has(code); this.pressed.delete(code); return v; },
  endFrame() { this.pressed.clear(); this.any = false; this.click = false; },
};
const GAME_KEYS = /^(Arrow|Key[WASDMFPN]$|Digit[1-9]$|Numpad[1-9]$|Escape$|Space$|Enter$)/;
addEventListener('keydown', (e) => {
  if (GAME_KEYS.test(e.code)) e.preventDefault();
  input.held.add(e.code);
  if (!e.repeat) { input.pressed.add(e.code); input.any = true; }
});
addEventListener('keyup', (e) => input.held.delete(e.code));
addEventListener('blur', () => { input.held.clear(); input.pdown = false; });
const toView = (e) => {
  const r = canvas.getBoundingClientRect();
  input.px = ((e.clientX - r.left) / r.width) * VIEW.w; input.py = ((e.clientY - r.top) / r.height) * VIEW.h;
};
addEventListener('pointerdown', (e) => { toView(e); input.pdown = true; input.click = true; input.any = true; });
addEventListener('pointermove', toView);
const lift = (e) => { input.pdown = false; if (e.pointerType === 'touch') { input.px = -99; input.py = -99; } };
addEventListener('pointerup', lift);
addEventListener('pointercancel', lift);
addEventListener('contextmenu', (e) => e.preventDefault());

// Largest whole-number scale that fits, measured in device pixels so it stays crisp.
function fit() {
  const dpr = window.devicePixelRatio || 1, cs = getComputedStyle(stage);
  const availW = (stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * dpr;
  const availH = (stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) * dpr;
  let s = Math.floor(Math.min(availW / VIEW.w, availH / VIEW.h));
  if (s < 1) s = Math.min(availW / VIEW.w, availH / VIEW.h);
  canvas.style.width = (VIEW.w * s) / dpr + 'px';
  canvas.style.height = (VIEW.h * s) / dpr + 'px';
}
addEventListener('resize', fit);
fit();

const audio = new Audio();
if (q.has('mute')) audio.muted = true;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const game = new Game(input, audio, { calm });
window.__game = game;

// When the host page can hand state across a reload, pick up where the player left off.
const hot = window.claude && window.claude.hot;
try { if (hot && hot.snapshot) hot.snapshot(() => ({ save: game.save() })); } catch { /* optional */ }
const resume = (data) => { try { if (data && data.save && game.load(data.save)) { game.hasSave = true; } } catch { /* start fresh */ } };
if (hot && hot.ready) { try { hot.ready(resume); } catch { /* optional */ } } else resume(hot && hot.data);

const unlock = () => audio.unlock();
addEventListener('keydown', unlock);
addEventListener('pointerdown', unlock);
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play') game.state = 'pause'; });

const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  if (input.take('KeyF')) {
    try { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); } catch { /* not available here */ }
  }
  let n = 0;
  while (acc >= STEP && n < 4) { game.step(); input.endFrame(); acc -= STEP; n++; }
  if (n === 4) acc = 0;
  ctx.drawImage(game.render(), 0, 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

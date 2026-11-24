// Boot: canvas scaling, fixed-timestep loop, input and audio unlock.
import { Game } from './game/game.js';
import { Input, mountTouch } from './game/input.js';
import { Audio } from './audio.js';
import { VIEW_W, VIEW_H } from './gfx/art-bg.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const stage = document.getElementById('stage');

const input = new Input(window);
const audio = new Audio();
const touchEl = mountTouch(input, document.body);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

// Largest whole-number scale that fits, measured in device pixels so it stays crisp.
function fit() {
  const dpr = window.devicePixelRatio || 1;
  const cs = getComputedStyle(stage);
  const availW = (stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * dpr;
  const availH = (stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) * dpr;
  let s = Math.floor(Math.min(availW / VIEW_W, availH / VIEW_H));
  if (s < 1) s = Math.min(availW / VIEW_W, availH / VIEW_H);
  canvas.style.width = (VIEW_W * s) / dpr + 'px';
  canvas.style.height = (VIEW_H * s) / dpr + 'px';
}
addEventListener('resize', fit);
fit();

if (q.has('mute')) audio.muted = true;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const game = new Game(input, audio, { start: q.get('start'), god: q.has('god'), calm });
window.__game = game;

// When the host page can hand state across a reload, resume from the last campfire.
const hot = window.claude && window.claude.hot;
try { if (hot && hot.snapshot) hot.snapshot(() => ({ save: game.save() })); } catch { /* optional */ }
const resume = (data) => { try { if (data && data.save) game.load(data.save); } catch { /* start fresh */ } };
if (hot && hot.ready) { try { hot.ready(resume); } catch { /* optional */ } } else resume(hot && hot.data);

const unlock = () => audio.unlock();
addEventListener('keydown', unlock);
addEventListener('pointerdown', (e) => { unlock(); input.anyPressed = true; if (e.pointerType === 'touch') { input.touch = true; document.body.classList.add('touch'); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play') game.state = 'pause'; });

const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  input.poll();
  if (input.take('fullscreen')) {
    const el = document.documentElement;
    try { (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen()).catch(() => {}); } catch { /* not available here */ }
  }
  let n = 0;
  while (acc >= STEP && n < 4) { game.step(); input.endFrame(); acc -= STEP; n++; }
  if (n === 4) acc = 0;
  ctx.drawImage(game.render(), 0, 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = true;

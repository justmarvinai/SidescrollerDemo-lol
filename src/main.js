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
  const availW = stage.clientWidth * dpr, availH = stage.clientHeight * dpr;
  let s = Math.floor(Math.min(availW / VIEW_W, availH / VIEW_H));
  if (s < 1) s = Math.min(availW / VIEW_W, availH / VIEW_H);
  canvas.style.width = (VIEW_W * s) / dpr + 'px';
  canvas.style.height = (VIEW_H * s) / dpr + 'px';
}
addEventListener('resize', fit);
fit();

const game = new Game(input, audio, { start: q.get('start'), god: q.has('god') });
window.__game = game;
if (q.has('mute')) audio.muted = true;

const unlock = () => audio.unlock();
addEventListener('keydown', unlock);
addEventListener('pointerdown', (e) => { unlock(); input.anyPressed = true; if (e.pointerType === 'touch') { input.touch = true; document.body.classList.add('touch'); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play') game.state = 'pause'; });

const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  input.poll();
  let n = 0;
  while (acc >= STEP && n < 4) { game.step(); input.endFrame(); acc -= STEP; n++; }
  if (n === 4) acc = 0;
  ctx.drawImage(game.render(), 0, 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = true;

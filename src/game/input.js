// Keyboard, gamepad and touch -> a small set of named actions.
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump',
  KeyJ: 'attack', KeyX: 'attack',
  KeyL: 'dash', KeyC: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash',
  KeyK: 'spell', KeyV: 'spell',
  KeyE: 'interact', Enter: 'interact',
  KeyQ: 'potion', KeyH: 'potion',
  Escape: 'pause', KeyP: 'pause', KeyM: 'mute', KeyF: 'fullscreen',
};
const PAD = { 0: 'jump', 2: 'attack', 1: 'dash', 3: 'spell', 4: 'interact', 5: 'potion', 9: 'pause', 14: 'left', 15: 'right', 12: 'up', 13: 'down' };

export class Input {
  constructor(target = window) {
    this.held = {}; this.pressed = {}; this.src = {};
    this.anyPressed = false; this.touch = false;
    target.addEventListener('keydown', (e) => {
      const a = KEYS[e.code];
      if (a) { e.preventDefault(); if (!e.repeat) this.set('k' + e.code, a, true); }
      if (!e.repeat) this.anyPressed = true;
    });
    target.addEventListener('keyup', (e) => { const a = KEYS[e.code]; if (a) { e.preventDefault(); this.set('k' + e.code, a, false); } });
    target.addEventListener('blur', () => { this.src = {}; this.held = {}; });
  }
  set(source, action, on) {
    const s = this.src[action] || (this.src[action] = new Set());
    const was = s.size > 0;
    if (on) s.add(source); else s.delete(source);
    this.held[action] = s.size > 0;
    if (on && !was) { this.pressed[action] = true; this.anyPressed = true; }
  }
  // call once per rendered frame, before simulation steps
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      for (const k in PAD) this.set('g' + k, PAD[k], !!(p.buttons[k] && p.buttons[k].pressed));
      this.set('gax-', 'left', p.axes[0] < -0.4); this.set('gax+', 'right', p.axes[0] > 0.4);
      this.set('gay-', 'up', p.axes[1] < -0.6); this.set('gay+', 'down', p.axes[1] > 0.6);
      break;
    }
  }
  down(a) { return !!this.held[a]; }
  hit(a) { return !!this.pressed[a]; }
  // consume a press so two systems don't both react to it
  take(a) { const v = !!this.pressed[a]; this.pressed[a] = false; return v; }
  endFrame() { this.pressed = {}; this.anyPressed = false; }
}

// On-screen buttons for phones and tablets.
export function mountTouch(input, root) {
  const el = document.createElement('div');
  el.id = 'touch';
  el.innerHTML = `
    <div class="pad"><button data-a="left">&#9664;</button><button data-a="right">&#9654;</button></div>
    <div class="mid"><button data-a="interact" class="sm">E</button><button data-a="potion" class="sm">&#9829;</button><button data-a="pause" class="sm">II</button></div>
    <div class="act"><button data-a="spell" class="b3">&#10022;</button><button data-a="dash" class="b2">&#187;</button><button data-a="attack" class="b1">&#9876;</button><button data-a="jump" class="b0">&#9650;</button></div>`;
  root.appendChild(el);
  const ids = new Map();
  const at = (t) => { const b = document.elementFromPoint(t.clientX, t.clientY); return b && b.dataset && b.dataset.a ? b : null; };
  const sync = (e) => {
    e.preventDefault();
    input.touch = true;
    const now = new Map();
    for (const t of e.touches) { const b = at(t); if (b) now.set(t.identifier, b.dataset.a); }
    for (const [id, a] of ids) if (now.get(id) !== a) { input.set('t' + id, a, false); el.querySelector(`[data-a="${a}"]`).classList.remove('on'); }
    for (const [id, a] of now) if (ids.get(id) !== a) { input.set('t' + id, a, true); el.querySelector(`[data-a="${a}"]`).classList.add('on'); }
    ids.clear(); for (const [id, a] of now) ids.set(id, a);
  };
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) el.addEventListener(ev, sync, { passive: false });
  return el;
}

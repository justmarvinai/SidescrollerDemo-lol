// Pixel-art lighting: an ambient colour multiplied over the playfield, with
// banded, dithered light pools punched into it, plus an additive glow pass.
import { makeCanvas, ctx2d, bayer } from './pixel.js';
import { rgbOf } from './palette.js';

const sprites = new Map();

// Banded radial falloff with ordered dither between the bands.
function lightSprite(r, color, steps = 5, power = 1.6) {
  const key = r + color + steps + power;
  let c = sprites.get(key);
  if (c) return c;
  c = makeCanvas(r * 2, r * 2);
  const g = ctx2d(c), img = g.createImageData(r * 2, r * 2), d = img.data;
  const [R, G, B] = rgbOf(color);
  for (let y = 0; y < r * 2; y++)
    for (let x = 0; x < r * 2; x++) {
      const dist = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      if (dist >= 1) continue;
      const v = Math.pow(1 - dist, power) * steps;
      const lo = Math.floor(v), f = v - lo;
      const lvl = (lo + (f > bayer(x, y) ? 1 : 0)) / steps;
      const i = (y * r * 2 + x) * 4;
      d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = Math.round(Math.min(1, lvl) * 255);
    }
  g.putImageData(img, 0, 0);
  sprites.set(key, c);
  return c;
}

export class Lighting {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.map = makeCanvas(w, h); this.mg = ctx2d(this.map);
    this.tmp = makeCanvas(w, h); this.tg = ctx2d(this.tmp);
    this.list = [];
  }
  begin(ambient) {
    const g = this.mg;
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = ambient; g.fillRect(0, 0, this.w, this.h);
    this.list.length = 0;
  }
  // x,y in screen space
  add(x, y, r, color, intensity = 1, glow = 0) {
    if (x < -r || y < -r || x > this.w + r || y > this.h + r) return;
    r = Math.max(4, Math.round(r / 2) * 2);
    this.list.push({ x, y, r, color, intensity, glow });
  }
  finish() {
    const g = this.mg;
    g.globalCompositeOperation = 'lighter';
    for (const l of this.list) {
      g.globalAlpha = Math.min(1, l.intensity);
      g.drawImage(lightSprite(l.r, l.color), Math.round(l.x - l.r), Math.round(l.y - l.r));
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  // multiply the light map over a layer, respecting the layer's alpha
  apply(layerCanvas, layerCtx) {
    const t = this.tg;
    t.globalCompositeOperation = 'copy';
    t.drawImage(this.map, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(layerCanvas, 0, 0);
    layerCtx.globalCompositeOperation = 'multiply';
    layerCtx.drawImage(this.tmp, 0, 0);
    layerCtx.globalCompositeOperation = 'source-over';
  }
  // soft additive halos on the final image
  glow(g, amount) {
    if (amount <= 0.01) return;
    g.globalCompositeOperation = 'lighter';
    for (const l of this.list) {
      if (!l.glow) continue;
      const r = Math.max(4, Math.round(l.glow / 2) * 2);
      g.globalAlpha = Math.min(1, 0.55 * amount * l.intensity);
      g.drawImage(lightSprite(r, l.color, 3, 1.2), Math.round(l.x - r), Math.round(l.y - r));
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}

// Sprite sheet viewer. ?only=<section>&zoom=<n>&bg=<hex without #>
import { P } from './gfx/palette.js';
import { makeCanvas, ctx2d } from './gfx/pixel.js';
import { drawText } from './gfx/font.js';

const q = new URLSearchParams(location.search);
const zoom = +(q.get('zoom') || 5);
const only = q.get('only');
const cols = +(q.get('w') || 300);

const sections = [];
export function section(name, items) { sections.push({ name, items }); }

async function load() {
  const mods = ['./gfx/art-hero.js', './gfx/art-chars.js', './gfx/art-props.js', './gfx/art-bg.js', './gfx/terrain.js', './gfx/ui.js'];
  for (const m of mods) {
    try { const mod = await import(m); if (mod.gallery) mod.gallery(section); }
    catch (e) { if (!/Failed to fetch|404|not found/i.test(String(e))) console.error(m, e); }
  }
  section('font', [{ label: 'main', draw: (g) => {
    drawText(g, 'The quick brown fox jumps over the lazy dog.', 2, 2, { shadow: P.ink });
    drawText(g, 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG!', 2, 14, { color: P.y4, shadow: P.ink });
    drawText(g, "0123456789 +-*/=%#&()[]<>?!:;,.'\"_~ ♥★▶▼", 2, 26, { color: P.u6, outline: P.ink });
  }, w: 250, h: 40 }]);
  render();
}

function render() {
  const list = sections.filter((s) => !only || only.split(',').includes(s.name));
  // layout in the low-res space, then scale the whole sheet
  let y = 4; const place = [];
  for (const s of list) {
    place.push({ title: s.name, x: 4, y }); y += 12;
    let x = 4, rowH = 0;
    for (const it of s.items) {
      const w = it.w || it.canvas.width, h = it.h || it.canvas.height;
      if (x + w + 4 > cols) { x = 4; y += rowH + 12; rowH = 0; }
      place.push({ it, x, y, w, h });
      x += Math.max(w, (it.label || '').length * 4) + 6; rowH = Math.max(rowH, h);
    }
    y += rowH + 16;
  }
  const lo = makeCanvas(cols, y), g = ctx2d(lo);
  g.fillStyle = '#' + (q.get('bg') || '2c763b'); g.fillRect(0, 0, cols, y);
  // a darker strip on the right half, to judge readability on both
  g.fillStyle = '#' + (q.get('bg2') || '1b2a4a'); g.fillRect(cols / 2, 0, cols / 2, y);
  for (const p of place) {
    if (p.title) { drawText(g, '- ' + p.title + ' -', p.x, p.y, { color: P.y5, shadow: P.ink }); continue; }
    if (p.it.canvas) g.drawImage(p.it.canvas, p.x, p.y);
    else { g.save(); g.translate(p.x, p.y); p.it.draw(g); g.restore(); }
    if (p.it.label) drawText(g, p.it.label, p.x, p.y + p.h + 1, { color: P.n7, shadow: P.ink });
  }
  const out = document.getElementById('sheet');
  out.width = cols * zoom; out.height = y * zoom;
  const og = ctx2d(out); og.drawImage(lo, 0, 0, out.width, out.height);
  document.title = 'gallery ' + out.width + 'x' + out.height;
  window.__ready = true;
}
load();

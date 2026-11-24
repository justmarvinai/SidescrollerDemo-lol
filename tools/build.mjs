// Bundles each demo into one self-contained HTML file under dist/.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const games = [
  { name: 'mosslight', entry: 'src/main.js', css: 'src/style.css', title: 'Mosslight', hosted: 'Mosslight Pixel RPG' },
  { name: 'wrackline', entry: 'wrackline/src/main.js', css: 'wrackline/style.css', title: 'Wrackline', hosted: 'Wrackline Beachcomber' },
  { name: 'flamingo', entry: 'flamingo/src/main.js', css: 'flamingo/style.css', title: 'Flamingo Drive', hosted: 'Flamingo Drive', w: 384, h: 216 },
];

await mkdir(resolve(root, 'dist'), { recursive: true });
for (const g of games) {
  const out = await build({ entryPoints: [resolve(root, g.entry)], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false });
  const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  const css = await readFile(resolve(root, g.css), 'utf8');
  const body = `<div id="stage"><canvas id="game" width="${g.w || 320}" height="${g.h || 180}"></canvas></div>\n<script>${js}</script>\n`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>${g.title}</title>
<style>${css}</style>
</head>
<body>
${body}</body>
</html>
`;
  await writeFile(resolve(root, `dist/${g.name}.html`), html);
  // Same game as a body fragment, for hosts that supply their own <html> wrapper.
  await writeFile(resolve(root, `dist/${g.name}.fragment.html`), `<title>${g.hosted}</title>\n<style>${css}</style>\n${body}`);
  console.log(`dist/${g.name}.html  ${(html.length / 1024).toFixed(1)} kB`);
}

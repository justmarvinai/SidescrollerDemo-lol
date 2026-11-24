// Bundles the whole game into one self-contained HTML file: dist/mosslight.html
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = await build({ entryPoints: [resolve(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false });
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = await readFile(resolve(root, 'src/style.css'), 'utf8');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>Mosslight</title>
<style>${css}</style>
</head>
<body>
<div id="stage"><canvas id="game" width="320" height="180"></canvas></div>
<script>${js}</script>
</body>
</html>
`;
await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/mosslight.html'), html);
console.log(`dist/mosslight.html  ${(html.length / 1024).toFixed(1)} kB`);

// Same game as a body fragment, for hosts that supply their own <html> wrapper.
const fragment = `<title>Mosslight Pixel RPG</title>
<style>${css}</style>
<div id="stage"><canvas id="game" width="320" height="180"></canvas></div>
<script>${js}</script>
`;
await writeFile(resolve(root, 'dist/mosslight.fragment.html'), fragment);

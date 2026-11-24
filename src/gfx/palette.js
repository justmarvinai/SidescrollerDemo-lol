// Master palette. Every pixel in the game comes from these ramps.
// Ramps are hue-shifted: shadows drift toward indigo, highlights toward yellow.

export const RAMPS = {
  n: ['#0e0b16', '#1b1726', '#2b2839', '#423f55', '#5f5f78', '#85889c', '#b0b6c2', '#dadfe2', '#f6f8f4'],
  sk: ['#5e2b33', '#9c4a44', '#cf7d5c', '#eeaf85', '#fbd9b3'],
  r: ['#3a0f28', '#6b1730', '#a32532', '#d6452f', '#f07a3c'],
  y: ['#b0401e', '#e2701f', '#f6a52a', '#fbd04a', '#fff09a', '#fffbdd'],
  b: ['#21141b', '#372026', '#54302b', '#774633', '#a0663d', '#c58f57', '#e2bf88'],
  g: ['#0e2528', '#143b36', '#1c5539', '#2c763b', '#4f9a38', '#86bf3c', '#c3df62'],
  t: ['#0c1e30', '#123447', '#1b5462', '#2a7f7c', '#4fb096', '#96dab5'],
  u: ['#111433', '#1a2356', '#243c8c', '#3767c2', '#579be4', '#8fcdf4', '#d2f0fb'],
  p: ['#22123a', '#3a1c5a', '#602d8c', '#8b45bb', '#ba74e2', '#e3b5f8'],
  m: ['#77285a', '#b53c6d', '#e56780', '#f6a097', '#fcd2bf'],
};

// P: name -> hex, C: name -> palette index (index 0 is transparent)
export const P = {};
export const C = {};
export const PAL = [null];
export const DARKER = [0]; // index -> index two steps down its ramp (for selective outlines)
export const DARK1 = [0];  // index -> index one step down
export const LIGHT1 = [0]; // index -> index one step up

for (const [name, ramp] of Object.entries(RAMPS)) {
  const base = PAL.length;
  ramp.forEach((hex, i) => {
    const key = name === 'n' ? (i === 0 ? 'ink' : i === 8 ? 'white' : 'n' + i) : name + (i + 1);
    P[key] = hex;
    C[key] = PAL.length;
    PAL.push(hex);
    DARKER.push(i >= 2 ? base + i - 2 : 1);
    DARK1.push(i >= 1 ? base + i - 1 : 1);
    LIGHT1.push(i < ramp.length - 1 ? base + i + 1 : base + i);
  });
}
DARKER[1] = 1; DARK1[1] = 1;

// Sixteen free "slot" indices used by parallax layers; they get real colours per mood.
export const SLOT0 = PAL.length;
for (let i = 0; i < 24; i++) { C['s' + i] = PAL.length; PAL.push('#ff00ff'); DARKER.push(1); DARK1.push(1); LIGHT1.push(1); }

export function hexToInt(hex) {
  const n = parseInt(hex.slice(1), 16);
  // little-endian ABGR for Uint32 views over ImageData
  return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255);
}

export function makeLUT(overrides) {
  const lut = new Uint32Array(256);
  for (let i = 1; i < PAL.length; i++) lut[i] = hexToInt(PAL[i]);
  if (overrides) for (const k in overrides) lut[k] = hexToInt(overrides[k]);
  return lut;
}
export const LUT = makeLUT();

export function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function toHex(r, g, b) {
  return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}
export function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

// util.js — small deterministic helpers shared by every San Verano module.
// No external dependency; everything here is written for this game.

// Deterministic seeded random generator (mulberry32) so the city, traffic and
// staged screenshots look the same on every load with the same seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Shortest signed angle difference, wrapped to [-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
// Pick a value from an array with the seeded rng.
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Canvas texture helper: draw with a callback, get a THREE.CanvasTexture back.
// The THREE global is provided by the vendored three.min.js classic script.
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Neon sign texture: glowing text on a dark plate, used on building fronts.
export function neonSignTexture(text, color) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#0a0a14'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.font = 'bold 30px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 1);
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2 + 1);
  });
}

// Building facade texture: lit windows on a warm wall, drawn per building.
export function facadeTexture(rng, base, lit) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cols = 4, rows = 10;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const on = rng() < 0.55;
        g.fillStyle = on ? lit : '#1c2436';
        g.fillRect(10 + x * 30, 12 + y * 24, 18, 13);
      }
    }
  });
}

// Road texture: asphalt with a dashed centre line and edge lines.
export function roadTexture(horizontal) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#23242c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5d76e';
    if (horizontal) { for (let x = 0; x < w; x += 32) g.fillRect(x, h / 2 - 2, 18, 4); }
    else { for (let y = 0; y < h; y += 32) g.fillRect(w / 2 - 2, y, 4, 18); }
    g.fillStyle = '#c8ccd4';
    if (horizontal) { g.fillRect(0, 4, w, 2); g.fillRect(0, h - 6, w, 2); }
    else { g.fillRect(4, 0, 2, h); g.fillRect(w - 6, 0, 2, h); }
  });
}

import * as THREE from "three";

/**
 * Procedurally generated texture maps (original code, no third-party assets).
 * Textures are immutable once created, so they are cached and shared between
 * materials; materials themselves are never shared.
 */

const cache = new Map<string, THREE.Texture>();

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(size: number, cells: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = smooth(fx - x0);
      const ty = smooth(fy - y0);
      const w = (ix: number, iy: number) => hash(((ix % cells) + cells) % cells, ((iy % cells) + cells) % cells, seed);
      const a = w(x0, y0) + (w(x0 + 1, y0) - w(x0, y0)) * tx;
      const b = w(x0, y0 + 1) + (w(x0 + 1, y0 + 1) - w(x0, y0 + 1)) * tx;
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/** Fine orange-peel noise for powder coat, as a tangent-space normal map. */
export function powderCoatNormal(): THREE.Texture {
  const key = "powderCoatNormal";
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 256;
  const h = new Float32Array(size * size);
  for (const [cells, amp, seed] of [[16, 0.55, 1], [48, 0.3, 2], [128, 0.15, 3]] as const) {
    const n = valueNoise(size, cells, seed);
    for (let i = 0; i < h.length; i++) h[i] += n[i] * amp;
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace; // linear data
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Brushed-metal roughness streaks running along U (texture X). */
export function brushedRoughness(): THREE.Texture {
  const key = "brushedRoughness";
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    // Each row is one streak; low-frequency drift along X keeps it organic.
    const rowBase = hash(0, y, 7);
    for (let x = 0; x < size; x++) {
      const drift = valueNoise1(x, y);
      const v = 0.78 + (rowBase - 0.5) * 0.35 + (drift - 0.5) * 0.12;
      const g = Math.max(0, Math.min(1, v)) * 255;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = g; // roughnessMap reads G
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

function valueNoise1(x: number, y: number): number {
  const cell = 32;
  const x0 = Math.floor(x / cell);
  const t = x / cell - x0;
  const a = hash(x0, y, 11);
  const b = hash(x0 + 1, y, 11);
  return a + (b - a) * t * t * (3 - 2 * t);
}

export function disposeTextureCache(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

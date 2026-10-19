import * as THREE from "three";

/**
 * In the post-processing path the background is tone mapped together with
 * the scene (OutputPass), so a flat background colour comes out darker than
 * specified. This finds the linear value that the tone curve maps back to
 * the requested colour, so the background matches with post on or off.
 *
 * Both curves preserve the neutral axis (all matrix rows sum to 1), so each
 * channel is inverted independently along that axis — exact for greys, a
 * close approximation for near-neutral colours.
 */

const AGX_MIN = -12.47393;
const AGX_MAX = 4.026069;

function agxContrast(x: number): number {
  const x2 = x * x;
  const x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

export function agxNeutral(v: number, exposure: number): number {
  const e = Math.max(v * exposure, 1e-10);
  const t = Math.min(Math.max((Math.log2(e) - AGX_MIN) / (AGX_MAX - AGX_MIN), 0), 1);
  return Math.min(Math.max(Math.pow(Math.max(agxContrast(t), 0), 2.2), 0), 1);
}

export function acesNeutral(v: number, exposure: number): number {
  const x = (v * exposure) / 0.6;
  const a = x * (x + 0.0245786) - 0.000090537;
  const b = x * (0.983729 * x + 0.432951) + 0.238081;
  return Math.min(Math.max(a / b, 0), 1);
}

function invert(f: (v: number) => number, target: number): number {
  let lo = 0;
  let hi = 256;
  if (f(hi) < target) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Linear colour that tone maps to `hex` (sRGB) under the given curve and exposure. */
export function precompensate(hex: string, curve: THREE.ToneMapping, exposure: number): THREE.Color {
  const target = new THREE.Color(hex); // linear working space
  const f = curve === THREE.ACESFilmicToneMapping ? (v: number) => acesNeutral(v, exposure) : (v: number) => agxNeutral(v, exposure);
  const out = new THREE.Color();
  out.r = invert(f, target.r);
  out.g = invert(f, target.g);
  out.b = invert(f, target.b);
  return out;
}

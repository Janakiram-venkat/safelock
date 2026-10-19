import * as THREE from "three";
import type { Spec } from "../spec/dimensions";
import { materials as M } from "../spec/materials";
import { sineInOut } from "./easing";

export type GlassMode = "transparent" | "opaque";

/** PDLC switching: 0 = transparent, 1 = opaque, eased over the spec duration. */
export class SmartGlassController {
  value = 0;
  private from = 0;
  private to = 0;
  private elapsed = 0;

  constructor(private readonly s: Spec) {}

  get mode(): GlassMode {
    return this.to >= 0.5 ? "opaque" : "transparent";
  }

  set(mode: GlassMode, immediate = false): void {
    const target = mode === "opaque" ? 1 : 0;
    if (immediate) {
      this.value = this.from = this.to = target;
      this.elapsed = Infinity;
      return;
    }
    if (target === this.to) return;
    this.from = this.value;
    this.to = target;
    this.elapsed = 0;
  }

  get transitioning(): boolean {
    return this.value !== this.to;
  }

  update(dtMs: number): void {
    if (!this.transitioning) return;
    this.elapsed += dtMs;
    const dur = this.s.timing.smartGlassTransition.value * Math.abs(this.to - this.from);
    const p = dur > 0 ? Math.min(this.elapsed / dur, 1) : 1;
    this.value = p >= 1 ? this.to : this.from + (this.to - this.from) * sineInOut(p);
  }
}

const tA = new THREE.Color();
const tB = new THREE.Color();

/** Interpolate the physical glass parameters between the two spec states. */
export function applyGlass(material: THREE.MeshPhysicalMaterial, value: number): void {
  const a = M.smartGlass.transparent;
  const b = M.smartGlass.opaque;
  const lerp = (x: number, y: number) => x + (y - x) * value;
  material.transmission = lerp(a.transmission, b.transmission);
  material.roughness = lerp(a.roughness, b.roughness);
  material.ior = lerp(a.ior, b.ior);
  // Attenuation distance spans orders of magnitude; interpolate in log space.
  material.attenuationDistance = Math.exp(lerp(Math.log(a.attenuationDistance), Math.log(b.attenuationDistance)));
  material.color.copy(tA.set(a.color)).lerp(tB.set(b.color), value);
  material.attenuationColor.copy(tA.set(a.attenuationColor)).lerp(tB.set(b.attenuationColor), value);
}

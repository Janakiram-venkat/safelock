import * as THREE from "three";
import { mm } from "../spec/dimensions";
import type { Spec } from "../spec/dimensions";
import { derive } from "../spec/derived";

/**
 * Cutaway: a clipping plane removing everything at X greater than the cut,
 * so the chamber and electronics bay are visible from the latch side.
 * amount 0 = no cut, 1 = cut through the centre line.
 */
export class Cutaway {
  readonly plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10);
  amount = 0;
  private readonly halfW: number;

  constructor(s: Spec) {
    this.halfW = mm(derive(s).W / 2);
  }

  /** Assign the plane to every material under root (call after each rebuild). */
  attach(root: THREE.Object3D): void {
    root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        m.clippingPlanes = [this.plane];
        m.clipShadows = true;
      }
    });
  }

  set(t: number): void {
    this.amount = Math.min(Math.max(t, 0), 1);
    // Keeps points with −x + c ≥ 0, i.e. x ≤ c.
    this.plane.constant = this.amount === 0 ? 10 : this.halfW * (1 - this.amount) + mm(0.5) * (1 - this.amount);
  }
}

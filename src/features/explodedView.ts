import * as THREE from "three";
import { mm } from "../spec/dimensions";
import type { Spec } from "../spec/dimensions";

interface Entry {
  obj: THREE.Object3D;
  base: THREE.Vector3;
  offset: THREE.Vector3;
}

/**
 * Exploded view: every object tagged with userData.explode (mm, in its
 * parent's space) moves along that offset. Assembled positions are stored
 * once and restored exactly (copy, not arithmetic) at t = 0.
 */
export class ExplodedView {
  private readonly entries: Entry[] = [];
  amount = 0;

  constructor(root: THREE.Object3D, private readonly s: Spec) {
    root.traverse((o) => {
      const e = o.userData.explode as [number, number, number] | undefined;
      if (!e || (e[0] === 0 && e[1] === 0 && e[2] === 0)) return;
      this.entries.push({ obj: o, base: o.position.clone(), offset: new THREE.Vector3(mm(e[0]), mm(e[1]), mm(e[2])) });
    });
  }

  get count(): number {
    return this.entries.length;
  }

  set(t: number): void {
    this.amount = Math.min(Math.max(t, 0), 1);
    const k = this.amount * this.s.explode.distance.value;
    for (const e of this.entries) {
      if (this.amount === 0) e.obj.position.copy(e.base);
      else e.obj.position.copy(e.base).addScaledVector(e.offset, k);
    }
  }
}

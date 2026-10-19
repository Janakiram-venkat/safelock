import * as THREE from "three";
import type { Spec } from "../spec/dimensions";
import { derive } from "../spec/derived";
import { powderCoat, zincScrew } from "../materials";
import { group, rbox, cyl, at, explode, named } from "./util";

/**
 * Removable folded-sheet shelves (top plate + four folded lips) resting on
 * steel support pins pressed into the side walls.
 */
export function build(s: Spec): THREE.Group {
  const d = derive(s);
  const sh = s.shelves;
  const t = sh.plateThickness.value;
  const lip = sh.lipDepth.value;
  const x0 = d.inner.min[0] + sh.sideClearance.value;
  const x1 = d.inner.max[0] - sh.sideClearance.value;
  const z0 = sh.rearZ.value;
  const z1 = sh.frontZ.value;
  const w = x1 - x0;
  const depth = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const bend = Math.min(t * 0.9, 1.2);

  const out = group("shelves");
  sh.topY.value.forEach((top, i) => {
    const plate = named(rbox([w, t, depth], powderCoat(), bend), "shelfPlate");
    at(plate, [cx, top - t / 2, cz]);
    const front = rbox([w, lip, t], powderCoat(), bend);
    at(front, [cx, top - lip / 2, z1 - t / 2]);
    const back = rbox([w, lip, t], powderCoat(), bend);
    at(back, [cx, top - lip / 2, z0 + t / 2]);
    const sideL = rbox([t, lip, depth - 2 * t], powderCoat(), bend);
    at(sideL, [x0 + t / 2, top - lip / 2, cz]);
    const sideR = rbox([t, lip, depth - 2 * t], powderCoat(), bend);
    at(sideR, [x1 - t / 2, top - lip / 2, cz]);
    const shelf = explode(group(`shelf${i}`, plate, front, back, sideL, sideR), s.explode.shelves.value);

    const pins = group(`shelf${i}Pins`);
    const pr = sh.pinDiameter.value / 2;
    const py = top - lip - pr;
    for (const side of [-1, 1]) {
      for (const z of sh.pinZ.value) {
        const pin = cyl(pr, sh.pinLength.value, zincScrew(), "x");
        const x = side < 0 ? d.inner.min[0] + sh.pinLength.value / 2 : d.inner.max[0] - sh.pinLength.value / 2;
        pins.add(at(pin, [x, py, z]));
      }
    }
    out.add(shelf, pins);
  });
  return out;
}

export type ShelfGroup = THREE.Group;

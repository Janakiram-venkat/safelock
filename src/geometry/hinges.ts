import * as THREE from "three";
import type { Spec } from "../spec/dimensions";
import { derive } from "../spec/derived";
import { zincScrew, brushedMetal } from "../materials";
import { group, cyl, lathe, at, explode, named } from "./util";

/**
 * Concealed pivot hinges: a steel pin at the top and bottom of the door on
 * the hinge axis, running in flush bushings set into the top/bottom walls.
 * Returns the door-side pins (swing with the door) and the body-side bushings.
 */
export function build(s: Spec): { pins: THREE.Group; bushings: THREE.Group } {
  const d = derive(s);
  const pr = s.hinges.pinDiameter.value / 2;
  const br = s.hinges.bushingDiameter.value / 2;
  const embed = s.hinges.pinEmbedDoor.value;
  const { x, z } = d.pivot;

  const topLen = d.body.max[1] - (d.doorBox.max[1] - embed) - 0.2;
  const top = named(cyl(pr, topLen, zincScrew()), "hingePinTop");
  at(top, [x, d.doorBox.max[1] - embed + topLen / 2, z]);
  const botLen = d.doorBox.min[1] + embed - (d.body.min[1] + 0.2);
  const bottom = named(cyl(pr, botLen, zincScrew()), "hingePinBottom");
  at(bottom, [x, d.body.min[1] + 0.2 + botLen / 2, z]);

  const pins = group("hingePins",
    explode(group("hingeTop", top), s.explode.hingeTop.value),
    explode(group("hingeBottom", bottom), s.explode.hingeBottom.value),
  );

  // Flush bushings: a ring with a small chamfer, visible on the top/bottom faces.
  const t = d.t;
  const ring: [number, number][] = [[pr, 0], [br - 0.4, 0], [br, 0.4], [br, t], [pr, t]];
  const bTop = named(lathe(ring, brushedMetal()), "hingeBushingTop");
  bTop.rotation.x = Math.PI; // chamfer faces up
  at(bTop, [x, d.body.max[1] + 0.02, z]);
  const bBot = named(lathe(ring, brushedMetal()), "hingeBushingBottom");
  at(bBot, [x, d.body.min[1] - 0.02, z]);

  return { pins, bushings: group("hingeBushings", bTop, bBot) };
}

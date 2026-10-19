import * as THREE from "three";
import { mm, type Spec } from "../spec/dimensions";
import { derive, boxSize, boxCenter } from "../spec/derived";
import { brushedMetal, smartGlass } from "../materials";
import { group, extrudeZ, roundedRectShape, roundedRectHole, rbox, at, explode, named } from "./util";

/**
 * Door: brushed-metal frame (single profile, inset flush with the body front)
 * with the PDLC smart-glass pane captured in a rebate.
 *
 * The returned group is the hinge pivot ("door"): it sits on the hinge axis
 * and rotation.y opens the door. Children are in pivot-local coordinates.
 * Door-mounted parts from other files are attached to it by the assembly.
 */
export function build(s: Spec): THREE.Group {
  const d = derive(s);
  const db = d.doorBox;
  const [w, h] = boxSize(db);
  const [cx, cy] = boxCenter(db);

  const frameShape = roundedRectShape(w, h, s.door.frameEdgeRadius.value, cx, cy) as THREE.Shape;
  const win = d.window;
  frameShape.holes.push(roundedRectHole(win.maxX - win.minX, win.maxY - win.minY, s.door.glassEdgeRadius.value, (win.minX + win.maxX) / 2, (win.minY + win.maxY) / 2));
  const frame = named(extrudeZ(frameShape, db.min[2], db.max[2], brushedMetal()), "doorFrame");

  const g = d.glass;
  const glassMesh = named(rbox(boxSize(g), smartGlass(), s.door.glassEdgeRadius.value, 2), "smartGlass");
  at(glassMesh, boxCenter(g));
  glassMesh.castShadow = false; // PDLC transmits light into the chamber in both states
  const glass = explode(group("glass", glassMesh), s.explode.glass.value);

  const pivot = group("door");
  pivot.position.set(mm(d.pivot.x), 0, mm(d.pivot.z));
  const content = group("doorContent", frame, glass);
  content.position.set(-mm(d.pivot.x), 0, -mm(d.pivot.z));
  pivot.add(content);
  return explode(pivot, s.explode.door.value);
}

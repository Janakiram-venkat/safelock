import * as THREE from "three";
import { mm, type Spec } from "../spec/dimensions";
import { derive } from "../spec/derived";
import { rearScrewPositions } from "../spec/layout";
import { powderCoat, vent, zincScrew } from "../materials";
import { group, extrudeZ, roundedRectShape, roundedRectHole, instanced, explode, named, shadows, MIN_BEVEL, SEG } from "./util";

/**
 * Vault body: a hollow wrap-around steel shell (top, bottom, sides) plus a
 * separate rear panel. Wall thickness is real; the front is open for the door.
 */
export function build(s: Spec): THREE.Group {
  const d = derive(s);
  const R = s.body.edgeRadius.value;
  const cy = d.floorY + d.H / 2;

  // Shell tube: outer rounded rectangle minus the inner chamber section.
  const shape = roundedRectShape(d.W, d.H, R, 0, cy) as THREE.Shape;
  shape.holes.push(roundedRectHole(d.W - 2 * d.t, d.H - 2 * d.t, Math.max(R - d.t, MIN_BEVEL), 0, cy));
  const shell = named(extrudeZ(shape, d.inner.min[2], d.front, powderCoat(), s.body.edgeBevel.value), "shell");

  // Rear panel with cutouts for the Peltier module and the power inlet.
  const p = s.peltier;
  const pc = p.center.value;
  const panelShape = roundedRectShape(d.W, d.H, R, 0, cy) as THREE.Shape;
  const tecClear = p.tecSize.value[0] + 1;
  panelShape.holes.push(roundedRectHole(tecClear, tecClear, MIN_BEVEL, pc[0], pc[1]));
  const inlet = new THREE.Path();
  const [ix, iy] = s.powerInlet.centerXY.value;
  inlet.absarc(mm(ix), mm(iy), mm(s.powerInlet.bodyDiameter.value / 2), 0, Math.PI * 2, true);
  panelShape.holes.push(inlet);
  const panel = named(extrudeZ(panelShape, d.body.min[2], d.inner.min[2], powderCoat(), s.body.rearPanelSeam.value), "rearPanelSheet");

  // Electronics-bay vent slots (pill-shaped recesses), instanced.
  const v = s.rearVents;
  const slotGeo = pillGeometry(v.slotWidth.value, v.slotHeight.value, v.recess.value + 0.2);
  const slotPositions = Array.from({ length: v.count.value }, (_, i) => [
    v.firstX.value + i * v.pitch.value,
    v.centerY.value,
    d.body.min[2] + (v.recess.value + 0.2) / 2 - 0.1,
  ]);
  const vents = named(instanced(slotGeo, vent(), slotPositions), "rearVents");
  vents.castShadow = false;

  const rearPanel = explode(group("rearPanel", panel, vents, screws(s)), s.explode.rearPanel.value);
  return group("body", shell, rearPanel);
}

/** Pan-head screws with a cross recess on the rear panel (InstancedMesh). */
export function screws(s: Spec): THREE.Group {
  const d = derive(s);
  const r = s.rearScrews.headDiameter.value / 2;
  const h = s.rearScrews.headHeight.value;
  const profile: [number, number][] = [
    [0, 0], [r, 0], [r, h * 0.4], [r * 0.85, h * 0.78], [r * 0.5, h], [0, h],
  ];
  const headGeo = new THREE.LatheGeometry(profile.map(([a, b]) => new THREE.Vector2(mm(a), mm(b))), SEG());
  headGeo.rotateX(-Math.PI / 2); // head height points out of the rear face (−Z)
  const pts = rearScrewPositions(s).map(([x, y]) => [x, y, d.body.min[2]]);
  const heads = named(instanced(headGeo, zincScrew(), pts), "rearScrewHeads");

  const slotLen = r * 1.1;
  const recess = new THREE.BoxGeometry(mm(slotLen), mm(0.7), mm(0.8));
  const recess2 = recess.clone().rotateZ(Math.PI / 2);
  const crossPts = pts.map(([x, y, z]) => [x, y, z - h + 0.3]);
  const crossA = instanced(recess, vent(), crossPts);
  const crossB = instanced(recess2, vent(), crossPts);
  return shadows(group("rearScrews", heads, crossA, crossB));
}

/** Pill (stadium) prism, axis along Z, used for slots. */
export function pillGeometry(w: number, h: number, depth: number): THREE.BufferGeometry {
  const r = Math.min(w, h) / 2;
  const shape = roundedRectShape(w, h, r) as THREE.Shape;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: mm(depth), bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, -mm(depth) / 2);
  return geo;
}

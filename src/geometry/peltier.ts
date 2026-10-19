import * as THREE from "three";
import { mm, type Spec } from "../spec/dimensions";
import { components } from "../spec/layout";
import { aluminium, ceramic, plastic, powderCoat, vent, zincScrew } from "../materials";
import { group, rbox, cyl, at, explode, named, instanced, shadows, roundedRectShape, SEG } from "./util";
import type { Box } from "../spec/derived";
import { pillGeometry } from "./body";

/**
 * Thermoelectric unit, stacked on the Peltier axis (Z):
 * inner fan | inner heat sink | TEC (in the rear-wall cutout) | outer heat sink | outer fan,
 * with a vented steel shroud over the hot side on the rear exterior.
 * Fan rotors are named "fanRotor" so they can spin.
 */
export function build(s: Spec): THREE.Group {
  const comps = new Map(components(s).map((c) => [c.name, c.box]));
  const p = s.peltier;
  const get = (n: string) => comps.get(n)!;

  const tec = get("peltierTec");
  const tecMesh = named(rbox(size(tec), ceramic(), 0.5), "tec");
  at(tecMesh, center(tec));
  const sealant = rbox([size(tec)[0] + 0.6, size(tec)[1] + 0.6, 1.4], plastic("white"), 0.5);
  at(sealant, center(tec));

  const inner = group("peltierInner",
    heatSink(get("peltierInnerSink"), "innerSink", p.innerFinCount.value, p.sinkBaseThickness.value, p.finThickness.value, +1),
    fan(get("peltierInnerFan"), "innerFan", 1),
  );
  explode(inner, s.explode.peltierInner.value);

  const outer = group("peltierOuter",
    heatSink(get("peltierOuterSink"), "outerSink", p.outerFinCount.value, p.sinkBaseThickness.value, p.finThickness.value, -1),
    fan(get("peltierOuterFan"), "outerFan", -1),
    shroud(s, get("peltierShroud")),
  );
  explode(outer, s.explode.peltierOuter.value);

  return group("peltier", tecMesh, sealant, inner, outer);
}

const size = (b: Box): [number, number, number] => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
const center = (b: Box): [number, number, number] => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];

/** Base plate against the TEC, fins running vertically. dir = +1 fins toward +Z. */
function heatSink(b: Box, name: string, finCount: number, baseT: number, finT: number, dir: 1 | -1): THREE.Group {
  const [w, h, dd] = size(b);
  const c = center(b);
  const baseZ = dir > 0 ? b.min[2] + baseT / 2 : b.max[2] - baseT / 2;
  const base = named(rbox([w, h, baseT], aluminium(), 0.6), "sinkBase");
  at(base, [c[0], c[1], baseZ]);
  const finLen = dd - baseT;
  const finGeo = new THREE.BoxGeometry(mm(finT), mm(h - 1), mm(finLen));
  const pitch = (w - finT) / (finCount - 1);
  const finZ = dir > 0 ? b.min[2] + baseT + finLen / 2 : b.max[2] - baseT - finLen / 2;
  const pts = Array.from({ length: finCount }, (_, i) => [b.min[0] + finT / 2 + i * pitch, c[1], finZ]);
  const fins = named(instanced(finGeo, aluminium(), pts), "sinkFins");
  return group(name, base, fins);
}

/** Axial fan: square frame with a round throat, hub and seven blades. `face` is the exposed side (±Z). */
function fan(b: Box, name: string, face: 1 | -1): THREE.Group {
  const [w, h, dd] = size(b);
  const c = center(b);
  const R = Math.min(w, h) / 2;
  const throat = R * 0.92;
  const shape = roundedRectShape(w, h, R * 0.12) as THREE.Shape;
  const hole = new THREE.Path();
  hole.absarc(0, 0, mm(throat), 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const frameGeo = new THREE.ExtrudeGeometry(shape, { depth: mm(dd), bevelEnabled: false, curveSegments: SEG() / 2 });
  frameGeo.translate(0, 0, -mm(dd) / 2);
  const frame = named(shadows(new THREE.Mesh(frameGeo, plastic("black"))), `${name}Frame`);
  at(frame, c);

  const rotor = group("fanRotor");
  at(rotor, c);
  const hub = cyl(R * 0.36, dd * 0.8, plastic("black"), "z");
  rotor.add(hub);
  const bladeGeo = new THREE.BoxGeometry(mm(throat - R * 0.38), mm(R * 0.42), mm(0.8));
  bladeGeo.translate(mm((throat + R * 0.34) / 2), 0, 0);
  for (let i = 0; i < 7; i++) {
    const blade = shadows(new THREE.Mesh(bladeGeo, plastic("black")));
    blade.rotation.z = (i / 7) * Math.PI * 2;
    blade.rotateX(0.42);
    rotor.add(blade);
  }
  // Corner screws.
  const screws = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([kx, ky]) => at(cyl(1.6, 0.8, zincScrew(), "z", 16), [c[0] + kx * (w / 2 - 4), c[1] + ky * (h / 2 - 4), c[2] + face * (dd / 2 - 0.4)]));
  return group(name, frame, rotor, ...screws);
}

/** Five-sided vented sheet-steel cover over the hot side. */
function shroud(s: Spec, b: Box): THREE.Group {
  const p = s.peltier;
  const t = p.shroudSheet.value;
  const [w, h, dd] = size(b);
  const c = center(b);
  const back = named(rbox([w, h, t], powderCoat(), 0.7), "shroudBack");
  at(back, [c[0], c[1], b.min[2] + t / 2]);
  const sideLen = dd - t;
  const sz = b.min[2] + t + sideLen / 2;
  const top = rbox([w, t, sideLen], powderCoat(), 0.7);
  at(top, [c[0], b.max[1] - t / 2, sz]);
  const bottom = rbox([w, t, sideLen], powderCoat(), 0.7);
  at(bottom, [c[0], b.min[1] + t / 2, sz]);
  const left = rbox([t, h - 2 * t, sideLen], powderCoat(), 0.7);
  at(left, [b.min[0] + t / 2, c[1], sz]);
  const right = rbox([t, h - 2 * t, sideLen], powderCoat(), 0.7);
  at(right, [b.max[0] - t / 2, c[1], sz]);

  // Vent slots: vertical on the back, horizontal on both sides.
  const sw = p.shroudSlotWidth.value;
  const sl = p.shroudSlotLength.value;
  const pitch = p.shroudSlotPitch.value;
  const nBack = Math.floor((w - 16) / pitch);
  const backPts: number[][] = [];
  for (let i = 0; i < nBack; i++) for (const ky of [-1, 1]) backPts.push([c[0] - ((nBack - 1) * pitch) / 2 + i * pitch, c[1] + ky * (sl / 2 + 4), b.min[2] + t / 2]);
  const backSlots = named(instanced(pillGeometry(sw, sl, t + 0.2), vent(), backPts), "shroudBackSlots");
  const nSide = Math.floor((sideLen - 14) / pitch);
  const sideGeo = pillGeometry(sw, sl, t + 0.2).rotateY(Math.PI / 2); // depth along X, slot vertical
  const sidePts: number[][] = [];
  for (let i = 0; i < nSide; i++) for (const kx of [-1, 1]) sidePts.push([c[0] + kx * (w / 2 - t / 2 + 0.06), c[1], b.min[2] + t + 7 + i * pitch]);
  const sideSlots = named(instanced(sideGeo, vent(), sidePts), "shroudSideSlots");

  // Fixing screws through the shroud flange into the rear panel are hidden; show four on the back.
  const screws = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([kx, ky]) => at(cyl(2.4, 1, zincScrew(), "z", 24), [c[0] + kx * (w / 2 - 6), c[1] + ky * (h / 2 - 6), b.min[2] + 0.25]));
  return group("peltierShroud", back, top, bottom, left, right, backSlots, sideSlots, ...screws);
}

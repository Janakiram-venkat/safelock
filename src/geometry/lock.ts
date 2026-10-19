import * as THREE from "three";
import { mm, type Spec } from "../spec/dimensions";
import { derive } from "../spec/derived";
import { lockBoltBox } from "../spec/layout";
import { darkAluminium, brushedMetal, zincScrew, plastic } from "../materials";
import { group, rbox, cyl, at, explode, named, shadows, roundedRectShape, roundedRectHole, MIN_BEVEL, SEG } from "./util";

/**
 * Electronic solenoid lock on the inner latch-side wall. The bolt travels
 * along −X through the slot of a strike catch on the door's inner face.
 * The bolt mesh ("lockBolt") carries its extended/retracted X positions in
 * userData so features/doorAnimation.ts can drive it.
 */
export function build(s: Spec): THREE.Group {
  const l = s.lock;
  const hc = l.housingCenter.value;
  const [hw, hh, hd] = l.housingSize.value;

  const housing = named(rbox([hw, hh, hd], darkAluminium(), 1.2), "lockHousing");
  at(housing, hc);

  // Bolt guide bush on the chamber-facing (−X) face.
  const r = l.boltDiameter.value / 2;
  const bush = named(cyl(r + 1.5, 0.8, plastic("black"), "x"), "lockBoltBush");
  at(bush, [hc[0] - hw / 2 + 0.35, hc[1], hc[2]]);

  // Bolt: stainless rod with a rounded nose, travelling in X.
  const len = l.boltLength.value;
  const boltGeo = new THREE.CapsuleGeometry(mm(r), mm(len - 2 * r), 6, SEG());
  boltGeo.rotateZ(Math.PI / 2);
  const bolt = named(shadows(new THREE.Mesh(boltGeo, brushedMetal())), "lockBolt");
  const ext = lockBoltBox(s, true);
  const ret = lockBoltBox(s, false);
  const extX = (ext.min[0] + ext.max[0]) / 2;
  const retX = (ret.min[0] + ret.max[0]) / 2;
  bolt.userData.extendedX = mm(extX);
  bolt.userData.retractedX = mm(retX);
  at(bolt, [extX, hc[1], hc[2]]);

  // Two mounting screws into the side wall, seen on the housing face.
  const screwHeads = [-1, 1].map((k) => {
    const sh = cyl(2.2, 1, zincScrew(), "x", 24);
    return at(sh, [hc[0] - hw / 2 + 0.4, hc[1] + k * (hh / 2 - 4), hc[2] + hd / 2 - 5]);
  });

  return explode(group("lock", housing, bush, bolt, ...screwHeads), s.explode.lock.value);
}

/** Strike catch on the door's inner face: an L-bracket with a slot for the bolt. */
export function buildCatch(s: Spec): THREE.Group {
  const d = derive(s);
  const l = s.lock;
  const cc = l.catchCenter.value;
  const [tx, sy, sz] = l.catchSize.value;
  const slot = l.catchSlot.value;
  const slotZ = cc[2] + l.catchSlotOffsetZ.value;

  // Plate in the Y/Z plane with a rounded slot, extruded along X.
  const plateShape = roundedRectShape(sz, sy, 1.5, cc[2], cc[1]) as THREE.Shape;
  plateShape.holes.push(roundedRectHole(slot[2], slot[1], 2, slotZ, cc[1]));
  const geo = new THREE.ExtrudeGeometry(plateShape, {
    depth: mm(tx - 2 * MIN_BEVEL),
    bevelEnabled: true,
    bevelThickness: mm(MIN_BEVEL),
    bevelSize: mm(MIN_BEVEL),
    bevelOffset: -mm(MIN_BEVEL),
    bevelSegments: 2,
  });
  // Shape X→world Z, shape Y→world Y, extrusion Z→world X.
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)));
  geo.translate(mm(cc[0] - tx / 2 + MIN_BEVEL), 0, 0);
  // makeBasis with (z, y, x) is a reflection; flip winding so faces point outward.
  flipWinding(geo);
  const plate = named(shadows(new THREE.Mesh(geo, brushedMetal())), "lockCatchPlate");

  const fw = l.catchFlangeWidth.value;
  const ft = l.catchFlangeThickness.value;
  const flange = named(rbox([fw, sy, ft], brushedMetal(), 0.8), "lockCatchFlange");
  at(flange, [cc[0] + tx / 2 - fw / 2, cc[1], d.doorBackZ - ft / 2]);

  return explode(group("lockCatch", plate, flange), s.explode.lockCatch.value);
}

function flipWinding(geo: THREE.BufferGeometry): void {
  const idx = geo.getIndex();
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
    idx.needsUpdate = true;
  } else {
    const pos = geo.getAttribute("position");
    const attrs = Object.values(geo.attributes);
    for (let i = 0; i < pos.count; i += 3) {
      for (const attr of attrs) {
        for (let c = 0; c < attr.itemSize; c++) {
          const v1 = attr.getComponent(i + 1, c);
          attr.setComponent(i + 1, c, attr.getComponent(i + 2, c));
          attr.setComponent(i + 2, c, v1);
        }
      }
    }
  }
  geo.computeVertexNormals();
}

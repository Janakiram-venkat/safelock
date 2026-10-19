import type { Spec } from "./dimensions";
import { box, boxFromCenter, unionBox, derive, type Box } from "./derived";

export type Zone = "chamber" | "bay" | "structure" | "door" | "exterior" | "throughWall";

export interface Component {
  name: string;
  box: Box;
  zone: Zone;
  /** Mounted on the door (swings with it) or on the body. */
  mount: "door" | "body";
  /** Components this one may overlap by design, with the reason. */
  allow?: Record<string, string>;
}

/** Axis-aligned envelope of a box rotated about X by `deg`, around `center`. */
export function rotatedXEnvelope(center: readonly number[], localMin: number[], localMax: number[], degX: number): Box {
  const a = (degX * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const pts: [number, number, number][] = [];
  for (const x of [localMin[0], localMax[0]])
    for (const y of [localMin[1], localMax[1]])
      for (const z of [localMin[2], localMax[2]]) pts.push([x, y * c - z * s, y * s + z * c]);
  return {
    min: [0, 1, 2].map((i) => center[i] + Math.min(...pts.map((p) => p[i]))) as [number, number, number],
    max: [0, 1, 2].map((i) => center[i] + Math.max(...pts.map((p) => p[i]))) as [number, number, number],
  };
}

/** Camera housing local extents (lens protrudes along local -Z). */
export function cameraLocalExtents(s: Spec) {
  const [w, h, d] = s.camera.housingSize.value;
  return {
    min: [-w / 2, -h / 2, -d / 2 - s.camera.lensLength.value],
    max: [w / 2, h / 2, d / 2],
  };
}

export function lockBoltBox(s: Spec, extended: boolean): Box {
  const hc = s.lock.housingCenter.value;
  const hMinX = hc[0] - s.lock.housingSize.value[0] / 2;
  const r = s.lock.boltDiameter.value / 2;
  const minX = extended ? hMinX - s.lock.boltThrow.value : hMinX;
  return box([minX, hc[1] - r, hc[2] - r], [minX + s.lock.boltLength.value, hc[1] + r, hc[2] + r]);
}

/**
 * Every physical component as a named envelope (mm, world, door closed).
 * Used by validate.ts for clearance checks and by the geometry tests to
 * confirm the built meshes stay inside their declared envelopes.
 */
export function components(s: Spec, opts: { boltExtended?: boolean } = {}): Component[] {
  const d = derive(s);
  const boltExtended = opts.boltExtended ?? true;
  const out: Component[] = [];
  const add = (c: Component) => out.push(c);

  // Hinge pins (on the pivot axis, through the top/bottom walls).
  const pr = s.hinges.pinDiameter.value / 2;
  add({
    name: "hingeTop",
    zone: "throughWall",
    mount: "door",
    box: box([d.pivot.x - pr, d.doorBox.max[1] - s.hinges.pinEmbedDoor.value, d.pivot.z - pr], [d.pivot.x + pr, d.body.max[1], d.pivot.z + pr]),
  });
  add({
    name: "hingeBottom",
    zone: "throughWall",
    mount: "door",
    box: box([d.pivot.x - pr, d.body.min[1], d.pivot.z - pr], [d.pivot.x + pr, d.doorBox.min[1] + s.hinges.pinEmbedDoor.value, d.pivot.z + pr]),
  });

  // Handle.
  const hc = s.handle.center.value;
  const hr = Math.max(s.handle.barDiameter.value, s.handle.postDiameter.value) / 2;
  add({
    name: "handle",
    zone: "door",
    mount: "door",
    box: box([hc[0] - hr, hc[1] - s.handle.length.value / 2, d.front], [hc[0] + hr, hc[1] + s.handle.length.value / 2, d.front + s.handle.standoff.value + s.handle.barDiameter.value / 2]),
  });

  // Lock.
  add({ name: "lockHousing", zone: "chamber", mount: "body", box: boxFromCenter(s.lock.housingCenter.value, s.lock.housingSize.value) });
  add({
    name: "lockBolt",
    zone: "chamber",
    mount: "body",
    box: lockBoltBox(s, boltExtended),
    allow: {
      lockHousing: "bolt slides inside its own housing",
      ...(boltExtended ? { lockCatch: "extended bolt passes through the catch slot (that is the lock)" } : {}),
    },
  });
  const cc = s.lock.catchCenter.value;
  const cs = s.lock.catchSize.value;
  const catchPlate = boxFromCenter(cc, cs);
  const catchFlange = box(
    [catchPlate.max[0] - s.lock.catchFlangeWidth.value, catchPlate.min[1], d.doorBackZ - s.lock.catchFlangeThickness.value],
    [catchPlate.max[0], catchPlate.max[1], d.doorBackZ],
  );
  add({ name: "lockCatch", zone: "door", mount: "door", box: unionBox(catchPlate, catchFlange) });

  // Control strip and PIR on the door rails.
  const sc = s.controlStrip.center.value;
  add({
    name: "controlStrip",
    zone: "door",
    mount: "door",
    box: box([sc[0] - s.controlStrip.width.value / 2, sc[1] - s.controlStrip.height.value / 2, d.front], [sc[0] + s.controlStrip.width.value / 2, sc[1] + s.controlStrip.height.value / 2, d.front + s.controlStrip.panelDepth.value]),
  });
  const pc = s.pir.center.value;
  const pirHalfX = Math.max(s.pir.bezelDiameter.value, s.pir.boardSize.value[0]) / 2;
  const pirHalfY = Math.max(s.pir.bezelDiameter.value, s.pir.boardSize.value[1]) / 2;
  add({
    name: "pir",
    zone: "door",
    mount: "door",
    box: box([pc[0] - pirHalfX, pc[1] - pirHalfY, d.front - s.door.frontLipDepth.value - s.pir.boardSize.value[2]], [pc[0] + pirHalfX, pc[1] + pirHalfY, d.front + s.pir.bezelHeight.value + s.pir.domeHeight.value]),
  });

  // Internal camera: tilted housing + ceiling mount plate.
  const ext = cameraLocalExtents(s);
  const cam = s.camera.center.value;
  const housing = rotatedXEnvelope(cam, ext.min, ext.max, s.camera.tilt.value);
  const mp = s.camera.mountPlateSize.value;
  const plate = box([cam[0] - mp[0] / 2, d.inner.max[1] - mp[1], cam[2] - mp[2] / 2], [cam[0] + mp[0] / 2, d.inner.max[1], cam[2] + mp[2] / 2]);
  add({ name: "camera", zone: "chamber", mount: "body", box: unionBox(housing, plate) });

  // Door sensor pair.
  add({ name: "magnet", zone: "door", mount: "door", box: boxFromCenter(s.doorSensor.magnetCenter.value, s.doorSensor.magnetSize.value) });
  add({ name: "reed", zone: "chamber", mount: "body", box: boxFromCenter(s.doorSensor.reedCenter.value, s.doorSensor.reedSize.value) });

  add({ name: "vibration", zone: "chamber", mount: "body", box: boxFromCenter(s.vibration.center.value, s.vibration.size.value) });
  add({ name: "tempHumidity", zone: "chamber", mount: "body", box: boxFromCenter(s.tempHumidity.center.value, s.tempHumidity.size.value) });

  // Shelves and their support pins.
  const sh = s.shelves;
  sh.topY.value.forEach((top, i) => {
    add({
      name: `shelf${i}`,
      zone: "chamber",
      mount: "body",
      box: box([d.inner.min[0] + sh.sideClearance.value, top - sh.lipDepth.value, sh.rearZ.value], [d.inner.max[0] - sh.sideClearance.value, top, sh.frontZ.value]),
    });
    const py = top - sh.lipDepth.value;
    const r = sh.pinDiameter.value / 2;
    for (const side of [-1, 1] as const) {
      sh.pinZ.value.forEach((z, j) => {
        const x0 = side < 0 ? d.inner.min[0] : d.inner.max[0] - sh.pinLength.value;
        add({ name: `shelf${i}Pin${side < 0 ? "L" : "R"}${j}`, zone: "chamber", mount: "body", box: box([x0, py - sh.pinDiameter.value, z - r], [x0 + sh.pinLength.value, py, z + r]) });
      });
    }
  });

  // Electronics bay structure and contents.
  add({ name: "bayCover", zone: "structure", mount: "body", box: d.bayCover });
  add({ name: "bayFrontPanel", zone: "structure", mount: "body", box: d.bayFrontPanel, allow: { bayCover: "welded corner joint" } });

  const cb = s.controller.boardSize.value;
  const bc = s.controller.boardCenter.value;
  const boardTop = bc[1] + cb[1] / 2;
  add({
    name: "controller",
    zone: "bay",
    mount: "body",
    box: box([bc[0] - cb[0] / 2, bc[1] - cb[1] / 2 - s.controller.standoffHeight.value, bc[2] - cb[2] / 2], [bc[0] + cb[0] / 2, boardTop + s.controller.mcuSize.value[1], bc[2] + cb[2] / 2]),
  });
  add({ name: "imu", zone: "bay", mount: "body", box: boxFromCenter(s.imu.center.value, s.imu.size.value), allow: { controller: "plugged into the controller board on pin headers" } });
  add({ name: "battery", zone: "bay", mount: "body", box: boxFromCenter(s.battery.center.value, s.battery.size.value) });
  add({ name: "tamper", zone: "bay", mount: "body", box: boxFromCenter(s.tamper.center.value, s.tamper.size.value) });
  const bz = s.buzzer.center.value;
  add({
    name: "buzzer",
    zone: "bay",
    mount: "body",
    box: box([bz[0] - s.buzzer.length.value / 2, bz[1] - s.buzzer.diameter.value / 2, bz[2] - s.buzzer.diameter.value / 2], [bz[0] + s.buzzer.length.value / 2, bz[1] + s.buzzer.diameter.value / 2, bz[2] + s.buzzer.diameter.value / 2]),
  });
  const pi = s.powerInlet;
  const pir = pi.flangeDiameter.value / 2;
  add({
    name: "powerInlet",
    zone: "throughWall",
    mount: "body",
    box: box([pi.centerXY.value[0] - pir, pi.centerXY.value[1] - pir, d.body.min[2] - pi.flangeThickness.value], [pi.centerXY.value[0] + pir, pi.centerXY.value[1] + pir, d.inner.min[2] + pi.bodyLength.value]),
  });

  // Peltier stack: inner fan | inner sink | TEC (in wall) | outer sink | outer fan, under a shroud.
  const p = s.peltier;
  const pc3 = p.center.value;
  const tec = boxFromCenter(pc3, p.tecSize.value);
  const stack = (size: readonly number[], z0: number, z1: number): Box =>
    box([pc3[0] - size[0] / 2, pc3[1] - size[1] / 2, z0], [pc3[0] + size[0] / 2, pc3[1] + size[1] / 2, z1]);
  const innerSink = stack(p.innerSinkSize.value, tec.max[2], tec.max[2] + p.innerSinkSize.value[2]);
  const innerFan = stack(p.innerFanSize.value, innerSink.max[2], innerSink.max[2] + p.innerFanSize.value[2]);
  const outerSink = stack(p.outerSinkSize.value, tec.min[2] - p.outerSinkSize.value[2], tec.min[2]);
  const outerFan = stack(p.outerFanSize.value, outerSink.min[2] - p.outerFanSize.value[2], outerSink.min[2]);
  const shroud = stack(p.shroudSize.value, d.body.min[2] - p.shroudSize.value[2], d.body.min[2]);
  add({ name: "peltierTec", zone: "throughWall", mount: "body", box: tec });
  add({ name: "peltierInnerSink", zone: "chamber", mount: "body", box: innerSink });
  add({ name: "peltierInnerFan", zone: "chamber", mount: "body", box: innerFan });
  const enclosed = "enclosed by the vented shroud (hollow cover)";
  add({ name: "peltierOuterSink", zone: "exterior", mount: "body", box: outerSink });
  add({ name: "peltierOuterFan", zone: "exterior", mount: "body", box: outerFan });
  add({
    name: "peltierShroud",
    zone: "exterior",
    mount: "body",
    box: shroud,
    allow: { peltierOuterSink: enclosed, peltierOuterFan: enclosed, peltierTec: enclosed },
  });

  // Feet.
  const fi = s.feet.inset.value;
  const fr = s.feet.diameter.value / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx * (d.W / 2 - fi);
    const z = sz * (d.D / 2 - fi);
    add({ name: `foot${sx < 0 ? "L" : "R"}${sz < 0 ? "B" : "F"}`, zone: "exterior", mount: "body", box: box([x - fr, 0, z - fr], [x + fr, s.feet.height.value, z + fr]) });
  }

  // Rear panel screws.
  rearScrewPositions(s).forEach(([x, y], i) => {
    const r = s.rearScrews.headDiameter.value / 2;
    add({ name: `rearScrew${i}`, zone: "exterior", mount: "body", box: box([x - r, y - r, d.body.min[2] - s.rearScrews.headHeight.value], [x + r, y + r, d.body.min[2]]) });
  });

  return out;
}

/** Perimeter screw pattern on the rear panel, as (x, y) in mm. */
export function rearScrewPositions(s: Spec): [number, number][] {
  const d = derive(s);
  const inset = s.rearScrews.inset.value;
  const nx = s.rearScrews.countAcross.value;
  const ny = s.rearScrews.countUp.value;
  const x0 = d.body.min[0] + inset;
  const x1 = d.body.max[0] - inset;
  const y0 = d.body.min[1] + inset;
  const y1 = d.body.max[1] - inset;
  const pts: [number, number][] = [];
  for (let i = 0; i < nx; i++) {
    const x = x0 + ((x1 - x0) * i) / (nx - 1);
    pts.push([x, y0], [x, y1]);
  }
  for (let j = 1; j < ny - 1; j++) {
    const y = y0 + ((y1 - y0) * j) / (ny - 1);
    pts.push([x0, y], [x1, y]);
  }
  return pts;
}

import type { Spec } from "./dimensions";
import { derive, boxSize, type Box } from "./derived";
import { components, lockBoltBox, type Component } from "./layout";

export interface Check {
  name: string;
  ok: boolean;
  message: string;
}

/** Overlaps smaller than this (mm) count as touching, not intersecting. */
const EPS = 0.01;

const overlap1 = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

export function boxesIntersect(a: Box, b: Box): boolean {
  return [0, 1, 2].every((i) => overlap1(a.min[i], a.max[i], b.min[i], b.max[i]) > EPS);
}

export function boxInside(inner: Box, outer: Box): boolean {
  return [0, 1, 2].every((i) => inner.min[i] >= outer.min[i] - EPS && inner.max[i] <= outer.max[i] + EPS);
}

const fmt = (b: Box) => `[${b.min.map((v) => v.toFixed(1)).join(", ")}] → [${b.max.map((v) => v.toFixed(1)).join(", ")}]`;

// ---- 2D separating-axis test for the door swing (top view, X/Z plane) ----

type P2 = [number, number];

function rectCorners(b: Box): P2[] {
  return [
    [b.min[0], b.min[2]],
    [b.max[0], b.min[2]],
    [b.max[0], b.max[2]],
    [b.min[0], b.max[2]],
  ];
}

/** Rotate a point about the pivot by rotation.y = theta (three.js convention). */
function rotY(p: P2, pivot: { x: number; z: number }, theta: number): P2 {
  const x = p[0] - pivot.x;
  const z = p[1] - pivot.z;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [pivot.x + x * c + z * s, pivot.z - x * s + z * c];
}

function polysOverlap(a: P2[], b: P2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1];
      const nz = p[0] - q[0];
      const len = Math.hypot(nx, nz);
      const proj = (pts: P2[]) => pts.map((v) => (v[0] * nx + v[1] * nz) / len);
      const pa = proj(a);
      const pb = proj(b);
      if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= EPS) return false;
    }
  }
  return true;
}

/**
 * Sweep the door (slab + every door-mounted component) from closed to
 * maxOpenAngle and report the first collision with the body or a body-mounted
 * component (lock bolt retracted, as it is whenever the door moves).
 */
export function doorSwingCollision(s: Spec, stepDeg = 0.25): { angle: number; a: string; b: string } | null {
  const d = derive(s);
  const all = components(s, { boltExtended: false });
  const moving: { name: string; box: Box }[] = [
    { name: "doorSlab", box: d.doorBox },
    ...all.filter((c) => c.mount === "door" && c.zone !== "throughWall").map((c) => ({ name: c.name, box: c.box })),
  ];
  const fixed: { name: string; box: Box }[] = [
    ...Object.entries(d.walls).map(([k, b]) => ({ name: `${k}Wall`, box: b })),
    ...all.filter((c) => c.mount === "body").map((c) => ({ name: c.name, box: c.box })),
  ];
  const max = s.door.maxOpenAngle.value;
  for (let a = stepDeg; a <= max + 1e-9; a += stepDeg) {
    const theta = d.openSign * ((a * Math.PI) / 180);
    for (const m of moving) {
      const poly = rectCorners(m.box).map((p) => rotY(p, d.pivot, theta));
      for (const f of fixed) {
        if (overlap1(m.box.min[1], m.box.max[1], f.box.min[1], f.box.max[1]) <= EPS) continue;
        if (polysOverlap(poly, rectCorners(f.box))) return { angle: a, a: m.name, b: f.name };
      }
    }
  }
  return null;
}

export function validate(s: Spec): Check[] {
  const d = derive(s);
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, message: string) => checks.push({ name, ok, message });

  // 1. Door + clearance fits the opening on all sides.
  const g = s.door.gap.value;
  const doorW = d.doorBox.max[0] - d.doorBox.min[0];
  const doorH = d.doorBox.max[1] - d.doorBox.min[1];
  const openW = d.opening.maxX - d.opening.minX;
  const openH = d.opening.maxY - d.opening.minY;
  check("door fits opening", g > 0 && Math.abs(doorW + 2 * g - openW) < EPS && Math.abs(doorH + 2 * g - openH) < EPS,
    `door ${doorW} × ${doorH} + 2 × ${g} gap vs opening ${openW} × ${openH}`);
  check("door depth inside body", s.door.depth.value < d.D - d.t, `door depth ${s.door.depth.value} < ${d.D - d.t}`);

  // 2. Inner chamber = outer size − 2 × wall (width and height; the front is the door).
  const inner = boxSize(d.inner);
  check("inner width = W − 2t", Math.abs(inner[0] - (d.W - 2 * d.t)) < EPS, `${inner[0]} vs ${d.W - 2 * d.t}`);
  check("inner height = H − 2t", Math.abs(inner[1] - (d.H - 2 * d.t)) < EPS, `${inner[1]} vs ${d.H - 2 * d.t}`);
  check("inner depth = D − t (open front)", Math.abs(inner[2] - (d.D - d.t)) < EPS, `${inner[2]} vs ${d.D - d.t}`);

  // Door frame and glass.
  check("glass window positive", d.window.maxX > d.window.minX && d.window.maxY > d.window.minY,
    `window ${(d.window.maxX - d.window.minX).toFixed(1)} × ${(d.window.maxY - d.window.minY).toFixed(1)}`);
  check("glass captured by frame", d.glass.min[0] > d.doorBox.min[0] && d.glass.max[0] < d.doorBox.max[0] && d.glass.min[1] > d.doorBox.min[1] && d.glass.max[1] < d.doorBox.max[1] && d.glass.min[2] > d.doorBox.min[2],
    `glass ${fmt(d.glass)} inside door ${fmt(d.doorBox)}`);
  check("hinge pivot inside door", d.pivot.x > d.doorBox.min[0] && d.pivot.x < d.doorBox.max[0] && d.pivot.z > d.doorBox.min[2] && d.pivot.z < d.doorBox.max[2],
    `pivot (${d.pivot.x}, ${d.pivot.z})`);

  // 3. Components: zones and pairwise intersections.
  const comps = components(s);
  const byName = new Map(comps.map((c) => [c.name, c]));
  check("component names unique", byName.size === comps.length, `${comps.length} components`);
  for (const c of comps) {
    let ok = true;
    let where = "";
    switch (c.zone) {
      case "chamber": ok = boxInside(c.box, d.chamber); where = "chamber"; break;
      case "bay": ok = boxInside(c.box, d.bay); where = "electronics bay"; break;
      case "structure": ok = boxInside(c.box, d.inner); where = "body interior"; break;
      case "door": {
        const o = { min: [d.opening.minX, d.opening.minY, -Infinity], max: [d.opening.maxX, d.opening.maxY, Infinity] } as Box;
        ok = boxInside(c.box, o) && c.box.min[2] >= d.chamber.max[2] - s.chamber.doorInnerClearance.value;
        where = "door outline / keep-out zone";
        break;
      }
      case "exterior": ok = !boxesIntersect(c.box, d.body); where = "outside the body"; break;
      case "throughWall": ok = boxesIntersect(c.box, d.body) && !boxInside(c.box, d.inner); where = "through a wall"; break;
    }
    check(`${c.name} in ${where}`, ok, fmt(c.box));
  }
  const allowed = (a: Component, b: Component) => !!(a.allow?.[b.name] || b.allow?.[a.name]);
  const clashes: string[] = [];
  for (let i = 0; i < comps.length; i++)
    for (let j = i + 1; j < comps.length; j++)
      if (!allowed(comps[i], comps[j]) && boxesIntersect(comps[i].box, comps[j].box)) clashes.push(`${comps[i].name} × ${comps[j].name}`);
  check("no component intersections", clashes.length === 0, clashes.length ? clashes.join("; ") : `${comps.length} components, 0 clashes`);

  // 4. Shelves.
  const innerDepth = d.inner.max[2] - d.inner.min[2];
  const catchBox = byName.get("lockCatch")!.box;
  const keepOut = d.front - catchBox.min[2];
  check("door inner clearance covers door + lock zone", s.chamber.doorInnerClearance.value >= keepOut,
    `clearance ${s.chamber.doorInnerClearance.value} ≥ ${keepOut.toFixed(1)}`);
  for (const [i] of s.shelves.topY.value.entries()) {
    const sb = byName.get(`shelf${i}`)!.box;
    const depth = sb.max[2] - sb.min[2];
    check(`shelf${i} depth < inner depth − door clearance`, depth < innerDepth - s.chamber.doorInnerClearance.value,
      `${depth} < ${innerDepth} − ${s.chamber.doorInnerClearance.value}`);
    const pins = comps.filter((c) => c.name.startsWith(`shelf${i}Pin`));
    check(`shelf${i} rests on its pins`, pins.length >= 4 && pins.every((p) => Math.abs(p.box.max[1] - sb.min[1]) < EPS && p.box.max[0] > sb.min[0] && p.box.min[0] < sb.max[0]),
      `${pins.length} pins`);
  }

  // 5. Lock engages when extended, clears when retracted.
  const ext = lockBoltBox(s, true);
  const ret = lockBoltBox(s, false);
  const cc = s.lock.catchCenter.value;
  const cs = s.lock.catchSize.value;
  const plateMinX = cc[0] - cs[0] / 2;
  const plateMaxX = cc[0] + cs[0] / 2;
  const slot = s.lock.catchSlot.value;
  const hc = s.lock.housingCenter.value;
  const r = s.lock.boltDiameter.value / 2;
  check("extended bolt passes through the catch", ext.min[0] < plateMinX && ext.max[0] > plateMaxX, `bolt x ${ext.min[0]}–${ext.max[0]}, plate ${plateMinX}–${plateMaxX}`);
  const slotZ = cc[2] + s.lock.catchSlotOffsetZ.value;
  check("bolt fits the catch slot", Math.abs(hc[1] - cc[1]) + r <= slot[1] / 2 && Math.abs(hc[2] - slotZ) + r <= slot[2] / 2,
    `bolt axis (${hc[1]}, ${hc[2]}), slot centre (${cc[1]}, ${slotZ}) ${slot[1]} × ${slot[2]}`);
  check("slot leaves material in the catch plate", slotZ - slot[2] / 2 > cc[2] - cs[2] / 2 && slotZ + slot[2] / 2 < cc[2] + cs[2] / 2 && slot[1] < cs[1],
    `slot z ${slotZ - slot[2] / 2}–${slotZ + slot[2] / 2} inside plate ${cc[2] - cs[2] / 2}–${cc[2] + cs[2] / 2}`);
  check("retracted bolt clears the catch", ret.min[0] >= plateMaxX + EPS, `retracted tip x ${ret.min[0]} vs plate ${plateMaxX}`);
  check("bolt keeps engagement inside housing", s.lock.boltLength.value > s.lock.boltThrow.value, `length ${s.lock.boltLength.value} > throw ${s.lock.boltThrow.value}`);

  // 6. Door sensor pair aligned when closed.
  const mag = byName.get("magnet")!.box;
  const reed = byName.get("reed")!.box;
  const gapZ = mag.min[2] - reed.max[2];
  check("reed switch within range of magnet", gapZ >= 0 && gapZ <= s.doorSensor.maxSwitchGap.value && overlap1(mag.min[1], mag.max[1], reed.min[1], reed.max[1]) > 0 && overlap1(mag.min[0], mag.max[0], reed.min[0], reed.max[0]) > 0,
    `air gap ${gapZ.toFixed(1)} mm (max ${s.doorSensor.maxSwitchGap.value})`);

  // 7. Rail-mounted parts sit on the rails they belong to.
  const pir = byName.get("pir")!.box;
  check("PIR on the top rail, facing out", pir.min[1] >= d.window.maxY - EPS && pir.max[1] <= d.doorBox.max[1] + EPS && pir.max[2] > d.front,
    fmt(pir));
  const strip = byName.get("controlStrip")!.box;
  check("control strip on the bottom rail", strip.min[1] >= d.doorBox.min[1] - EPS && strip.max[1] <= d.window.minY + EPS && strip.min[0] >= d.doorBox.min[0] && strip.max[0] <= d.doorBox.max[0],
    fmt(strip));
  const handle = byName.get("handle")!.box;
  const latchStile = s.door.hingeSide === "left" ? [d.window.maxX, d.doorBox.max[0]] : [d.doorBox.min[0], d.window.minX];
  check("handle on the latch-side stile", handle.min[0] >= latchStile[0] - EPS && handle.max[0] <= latchStile[1] + EPS, fmt(handle));
  check("hinge side opposite the lock", (s.door.hingeSide === "left") === (s.lock.housingCenter.value[0] > 0), `hinge ${s.door.hingeSide}, lock x ${s.lock.housingCenter.value[0]}`);

  // 8. Camera looks into the chamber.
  const tilt = (s.camera.tilt.value * Math.PI) / 180;
  // Lens axis is local -Z; rotated about X it becomes (y, z) = (sin t, −cos t).
  const lookY = Math.sin(tilt);
  const lookZ = -Math.cos(tilt);
  check("camera looks into the chamber (back and down)", lookY < 0 && lookZ < 0, `tilt ${s.camera.tilt.value}°, axis (y ${lookY.toFixed(2)}, z ${lookZ.toFixed(2)})`);

  // 9. Peltier vents to the outside.
  const shroud = byName.get("peltierShroud")!.box;
  check("Peltier hot side vents outside", shroud.max[2] <= d.body.min[2] + EPS, fmt(shroud));

  // 10. Door can swing to its open angle without hitting anything.
  const hit = doorSwingCollision(s);
  check(`door swings to ${s.door.maxOpenAngle.value}° freely`, hit === null, hit ? `${hit.a} hits ${hit.b} at ${hit.angle}°` : "no collision in 0.25° steps");

  // 11. Feet inside the footprint.
  const feet = comps.filter((c) => c.name.startsWith("foot"));
  check("feet inside footprint", feet.every((f) => f.box.min[0] >= d.body.min[0] && f.box.max[0] <= d.body.max[0] && f.box.min[2] >= d.body.min[2] && f.box.max[2] <= d.body.max[2] && Math.abs(f.box.max[1] - d.body.min[1]) < EPS),
    `${feet.length} feet`);

  return checks;
}

import { describe, it, expect } from "vitest";
import { spec, mm, type Spec } from "../../src/spec/dimensions";
import { validate, doorSwingCollision, boxesIntersect } from "../../src/spec/validate";
import { components } from "../../src/spec/layout";
import { entries, placeholders } from "../../src/spec/report";
import { derive } from "../../src/spec/derived";

/** Deep-clone the spec and apply a mutation, for negative tests. */
function mutate(fn: (s: { [k: string]: any }) => void): Spec {
  const s = structuredClone(spec) as unknown as { [k: string]: any };
  fn(s);
  return s as unknown as Spec;
}

const failing = (s: Spec) => validate(s).filter((c) => !c.ok).map((c) => c.name);

describe("spec constraints", () => {
  it("the shipped spec passes every check", () => {
    const bad = validate(spec).filter((c) => !c.ok);
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  it("there are enough checks to mean something", () => {
    expect(validate(spec).length).toBeGreaterThan(60);
  });

  it("unit conversion: 1 unit = 1 m", () => {
    expect(mm(1000)).toBe(1);
    expect(mm(450)).toBeCloseTo(0.45, 12);
  });

  it("origin is the centre of the footprint on the floor; +Z is the door side", () => {
    const d = derive(spec);
    expect(d.body.min[0] + d.body.max[0]).toBeCloseTo(0, 9);
    expect(d.body.min[2] + d.body.max[2]).toBeCloseTo(0, 9);
    expect(d.doorBox.max[2]).toBe(d.body.max[2]);
    const feet = components(spec).filter((c) => c.name.startsWith("foot"));
    expect(Math.min(...feet.map((f) => f.box.min[1]))).toBe(0);
  });

  it("every spec value carries a valid source and unit", () => {
    const all = entries(spec);
    expect(all.length).toBeGreaterThan(150);
    for (const e of all) {
      expect(["measured", "datasheet", "placeholder"], e.path).toContain(e.source);
      expect(["mm", "deg", "ms", "count", "degC", "%", "g", "s", "dBm"], e.path).toContain(e.unit);
      const vals = Array.isArray(e.value) ? e.value : [e.value];
      for (const v of vals) expect(Number.isFinite(v), e.path).toBe(true);
    }
  });

  it("datasheet values name a part number in the note", () => {
    for (const e of entries(spec).filter((x) => x.source === "datasheet")) expect(e.note, e.path).toBeTruthy();
  });

  it("nothing is marked measured until the user supplies it", () => {
    expect(entries(spec).filter((e) => e.source === "measured")).toEqual([]);
    expect(placeholders(spec).length).toBe(entries(spec).length);
  });
});

describe("checks fail when the design is physically wrong", () => {
  it("door wider than the opening", () => {
    expect(failing(mutate((s) => (s.door.gap.value = -1)))).toContain("door fits opening");
  });

  it("two components overlapping", () => {
    const s = mutate((x) => (x.vibration.center.value = [...x.tempHumidity.center.value]));
    expect(failing(s)).toContain("no component intersections");
  });

  it("component outside the chamber", () => {
    const s = mutate((x) => (x.tempHumidity.center.value = [230, 432, -140]));
    expect(failing(s)).toContain("tempHumidity in chamber");
  });

  it("shelf too deep for the door clearance", () => {
    const s = mutate((x) => (x.shelves.frontZ.value = 160));
    expect(failing(s).some((n) => n.startsWith("shelf0 depth"))).toBe(true);
  });

  it("door swing blocked: pivot too far behind the front face", () => {
    // Moving the hinge axis back makes the door's front corner sweep into the side wall.
    const s = mutate((x) => (x.door.pivotInsetZ.value = 25));
    const hit = doorSwingCollision(s);
    expect(hit).not.toBeNull();
    expect(failing(s)).toContain("door swings to 110° freely");
  });

  it("door swing blocked: lock housing too close to the door", () => {
    const s = mutate((x) => (x.lock.housingCenter.value = [212, 262, 156]));
    expect(failing(s).length).toBeGreaterThan(0);
  });

  it("bolt that never reaches the catch", () => {
    const s = mutate((x) => (x.lock.boltThrow.value = 2));
    expect(failing(s)).toContain("extended bolt passes through the catch");
  });

  it("bolt that does not clear the catch when retracted", () => {
    const s = mutate((x) => (x.lock.catchCenter.value = [201, 262, 156]));
    expect(failing(s)).toContain("retracted bolt clears the catch");
  });

  it("reed switch too far from its magnet", () => {
    const s = mutate((x) => (x.doorSensor.reedCenter.value = [212, 335, 140]));
    expect(failing(s)).toContain("reed switch within range of magnet");
  });

  it("hinge on the same side as the lock", () => {
    const s = mutate((x) => (x.door.hingeSide = "right"));
    expect(failing(s)).toContain("hinge side opposite the lock");
  });

  it("camera aimed out of the chamber", () => {
    expect(failing(mutate((x) => (x.camera.tilt.value = 30)))).toContain("camera looks into the chamber (back and down)");
  });
});

describe("box helpers", () => {
  it("touching boxes do not count as intersecting", () => {
    expect(boxesIntersect({ min: [0, 0, 0], max: [1, 1, 1] }, { min: [1, 0, 0], max: [2, 1, 1] })).toBe(false);
    expect(boxesIntersect({ min: [0, 0, 0], max: [1, 1, 1] }, { min: [0.5, 0.5, 0.5], max: [2, 2, 2] })).toBe(true);
  });
});

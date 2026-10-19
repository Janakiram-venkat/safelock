import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { spec } from "../../src/spec/dimensions";
import { materials as M } from "../../src/spec/materials";
import { derive } from "../../src/spec/derived";
import { buildVault } from "../../src/geometry/vault";
import { DoorController, applyDoor } from "../../src/features/doorAnimation";
import { SmartGlassController, applyGlass } from "../../src/features/smartGlass";
import { ExplodedView } from "../../src/features/explodedView";
import { Cutaway } from "../../src/features/cutaway";
import { premium, snappy, sineInOut, cubicBezier } from "../../src/features/easing";
import { parseQuery, toQuery, DEFAULTS } from "../../src/features/urlState";
import { orthoCamera, perspectiveDirection, PATENT_VIEWS, PATENT_FILES, modelBox } from "../../src/features/patentViews";
import { agxNeutral, acesNeutral, precompensate } from "../../src/scene/toneMapCompensation";
import { lensFov } from "../../src/scene/cameras";

const MAX = spec.door.maxOpenAngle.value;

/** Step the controller in fixed 1 ms ticks, recording every state. */
function run(door: DoorController, ms: number) {
  const trace: { angle: number; bolt: number; phase: string }[] = [];
  for (let t = 0; t < ms; t++) {
    door.update(1);
    trace.push({ angle: door.angle, bolt: door.bolt, phase: door.phase });
  }
  return trace;
}

describe("door + lock state machine", () => {
  it("starts closed and locked", () => {
    const d = new DoorController(spec);
    expect(d.locked).toBe(true);
    expect(d.angle).toBe(0);
    expect(d.bolt).toBe(0);
  });

  it("retracts the bolt fully before the door moves", () => {
    const d = new DoorController(spec);
    d.open();
    const trace = run(d, 3000);
    const firstMove = trace.findIndex((s) => s.angle > 0);
    expect(firstMove).toBeGreaterThan(0);
    for (const s of trace.slice(0, firstMove)) expect(s.angle).toBe(0);
    for (const s of trace) if (s.angle > 0) expect(s.bolt).toBe(1);
    expect(firstMove).toBeGreaterThanOrEqual(spec.timing.boltTravel.value - 1);
  });

  it("opens exactly to maxOpenAngle and never beyond", () => {
    const d = new DoorController(spec);
    d.open();
    const trace = run(d, 4000);
    expect(Math.max(...trace.map((s) => s.angle))).toBeLessThanOrEqual(MAX);
    expect(d.angle).toBe(MAX);
    expect(d.phase).toBe("idle");
    d.open(500);
    run(d, 3000);
    expect(d.angle).toBe(MAX);
  });

  it("uses eased motion: slow start, slow finish, no overshoot", () => {
    const d = new DoorController(spec);
    d.snap(0);
    d.open();
    const trace = run(d, 4000).filter((s) => s.phase === "opening");
    const deltas = trace.slice(1).map((s, i) => s.angle - trace[i].angle);
    const mid = deltas[Math.floor(deltas.length / 2)];
    expect(deltas[0]).toBeLessThan(mid * 0.2);
    expect(deltas[deltas.length - 1]).toBeLessThan(mid * 0.2);
    for (const dd of deltas) expect(dd).toBeGreaterThanOrEqual(0);
  });

  it("takes the spec durations", () => {
    const d = new DoorController(spec);
    d.open();
    const trace = run(d, 4000);
    const swing = trace.filter((s) => s.phase === "opening").length;
    expect(Math.abs(swing - spec.timing.doorOpen.value)).toBeLessThanOrEqual(2);
  });

  it("closes, then extends the bolt only once the door is shut", () => {
    const d = new DoorController(spec);
    d.snap(MAX);
    d.close();
    const trace = run(d, 3000);
    for (const s of trace) if (s.bolt < 1) expect(s.angle).toBe(0);
    expect(d.locked).toBe(true);
  });

  it("can reverse mid-swing without breaking the invariant", () => {
    const d = new DoorController(spec);
    d.open();
    run(d, 700);
    d.close();
    run(d, 200);
    d.open();
    const trace = run(d, 3000);
    for (const s of trace) if (s.angle > 0) expect(s.bolt).toBe(1);
    expect(d.angle).toBe(MAX);
  });

  it("snap() keeps the invariant", () => {
    const d = new DoorController(spec);
    d.snap(45);
    expect(d.bolt).toBe(1);
    d.snap(0);
    expect(d.bolt).toBe(0);
    d.snap(999);
    expect(d.angle).toBe(MAX);
  });

  it("drives the scene graph: hinge axis rotation and bolt travel", () => {
    const v = buildVault(spec);
    const d = new DoorController(spec);
    applyDoor(v, spec, d);
    expect(v.bolt.position.x).toBeCloseTo(v.bolt.userData.extendedX, 12);
    d.snap(90);
    applyDoor(v, spec, d);
    expect(v.door.rotation.y).toBeCloseTo((derive(spec).openSign * Math.PI) / 2, 9);
    expect(v.bolt.position.x).toBeCloseTo(v.bolt.userData.retractedX, 12);
    // Left hinge: the latch-side handle swings outward (+Z) and stays on the hinge side.
    v.root.updateMatrixWorld(true);
    const handle = new THREE.Box3().setFromObject(v.root.getObjectByName("handle")!);
    expect(handle.min.z).toBeGreaterThan(mm(spec.body.depth.value / 2));
    expect(handle.max.x).toBeLessThan(0);
  });
});

const mm = (x: number) => x / 1000;

describe("smart glass", () => {
  it("interpolates to the spec end states", () => {
    const mat = new THREE.MeshPhysicalMaterial();
    applyGlass(mat, 0);
    expect(mat.transmission).toBe(M.smartGlass.transparent.transmission);
    expect(mat.roughness).toBe(M.smartGlass.transparent.roughness);
    applyGlass(mat, 1);
    expect(mat.transmission).toBeCloseTo(M.smartGlass.opaque.transmission, 9);
    expect(mat.roughness).toBeCloseTo(M.smartGlass.opaque.roughness, 9);
    expect(mat.attenuationDistance).toBeCloseTo(M.smartGlass.opaque.attenuationDistance, 9);
    expect(`#${mat.attenuationColor.getHexString()}`).toBe(M.smartGlass.opaque.attenuationColor);
  });

  it("transitions over the spec duration with eased, monotonic progress", () => {
    const g = new SmartGlassController(spec);
    g.set("opaque");
    const vals: number[] = [];
    for (let t = 0; t < spec.timing.smartGlassTransition.value + 5; t++) {
      g.update(1);
      vals.push(g.value);
    }
    expect(g.value).toBe(1);
    const done = vals.findIndex((v) => v === 1);
    expect(Math.abs(done + 1 - spec.timing.smartGlassTransition.value)).toBeLessThanOrEqual(1);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]);
    expect(vals[10]).toBeLessThan(10 / spec.timing.smartGlassTransition.value); // ease-in start
  });

  it("set(..., immediate) snaps without a transition", () => {
    const g = new SmartGlassController(spec);
    g.set("opaque", true);
    expect(g.value).toBe(1);
    expect(g.transitioning).toBe(false);
  });
});

describe("exploded view", () => {
  it("moves parts along their offsets and restores assembled positions exactly", () => {
    const v = buildVault(spec);
    const ex = new ExplodedView(v.root, spec);
    expect(ex.count).toBeGreaterThan(15);
    const before = new Map<THREE.Object3D, THREE.Vector3>();
    v.root.traverse((o) => before.set(o, o.position.clone()));
    for (const t of [0.13, 1, 0.5, 0.987654, 0]) ex.set(t);
    ex.set(0.42);
    const moved = [...before.keys()].filter((o) => !o.position.equals(before.get(o)!));
    expect(moved.length).toBeGreaterThan(15);
    ex.set(0);
    for (const [o, p] of before) {
      expect(o.position.x, o.name).toBe(p.x);
      expect(o.position.y, o.name).toBe(p.y);
      expect(o.position.z, o.name).toBe(p.z);
    }
  });

  it("exploded door moves out along +Z by the spec distance", () => {
    const v = buildVault(spec);
    const ex = new ExplodedView(v.root, spec);
    const z0 = v.door.position.z;
    ex.set(1);
    expect(v.door.position.z - z0).toBeCloseTo(mm(spec.explode.door.value[2]), 12);
  });
});

describe("cutaway", () => {
  it("plane keeps x ≤ cut and disables cleanly", () => {
    const c = new Cutaway(spec);
    c.set(1);
    expect(c.plane.distanceToPoint(new THREE.Vector3(-0.1, 0, 0))).toBeGreaterThan(0);
    expect(c.plane.distanceToPoint(new THREE.Vector3(0.1, 0, 0))).toBeLessThan(0);
    c.set(0);
    expect(c.plane.distanceToPoint(new THREE.Vector3(1, 0, 0))).toBeGreaterThan(0);
  });

  it("attaches the clipping plane to every vault material", () => {
    const v = buildVault(spec);
    const c = new Cutaway(spec);
    c.attach(v.root);
    v.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) expect(m.clippingPlanes?.[0]).toBe(c.plane);
    });
  });
});

describe("easing", () => {
  it("curves hit their endpoints and stay monotonic", () => {
    for (const f of [premium, snappy, sineInOut, cubicBezier(0.25, 0.1, 0.25, 1)]) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      let prev = 0;
      for (let t = 0; t <= 1; t += 0.01) {
        const v = f(t);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it("cubic-bezier matches known CSS values", () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
  });
});

describe("URL state", () => {
  it("parses the documented example", () => {
    const s = parseQuery("?view=front&glass=opaque", MAX);
    expect(s.view).toBe("front");
    expect(s.glass).toBe("opaque");
  });

  it("round-trips every field", () => {
    const s = { ...DEFAULTS, view: "left" as const, glass: "opaque" as const, door: 45, security: "alert" as const, mode: "warm" as const, tint: true, overlay: true, explode: 0.5, cutaway: 0.25, post: false, exposure: 1.3, toneMapping: "aces" as const, hdriBackground: true };
    const back = parseQuery(toQuery(s, MAX), MAX);
    expect(back).toEqual(s);
  });

  it("patent mode forces its defaults: closed door, opaque glass, no post, no labels", () => {
    const s = parseQuery("?patent=1&overlay=1&post=1", MAX);
    expect(s.patent).toBe(true);
    expect(s.glass).toBe("opaque");
    expect(s.door).toBe(0);
    expect(s.post).toBe(false);
    expect(s.overlay).toBe(false);
    expect(parseQuery("?patent=1&glass=transparent", MAX).glass).toBe("transparent");
  });

  it("clamps and rejects bad input", () => {
    const s = parseQuery("?door=999&explode=7&cutaway=-1&view=nope&exposure=abc", MAX);
    expect(s.door).toBe(MAX);
    expect(s.explode).toBe(1);
    expect(s.cutaway).toBe(0);
    expect(s.view).toBe("hero");
    expect(s.exposure).toBe(1);
    expect(parseQuery("?door=open", MAX).door).toBe(MAX);
  });
});

describe("patent views", () => {
  const v = buildVault(spec);
  const box = modelBox(v.root);

  it("has the 7 required views with the required file names", () => {
    expect([...PATENT_VIEWS]).toEqual(["front", "rear", "left", "right", "top", "bottom", "perspective"]);
    expect(Object.values(PATENT_FILES)).toEqual(["01-front.png", "02-rear.png", "03-left.png", "04-right.png", "05-top.png", "06-bottom.png", "07-perspective.png"]);
  });

  it("all orthographic views share one scale and look exactly along an axis", () => {
    const sizes = new Set<number>();
    const axes: Record<string, THREE.Vector3> = {
      front: new THREE.Vector3(0, 0, -1), rear: new THREE.Vector3(0, 0, 1), left: new THREE.Vector3(1, 0, 0),
      right: new THREE.Vector3(-1, 0, 0), top: new THREE.Vector3(0, -1, 0), bottom: new THREE.Vector3(0, 1, 0),
    };
    for (const view of ["front", "rear", "left", "right", "top", "bottom"] as const) {
      const cam = orthoCamera(view, box, 1, spec.render.patentMargin.value);
      sizes.add(Math.round((cam.top - cam.bottom) * 1e9));
      const look = cam.getWorldDirection(new THREE.Vector3());
      expect(look.distanceTo(axes[view]), view).toBeLessThan(1e-9);
      // Whole model inside the frustum with the margin.
      const corners = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => new THREE.Vector3(i ? box.max.x : box.min.x, j ? box.max.y : box.min.y, k ? box.max.z : box.min.z))));
      for (const c of corners) {
        const p = c.clone().project(cam);
        expect(Math.abs(p.x), view).toBeLessThan(1);
        expect(Math.abs(p.y), view).toBeLessThan(1);
      }
    }
    expect(sizes.size).toBe(1);
  });

  it("top view puts the front at the bottom, bottom view puts it at the top", () => {
    const front = new THREE.Vector3(0, box.min.y, box.max.z);
    expect(front.clone().project(orthoCamera("top", box, 1, 0.08)).y).toBeLessThan(0);
    expect(front.clone().project(orthoCamera("bottom", box, 1, 0.08)).y).toBeGreaterThan(0);
  });

  it("perspective view is 45° azimuth and 45° elevation from the top-front corner", () => {
    const d = perspectiveDirection();
    expect((Math.asin(d.y) * 180) / Math.PI).toBeCloseTo(45, 9);
    expect((Math.atan2(d.x, d.z) * 180) / Math.PI).toBeCloseTo(45, 9);
  });
});

describe("rendering helpers", () => {
  it("real lens FOV: 50 mm on full frame ≈ 27°", () => {
    expect(lensFov(spec)).toBeCloseTo(26.99, 1);
  });

  it("background pre-compensation inverts the tone curve", () => {
    for (const curve of [THREE.AgXToneMapping, THREE.ACESFilmicToneMapping]) {
      const c = precompensate("#eef0f2", curve, 1);
      const f = curve === THREE.AgXToneMapping ? agxNeutral : acesNeutral;
      const target = new THREE.Color("#eef0f2");
      expect(f(c.r, 1)).toBeCloseTo(target.r, 4);
      expect(f(c.b, 1)).toBeCloseTo(target.b, 4);
    }
  });
});

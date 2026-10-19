import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { spec } from "../../src/spec/dimensions";
import { derive, unionBox, type Box } from "../../src/spec/derived";
import { components } from "../../src/spec/layout";
import { buildVault } from "../../src/geometry/vault";

/** Spec component → built object name. */
const MAP: Record<string, string> = {
  hingeTop: "hingeTop", hingeBottom: "hingeBottom", handle: "handle",
  lockHousing: "lockHousing", lockBolt: "lockBolt", lockCatch: "lockCatch",
  controlStrip: "controlStrip", pir: "pir", camera: "camera", magnet: "magnet", reed: "reed",
  vibration: "vibration", tempHumidity: "tempHumidity", shelf0: "shelf0",
  bayCover: "bayCover", bayFrontPanel: "bayFrontPanel", controller: "controller", imu: "imu",
  battery: "battery", tamper: "tamper", buzzer: "buzzer", powerInlet: "powerInlet",
  peltierTec: "tec", peltierInnerSink: "innerSink", peltierInnerFan: "innerFan",
  peltierOuterSink: "outerSink", peltierOuterFan: "outerFan", peltierShroud: "peltierShroud",
  footLB: "footLB", footRB: "footRB", footLF: "footLF", footRF: "footRF",
};

const TOL = 0.6; // mm: bevels, proud LEDs, anti-z-fight offsets

function worldBoxMm(obj: THREE.Object3D): Box {
  obj.updateWorldMatrix(true, true);
  const b = new THREE.Box3().setFromObject(obj, true);
  return { min: b.min.toArray().map((v) => v * 1000) as Box["min"], max: b.max.toArray().map((v) => v * 1000) as Box["max"] };
}

describe("built geometry matches the spec", () => {
  const vault = buildVault(spec);
  vault.root.updateMatrixWorld(true);
  const comps = components(spec);

  it("every physical component in the spec has a mesh", () => {
    const unmapped = comps.filter((c) => !MAP[c.name] && !/^(shelf\dPin|rearScrew)/.test(c.name)).map((c) => c.name);
    expect(unmapped).toEqual([]);
    const missing = comps.filter((c) => MAP[c.name] && !vault.root.getObjectByName(MAP[c.name])).map((c) => c.name);
    expect(missing).toEqual([]);
  });

  for (const c of comps) {
    const objName = MAP[c.name];
    if (!objName) continue;
    it(`${c.name} stays inside its spec envelope and fills it`, () => {
      const got = worldBoxMm(vault.root.getObjectByName(objName)!);
      for (let i = 0; i < 3; i++) {
        expect(got.min[i], `${c.name} min[${i}]`).toBeGreaterThanOrEqual(c.box.min[i] - TOL);
        expect(got.max[i], `${c.name} max[${i}]`).toBeLessThanOrEqual(c.box.max[i] + TOL);
        const want = c.box.max[i] - c.box.min[i];
        expect(got.max[i] - got.min[i], `${c.name} size[${i}]`).toBeGreaterThanOrEqual(want * 0.8 - TOL);
      }
    });
  }

  it("shelf pins and rear screws match their spec positions", () => {
    const pins = unionBox(...comps.filter((c) => c.name.startsWith("shelf0Pin")).map((c) => c.box));
    const screws = unionBox(...comps.filter((c) => c.name.startsWith("rearScrew")).map((c) => c.box));
    for (const [want, name] of [[pins, "shelf0Pins"], [screws, "rearScrewHeads"]] as const) {
      const got = worldBoxMm(vault.root.getObjectByName(name)!);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(got.min[i] - want.min[i]), `${name} min[${i}]`).toBeLessThan(TOL);
        expect(Math.abs(got.max[i] - want.max[i]), `${name} max[${i}]`).toBeLessThan(TOL);
      }
    }
  });

  it("body outer envelope equals W × H × D on the floor", () => {
    const d = derive(spec);
    const got = unionBox(worldBoxMm(vault.root.getObjectByName("shell")!), worldBoxMm(vault.root.getObjectByName("rearPanelSheet")!));
    for (let i = 0; i < 3; i++) {
      expect(got.min[i]).toBeCloseTo(d.body.min[i], 1);
      expect(got.max[i]).toBeCloseTo(d.body.max[i], 1);
    }
    const feet = worldBoxMm(vault.root.getObjectByName("feet")!);
    expect(feet.min[1]).toBeCloseTo(0, 3);
  });

  it("body is a hollow shell with the spec wall thickness (raycast)", () => {
    const d = derive(spec);
    const shell = vault.root.getObjectByName("shell") as THREE.Mesh;
    const mat = shell.material as THREE.Material;
    mat.side = THREE.DoubleSide;
    const rc = new THREE.Raycaster();
    const cy = (d.inner.min[1] + d.inner.max[1]) / 2000;
    const hitsAlong = (origin: THREE.Vector3, dir: THREE.Vector3) => {
      rc.set(origin, dir);
      return rc.intersectObject(shell).map((h) => h.distance * 1000);
    };
    // From outside on +X, travelling −X through both side walls at mid-depth.
    const hx = hitsAlong(new THREE.Vector3(1, cy, 0), new THREE.Vector3(-1, 0, 0));
    expect(hx.length).toBe(4);
    expect(hx[0]).toBeCloseTo(1000 - d.W / 2, 1);
    expect(hx[1] - hx[0]).toBeCloseTo(d.t, 1);
    expect(hx[2] - hx[1]).toBeCloseTo(d.W - 2 * d.t, 1);
    expect(hx[3] - hx[2]).toBeCloseTo(d.t, 1);
    // Down through the top and bottom walls.
    const hy = hitsAlong(new THREE.Vector3(0.05, 2, 0), new THREE.Vector3(0, -1, 0));
    expect(hy.length).toBe(4);
    expect(hy[1] - hy[0]).toBeCloseTo(d.t, 1);
    expect(hy[2] - hy[1]).toBeCloseTo(d.H - 2 * d.t, 1);
    mat.side = THREE.FrontSide;
  });

  it("door is inset with the spec gap on every side", () => {
    const d = derive(spec);
    const frame = worldBoxMm(vault.root.getObjectByName("doorFrame")!);
    const g = spec.door.gap.value;
    expect(frame.min[0] - d.opening.minX).toBeCloseTo(g, 2);
    expect(d.opening.maxX - frame.max[0]).toBeCloseTo(g, 2);
    expect(frame.min[1] - d.opening.minY).toBeCloseTo(g, 2);
    expect(d.opening.maxY - frame.max[1]).toBeCloseTo(g, 2);
    expect(frame.max[2]).toBeCloseTo(d.front, 2);
    expect(frame.min[2]).toBeCloseTo(d.doorBackZ, 2);
  });

  it("glass is inset in the frame with the spec thickness", () => {
    const d = derive(spec);
    const g = worldBoxMm(vault.root.getObjectByName("smartGlass")!);
    expect(g.max[2] - g.min[2]).toBeCloseTo(spec.door.glassThickness.value, 2);
    for (let i = 0; i < 3; i++) {
      expect(g.min[i]).toBeCloseTo(d.glass.min[i], 2);
      expect(g.max[i]).toBeCloseTo(d.glass.max[i], 2);
    }
  });

  it("door pivot sits on the hinge axis from the spec", () => {
    const d = derive(spec);
    expect(vault.door.position.x * 1000).toBeCloseTo(d.pivot.x, 6);
    expect(vault.door.position.z * 1000).toBeCloseTo(d.pivot.z, 6);
    for (const n of ["handle", "controlStrip", "pir", "magnet", "lockCatch", "hingeTop", "hingeBottom"]) {
      let p: THREE.Object3D | null = vault.root.getObjectByName(n)!;
      while (p && p !== vault.door) p = p.parent;
      expect(p, `${n} swings with the door`).toBe(vault.door);
    }
  });

  it("curved parts use at least 48 radial segments", () => {
    expect(spec.render.radialSegments.value).toBeGreaterThanOrEqual(48);
    const foot = vault.root.getObjectByName("footLF") as THREE.Mesh;
    expect((foot.geometry as THREE.LatheGeometry).parameters.segments).toBeGreaterThanOrEqual(48);
    const dome = vault.root.getObjectByName("pirDome") as THREE.Mesh;
    expect((dome.geometry as THREE.SphereGeometry).parameters.widthSegments).toBeGreaterThanOrEqual(48);
  });

  it("no material instance is shared between meshes", () => {
    const seen = new Map<THREE.Material, string>();
    const shared: string[] = [];
    vault.root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const m = (o as THREE.Mesh).material as THREE.Material;
      const label = o.name || o.parent?.name || "?";
      if (seen.has(m)) shared.push(`${seen.get(m)} & ${label}`);
      else seen.set(m, label);
    });
    expect(shared).toEqual([]);
  });

  it("repeated parts are instanced", () => {
    for (const n of ["rearScrewHeads", "rearVents", "buzzerGrilleHoles", "shroudBackSlots"]) {
      const o = vault.root.getObjectByName(n) as THREE.InstancedMesh;
      expect(o?.isInstancedMesh, n).toBe(true);
      expect(o.count, n).toBeGreaterThan(1);
    }
  });
});

import * as THREE from "three";
import type { Spec } from "../spec/dimensions";
import * as body from "./body";
import * as door from "./door";
import * as hinges from "./hinges";
import * as lock from "./lock";
import * as handle from "./handle";
import * as controlStrip from "./controlStrip";
import * as shelves from "./shelves";
import * as sensors from "./sensors";
import * as electronics from "./electronics";
import * as power from "./power";
import * as buzzer from "./buzzer";
import * as peltier from "./peltier";
import * as feet from "./feet";
import { group, projectUVs } from "./util";
import { BLOOM_LAYER } from "../scene/postprocessing";

/** Texture tile size for world-projected UVs (metres). */
const UV_TILE = 0.08;

export interface Vault {
  root: THREE.Group;
  door: THREE.Group;
  bolt: THREE.Mesh;
  glass: THREE.Mesh;
  leds: { status: THREE.Mesh; mode: THREE.Mesh; network: THREE.Mesh; pad: THREE.Mesh; camera: THREE.Mesh };
  grille: THREE.Group;
  fanRotors: THREE.Object3D[];
}

function find<T extends THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`vault part "${name}" not found`);
  return o as T;
}

/** Build every part from the spec and assemble them; door-mounted parts are attached to the hinge pivot. */
export function buildVault(s: Spec): Vault {
  const root = group("vault");
  const doorPivot = door.build(s);
  const h = hinges.build(s);
  root.add(
    body.build(s),
    feet.build(s),
    h.bushings,
    lock.build(s),
    shelves.build(s),
    sensors.build(s),
    electronics.build(s),
    power.build(s),
    buzzer.build(s),
    peltier.build(s),
    doorPivot,
  );

  // Door-mounted parts are built in world coordinates (door closed), then
  // re-parented to the pivot so they swing with it.
  root.updateMatrixWorld(true);
  for (const part of [handle.build(s), controlStrip.build(s), sensors.buildDoorMounted(s), lock.buildCatch(s), h.pins]) {
    root.add(part);
    root.updateMatrixWorld(true);
    doorPivot.attach(part);
  }

  // Consistent texel density for procedural maps; LEDs and the buzzer grille bloom.
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const name = (mesh.material as THREE.Material).name;
    if (name === "powderCoat" || name === "brushedMetal") projectUVs(mesh, UV_TILE);
    if (name === "led") mesh.layers.enable(BLOOM_LAYER);
  });
  root.getObjectByName("buzzerGrilleHoles")?.layers.enable(BLOOM_LAYER);

  return {
    root,
    door: doorPivot,
    bolt: find<THREE.Mesh>(root, "lockBolt"),
    glass: find<THREE.Mesh>(root, "smartGlass"),
    leds: {
      status: find(root, "ledStatus"),
      mode: find(root, "ledMode"),
      network: find(root, "ledNetwork"),
      pad: find(root, "padRing"),
      camera: find(root, "cameraLed"),
    },
    grille: find<THREE.Group>(root, "buzzerGrille"),
    fanRotors: (() => {
      const out: THREE.Object3D[] = [];
      root.traverse((o) => o.name === "fanRotor" && out.push(o));
      return out;
    })(),
  };
}

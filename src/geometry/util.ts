import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mm, spec } from "../spec/dimensions";

/** Smallest edge break applied to every visible edge (real parts are never knife-sharp). */
export const MIN_BEVEL = 0.6;
export const SEG = (): number => spec.render.radialSegments.value;

type V3 = readonly [number, number, number] | readonly number[];

export function named<T extends THREE.Object3D>(obj: T, name: string): T {
  obj.name = name;
  return obj;
}

export function shadows<T extends THREE.Object3D>(obj: T, cast = true, receive = true): T {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

/** Place an object at a millimetre position. */
export function at<T extends THREE.Object3D>(obj: T, p: V3): T {
  obj.position.set(mm(p[0]), mm(p[1]), mm(p[2]));
  return obj;
}

/** Rounded box from millimetre size, centred on its origin. */
export function rbox(size: V3, material: THREE.Material, radius = MIN_BEVEL, segments = 3): THREE.Mesh {
  const minHalf = Math.min(size[0], size[1], size[2]) / 2;
  const r = Math.min(radius, minHalf * 0.98);
  const geo = new RoundedBoxGeometry(mm(size[0]), mm(size[1]), mm(size[2]), segments, mm(r));
  return shadows(new THREE.Mesh(geo, material));
}

/** Cylinder from millimetre radius/length along the given axis, centred on its origin. */
export function cyl(radius: number, length: number, material: THREE.Material, axis: "x" | "y" | "z" = "y", segments = SEG()): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(mm(radius), mm(radius), mm(length), segments);
  if (axis === "x") geo.rotateZ(Math.PI / 2);
  if (axis === "z") geo.rotateX(Math.PI / 2);
  return shadows(new THREE.Mesh(geo, material));
}

/**
 * Revolved profile (mm, [radius, height] pairs) around the given axis.
 * Used for feet, bushings, domes and bezels so their edges are rounded.
 */
export function lathe(profile: [number, number][], material: THREE.Material, axis: "y" | "z" | "x" = "y", segments = SEG()): THREE.Mesh {
  const pts = profile.map(([r, h]) => new THREE.Vector2(mm(r), mm(h)));
  const geo = new THREE.LatheGeometry(pts, segments);
  if (axis === "z") geo.rotateX(Math.PI / 2);
  if (axis === "x") geo.rotateZ(-Math.PI / 2);
  return shadows(new THREE.Mesh(geo, material));
}

/** Rounded-rectangle shape in metres, centred at (cx, cy) given in mm. */
export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0, path: THREE.Path = new THREE.Shape()): THREE.Path {
  const x = mm(cx - w / 2);
  const y = mm(cy - h / 2);
  const W = mm(w);
  const H = mm(h);
  const R = mm(Math.min(r, w / 2, h / 2));
  path.moveTo(x + R, y);
  path.lineTo(x + W - R, y);
  path.quadraticCurveTo(x + W, y, x + W, y + R);
  path.lineTo(x + W, y + H - R);
  path.quadraticCurveTo(x + W, y + H, x + W - R, y + H);
  path.lineTo(x + R, y + H);
  path.quadraticCurveTo(x, y + H, x, y + H - R);
  path.lineTo(x, y + R);
  path.quadraticCurveTo(x, y, x + R, y);
  return path;
}

/** Hole path wound opposite to the outer shape. */
export function roundedRectHole(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Path {
  const x = mm(cx - w / 2);
  const y = mm(cy - h / 2);
  const W = mm(w);
  const H = mm(h);
  const R = mm(Math.min(r, w / 2, h / 2));
  const p = new THREE.Path();
  p.moveTo(x + R, y);
  p.quadraticCurveTo(x, y, x, y + R);
  p.lineTo(x, y + H - R);
  p.quadraticCurveTo(x, y + H, x + R, y + H);
  p.lineTo(x + W - R, y + H);
  p.quadraticCurveTo(x + W, y + H, x + W, y + H - R);
  p.lineTo(x + W, y + R);
  p.quadraticCurveTo(x + W, y, x + W - R, y);
  p.lineTo(x + R, y);
  return p;
}

/**
 * Extrude a shape along +Z from z0 to z1 (mm) with a bevel that keeps the
 * nominal outline exact (bevelOffset = −bevel).
 */
export function extrudeZ(shape: THREE.Shape, z0: number, z1: number, material: THREE.Material, bevel = MIN_BEVEL): THREE.Mesh {
  const len = z1 - z0;
  const b = Math.min(bevel, len / 2 - 0.01);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: mm(len - 2 * b),
    bevelEnabled: true,
    bevelThickness: mm(b),
    bevelSize: mm(b),
    bevelOffset: -mm(b),
    bevelSegments: 3,
    curveSegments: 12,
  });
  geo.translate(0, 0, mm(z0 + b));
  return shadows(new THREE.Mesh(geo, material));
}

/** Instanced copies of a geometry at millimetre positions (screws, slots, holes). */
export function instanced(geo: THREE.BufferGeometry, material: THREE.Material, positions: V3[], rotation?: THREE.Euler): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, material, positions.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(rotation ?? new THREE.Euler());
  const one = new THREE.Vector3(1, 1, 1);
  positions.forEach((p, i) => {
    m.compose(new THREE.Vector3(mm(p[0]), mm(p[1]), mm(p[2])), q, one);
    im.setMatrixAt(i, m);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingBox();
  im.computeBoundingSphere();
  return shadows(im);
}

/** Tag an object with its exploded-view offset (mm). */
export function explode<T extends THREE.Object3D>(obj: T, offset: V3): T {
  obj.userData.explode = [offset[0], offset[1], offset[2]];
  return obj;
}

export function group(name: string, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  if (children.length) g.add(...children);
  return g;
}

/** Free GPU resources of everything under `root` (shared procedural textures are kept). */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}

/**
 * Re-project UVs from world-space position (box/triplanar projection by the
 * dominant normal axis), so procedural maps keep one texel density across
 * extrusions and rounded boxes. `tile` is the texture repeat size in metres.
 * U follows the part's longest horizontal-ish axis per face, so brushed
 * streaks run along the face.
 */
export function projectUVs(mesh: THREE.Mesh, tile: number): void {
  const geo = mesh.geometry;
  const pos = geo.getAttribute("position");
  const nrm = geo.getAttribute("normal");
  if (!pos || !nrm) return;
  mesh.updateWorldMatrix(true, false);
  const m = mesh.matrixWorld;
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(m);
    n.fromBufferAttribute(nrm, i).applyMatrix3(nm);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    let u: number;
    let v: number;
    if (ax >= ay && ax >= az) [u, v] = [p.z, p.y];
    else if (ay >= az) [u, v] = [p.x, p.z];
    else [u, v] = [p.x, p.y];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

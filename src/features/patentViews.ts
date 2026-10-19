import * as THREE from "three";
import { deg } from "../spec/dimensions";

export const PATENT_VIEWS = ["front", "rear", "left", "right", "top", "bottom", "perspective"] as const;
export type PatentView = (typeof PATENT_VIEWS)[number];
export type ViewName = PatentView | "hero";

/** File names for `npm run render:patent`. */
export const PATENT_FILES: Record<PatentView, string> = {
  front: "01-front.png",
  rear: "02-rear.png",
  left: "03-left.png",
  right: "04-right.png",
  top: "05-top.png",
  bottom: "06-bottom.png",
  perspective: "07-perspective.png",
};

interface AxisView {
  dir: THREE.Vector3;
  up: THREE.Vector3;
}

/**
 * View directions (from the target toward the camera). Top view has the
 * front edge at the bottom of the image, bottom view has it at the top
 * (third-angle projection layout). "left" is the vault's own left (−X).
 */
const AXIS: Record<Exclude<PatentView, "perspective">, AxisView> = {
  front: { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  rear: { dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
  left: { dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  right: { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  top: { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  bottom: { dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
};

/** 45° azimuth (front toward +X) and 45° elevation: the top-front-right corner. */
export function perspectiveDirection(): THREE.Vector3 {
  const az = deg(45);
  const el = deg(45);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
}

export function viewDirection(view: PatentView): { dir: THREE.Vector3; up: THREE.Vector3 } {
  if (view === "perspective") return { dir: perspectiveDirection(), up: new THREE.Vector3(0, 1, 0) };
  return { dir: AXIS[view].dir.clone(), up: AXIS[view].up.clone() };
}

/**
 * Orthographic camera for an axis view. All six share one frustum size
 * derived from the largest bounding-box side plus the margin, so every view
 * is drawn at the same scale.
 */
export function orthoCamera(view: Exclude<PatentView, "perspective">, box: THREE.Box3, aspect: number, margin: number): THREE.OrthographicCamera {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const L = Math.max(size.x, size.y, size.z);
  const half = (L * (1 + 2 * margin)) / 2;
  const cam = new THREE.OrthographicCamera(-half * Math.max(aspect, 1), half * Math.max(aspect, 1), half / Math.min(aspect, 1), -half / Math.min(aspect, 1), L * 0.01, L * 10);
  const { dir, up } = viewDirection(view);
  cam.up.copy(up);
  cam.position.copy(center).addScaledVector(dir, L * 3);
  cam.lookAt(center);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  cam.name = `patent:${view}`;
  return cam;
}

/** Distance at which a sphere of `radius` fits the narrower FOV with the margin. */
export function fitDistance(radius: number, vfovDeg: number, aspect: number, margin: number): number {
  const vf = deg(vfovDeg) / 2;
  const hf = Math.atan(Math.tan(vf) * aspect);
  return (radius * (1 + 2 * margin)) / Math.sin(Math.min(vf, hf));
}

/** Place a perspective camera looking at the box from `dir`, framed by its bounding sphere. */
export function framePerspective(cam: THREE.PerspectiveCamera, box: THREE.Box3, dir: THREE.Vector3, up: THREE.Vector3, margin: number): THREE.Vector3 {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist = fitDistance(sphere.radius, cam.fov, cam.aspect, margin);
  cam.up.copy(up);
  cam.position.copy(sphere.center).addScaledVector(dir.clone().normalize(), dist);
  cam.near = dist / 50;
  cam.far = dist * 50;
  cam.lookAt(sphere.center);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return sphere.center.clone();
}

/** Bounding box of the model, ignoring overlay helpers and lights. */
export function modelBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.overlay || !p.visible) return;
    box.expandByObject(o, false);
  });
  return box;
}

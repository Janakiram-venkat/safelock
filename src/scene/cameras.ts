import * as THREE from "three";
import type { Spec } from "../spec/dimensions";

/** Vertical FOV of a real lens: 2·atan(sensorHeight / 2f). */
export function lensFov(s: Spec): number {
  return (2 * Math.atan(s.optics.sensorHeight.value / (2 * s.optics.focalLength.value)) * 180) / Math.PI;
}

/** Presentation camera with the spec focal length (50 mm full-frame ≈ 27° vertical). */
export function presentationCamera(s: Spec, aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(lensFov(s), aspect, 0.01, 100);
  cam.name = "presentation";
  return cam;
}

/** Hero framing: three-quarter view from the front-right, slightly above. */
export function heroDirection(): THREE.Vector3 {
  const az = (32 * Math.PI) / 180;
  const el = (18 * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

import * as THREE from "three";
import { mm, type Spec } from "../spec/dimensions";
import { derive } from "../spec/derived";
import { materials as M } from "../spec/materials";

/**
 * Two rigs:
 * - presentation: shadow-casting key light, soft fill, rim, and a
 *   shadow-catcher floor so the vault sits naturally on a light background.
 * - patent: even, shadowless lighting so every edge reads.
 * Image-based lighting from the HDRI does most of the work in both.
 */
export class Lighting {
  readonly presentation = new THREE.Group();
  readonly patent = new THREE.Group();
  readonly floor: THREE.Mesh;
  readonly key: THREE.DirectionalLight;

  constructor(s: Spec, scene: THREE.Scene) {
    const d = derive(s);
    const size = Math.max(d.W, d.H, d.D);
    const target = new THREE.Vector3(0, mm(d.floorY + d.H / 2), 0);

    // Key: high front-left softbox, so the soft shadow falls back-right into view.
    this.key = new THREE.DirectionalLight(0xfff6ec, 2.4);
    this.key.position.set(-mm(size * 2), mm(size * 5), mm(size * 2.6));
    this.key.target.position.copy(target);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(4096, 4096);
    const ext = mm(size * 1.4);
    Object.assign(this.key.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: mm(size), far: mm(size * 10) });
    this.key.shadow.camera.updateProjectionMatrix();
    this.key.shadow.bias = -0.00015;
    this.key.shadow.normalBias = 0.0015;
    this.key.shadow.radius = 8;
    this.key.shadow.blurSamples = 16;

    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.6);
    fill.position.set(mm(size * 3), mm(size * 1.2), mm(size * 2));
    fill.target.position.copy(target);
    const rim = new THREE.DirectionalLight(0xffffff, 0.9);
    rim.position.set(mm(size * 1.5), mm(size * 2.5), -mm(size * 3));
    rim.target.position.copy(target);
    this.presentation.add(this.key, this.key.target, fill, fill.target, rim, rim.target);

    // Patent rig: hemisphere + four soft directionals, no shadows.
    this.patent.add(new THREE.HemisphereLight(0xffffff, 0xdddddd, 1.2));
    for (const [x, y, z, i] of [[1, 1, 1, 0.7], [-1, 1, 1, 0.7], [1, 0.6, -1, 0.45], [-1, 0.6, -1, 0.45], [0, -1, 0.3, 0.3]]) {
      const l = new THREE.DirectionalLight(0xffffff, i);
      l.position.set(x, y, z);
      l.target.position.set(0, 0, 0);
      this.patent.add(l, l.target);
    }

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(mm(size * 12), mm(size * 12)), new THREE.ShadowMaterial({ opacity: M.shadowOpacity }));
    this.floor.name = "shadowCatcher";
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.userData.overlay = true; // not part of the model bounds

    scene.add(this.presentation, this.patent, this.floor);
    this.setPatent(false);
  }

  setPatent(on: boolean): void {
    this.presentation.visible = !on;
    this.floor.visible = !on;
    this.patent.visible = on;
  }
}

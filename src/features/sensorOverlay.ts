import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { mm, deg, type Spec } from "../spec/dimensions";
import { derive } from "../spec/derived";
import { materials as M } from "../spec/materials";
import type { Vault } from "../geometry/vault";

interface SensorDef {
  object: string;
  label: string;
  color: string;
  /** Put the label under the box instead of above it (avoids overlaps). */
  below?: boolean;
}

const SENSORS: SensorDef[] = [
  { object: "pir", label: "PIR presence sensor", color: M.overlay.pir, below: true },
  { object: "camera", label: "Internal camera + LED", color: M.overlay.camera },
  { object: "magnet", label: "Door sensor (magnet)", color: M.overlay.sensor },
  { object: "reed", label: "Door sensor (reed switch)", color: M.overlay.sensor, below: true },
  { object: "vibration", label: "Vibration sensor", color: M.overlay.sensor },
  { object: "tempHumidity", label: "Temperature / humidity", color: M.overlay.sensor },
  { object: "imu", label: "Accelerometer / IMU", color: M.overlay.sensor },
  { object: "tamper", label: "Tamper switch", color: M.overlay.sensor },
  { object: "buzzer", label: "Buzzer", color: M.overlay.sensor },
  { object: "lock", label: "Solenoid lock", color: M.overlay.sensor },
  { object: "controller", label: "Wi-Fi/BLE controller", color: M.overlay.sensor },
  { object: "peltier", label: "Peltier unit", color: M.overlay.sensor },
  { object: "battery", label: "Backup battery", color: M.overlay.sensor },
  { object: "powerInlet", label: "Power inlet", color: M.overlay.sensor },
];

/**
 * Sensor overlay: highlight box + CSS2D label per sensor, the PIR detection
 * cone and the camera field of view (angles and range from the spec).
 * All overlay objects are tagged userData.overlay so framing ignores them.
 */
export class SensorOverlay {
  private readonly objects: THREE.Object3D[] = [];
  visible = false;

  constructor(private readonly s: Spec, vault: Vault) {
    vault.root.updateMatrixWorld(true);
    for (const def of SENSORS) {
      const target = vault.root.getObjectByName(def.object);
      if (!target) continue;
      const box = new THREE.Box3().setFromObject(target, true);
      const anchor = new THREE.Group();
      anchor.name = `overlay:${def.object}`;
      anchor.userData.overlay = true;
      anchor.position.copy(target.worldToLocal(box.getCenter(new THREE.Vector3())));
      // Highlight box (local frame of the sensor, axis-aligned while assembled).
      const size = box.getSize(new THREE.Vector3()).addScalar(mm(3));
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
        new THREE.LineBasicMaterial({ color: def.color, depthTest: false, transparent: true, opacity: 0.9 }),
      );
      edges.renderOrder = 10;
      anchor.add(edges);
      const el = document.createElement("div");
      el.className = "sensor-label";
      el.style.setProperty("--accent", def.color);
      el.textContent = def.label;
      const label = new CSS2DObject(el);
      label.position.set(0, (def.below ? -1 : 1) * (size.y / 2 + mm(6)), 0);
      anchor.add(label);
      target.add(anchor);
      this.objects.push(anchor);
    }
    this.addPirCone(vault);
    this.addCameraFov(vault);
    this.setVisible(false);
  }

  private addPirCone(vault: Vault): void {
    const p = this.s.pir;
    const pir = vault.root.getObjectByName("pir")!;
    const range = mm(p.range.value);
    const radius = range * Math.tan(deg(p.detectionAngle.value / 2));
    // Drawn as range rings and edge lines, no fill: the vault sits behind the
    // apex, so any fill would tint every sight line to it.
    const lines = new THREE.Group();
    const circle = (z: number) =>
      Array.from({ length: 96 }, (_, i) => {
        const a = (i / 96) * Math.PI * 2;
        const r = z * Math.tan(deg(p.detectionAngle.value / 2));
        return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z);
      });
    for (let z = 0.25; z <= range + 1e-6; z += 0.25) {
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circle(z)), new THREE.LineBasicMaterial({ color: M.overlay.pir, transparent: true, opacity: 0.9 * (1 - z / range) + 0.1 }));
      lines.add(ring);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const end = new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, range);
      lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), end]), new THREE.LineBasicMaterial({ color: M.overlay.pir, transparent: true, opacity: 0.5 })));
    }
    const g = new THREE.Group();
    g.name = "overlay:pirCone";
    g.userData.overlay = true;
    const pc = p.center.value;
    g.position.copy(pir.worldToLocal(new THREE.Vector3(mm(pc[0]), mm(pc[1]), mm(pc[2] + p.bezelHeight.value + p.domeHeight.value))));
    g.add(lines);
    pir.add(g);
    this.objects.push(g);
  }

  private addCameraFov(vault: Vault): void {
    const c = this.s.camera;
    const d = derive(this.s);
    const head = vault.root.getObjectByName("cameraHead")!;
    // Reach: along the lens axis to the rear inner wall.
    const tilt = deg(c.tilt.value);
    const reach = mm(c.center.value[2] - d.inner.min[2]) / Math.cos(tilt);
    const half = deg(c.fov.value / 2);
    const r = reach * Math.tan(half);
    const geo = new THREE.ConeGeometry(r, reach, 4, 1, true);
    geo.rotateY(Math.PI / 4);
    geo.translate(0, -reach / 2, 0);
    geo.rotateX(Math.PI / 2); // opens toward local −Z (lens axis)
    const fov = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: M.overlay.camera, transparent: true, opacity: M.overlay.coneOpacity * 1.5, depthWrite: false, side: THREE.DoubleSide }));
    const g = new THREE.Group();
    g.name = "overlay:cameraFov";
    g.userData.overlay = true;
    g.position.z = -mm(c.housingSize.value[2] / 2 + c.lensLength.value);
    g.add(fov, new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: M.overlay.camera })));
    head.add(g);
    this.objects.push(g);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const o of this.objects) {
      o.visible = v;
      o.traverse((c) => {
        if (c instanceof CSS2DObject) c.element.style.display = v ? "" : "none";
      });
    }
  }

  dispose(): void {
    for (const o of this.objects) {
      o.traverse((c) => {
        if (c instanceof CSS2DObject) c.element.remove();
        const m = c as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      o.removeFromParent();
    }
  }
}

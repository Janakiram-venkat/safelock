import * as THREE from "three";
import type { Spec } from "../spec/dimensions";
import { mm } from "../spec/dimensions";
import { derive, boxCenter } from "../spec/derived";
import { materials as M } from "../spec/materials";
import type { Vault } from "../geometry/vault";

export type Security = "idle" | "alert";
export type StorageMode = "cold" | "normal" | "warm";

export interface DeviceState {
  security: Security;
  mode: StorageMode;
  tint: boolean;
}

const C = M.led.colors;
const ON = M.led.onIntensity;

function setLed(mesh: THREE.Mesh, color: string, intensity: number): void {
  const m = mesh.material as THREE.MeshStandardMaterial;
  m.emissive.set(color);
  m.emissiveIntensity = intensity;
}

/** Sine pulse 0..1 with the spec alert period. */
export function alertPulse(s: Spec, timeMs: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * timeMs) / s.timing.alertPulsePeriod.value);
}

/**
 * Drive LEDs, the buzzer grille, Peltier fans and the optional chamber tint
 * from the device state. Breach response (alert): glass opaque (handled by
 * the caller), status LED red and pulsing, buzzer grille pulsing, camera
 * illumination on.
 */
export class DeviceStateView {
  readonly chamberLight: THREE.PointLight;

  constructor(private readonly s: Spec, private readonly vault: Vault) {
    const d = derive(s);
    this.chamberLight = new THREE.PointLight(0xffffff, 0, mm(d.W), 2);
    this.chamberLight.name = "chamberTint";
    const c = boxCenter(d.chamber);
    this.chamberLight.position.set(mm(c[0]), mm(c[1]), mm(c[2]));
    vault.root.add(this.chamberLight);
  }

  apply(state: DeviceState, timeMs: number, dtMs: number, boltRetracted: boolean): void {
    const v = this.vault;
    const pulse = alertPulse(this.s, timeMs);
    const alert = state.security === "alert";

    if (alert) setLed(v.leds.status, C.alert, ON * (0.25 + 0.75 * pulse));
    else if (boltRetracted) setLed(v.leds.status, C.unlocked, ON);
    else setLed(v.leds.status, C.idle, ON);

    setLed(v.leds.mode, C[state.mode], ON);
    setLed(v.leds.network, C.network, ON * 0.6);
    setLed(v.leds.pad, alert ? C.alert : C.network, alert ? ON * (0.2 + 0.8 * pulse) : ON * 0.35);
    setLed(v.leds.camera, C.cameraIllumination, alert ? ON * 0.8 : 0);

    // Buzzer grille glows in time with the buzzer.
    v.grille.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m || !(o as THREE.Mesh).isMesh) return;
      m.emissive.set(C.alert);
      m.emissiveIntensity = alert ? ON * pulse : 0;
    });

    // Peltier fans run in cold / warm modes.
    const spin = state.mode === "normal" ? 0 : (2 * Math.PI * 25 * dtMs) / 1000;
    for (const r of v.fanRotors) r.rotation.z += spin;

    const tint = M.chamberTint;
    this.chamberLight.color.set(tint[state.mode]);
    this.chamberLight.intensity = state.tint && state.mode !== "normal" ? tint.intensity : 0;
  }
}

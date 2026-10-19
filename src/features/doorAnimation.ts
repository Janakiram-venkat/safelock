import type { Spec } from "../spec/dimensions";
import { deg } from "../spec/dimensions";
import { derive } from "../spec/derived";
import type { Vault } from "../geometry/vault";
import { premium, snappy } from "./easing";

export type DoorPhase = "idle" | "retracting" | "opening" | "closing" | "extending";

/**
 * Door + lock state machine. Invariant: the door angle is non-zero only while
 * the bolt is fully retracted. Opening = retract bolt → swing open; closing =
 * swing shut → extend bolt. Pure logic (no Three.js) so it can be unit tested.
 */
export class DoorController {
  /** Door angle in degrees, 0 = closed. */
  angle = 0;
  /** Bolt position: 0 = extended (locked), 1 = retracted. */
  bolt = 0;
  phase: DoorPhase = "idle";
  /**
   * Extend the bolt automatically once the door shuts. Standalone viewer: on.
   * Connected to the device hub: off, because the device decides when to lock.
   */
  autoLock = true;
  private wantOpen = false;
  private swingTarget = 0;
  private from = 0;
  private to = 0;
  private duration = 1;
  private elapsed = 0;

  constructor(private readonly s: Spec) {}

  get maxAngle(): number {
    return this.s.door.maxOpenAngle.value;
  }

  get locked(): boolean {
    return this.bolt === 0 && this.angle === 0;
  }

  get target(): "open" | "closed" {
    return this.wantOpen ? "open" : "closed";
  }

  open(angle = this.maxAngle): void {
    this.wantOpen = true;
    this.swingTarget = Math.min(Math.max(angle, 0), this.maxAngle);
    if (this.bolt < 1) this.startBolt(1);
    else this.startSwing(this.swingTarget);
  }

  close(): void {
    this.wantOpen = false;
    if (this.angle > 0) this.startSwing(0);
    else this.startBolt(0);
  }

  /**
   * Drive the bolt from the device's lock state without moving the door.
   * Ignored while the door is open or swinging (the bolt must stay retracted).
   */
  setLocked(locked: boolean): void {
    if (this.angle > 0 || this.phase === "opening" || this.phase === "closing") return;
    if (this.wantOpen) return;
    if (locked && this.bolt > 0) this.startBolt(0);
    if (!locked && this.bolt < 1) this.startBolt(1);
  }

  toggle(): void {
    if (this.wantOpen) this.close();
    else this.open();
  }

  /** Jump straight to a state (URL / patent renders). Keeps the invariant. */
  snap(angle: number): void {
    const a = Math.min(Math.max(angle, 0), this.maxAngle);
    this.angle = a;
    this.bolt = a > 0 ? 1 : 0;
    this.wantOpen = a > 0;
    this.swingTarget = a;
    this.phase = "idle";
  }

  private startBolt(to: 0 | 1): void {
    this.begin(to === 1 ? "retracting" : "extending", this.bolt, to, this.s.timing.boltTravel.value * Math.abs(to - this.bolt));
  }

  private startSwing(target: number): void {
    const opening = target > this.angle;
    const full = opening ? this.s.timing.doorOpen.value : this.s.timing.doorClose.value;
    // Partial swings take proportionally less time; never shorter than 25 %.
    const frac = Math.abs(target - this.angle) / this.maxAngle;
    this.begin(opening ? "opening" : "closing", this.angle, target, full * Math.max(frac, 0.25));
  }

  private begin(phase: DoorPhase, from: number, to: number, duration: number): void {
    this.phase = phase;
    this.from = from;
    this.to = to;
    this.duration = Math.max(duration, 1);
    this.elapsed = 0;
  }

  update(dtMs: number): void {
    if (this.phase === "idle") return;
    this.elapsed += dtMs;
    const p = Math.min(this.elapsed / this.duration, 1);
    if (this.phase === "retracting" || this.phase === "extending") {
      this.bolt = p >= 1 ? this.to : this.from + (this.to - this.from) * snappy(p);
      if (p < 1) return;
      if (this.phase === "retracting" && this.wantOpen) this.startSwing(this.swingTarget);
      else this.phase = "idle";
    } else {
      this.angle = p >= 1 ? this.to : this.from + (this.to - this.from) * premium(p);
      if (p < 1) return;
      if (this.phase === "closing" && !this.wantOpen && this.autoLock) this.startBolt(0);
      else this.phase = "idle";
    }
  }
}

/** Push controller state into the scene graph. */
export function applyDoor(vault: Vault, s: Spec, door: DoorController): void {
  const d = derive(s);
  vault.door.rotation.y = d.openSign * deg(door.angle);
  const { extendedX, retractedX } = vault.bolt.userData as { extendedX: number; retractedX: number };
  vault.bolt.position.x = extendedX + (retractedX - extendedX) * door.bolt;
}

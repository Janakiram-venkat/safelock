import type { DeviceSpec } from "../spec/device";
import type { Command, DeviceState, Glass, LockState, LogEvent, Mode, PhysicalEvent, Readings, Role, Security } from "./protocol";

export interface SimOptions {
  pin: string;
  now?: () => number;
  /** Deterministic RNG in [0, 1) for tests. */
  random?: () => number;
}

export interface Result {
  ok: boolean;
  message: string;
}

/** Saturation vapour pressure (hPa), Magnus formula. */
const es = (tC: number) => 6.112 * Math.exp((17.62 * tC) / (243.12 + tC));

/**
 * Behavioural model of the Safe Lock firmware. It is not a measurement:
 * every number it produces derives from src/spec/device.ts placeholders.
 * The breach response matches the viewer: alert → glass opaque, status LED
 * red, buzzer, camera on.
 */
export class DeviceSimulator {
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly t0: number;
  lock: LockState = "locked";
  door: "open" | "closed" = "closed";
  glassSetting: Glass = "transparent";
  security: Security = "idle";
  alertReason: string | null = null;
  mode: Mode = "normal";
  /** True chamber temperature (sensor adds noise on read). */
  temperature: number;
  vibration: number;
  tilt = 0.4;
  tamper: "closed" | "open" = "closed";
  battery = 100;
  power: "mains" | "battery" = "mains";
  private motionUntil = 0;
  private lastMotionAt: number | null = null;
  private relockAt: number | null = null;
  private lockoutUntil: number | null = null;
  private wrongPins = 0;
  private readonly history: [number, number][] = [];
  private nextSample: number;
  private readonly events: LogEvent[] = [];

  constructor(private readonly d: DeviceSpec, private readonly opts: SimOptions) {
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.t0 = this.now();
    this.temperature = this.ambient(this.t0);
    this.vibration = d.security.vibrationIdle.value;
    // Seed the chart with the recent past so it is not empty on first open.
    const step = d.link.historyStep.value * 1000;
    const span = d.link.historySeconds.value * 1000;
    for (let t = this.t0 - span; t < this.t0; t += step) this.history.push([t, round(this.ambient(t) + this.noise(d.climate.sensorNoiseT.value), 2)]);
    this.nextSample = this.t0;
    this.log("info", "Device started");
  }

  private ambient(t: number): number {
    const c = this.d.climate;
    return c.ambient.value + c.ambientSwing.value * Math.sin((2 * Math.PI * (t / 1000)) / 86400);
  }

  private noise(amp: number): number {
    return (this.random() + this.random() - 1) * amp;
  }

  private log(kind: LogEvent["kind"], text: string): void {
    this.events.unshift({ t: this.now(), kind, text });
    this.events.length = Math.min(this.events.length, this.d.link.eventLog.value);
  }

  targetC(): number | null {
    const c = this.d.climate;
    if (this.mode === "cold") return c.coldTarget.value;
    if (this.mode === "warm") return c.warmTarget.value;
    return null;
  }

  get glass(): Glass {
    return this.security === "alert" ? "opaque" : this.glassSetting;
  }

  private raise(reason: string): void {
    if (this.security === "alert" && this.alertReason === reason) return;
    this.security = "alert";
    this.alertReason = reason;
    this.log("alert", `${reason}. Glass set to private, alarm sounding, camera recording`);
  }

  /** Advance the physical model by dt milliseconds. */
  tick(dtMs: number): void {
    const now = this.now();
    const c = this.d.climate;
    const dt = dtMs / 1000;
    const amb = this.ambient(now);
    const target = this.targetC();
    let goal = amb;
    let tau = c.passiveTau.value;
    if (this.door === "open") tau = c.doorOpenTau.value;
    else if (target !== null) {
      goal = target;
      tau = c.coolTau.value;
    }
    this.temperature += (goal - this.temperature) * (1 - Math.exp(-dt / tau));

    // Vibration decays back to idle after a knock.
    const idle = this.d.security.vibrationIdle.value;
    this.vibration = idle + (this.vibration - idle) * Math.exp(-dt / 0.8);

    if (this.power === "battery") this.battery = Math.max(0, this.battery - (this.d.power.batteryDrainPerHour.value * dt) / 3600);
    else this.battery = Math.min(100, this.battery + (this.d.power.batteryChargePerHour.value * dt) / 3600);

    if (this.relockAt !== null && now >= this.relockAt && this.door === "closed") {
      this.relockAt = null;
      this.lock = "locked";
      this.log("lock", "Locked automatically (door not opened)");
    }
    if (this.lockoutUntil !== null && now >= this.lockoutUntil) {
      this.lockoutUntil = null;
      this.wrongPins = 0;
    }

    while (now >= this.nextSample) {
      this.history.push([this.nextSample, round(this.temperature + this.noise(c.sensorNoiseT.value), 2)]);
      this.nextSample += this.d.link.historyStep.value * 1000;
    }
    const keepFrom = now - this.d.link.historySeconds.value * 1000;
    while (this.history.length && this.history[0][0] < keepFrom) this.history.shift();
  }

  private checkPin(pin: string | undefined, via: "app" | "pad" | undefined, action: string): Result | null {
    if (via === "pad") return null; // authenticated at the access pad
    if (this.lockoutUntil !== null) {
      const s = Math.ceil((this.lockoutUntil - this.now()) / 1000);
      return { ok: false, message: `Too many wrong PINs. Try again in ${s} s` };
    }
    if (pin === this.opts.pin) {
      this.wrongPins = 0;
      return null;
    }
    this.wrongPins++;
    const left = this.d.security.pinAttempts.value - this.wrongPins;
    if (left <= 0) {
      this.lockoutUntil = this.now() + this.d.security.lockoutTime.value * 1000;
      this.log("auth", `Remote ${action} blocked after ${this.wrongPins} wrong PINs`);
      return { ok: false, message: `Wrong PIN. Remote access blocked for ${this.d.security.lockoutTime.value / 60} min` };
    }
    this.log("auth", `Wrong PIN for ${action}`);
    return { ok: false, message: `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left` };
  }

  handle(cmd: Command, role: Role = "app"): Result {
    switch (cmd.type) {
      case "unlock": {
        if (this.lock === "unlocked") return { ok: true, message: "Already unlocked" };
        const denied = this.checkPin(cmd.pin, role === "twin" ? cmd.via : "app", "unlock");
        if (denied) return denied;
        this.lock = "unlocked";
        this.relockAt = this.now() + this.d.security.relockDelay.value * 1000;
        this.log("lock", cmd.via === "pad" && role === "twin" ? "Unlocked at the access pad" : "Unlocked from the app");
        return { ok: true, message: "Unlocked" };
      }
      case "lock":
        if (this.door === "open") return { ok: false, message: "Close the door to lock it" };
        if (this.lock === "locked") return { ok: true, message: "Already locked" };
        this.lock = "locked";
        this.relockAt = null;
        this.log("lock", "Locked from the app");
        return { ok: true, message: "Locked" };
      case "setGlass":
        this.glassSetting = cmd.glass;
        this.log("glass", cmd.glass === "opaque" ? "Privacy glass on" : "Privacy glass off");
        return { ok: true, message: cmd.glass === "opaque" ? "Privacy glass on" : "Privacy glass off" };
      case "setMode": {
        this.mode = cmd.mode;
        const t = this.targetC();
        const label = cmd.mode[0].toUpperCase() + cmd.mode.slice(1);
        this.log("climate", t === null ? `${label} mode, no temperature control` : `${label} mode, target ${t} °C`);
        return { ok: true, message: `${label} mode` };
      }
      case "clearAlert": {
        if (this.security === "idle") return { ok: true, message: "No active alert" };
        const denied = this.checkPin(cmd.pin, role === "twin" ? cmd.via : "app", "alert clear");
        if (denied) return denied;
        this.security = "idle";
        this.alertReason = null;
        this.log("alert", "Alert cleared");
        return { ok: true, message: "Alert cleared" };
      }
      case "panic":
        this.raise("Panic alarm from the app");
        return { ok: true, message: "Alarm on" };
      case "physical":
        return this.physical(cmd.event);
    }
  }

  private physical(e: PhysicalEvent): Result {
    const now = this.now();
    switch (e) {
      case "doorOpened":
        if (this.door === "open") break;
        this.door = "open";
        this.relockAt = null;
        if (this.lock === "locked") this.raise("Door forced open");
        else this.log("door", "Door opened");
        break;
      case "doorClosed":
        if (this.door === "closed") break;
        this.door = "closed";
        this.lock = "locked";
        this.log("door", "Door closed and locked");
        break;
      case "knock":
        this.vibration = Math.max(this.vibration, this.d.security.vibrationAlert.value * 1.8);
        if (this.lock === "locked") this.raise("Vibration detected");
        else this.log("info", "Vibration while unlocked");
        break;
      case "tamperOpen":
        this.tamper = "open";
        this.raise("Electronics cover opened");
        break;
      case "tamperClose":
        this.tamper = "closed";
        this.log("info", "Electronics cover closed");
        break;
      case "motion":
        this.motionUntil = now + this.d.security.motionHold.value * 1000;
        this.lastMotionAt = now;
        this.log("info", "Someone is near the vault");
        break;
      case "tilt":
        this.tilt = this.d.security.tiltAlert.value * 1.5;
        this.raise("Vault moved");
        break;
      case "level":
        this.tilt = 0.4;
        break;
      case "powerLoss":
        this.power = "battery";
        this.log("power", "Mains power lost, running on battery");
        break;
      case "powerRestore":
        this.power = "mains";
        this.log("power", "Mains power restored");
        break;
    }
    return { ok: true, message: e };
  }

  readings(): Readings {
    const c = this.d.climate;
    const now = this.now();
    const amb = this.ambient(now);
    const target = this.targetC();
    // Moisture content follows the room; relative humidity rises as the chamber cools.
    const rh = Math.min(c.maxHumidity.value, (c.ambientHumidity.value * es(amb)) / es(this.temperature));
    const peltier = target === null || this.door === "open" ? 0 : Math.max(-1, Math.min(1, (this.temperature - target) / 4 + (target < amb ? 0.25 : -0.25)));
    return {
      temperatureC: round(this.temperature + this.noise(c.sensorNoiseT.value), 1),
      humidityRH: round(rh + this.noise(c.sensorNoiseRH.value), 0),
      targetC: target,
      peltier: round(peltier, 2),
      fan: Math.abs(peltier) > 0.05,
      motion: now < this.motionUntil,
      lastMotionAt: this.lastMotionAt,
      vibrationG: round(this.vibration + Math.abs(this.noise(0.003)), 3),
      tiltDeg: round(this.tilt + this.noise(0.05), 1),
      tamper: this.tamper,
      batteryPct: Math.round(this.battery),
      power: this.power,
      rssiDbm: Math.round(this.d.link.rssi.value + this.noise(3)),
      cameraOn: this.security === "alert" || this.door === "open",
    };
  }

  snapshot(): DeviceState {
    const now = this.now();
    return {
      type: "state",
      source: "simulated",
      t: now,
      lock: this.lock,
      door: this.door,
      glass: this.glass,
      glassSetting: this.glassSetting,
      security: this.security,
      alertReason: this.alertReason,
      mode: this.mode,
      relockIn: this.relockAt === null ? null : Math.max(0, Math.ceil((this.relockAt - now) / 1000)),
      lockoutIn: this.lockoutUntil === null ? null : Math.max(0, Math.ceil((this.lockoutUntil - now) / 1000)),
      readings: this.readings(),
      history: this.history.slice(),
      events: this.events.slice(),
    };
  }
}

function round(x: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(x * k) / k;
}

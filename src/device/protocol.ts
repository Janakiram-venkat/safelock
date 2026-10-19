/**
 * Safe Lock device protocol (JSON over WebSocket, path /hub).
 *
 * Roles:
 *   "app"    — the mobile screen; sends user commands, receives state.
 *   "twin"   — the 3D viewer; reports physical actions (door opened, knock…)
 *              and mirrors state onto the model.
 *   "device" — real firmware (ESP32). When one is connected the hub stops
 *              simulating and relays: commands go to the device, the device's
 *              state goes to everyone.
 *
 * Every message is { type, ... }. Unknown or malformed messages are ignored
 * and answered with { type: "error" }.
 */

export type LockState = "locked" | "unlocked";
export type DoorState = "open" | "closed";
export type Glass = "transparent" | "opaque";
export type Security = "idle" | "alert";
export type Mode = "cold" | "normal" | "warm";
export type Role = "app" | "twin" | "device";
export type Source = "simulated" | "device";

export interface Readings {
  temperatureC: number;
  humidityRH: number;
  /** Setpoint for the current mode; null in normal mode (no conditioning). */
  targetC: number | null;
  /** Peltier drive, −1 (full heat) … +1 (full cool). */
  peltier: number;
  fan: boolean;
  motion: boolean;
  /** Epoch ms of the last PIR trigger, or null. */
  lastMotionAt: number | null;
  vibrationG: number;
  tiltDeg: number;
  tamper: "closed" | "open";
  batteryPct: number;
  power: "mains" | "battery";
  rssiDbm: number;
  cameraOn: boolean;
}

export interface LogEvent {
  t: number;
  kind: "lock" | "door" | "alert" | "climate" | "power" | "glass" | "auth" | "info";
  text: string;
}

export interface DeviceState {
  type: "state";
  source: Source;
  t: number;
  lock: LockState;
  door: DoorState;
  glass: Glass;
  /** Glass as the user set it; alert forces "opaque" in `glass`. */
  glassSetting: Glass;
  security: Security;
  alertReason: string | null;
  mode: Mode;
  /** Seconds until auto-relock, or null. */
  relockIn: number | null;
  /** Seconds remaining on a PIN lockout, or null. */
  lockoutIn: number | null;
  readings: Readings;
  /** Temperature history for the app chart, oldest first: [epoch ms, °C]. */
  history: [number, number][];
  events: LogEvent[];
}

export type Command =
  | { type: "unlock"; pin?: string; via?: "app" | "pad" }
  | { type: "lock" }
  | { type: "setGlass"; glass: Glass }
  | { type: "setMode"; mode: Mode }
  | { type: "clearAlert"; pin?: string; via?: "app" | "pad" }
  | { type: "panic" }
  | { type: "physical"; event: PhysicalEvent };

export type PhysicalEvent = "doorOpened" | "doorClosed" | "knock" | "tamperOpen" | "tamperClose" | "motion" | "tilt" | "level" | "powerLoss" | "powerRestore";

export type ClientMessage = { type: "hello"; role: Role } | Command | DeviceState;

export type ServerMessage = DeviceState | { type: "ack"; command: string; ok: boolean; message: string } | { type: "error"; message: string };

const MODES: readonly string[] = ["cold", "normal", "warm"];
const GLASS: readonly string[] = ["transparent", "opaque"];
const PHYSICAL: readonly string[] = ["doorOpened", "doorClosed", "knock", "tamperOpen", "tamperClose", "motion", "tilt", "level", "powerLoss", "powerRestore"];
const ROLES: readonly string[] = ["app", "twin", "device"];

/** Validate an untrusted command. Returns null if it is not a well-formed command. */
export function parseCommand(raw: unknown): Command | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const pin = typeof m.pin === "string" && /^\d{4,8}$/.test(m.pin) ? m.pin : undefined;
  const via = m.via === "pad" ? "pad" : "app";
  switch (m.type) {
    case "unlock":
      return { type: "unlock", pin, via };
    case "lock":
      return { type: "lock" };
    case "setGlass":
      return GLASS.includes(m.glass as string) ? { type: "setGlass", glass: m.glass as Glass } : null;
    case "setMode":
      return MODES.includes(m.mode as string) ? { type: "setMode", mode: m.mode as Mode } : null;
    case "clearAlert":
      return { type: "clearAlert", pin, via };
    case "panic":
      return { type: "panic" };
    case "physical":
      return PHYSICAL.includes(m.event as string) ? { type: "physical", event: m.event as PhysicalEvent } : null;
    default:
      return null;
  }
}

export function parseHello(raw: unknown): Role | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  return m.type === "hello" && ROLES.includes(m.role as string) ? (m.role as Role) : null;
}

export function isDeviceState(raw: unknown): raw is DeviceState {
  if (typeof raw !== "object" || raw === null) return false;
  const m = raw as Record<string, unknown>;
  return m.type === "state" && typeof m.lock === "string" && typeof m.door === "string" && typeof m.readings === "object";
}

import type { DeviceSpec } from "../spec/device";
import type { PhysicalEvent } from "../device/protocol";
import type { GlassMode } from "./smartGlass";
import type { Security, StorageMode } from "./deviceState";
import type { ViewName } from "./patentViews";

/**
 * Scripted demo scenarios for the Surakshit Bharat theme. Each step declares
 * the scene it wants (camera, door, glass, security, mode, overlays) and the
 * physical events to inject into the device. Steps are cumulative: step i is
 * BASE ⊕ scenario.base ⊕ steps[0..i], so stepping backwards is exact.
 * Pure data + logic (no Three.js, no DOM) so it can be unit tested.
 */

export type Pillar = "road" | "mobility" | "cyber" | "emergency" | "disaster";

export const PILLARS: Record<Pillar, string> = {
  road: "Road safety",
  mobility: "Smart mobility",
  cyber: "Cybersecurity",
  emergency: "Emergency response",
  disaster: "Disaster resilience",
};

const ALL: Pillar[] = ["road", "mobility", "cyber", "emergency", "disaster"];

export interface DemoScene {
  view: ViewName;
  door: "open" | "closed";
  glass: GlassMode;
  security: Security;
  mode: StorageMode;
  tint: boolean;
  overlay: boolean;
  explode: number;
  cutaway: number;
  /** Show the phone app beside the model (only when the device hub is online). */
  phone: boolean;
}

export interface Step {
  title: string;
  text: string;
  /** What is not in the prototype yet, shown separately so the demo stays honest. */
  planned?: string;
  pillars: Pillar[];
  scene: Partial<DemoScene>;
  events?: PhysicalEvent[];
}

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  pillars: Pillar[];
  base?: Partial<DemoScene>;
  steps: Step[];
}

export const BASE_SCENE: DemoScene = {
  view: "hero",
  door: "closed",
  glass: "transparent",
  security: "idle",
  mode: "normal",
  tint: false,
  overlay: false,
  explode: 0,
  cutaway: 0,
  phone: false,
};

/** The scene in force at step `index` (cumulative over the earlier steps). */
export function resolveScene(sc: Scenario, index: number): DemoScene {
  const out: DemoScene = { ...BASE_SCENE, ...sc.base };
  for (const step of sc.steps.slice(0, index + 1)) Object.assign(out, step.scene);
  return out;
}

/** Narration reads its numbers from the device spec, so it never drifts from the simulator. */
export function buildScenarios(d: DeviceSpec): Scenario[] {
  const cold = d.climate.coldTarget.value;
  const ambient = d.climate.ambient.value;
  const vib = d.security.vibrationAlert.value;
  const tilt = d.security.tiltAlert.value;
  const pins = d.security.pinAttempts.value;
  const lockoutMin = d.security.lockoutTime.value / 60;

  return [
    {
      id: "highway",
      title: "Golden hour: highway crash",
      summary: "A crash at an accident blackspot. The pod gets first aid into a bystander's hands and puts the control room on the scene.",
      pillars: ["road", "emergency", "mobility"],
      base: { mode: "cold", tint: true },
      steps: [
        {
          title: "Standing by at an accident blackspot",
          pillars: ["road"],
          text: `A Safe Lock pod at a highway blackspot holds a trauma kit, splints, an AED and medicines. Cold mode keeps the chamber at ${cold} °C, and the clear smart glass shows passers-by what is inside.`,
          scene: { view: "hero" },
        },
        {
          title: "A crash. Someone runs to the pod",
          pillars: ["road", "emergency"],
          text: "The PIR sensor detects a person in front of the pod and wakes the system, so the camera and controller are ready before they reach the door.",
          scene: { view: "front", overlay: true },
          events: ["motion"],
        },
        {
          title: "SOS raised",
          pillars: ["emergency", "mobility"],
          text: "The bystander triggers SOS at the access pad. The buzzer sounds and the status LED strobes red to slow approaching traffic. The camera starts recording, and the alert reaches the control room over the Wi-Fi controller. The glass goes opaque so the stock stays sealed until someone is verified.",
          planned: "4G radio and an automatic push to 112 / ERSS with the pod's GPS location.",
          scene: { view: "perspective", overlay: false, security: "alert" },
        },
        {
          title: "Control room verifies and unlocks remotely",
          pillars: ["emergency", "cyber"],
          text: "The operator checks the live camera and sends a PIN-protected unlock. The bolt retracts before the door moves, and the camera keeps recording who takes what.",
          scene: { view: "hero", security: "idle", door: "open" },
        },
        {
          title: "Door shut, kit logged for restocking",
          pillars: ["emergency", "mobility"],
          text: "The reed switch reports the door shut and the bolt locks again. Every open and close is time-stamped, and the internal camera shows which shelf is now empty.",
          planned: "Automatic restock ticket to the highway patrol.",
          scene: { door: "closed", cutaway: 0.6, overlay: true },
        },
        {
          title: "A network of pods along the highway",
          pillars: ["mobility", "road"],
          text: "Each pod streams its status, stock and temperature live, shown here on the phone app. As a network, the pods let dispatchers route ambulances and direct callers to the nearest kit.",
          planned: "Map view and integration with the 1033 highway helpline.",
          scene: { cutaway: 0, overlay: false, phone: true },
        },
      ],
    },
    {
      id: "attack",
      title: "Cyber-physical attack",
      summary: "Someone tries to break into an unattended pod at night, physically and through the app.",
      pillars: ["cyber", "emergency"],
      base: { glass: "opaque" },
      steps: [
        {
          title: "Unattended at night",
          pillars: ["cyber"],
          text: "Privacy glass hides what is inside. The pod is locked and watching: the PIR, vibration, tilt and tamper sensors all report to the controller.",
          scene: { view: "hero", overlay: true },
        },
        {
          title: "Someone loiters near the pod",
          pillars: ["cyber"],
          text: "The PIR detects presence and logs it with a timestamp. Passers-by are normal, so this alone raises no alarm.",
          scene: { view: "front" },
          events: ["motion"],
        },
        {
          title: "Prying at the door",
          pillars: ["cyber", "emergency"],
          text: `Forcing the door shakes the pod past ${vib} g while it is locked. Breach response starts: siren, red strobe and camera evidence.`,
          scene: { view: "perspective", overlay: false, security: "alert" },
          events: ["knock"],
        },
        {
          title: "Going for the electronics",
          pillars: ["cyber"],
          text: "The attacker opens the electronics cover to bypass the controller. The tamper switch trips at once. Even with the mains cable pulled, the backup battery keeps the alarm running.",
          scene: { view: "hero", cutaway: 0.6, overlay: true },
          events: ["tamperOpen", "powerLoss"],
        },
        {
          title: "Trying to carry it away",
          pillars: ["cyber"],
          text: `The IMU on the controller board measures a tilt past ${tilt}° and reports "Vault moved".`,
          scene: { view: "left", cutaway: 0, overlay: false },
          events: ["tilt"],
        },
        {
          title: "Brute-forcing the app",
          pillars: ["cyber"],
          text: `Remote unlock and alert-clear both need a PIN. After ${pins} wrong PINs, remote access is blocked for ${lockoutMin} min, and every attempt is written to the audit log.`,
          planned: "TLS-encrypted link, signed firmware updates and per-responder tokens instead of a shared PIN.",
          scene: { view: "hero", phone: true },
        },
        {
          title: "The owner restores the pod",
          pillars: ["cyber", "emergency"],
          text: "An authorised person clears the alert at the access pad, closes the cover and sets the pod level, and mains power returns. The log keeps the full timeline as evidence.",
          scene: { security: "idle", phone: false },
          events: ["tamperClose", "level", "powerRestore"],
        },
      ],
    },
    {
      id: "disaster",
      title: "Disaster: power cut and earthquake",
      summary: "A relief-camp pod keeps medicines cold through a grid failure and an aftershock.",
      pillars: ["disaster", "emergency"],
      base: { mode: "cold", tint: true },
      steps: [
        {
          title: "A cold chain at the relief camp",
          pillars: ["disaster"],
          text: `The pod stores insulin, anti-venom, vaccines and ORS. The Peltier unit holds the chamber at ${cold} °C against ${ambient} °C outside, and the temperature/humidity sensor logs every reading.`,
          scene: { view: "hero", cutaway: 0.6, overlay: true },
        },
        {
          title: "The grid fails",
          pillars: ["disaster"],
          text: "Mains power drops and the pod switches straight to its backup battery. Cooling, sensors and the radio keep running.",
          planned: "Roof solar panel to recharge the battery off-grid.",
          scene: { view: "rear", cutaway: 0 },
          events: ["powerLoss"],
        },
        {
          title: "An aftershock hits",
          pillars: ["disaster", "emergency"],
          text: "The vibration sensor and IMU record the shaking. The pod sounds its alarm and reports to the district control room, building a live picture of the damage.",
          scene: { view: "hero", overlay: false, security: "alert" },
          events: ["knock", "tilt"],
        },
        {
          title: "Responders collect medicines",
          pillars: ["emergency", "disaster"],
          text: "A verified responder clears the alarm at the pad and opens the door. The log shows the chamber stayed in range during the outage, so the cold chain is intact.",
          scene: { security: "idle", door: "open" },
          events: ["level"],
        },
        {
          title: "Power returns",
          pillars: ["disaster"],
          text: "The door is shut and locked again. Back on mains, the battery recharges for the next outage.",
          scene: { door: "closed", phone: true },
          events: ["powerRestore"],
        },
      ],
    },
    {
      id: "tour",
      title: "Inside the pod: sensor tour",
      summary: "Every component, and the Surakshit Bharat pillar it serves.",
      pillars: ALL,
      steps: [
        {
          title: "One pod, five missions",
          pillars: ALL,
          text: "Safe Lock is secure, connected, climate-controlled storage. The same hardware serves road safety, smart mobility, cybersecurity, emergency response and disaster resilience.",
          scene: { view: "hero" },
        },
        {
          title: "Exploded view",
          pillars: ALL,
          text: "The steel shell, PDLC smart-glass door, solenoid bolt, electronics bay, Peltier cooler and battery separate along their assembly axes.",
          scene: { view: "perspective", explode: 1 },
        },
        {
          title: "Sensors that guard it",
          pillars: ["cyber", "emergency"],
          text: "The PIR, reed-switch door sensor, vibration sensor, IMU and tamper switch are the eyes and ears of the breach response.",
          scene: { explode: 0.6, overlay: true },
        },
        {
          title: "Sensors that keep it useful",
          pillars: ["disaster", "road"],
          text: "The temperature/humidity sensor, Peltier unit and backup battery keep medicines usable through heat and power cuts. The internal camera checks the stock.",
          scene: { view: "hero", explode: 0, cutaway: 0.6, mode: "cold", tint: true },
        },
        {
          title: "Connected by design",
          pillars: ["mobility", "cyber"],
          text: "The Wi-Fi/BLE controller streams the pod's state to the phone app and the control room. When the device hub is running, this 3D model mirrors it live as a digital twin.",
          scene: { cutaway: 0, overlay: false, phone: true },
        },
      ],
    },
  ];
}

/**
 * Step-through / auto-play state for one scenario. `apply` is called with the
 * resolved scene on every step change; events fire only when stepping forward
 * into a step (or starting on it), never when stepping back.
 */
export class ScenarioPlayer {
  scenario: Scenario | null = null;
  index = 0;
  playing = false;
  /** Time spent on the current step while playing, ms. */
  elapsed = 0;

  constructor(
    readonly scenarios: Scenario[],
    private readonly dwellMs: number,
    private readonly apply: (scene: DemoScene, events: PhysicalEvent[]) => void,
    private readonly changed: () => void = () => {},
  ) {}

  get step(): Step | null {
    return this.scenario?.steps[this.index] ?? null;
  }

  get progress(): number {
    return this.playing ? Math.min(this.elapsed / this.dwellMs, 1) : 0;
  }

  start(id: string, index = 0, play = false): boolean {
    const sc = this.scenarios.find((s) => s.id === id);
    if (!sc) return false;
    this.scenario = sc;
    this.playing = play;
    this.go(Math.min(Math.max(index, 0), sc.steps.length - 1), true);
    return true;
  }

  next(): void {
    if (!this.scenario) return;
    if (this.index < this.scenario.steps.length - 1) this.go(this.index + 1, true);
    else this.pause();
  }

  prev(): void {
    if (this.scenario && this.index > 0) this.go(this.index - 1, false);
  }

  togglePlay(): void {
    if (!this.scenario) return;
    // Play from the end restarts the scenario.
    if (!this.playing && this.index === this.scenario.steps.length - 1) {
      this.playing = true;
      this.go(0, true);
      return;
    }
    this.playing = !this.playing;
    this.elapsed = 0;
    this.changed();
  }

  /** Re-apply the current step without its events (e.g. after the device hub reconnects). */
  refresh(): void {
    const sc = this.scenario;
    if (sc) this.apply(resolveScene(sc, this.index), []);
  }

  pause(): void {
    this.playing = false;
    this.elapsed = 0;
    this.changed();
  }

  stop(): void {
    this.scenario = null;
    this.index = 0;
    this.playing = false;
    this.elapsed = 0;
    this.changed();
  }

  update(dtMs: number): void {
    if (!this.playing || !this.scenario) return;
    this.elapsed += dtMs;
    if (this.elapsed >= this.dwellMs) this.next();
  }

  private go(index: number, forward: boolean): void {
    const sc = this.scenario!;
    this.index = index;
    this.elapsed = 0;
    this.apply(resolveScene(sc, index), forward ? (sc.steps[index].events ?? []) : []);
    this.changed();
  }
}

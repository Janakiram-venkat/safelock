import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { WebSocket } from "ws";
import { deviceSpec } from "../../src/spec/device";
import { entries } from "../../src/spec/report";
import { DeviceSimulator } from "../../src/device/simulator";
import { createHub, type Hub } from "../../src/device/hub";
import { parseCommand, type DeviceState } from "../../src/device/protocol";

const PIN = "4321";

/** Simulator on a fake clock; `run(s)` advances simulated seconds in 100 ms ticks. */
function sim() {
  let now = 1_700_000_000_000;
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const s = new DeviceSimulator(deviceSpec, { pin: PIN, now: () => now, random });
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * 10; i++) {
      now += 100;
      s.tick(100);
    }
  };
  return { s, run, now: () => now };
}

describe("device spec", () => {
  it("every behaviour value has a source; all are placeholders for now", () => {
    const all = entries(deviceSpec);
    expect(all.length).toBeGreaterThan(20);
    for (const e of all) expect(e.source, e.path).toBe("placeholder");
  });
});

describe("firmware simulator: climate", () => {
  it("cold mode cools toward the setpoint and humidity rises as it cools", () => {
    const { s, run } = sim();
    const t0 = s.temperature;
    const rh0 = s.readings().humidityRH;
    s.handle({ type: "setMode", mode: "cold" });
    run(600);
    expect(s.temperature).toBeLessThan(t0 - 8);
    expect(s.temperature).toBeGreaterThan(deviceSpec.climate.coldTarget.value);
    run(3000);
    expect(Math.abs(s.temperature - deviceSpec.climate.coldTarget.value)).toBeLessThan(0.5);
    const r = s.readings();
    expect(r.humidityRH).toBeGreaterThan(rh0 + 20);
    expect(r.humidityRH).toBeLessThanOrEqual(deviceSpec.climate.maxHumidity.value + 1);
    expect(r.targetC).toBe(deviceSpec.climate.coldTarget.value);
  });

  it("drives the Peltier the right way and runs the fan", () => {
    const { s } = sim();
    s.handle({ type: "setMode", mode: "cold" });
    expect(s.readings().peltier).toBeGreaterThan(0.5);
    expect(s.readings().fan).toBe(true);
    s.handle({ type: "setMode", mode: "warm" });
    expect(s.readings().peltier).toBeLessThan(-0.5);
    s.handle({ type: "setMode", mode: "normal" });
    expect(s.readings().peltier).toBe(0);
    expect(s.readings().targetC).toBeNull();
  });

  it("an open door pulls the chamber back toward room temperature", () => {
    const { s, run } = sim();
    s.handle({ type: "setMode", mode: "cold" });
    run(4000);
    const cold = s.temperature;
    s.handle({ type: "unlock", pin: PIN });
    s.handle({ type: "physical", event: "doorOpened" });
    run(120);
    expect(s.temperature).toBeGreaterThan(cold + 8);
    expect(s.readings().peltier).toBe(0);
  });

  it("keeps a bounded temperature history for the chart", () => {
    const { s, run } = sim();
    const n = deviceSpec.link.historySeconds.value / deviceSpec.link.historyStep.value;
    expect(s.snapshot().history.length).toBe(n);
    run(900);
    const h = s.snapshot().history;
    expect(h.length).toBeLessThanOrEqual(n + 1);
    for (let i = 1; i < h.length; i++) expect(h[i][0]).toBeGreaterThan(h[i - 1][0]);
  });
});

describe("firmware simulator: lock and PIN", () => {
  it("unlock needs the right PIN from the app", () => {
    const { s } = sim();
    expect(s.handle({ type: "unlock" }).ok).toBe(false);
    expect(s.handle({ type: "unlock", pin: "0000" })).toMatchObject({ ok: false });
    expect(s.lock).toBe("locked");
    expect(s.handle({ type: "unlock", pin: PIN }).ok).toBe(true);
    expect(s.lock).toBe("unlocked");
  });

  it("the app cannot pretend to be the access pad", () => {
    const { s } = sim();
    expect(s.handle({ type: "unlock", via: "pad" }, "app").ok).toBe(false);
    expect(s.handle({ type: "unlock", via: "pad" }, "twin").ok).toBe(true);
  });

  it("blocks remote unlock after too many wrong PINs, then recovers", () => {
    const { s, run } = sim();
    for (let i = 0; i < deviceSpec.security.pinAttempts.value; i++) s.handle({ type: "unlock", pin: "1111" });
    const blocked = s.handle({ type: "unlock", pin: PIN });
    expect(blocked.ok).toBe(false);
    expect(blocked.message).toMatch(/Too many wrong PINs/);
    expect(s.snapshot().lockoutIn).toBeGreaterThan(0);
    run(deviceSpec.security.lockoutTime.value + 1);
    expect(s.handle({ type: "unlock", pin: PIN }).ok).toBe(true);
  });

  it("relocks by itself if the door is not opened", () => {
    const { s, run } = sim();
    s.handle({ type: "unlock", pin: PIN });
    expect(s.snapshot().relockIn).toBe(deviceSpec.security.relockDelay.value);
    run(deviceSpec.security.relockDelay.value - 1);
    expect(s.lock).toBe("unlocked");
    run(2);
    expect(s.lock).toBe("locked");
  });

  it("closing the door locks it; locking with the door open is refused", () => {
    const { s } = sim();
    s.handle({ type: "unlock", pin: PIN });
    s.handle({ type: "physical", event: "doorOpened" });
    expect(s.handle({ type: "lock" }).ok).toBe(false);
    s.handle({ type: "physical", event: "doorClosed" });
    expect(s.lock).toBe("locked");
    expect(s.door).toBe("closed");
  });
});

describe("firmware simulator: breach response", () => {
  for (const [event, reason] of [["knock", "Vibration detected"], ["tamperOpen", "Electronics cover opened"], ["tilt", "Vault moved"], ["doorOpened", "Door forced open"]] as const) {
    it(`${event} while locked raises an alert: glass private, camera on`, () => {
      const { s } = sim();
      s.handle({ type: "physical", event });
      const st = s.snapshot();
      expect(st.security).toBe("alert");
      expect(st.alertReason).toBe(reason);
      expect(st.glass).toBe("opaque");
      expect(st.readings.cameraOn).toBe(true);
      expect(st.events[0].kind).toBe("alert");
    });
  }

  it("knocking while unlocked is only logged", () => {
    const { s } = sim();
    s.handle({ type: "unlock", pin: PIN });
    s.handle({ type: "physical", event: "knock" });
    expect(s.security).toBe("idle");
  });

  it("vibration decays after a knock", () => {
    const { s, run } = sim();
    s.handle({ type: "physical", event: "knock" });
    expect(s.readings().vibrationG).toBeGreaterThan(deviceSpec.security.vibrationAlert.value);
    run(10);
    expect(s.readings().vibrationG).toBeLessThan(0.05);
  });

  it("clearing an alert needs the PIN and restores the user's glass setting", () => {
    const { s } = sim();
    s.handle({ type: "setGlass", glass: "transparent" });
    s.handle({ type: "panic" });
    expect(s.glass).toBe("opaque");
    expect(s.handle({ type: "clearAlert", pin: "9999" }).ok).toBe(false);
    expect(s.handle({ type: "clearAlert", pin: PIN }).ok).toBe(true);
    expect(s.security).toBe("idle");
    expect(s.glass).toBe("transparent");
  });

  it("motion is reported and held for the PIR hold time", () => {
    const { s, run } = sim();
    s.handle({ type: "physical", event: "motion" });
    expect(s.readings().motion).toBe(true);
    expect(s.readings().lastMotionAt).not.toBeNull();
    run(deviceSpec.security.motionHold.value + 1);
    expect(s.readings().motion).toBe(false);
    expect(s.security).toBe("idle");
  });

  it("runs on battery after a power cut and drains it", () => {
    const { s, run } = sim();
    s.handle({ type: "physical", event: "powerLoss" });
    run(3600);
    const r = s.readings();
    expect(r.power).toBe("battery");
    expect(r.batteryPct).toBe(100 - deviceSpec.power.batteryDrainPerHour.value);
  });

  it("keeps the activity log bounded, newest first", () => {
    const { s } = sim();
    for (let i = 0; i < 100; i++) s.handle({ type: "setGlass", glass: i % 2 ? "opaque" : "transparent" });
    const ev = s.snapshot().events;
    expect(ev.length).toBe(deviceSpec.link.eventLog.value);
    expect(ev[0].t).toBeGreaterThanOrEqual(ev[ev.length - 1].t);
  });
});

describe("protocol", () => {
  it("accepts well-formed commands and rejects everything else", () => {
    expect(parseCommand({ type: "setMode", mode: "cold" })).toEqual({ type: "setMode", mode: "cold" });
    expect(parseCommand({ type: "setMode", mode: "freezing" })).toBeNull();
    expect(parseCommand({ type: "physical", event: "selfDestruct" })).toBeNull();
    expect(parseCommand({ type: "rm -rf" })).toBeNull();
    expect(parseCommand("unlock")).toBeNull();
    expect(parseCommand(null)).toBeNull();
    // Malformed PINs are dropped, not passed through.
    expect(parseCommand({ type: "unlock", pin: "12<script>" })).toEqual({ type: "unlock", pin: undefined, via: "app" });
  });
});

describe("device hub over WebSocket", () => {
  let server: Server;
  let hub: Hub;
  afterEach(() => {
    hub?.close();
    server?.close();
  });

  async function start() {
    hub = createHub({ pin: PIN, publishMs: 50, tickMs: 20 });
    server = createServer();
    server.on("upgrade", (req, socket, head) => hub.handleUpgrade(req, socket, head));
    await new Promise<void>((r) => server.listen(0, r));
    return (server.address() as { port: number }).port;
  }

  function connect(port: number, role: string) {
    const ws = new WebSocket(`ws://localhost:${port}/hub`);
    const states: DeviceState[] = [];
    const acks: { id?: string; ok: boolean; message: string }[] = [];
    ws.on("message", (m) => {
      const msg = JSON.parse(String(m));
      if (msg.type === "state") states.push(msg);
      if (msg.type === "ack") acks.push(msg);
    });
    const ready = new Promise<void>((r) => ws.on("open", () => (ws.send(JSON.stringify({ type: "hello", role })), r())));
    return { ws, states, acks, ready };
  }

  const until = async (cond: () => boolean, ms = 3000) => {
    const t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > ms) throw new Error("timed out");
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  it("a command from the phone reaches the twin as new state", async () => {
    const port = await start();
    const phone = connect(port, "app");
    const twin = connect(port, "twin");
    await Promise.all([phone.ready, twin.ready]);
    await until(() => twin.states.length > 0);
    phone.ws.send(JSON.stringify({ type: "unlock", pin: PIN, id: "c1" }));
    await until(() => phone.acks.some((a) => a.id === "c1"));
    expect(phone.acks.find((a) => a.id === "c1")).toMatchObject({ ok: true, message: "Unlocked" });
    await until(() => twin.states.at(-1)?.lock === "unlocked");
    phone.ws.close();
    twin.ws.close();
  });

  it("answers garbage with an error and keeps going", async () => {
    const port = await start();
    const c = connect(port, "app");
    await c.ready;
    const errors: string[] = [];
    c.ws.on("message", (m) => JSON.parse(String(m)).type === "error" && errors.push("e"));
    c.ws.send("{not json");
    c.ws.send(JSON.stringify({ type: "launchMissiles" }));
    await until(() => errors.length === 2);
    c.ws.send(JSON.stringify({ type: "setMode", mode: "warm", id: "ok" }));
    await until(() => c.acks.some((a) => a.id === "ok"));
    c.ws.close();
  });

  it("a real device takes over from the simulator and receives commands", async () => {
    const port = await start();
    const device = connect(port, "device");
    const phone = connect(port, "app");
    await Promise.all([device.ready, phone.ready]);
    const forwarded: unknown[] = [];
    device.ws.on("message", (m) => {
      const msg = JSON.parse(String(m));
      if (msg.type === "setGlass") forwarded.push(msg);
    });
    const live: DeviceState = { ...hub.sim.snapshot(), source: "simulated", lock: "unlocked" };
    device.ws.send(JSON.stringify(live));
    await until(() => phone.states.at(-1)?.source === "device");
    expect(phone.states.at(-1)!.lock).toBe("unlocked");
    phone.ws.send(JSON.stringify({ type: "setGlass", glass: "opaque", id: "g" }));
    await until(() => forwarded.length === 1);
    expect(forwarded[0]).toMatchObject({ type: "setGlass", glass: "opaque", id: "g" });
    // The simulator itself was not changed: the device owns the state now.
    expect(hub.sim.glassSetting).toBe("transparent");
    device.ws.close();
    phone.ws.close();
  });
});

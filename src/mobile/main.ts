import "./mobile.css";
import { DeviceClient, type LinkStatus } from "../device/client";
import type { DeviceState, Mode } from "../device/protocol";
import { deviceSpec } from "../spec/device";
import { materials as M } from "../spec/materials";
import { Sparkline } from "./sparkline";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const client = new DeviceClient("app");

const LINE: Record<Mode, string> = { cold: "var(--line-cold)", normal: "var(--line-normal)", warm: "var(--line-warm)" };
const spark = new Sparkline($("sparkSvg") as unknown as SVGSVGElement, $("sparkReadout"), document.getElementById("sparkDesc") as unknown as SVGTitleElement);

const timeFmt = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function ago(t: number | null, now: number): string {
  if (t === null) return "No motion seen yet";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `Last seen ${s} s ago`;
  if (s < 3600) return `Last seen ${Math.round(s / 60)} min ago`;
  return `Last seen at ${timeFmt(t)}`;
}

// ---- toast ----
let toastTimer = 0;
function toast(msg: string, error = false): void {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("error", error);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), 2600);
}

// ---- PIN sheet ----
const sheet = $<HTMLDialogElement>("pinSheet");
const pinInput = $<HTMLInputElement>("pinInput");
let pinAction: ((pin: string) => Promise<{ ok: boolean; message: string }>) | null = null;
const PIN_LEN = 4;

function renderDots(): void {
  [...$("pinDots").children].forEach((d, i) => d.classList.toggle("filled", i < pinInput.value.length));
}

function askPin(title: string, action: (pin: string) => Promise<{ ok: boolean; message: string }>): void {
  $("pinTitle").textContent = title;
  $("pinError").textContent = "";
  pinInput.value = "";
  renderDots();
  pinAction = action;
  sheet.showModal();
  pinInput.focus({ preventScroll: true });
}

async function submitPin(): Promise<void> {
  if (!pinAction || pinInput.value.length < PIN_LEN) return;
  const res = await pinAction(pinInput.value);
  if (res.ok) {
    sheet.close();
    toast(res.message);
  } else {
    $("pinError").textContent = res.message;
    pinInput.value = "";
    renderDots();
    const dots = $("pinDots");
    dots.classList.remove("shake");
    void dots.offsetWidth;
    dots.classList.add("shake");
  }
}

function pressKey(k: string): void {
  if (k === "del") pinInput.value = pinInput.value.slice(0, -1);
  else if (pinInput.value.length < PIN_LEN) pinInput.value += k;
  renderDots();
  if (pinInput.value.length === PIN_LEN) void submitPin();
}

const keypad = $("keypad");
for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"]) {
  const b = document.createElement("button");
  b.type = "button";
  if (!k) b.className = "key-blank";
  b.textContent = k === "del" ? "⌫" : k;
  if (k === "del") b.setAttribute("aria-label", "Delete");
  b.dataset.key = k;
  b.addEventListener("click", () => k && pressKey(k));
  keypad.append(b);
}
pinInput.addEventListener("input", () => {
  pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, PIN_LEN);
  renderDots();
  if (pinInput.value.length === PIN_LEN) void submitPin();
});

// ---- controls ----
$("lockBtn").addEventListener("click", async () => {
  const s = client.state;
  if (!s) return;
  if (s.lock === "locked") askPin("Enter your PIN to unlock", (pin) => client.send({ type: "unlock", pin }));
  else {
    const r = await client.send({ type: "lock" });
    toast(r.message, !r.ok);
  }
});

$("glassBtn").addEventListener("click", async () => {
  const s = client.state;
  if (!s) return;
  const r = await client.send({ type: "setGlass", glass: s.glassSetting === "opaque" ? "transparent" : "opaque" });
  toast(r.message, !r.ok);
});

$("modes").addEventListener("change", async (e) => {
  const mode = (e.target as HTMLInputElement).value as Mode;
  const r = await client.send({ type: "setMode", mode });
  toast(r.message, !r.ok);
});

$("clearAlert").addEventListener("click", () => askPin("Enter your PIN to clear the alert", (pin) => client.send({ type: "clearAlert", pin })));

$("panic").addEventListener("click", async () => {
  if (!confirmPanic()) return;
  const r = await client.send({ type: "panic" });
  toast(r.message, !r.ok);
});

let panicArmedUntil = 0;
/** Two taps within 3 s, so the alarm is never sounded by a stray tap. */
function confirmPanic(): boolean {
  const now = Date.now();
  const btn = $("panic");
  if (now < panicArmedUntil) {
    panicArmedUntil = 0;
    btn.textContent = "Sound the alarm";
    return true;
  }
  panicArmedUntil = now + 3000;
  btn.textContent = "Tap again to sound the alarm";
  setTimeout(() => {
    if (Date.now() >= panicArmedUntil) btn.textContent = "Sound the alarm";
  }, 3100);
  return false;
}

// ---- rendering ----
function setLed(id: string, color: string | null): void {
  const led = $(id);
  led.classList.toggle("on", color !== null);
  if (color) led.style.setProperty("--c", color);
}

function row(label: string, value: string, sub?: string, warn = false): HTMLDivElement {
  const div = document.createElement("div");
  if (warn) div.dataset.flag = "warn";
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  if (sub) {
    const small = document.createElement("small");
    small.textContent = sub;
    dd.append(small);
  }
  div.append(dt, dd);
  return div;
}

function render(s: DeviceState): void {
  const r = s.readings;
  const vault = $("vault");
  vault.dataset.lock = s.lock;
  vault.dataset.glass = s.glass;
  vault.dataset.security = s.security;
  vault.dataset.door = s.door;
  $("lockWord").textContent = s.door === "open" ? "Open" : s.lock === "locked" ? "Locked" : "Unlocked";
  $("doorLine").textContent = s.door === "open" ? "Door is open" : s.lock === "locked" ? "Door closed" : "Door closed, ready to open";

  const alert = s.security === "alert";
  setLed("ledStatus", alert ? M.led.colors.alert : s.lock === "unlocked" ? M.led.colors.unlocked : M.led.colors.idle);
  setLed("ledMode", M.led.colors[s.mode]);
  setLed("ledNet", M.led.colors.network);
  $("ledPad").style.setProperty("--c", alert ? M.led.colors.alert : M.led.colors.network);

  $("alert").hidden = !alert;
  $("alertTitle").textContent = s.alertReason ?? "Alert";

  const lockBtn = $<HTMLButtonElement>("lockBtn");
  lockBtn.disabled = s.door === "open";
  lockBtn.textContent = s.door === "open" ? "Close the door to lock" : s.lock === "locked" ? "Unlock" : "Lock now";
  lockBtn.dataset.intent = s.lock === "locked" ? "unlock" : "lock";

  const glassBtn = $("glassBtn");
  glassBtn.setAttribute("aria-checked", String(s.glassSetting === "opaque"));

  $("hint").textContent =
    s.lockoutIn !== null ? `Remote unlock is blocked for ${s.lockoutIn} s after wrong PINs`
    : s.relockIn !== null && s.lock === "unlocked" ? `Locks again in ${s.relockIn} s unless the door is opened`
    : alert && s.glassSetting === "transparent" ? "Privacy glass stays on until the alert is cleared"
    : "";

  $("temp").textContent = r.temperatureC.toFixed(1);
  $("humidity").textContent = `${r.humidityRH}%`;
  $("target").textContent = r.targetC === null ? "Off" : `${r.targetC} °C`;
  spark.set({ points: s.history, target: r.targetC, lineColor: LINE[s.mode] });
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) input.checked = input.value === s.mode;

  const sec = deviceSpec.security;
  const cooling = r.peltier === 0 ? "Off" : `${r.peltier > 0 ? "Cooling" : "Heating"} ${Math.round(Math.abs(r.peltier) * 100)}%`;
  const wifi = r.rssiDbm > -60 ? "Strong" : r.rssiDbm > -70 ? "Good" : "Weak";
  $("sensors").replaceChildren(
    row("Motion", r.motion ? "Someone nearby" : "No one nearby", ago(r.lastMotionAt, s.t)),
    row("Vibration", `${r.vibrationG.toFixed(2)} g`, r.vibrationG >= sec.vibrationAlert.value ? "Knock or impact detected" : "Calm", r.vibrationG >= sec.vibrationAlert.value),
    row("Tilt", `${r.tiltDeg.toFixed(1)}° from level`, r.tiltDeg >= sec.tiltAlert.value ? "Vault has been moved" : "Standing level", r.tiltDeg >= sec.tiltAlert.value),
    row("Door sensor", s.door === "open" ? "Open" : "Closed"),
    row("Electronics cover", r.tamper === "open" ? "Opened" : "Closed", undefined, r.tamper === "open"),
    row("Camera", r.cameraOn ? "Recording" : "Standby"),
    row("Peltier unit", cooling, r.fan ? "Fan running" : "Fan off"),
    row("Power", r.power === "mains" ? "Mains" : "Battery", `Backup battery ${r.batteryPct}%`, r.power === "battery" && r.batteryPct <= deviceSpec.power.lowBattery.value),
    row("Wi-Fi", `${r.rssiDbm < 0 ? "−" : ""}${Math.abs(r.rssiDbm)} dBm`, wifi),
  );

  const list = $("activity");
  list.replaceChildren(
    ...s.events.slice(0, 12).map((e) => {
      const li = document.createElement("li");
      li.dataset.kind = e.kind;
      const time = document.createElement("time");
      time.dateTime = new Date(e.t).toISOString();
      time.textContent = timeFmt(e.t);
      const text = document.createElement("span");
      text.textContent = e.text;
      li.append(time, text);
      return li;
    }),
  );

  $("sourceNote").textContent = s.source === "simulated" ? "Readings are simulated until the vault's controller connects." : "Live readings from the vault.";
  updateLink();
}

function updateLink(): void {
  const status: LinkStatus = client.status;
  const link = $("link");
  link.dataset.status = status;
  const sim = client.state?.source === "simulated";
  $("linkText").textContent = status === "online" ? (sim ? "Simulated vault" : "Connected") : status === "connecting" ? "Connecting to the vault" : "Vault offline";
  for (const id of ["lockBtn", "glassBtn", "panic", "clearAlert"]) if (status !== "online") $<HTMLButtonElement>(id).disabled = true;
  if (status === "online") for (const id of ["glassBtn", "panic", "clearAlert"]) $<HTMLButtonElement>(id).disabled = false;
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) input.disabled = status !== "online";
}

client.onState(render);
client.onStatus(() => {
  updateLink();
  if (client.state && client.status === "online") render(client.state);
});

declare global {
  interface Window {
    __safelockMobile: { client: DeviceClient };
  }
}
window.__safelockMobile = { client };

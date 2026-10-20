import type { GlassMode } from "./smartGlass";
import type { Security, StorageMode } from "./deviceState";
import { PATENT_VIEWS, type ViewName } from "./patentViews";

/** Everything needed to reproduce a render, mirrored in the URL query string. */
export interface ViewState {
  view: ViewName;
  glass: GlassMode;
  /** Door angle in degrees (0 = closed). URL accepts "open", "closed" or a number. */
  door: number;
  security: Security;
  mode: StorageMode;
  tint: boolean;
  overlay: boolean;
  explode: number;
  cutaway: number;
  patent: boolean;
  post: boolean;
  exposure: number;
  toneMapping: "agx" | "aces";
  hdriBackground: boolean;
  gui: boolean;
  /** Show the mobile screen beside the model. */
  phone: boolean;
  /** Link to the device hub (live twin). URL `device=0` turns it off for reproducible renders. */
  device: boolean;
  /** Demo scenario id ("" = none) and its 1-based step; see features/scenarios.ts. */
  demo: string;
  step: number;
  /** Fixed render size in px (still renders); 0 = fit the window. */
  width: number;
  height: number;
}

export const DEFAULTS: ViewState = {
  view: "hero",
  glass: "transparent",
  door: 0,
  security: "idle",
  mode: "normal",
  tint: false,
  overlay: false,
  explode: 0,
  cutaway: 0,
  patent: false,
  post: true,
  exposure: 1,
  toneMapping: "agx",
  hdriBackground: false,
  gui: true,
  phone: false,
  device: true,
  demo: "",
  step: 1,
  width: 0,
  height: 0,
};

const VIEWS: readonly string[] = [...PATENT_VIEWS, "hero"];
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const bool = (v: string | null, d: boolean) => (v === null ? d : v === "1" || v === "true" || v === "on");
const num = (v: string | null, d: number) => (v === null || Number.isNaN(Number(v)) ? d : Number(v));

export function parseQuery(search: string, maxDoorAngle: number): ViewState {
  const q = new URLSearchParams(search);
  const s: ViewState = { ...DEFAULTS };
  const patent = bool(q.get("patent"), false);
  s.patent = patent;
  // Patent mode defaults: door closed, glass opaque, no post-processing, no labels.
  if (patent) {
    s.glass = "opaque";
    s.post = false;
    s.view = "front";
  }
  const view = q.get("view");
  if (view && VIEWS.includes(view)) s.view = view as ViewName;
  const glass = q.get("glass");
  if (glass === "opaque" || glass === "transparent") s.glass = glass;
  const door = q.get("door");
  if (door === "open") s.door = maxDoorAngle;
  else if (door === "closed") s.door = 0;
  else s.door = Math.min(Math.max(num(door, 0), 0), maxDoorAngle);
  const sec = q.get("state");
  if (sec === "idle" || sec === "alert") s.security = sec;
  const mode = q.get("mode");
  if (mode === "cold" || mode === "normal" || mode === "warm") s.mode = mode;
  s.tint = bool(q.get("tint"), s.tint);
  s.overlay = patent ? false : bool(q.get("overlay"), s.overlay);
  s.explode = clamp01(num(q.get("explode"), s.explode));
  s.cutaway = clamp01(num(q.get("cutaway"), s.cutaway));
  s.post = patent ? false : bool(q.get("post"), s.post);
  s.exposure = Math.min(Math.max(num(q.get("exposure"), s.exposure), 0.1), 4);
  const tm = q.get("tonemap");
  if (tm === "agx" || tm === "aces") s.toneMapping = tm;
  s.hdriBackground = patent ? false : bool(q.get("hdri"), s.hdriBackground);
  s.gui = bool(q.get("gui"), s.gui);
  s.phone = patent ? false : bool(q.get("phone"), s.phone);
  s.device = bool(q.get("device"), s.device);
  const demo = q.get("demo");
  if (!patent && demo && /^[a-z]+$/.test(demo)) s.demo = demo;
  s.step = Math.max(1, Math.round(num(q.get("step"), 1)));
  s.width = Math.max(0, Math.round(num(q.get("w"), 0)));
  s.height = Math.max(0, Math.round(num(q.get("h"), s.width)));
  return s;
}

/** Serialise only the values that differ from the defaults (for the mode in use). */
export function toQuery(s: ViewState, maxDoorAngle: number): string {
  const base = parseQuery(s.patent ? "?patent=1" : "", maxDoorAngle);
  const q = new URLSearchParams();
  if (s.patent) q.set("patent", "1");
  if (s.view !== base.view) q.set("view", s.view);
  if (s.glass !== base.glass) q.set("glass", s.glass);
  if (s.door !== base.door) q.set("door", s.door === maxDoorAngle ? "open" : String(Math.round(s.door * 10) / 10));
  if (s.security !== base.security) q.set("state", s.security);
  if (s.mode !== base.mode) q.set("mode", s.mode);
  if (s.tint !== base.tint) q.set("tint", s.tint ? "1" : "0");
  if (s.overlay !== base.overlay) q.set("overlay", s.overlay ? "1" : "0");
  if (s.explode !== base.explode) q.set("explode", String(Math.round(s.explode * 1000) / 1000));
  if (s.cutaway !== base.cutaway) q.set("cutaway", String(Math.round(s.cutaway * 1000) / 1000));
  if (s.post !== base.post) q.set("post", s.post ? "1" : "0");
  if (s.exposure !== base.exposure) q.set("exposure", String(Math.round(s.exposure * 100) / 100));
  if (s.toneMapping !== base.toneMapping) q.set("tonemap", s.toneMapping);
  if (s.hdriBackground !== base.hdriBackground) q.set("hdri", s.hdriBackground ? "1" : "0");
  if (!s.gui) q.set("gui", "0");
  if (s.phone) q.set("phone", "1");
  if (!s.device) q.set("device", "0");
  if (s.demo) {
    q.set("demo", s.demo);
    if (s.step > 1) q.set("step", String(s.step));
  }
  if (s.width) q.set("w", String(s.width));
  if (s.height && s.height !== s.width) q.set("h", String(s.height));
  const str = q.toString();
  return str ? `?${str}` : "";
}

import { spec } from "./spec/dimensions";
import { App } from "./app";
import { parseQuery } from "./features/urlState";
import { buildGui } from "./ui/gui";
import { DeviceClient } from "./device/client";
import { DemoPanel } from "./ui/demoPanel";

const container = document.getElementById("app")!;
const state = parseQuery(location.search, spec.door.maxOpenAngle.value);
const app = new App(container, spec, state);
// Live twin of the device hub, except for reproducible renders (patent / fixed size / device=0).
if (state.device && !state.patent && !state.width) app.attachDevice(new DeviceClient("twin"));
const demo = new DemoPanel(app);
const gui = state.gui ? buildGui(app, demo) : null;
// A demo is for an audience: keep the debug panel out of the way (it can be reopened).
demo.onStart = () => gui?.close();
if (state.demo) gui?.close();

/** Hook for Playwright renders and tests. */
declare global {
  interface Window {
    __safelock: { app: App; demo: DemoPanel; ready: boolean; capture: () => string; info: () => Record<string, unknown> };
  }
}

window.__safelock = {
  app,
  demo,
  get ready() {
    return app.ready;
  },
  capture: () => app.capture(),
  info: () => ({
    fps: app.fps,
    calls: app.renderer.info.render.calls,
    triangles: app.renderer.info.render.triangles,
    geometries: app.renderer.info.memory.geometries,
    textures: app.renderer.info.memory.textures,
    programs: app.renderer.info.programs?.length ?? 0,
    env: app.env.status,
    door: { angle: app.door.angle, bolt: app.door.bolt, phase: app.door.phase },
    glass: app.glass.value,
  }),
};

app.init().catch((err) => console.error("[safelock] init failed", err));

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    gui?.destroy();
    demo.dispose();
    app.dispose();
  });
}

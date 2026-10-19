import GUI from "lil-gui";
import type { App } from "../app";
import { PATENT_VIEWS } from "../features/patentViews";

/** lil-gui control panel. Every control writes through App so the URL stays in sync. */
export function buildGui(app: App): GUI {
  const gui = new GUI({ title: "Safe Lock" });
  const st = app.state;
  const proxy = {
    open: () => app.openDoor(),
    close: () => app.closeDoor(),
    get angle() {
      return Math.round(app.door.angle * 10) / 10;
    },
    get bolt() {
      return app.door.bolt === 0 ? "extended (locked)" : app.door.bolt === 1 ? "retracted" : "moving";
    },
    get fps() {
      return Math.round(app.fps);
    },
    rebuild: () => app.rebuild(),
  };

  const door = gui.addFolder("Door & lock");
  door.add(proxy, "open").name("Open door");
  door.add(proxy, "close").name("Close door");
  door.add(proxy, "angle").name("Angle (°)").listen().disable();
  door.add(proxy, "bolt").name("Bolt").listen().disable();

  const dev = gui.addFolder("Device");
  dev.add(st, "glass", ["transparent", "opaque"]).name("Smart glass").listen().onChange(() => app.deviceCommand("glass"));
  dev.add(st, "security", ["idle", "alert"]).name("Security").listen().onChange(() => app.deviceCommand("security"));
  dev.add(st, "mode", ["cold", "normal", "warm"]).name("Storage mode").listen().onChange(() => app.deviceCommand("mode"));
  dev.add(st, "tint").name("Chamber tint").listen().onChange(() => app.applyState());

  dev.add(st, "phone").name("Phone screen").listen().onChange(() => app.applyState());

  const sim = gui.addFolder("Simulate events");
  const events: [string, Parameters<App["simulate"]>[0]][] = [
    ["Knock on the vault", "knock"],
    ["Someone walks by", "motion"],
    ["Open electronics cover", "tamperOpen"],
    ["Close electronics cover", "tamperClose"],
    ["Tilt the vault", "tilt"],
    ["Set it level", "level"],
    ["Cut mains power", "powerLoss"],
    ["Restore mains power", "powerRestore"],
  ];
  for (const [label, event] of events) sim.add({ [event]: () => app.simulate(event) }, event).name(label);
  sim.close();

  const eng = gui.addFolder("Engineering");
  eng.add(st, "overlay").name("Sensor overlay").listen().onChange(() => app.applyState());
  eng.add(st, "explode", 0, 1, 0.001).name("Exploded view").listen().onChange(() => app.applyState());
  eng.add(st, "cutaway", 0, 1, 0.001).name("Cutaway").listen().onChange(() => app.applyState());

  const view = gui.addFolder("View");
  view.add(st, "view", ["hero", ...PATENT_VIEWS]).name("Camera").listen().onChange(() => app.applyState({ reframe: true }));
  view.add(st, "patent").name("Patent mode").listen().onChange(() => app.setPatent(st.patent));

  const r = gui.addFolder("Rendering");
  r.add(st, "exposure", 0.1, 4, 0.01).name("Exposure").listen().onChange(() => app.applyState());
  r.add(st, "toneMapping", ["agx", "aces"]).name("Tone mapping").listen().onChange(() => app.applyState());
  r.add(st, "post").name("Post-processing").listen().onChange(() => app.applyState());
  r.add(st, "hdriBackground").name("HDRI background").listen().onChange(() => app.applyState());
  r.add(proxy, "fps").name("FPS").listen().disable();
  r.add(proxy, "rebuild").name("Rebuild model");
  r.close();

  return gui;
}

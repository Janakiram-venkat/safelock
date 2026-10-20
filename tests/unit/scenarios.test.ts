import { describe, it, expect } from "vitest";
import { spec } from "../../src/spec/dimensions";
import { deviceSpec } from "../../src/spec/device";
import { buildScenarios, resolveScene, ScenarioPlayer, BASE_SCENE, PILLARS, type DemoScene } from "../../src/features/scenarios";
import { parseQuery, toQuery } from "../../src/features/urlState";
import { PATENT_VIEWS } from "../../src/features/patentViews";
import type { PhysicalEvent } from "../../src/device/protocol";

const scenarios = buildScenarios(deviceSpec);
const DWELL = spec.timing.demoStep.value;

function recorder() {
  const calls: { scene: DemoScene; events: PhysicalEvent[] }[] = [];
  const player = new ScenarioPlayer(scenarios, DWELL, (scene, events) => calls.push({ scene, events: [...events] }));
  return { calls, player };
}

describe("demo scenarios", () => {
  it("have unique ids, steps and valid scenes", () => {
    const ids = scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const sc of scenarios) {
      expect(sc.steps.length).toBeGreaterThan(0);
      for (let i = 0; i < sc.steps.length; i++) {
        const st = sc.steps[i];
        expect(st.pillars.length).toBeGreaterThan(0);
        for (const p of st.pillars) expect(PILLARS[p]).toBeDefined();
        const scene = resolveScene(sc, i);
        expect(["hero", ...PATENT_VIEWS]).toContain(scene.view);
        expect(scene.explode).toBeGreaterThanOrEqual(0);
        expect(scene.explode).toBeLessThanOrEqual(1);
        expect(scene.cutaway).toBeGreaterThanOrEqual(0);
        expect(scene.cutaway).toBeLessThanOrEqual(1);
      }
    }
  });

  it("cover all five Surakshit Bharat pillars", () => {
    const covered = new Set(scenarios.flatMap((s) => s.steps.flatMap((st) => st.pillars)));
    expect([...covered].sort()).toEqual(Object.keys(PILLARS).sort());
  });

  it("take their numbers from the device spec", () => {
    const highway = scenarios.find((s) => s.id === "highway")!;
    expect(highway.steps[0].text).toContain(`${deviceSpec.climate.coldTarget.value} °C`);
  });

  it("resolve scenes cumulatively from the base", () => {
    const sc = scenarios.find((s) => s.id === "highway")!;
    expect(resolveScene(sc, 0)).toEqual({ ...BASE_SCENE, ...sc.base, ...sc.steps[0].scene });
    const alertStep = sc.steps.findIndex((s) => s.scene.security === "alert");
    // Later steps inherit settings they do not mention.
    expect(resolveScene(sc, alertStep).mode).toBe("cold");
    expect(resolveScene(sc, alertStep).security).toBe("alert");
  });
});

describe("scenario player", () => {
  it("fires events stepping forward only", () => {
    const { calls, player } = recorder();
    player.start("attack");
    player.next();
    expect(calls[1].events).toEqual(["motion"]);
    player.prev();
    expect(calls[2].events).toEqual([]);
    expect(calls[2].scene).toEqual(calls[0].scene);
  });

  it("stepping back restores the earlier scene exactly", () => {
    const { calls, player } = recorder();
    const sc = scenarios.find((s) => s.id === "disaster")!;
    player.start(sc.id);
    for (let i = 1; i < sc.steps.length; i++) player.next();
    for (let i = sc.steps.length - 1; i > 0; i--) player.prev();
    expect(calls.at(-1)!.scene).toEqual(calls[0].scene);
    expect(player.index).toBe(0);
  });

  it("auto-plays at the spec dwell and stops on the last step", () => {
    const { player } = recorder();
    const sc = scenarios.find((s) => s.id === "tour")!;
    player.start(sc.id, 0, true);
    player.update(DWELL - 1);
    expect(player.index).toBe(0);
    player.update(1);
    expect(player.index).toBe(1);
    for (let i = 0; i < sc.steps.length * 2; i++) player.update(DWELL);
    expect(player.index).toBe(sc.steps.length - 1);
    expect(player.playing).toBe(false);
  });

  it("rejects unknown scenarios and clamps the start step", () => {
    const { player } = recorder();
    expect(player.start("nope")).toBe(false);
    expect(player.start("highway", 99)).toBe(true);
    expect(player.index).toBe(scenarios[0].steps.length - 1);
  });

  it("round-trips through the URL", () => {
    const max = spec.door.maxOpenAngle.value;
    const s = parseQuery("?demo=highway&step=3", max);
    expect(s.demo).toBe("highway");
    expect(s.step).toBe(3);
    expect(parseQuery(toQuery(s, max), max)).toEqual(s);
    expect(parseQuery("?patent=1&demo=highway", max).demo).toBe("");
  });
});

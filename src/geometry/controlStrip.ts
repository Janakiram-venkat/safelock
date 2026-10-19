import * as THREE from "three";
import type { Spec } from "../spec/dimensions";
import { materials as M } from "../spec/materials";
import { stripGlass, led, lens } from "../materials";
import { group, rbox, cyl, lathe, at, explode, named } from "./util";

/**
 * Control / indicator strip on the door's bottom rail: a dark glass panel
 * with three status LEDs (status, storage mode, network) and an access pad
 * ringed by an LED light guide.
 */
export function build(s: Spec): THREE.Group {
  const c = s.controlStrip;
  const [cx, cy, zf] = c.center.value;
  const top = zf + c.panelDepth.value; // outermost face of LEDs and pad
  const depth = c.panelDepth.value - c.featureRelief.value;

  const panel = named(rbox([c.width.value, c.height.value, depth], stripGlass(), Math.min(depth / 2, 0.6)), "stripPanel");
  at(panel, [cx, cy, zf + depth / 2]);

  const ledNames = ["ledStatus", "ledMode", "ledNetwork"];
  const ledColors = [M.led.colors.idle, M.led.colors.normal, M.led.colors.network];
  const leds = Array.from({ length: c.ledCount.value }, (_, i) => {
    const m = named(cyl(c.ledDiameter.value / 2, 0.6, led(ledColors[i] ?? M.led.colors.idle), "z"), ledNames[i] ?? `led${i}`);
    return at(m, [cx + c.ledStartX.value + i * c.ledPitch.value, cy, top - 0.3]);
  });

  // Access pad: emissive ring around a dark sensor disc.
  const pr = c.padDiameter.value / 2;
  const ringProfile: [number, number][] = [[pr - 1.2, 0], [pr, 0], [pr, 0.5], [pr - 1.2, 0.5]];
  const ring = named(lathe(ringProfile, led(M.led.colors.network), "z"), "padRing");
  at(ring, [cx + c.padOffsetX.value, cy, top - 0.5]);
  const disc = named(cyl(pr - 1.4, 0.4, lens(), "z"), "padSensor");
  at(disc, [cx + c.padOffsetX.value, cy, top - 0.2 - 0.05]);

  return explode(group("controlStrip", panel, ...leds, ring, disc), s.explode.controlStrip.value);
}

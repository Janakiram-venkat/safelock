import * as THREE from "three";
import type { Spec } from "../spec/dimensions";
import { derive } from "../spec/derived";
import { rubber } from "../materials";
import { group, lathe, at, explode, named } from "./util";

/** Four rubber feet with a slight taper and rounded contact edge. */
export function build(s: Spec): THREE.Group {
  const d = derive(s);
  const r = s.feet.diameter.value / 2;
  const h = s.feet.height.value;
  const e = Math.min(1.5, h / 4);
  const profile: [number, number][] = [
    [0, 0], [r * 0.9 - e, 0], [r * 0.9, e], [r * 0.95, h * 0.55], [r, h - e * 0.6], [r - e, h], [0, h],
  ];
  const inset = s.feet.inset.value;
  const feet = group("feet");
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const foot = named(lathe(profile, rubber()), `foot${sx < 0 ? "L" : "R"}${sz < 0 ? "B" : "F"}`);
    at(foot, [sx * (d.W / 2 - inset), 0, sz * (d.D / 2 - inset)]);
    feet.add(foot);
  }
  return explode(feet, s.explode.feet.value);
}

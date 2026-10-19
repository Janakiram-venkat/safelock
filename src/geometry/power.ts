import * as THREE from "three";
import type { Spec } from "../spec/dimensions";
import { derive } from "../spec/derived";
import { plastic, aluminium, vent, rfShield } from "../materials";
import { materials as M } from "../spec/materials";
import { group, rbox, cyl, lathe, at, explode, named } from "./util";

/** Power: DC panel inlet through the rear panel, and the backup battery pack. */
export function build(s: Spec): THREE.Group {
  return group("power", inlet(s), battery(s));
}

function inlet(s: Spec): THREE.Group {
  const d = derive(s);
  const p = s.powerInlet;
  const [x, y] = p.centerXY.value;
  const fr = p.flangeDiameter.value / 2;
  const ft = p.flangeThickness.value;
  const zr = d.body.min[2];

  // Flange outside the rear panel (height runs −Z, away from the panel).
  const flange = named(lathe([[p.bodyDiameter.value / 2 - 2.5, 0], [fr, 0], [fr, ft * 0.6], [fr - 0.6, ft], [p.bodyDiameter.value / 2 - 2.5, ft]], plastic("black"), "z"), "inletFlange");
  flange.rotation.y = Math.PI;
  at(flange, [x, y, zr]);
  const socket = named(cyl(p.bodyDiameter.value / 2 - 2.5, 0.6, vent(), "z"), "inletSocket");
  at(socket, [x, y, zr - ft + 0.25]);
  const pin = cyl(1, 4, rfShield(), "z", 16);
  at(pin, [x, y, zr - ft + 1.8]);
  // Threaded body inside the bay, with a hex nut on the inner face.
  const body = named(cyl(p.bodyDiameter.value / 2, p.bodyLength.value, plastic("black"), "z"), "inletBody");
  at(body, [x, y, d.inner.min[2] + p.bodyLength.value / 2]);
  const nut = cyl(p.bodyDiameter.value / 2 + 1.5, 2.5, aluminium(), "z", 6);
  at(nut, [x, y, d.inner.min[2] + 1.25]);
  return explode(group("powerInlet", flange, socket, pin, body, nut), s.explode.rearPanel.value);
}

function battery(s: Spec): THREE.Group {
  const b = s.battery;
  const c = b.center.value;
  const [w, h, dd] = b.size.value;
  const wall = 1.2;
  const holder = named(rbox([w, h * 0.55, dd], plastic("black"), 1), "batteryHolder");
  at(holder, [c[0], c[1] - h / 2 + (h * 0.55) / 2, c[2]]);
  // Two 18650-size cells lying along X.
  const cellR = Math.min(h / 2, dd / 4) - 0.3;
  const cellLen = w - 2 * wall - 6;
  const wrap = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(M.plasticBlue.color), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const cells = [-1, 1].map((k) => {
    const cell = named(cyl(cellR, cellLen, k < 0 ? wrap : wrap.clone(), "x"), "batteryCell");
    return at(cell, [c[0], c[1] - h / 2 + cellR + 0.3, c[2] + k * (dd / 4)]);
  });
  const contacts = [-1, 1].flatMap((kx) => [-1, 1].map((kz) => at(rbox([0.6, cellR * 1.4, cellR * 1.4], aluminium(), 0.2), [c[0] + kx * (w / 2 - wall - 1), c[1] - h / 2 + cellR + 0.3, c[2] + kz * (dd / 4)])));
  return explode(group("battery", holder, ...cells, ...contacts), s.explode.bayInternals.value);
}

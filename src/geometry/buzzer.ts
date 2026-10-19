import * as THREE from "three";
import { mm, type Spec } from "../spec/dimensions";
import { derive } from "../spec/derived";
import { plastic, vent } from "../materials";
import { group, cyl, at, explode, named, instanced } from "./util";

/** Hexagonal grille hole pattern (mm offsets in the wall plane). */
export function grilleOffsets(pitch: number, rings: number): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  for (let r = 1; r <= rings; r++) {
    for (let side = 0; side < 6; side++) {
      const a0 = (side * Math.PI) / 3;
      const a1 = ((side + 1) * Math.PI) / 3;
      for (let k = 0; k < r; k++) {
        const t = k / r;
        const x = r * pitch * ((1 - t) * Math.cos(a0) + t * Math.cos(a1));
        const y = r * pitch * ((1 - t) * Math.sin(a0) + t * Math.sin(a1));
        pts.push([x, y]);
      }
    }
  }
  return pts;
}

/**
 * Buzzer behind a small grille in the latch-side wall of the electronics bay.
 * The grille holes are a separate group ("buzzerGrille") so the alert state
 * can pulse them.
 */
export function build(s: Spec): THREE.Group {
  const d = derive(s);
  const b = s.buzzer;
  const c = b.center.value;
  const r = b.diameter.value / 2;
  const body = named(cyl(r, b.length.value, plastic("black"), "x"), "buzzerBody");
  at(body, c);
  const port = cyl(1.2, 0.4, vent(), "x", 24);
  at(port, [c[0] + b.length.value / 2 + 0.05, c[1], c[2]]);

  const holeGeo = new THREE.CylinderGeometry(mm(b.grilleHoleDiameter.value / 2), mm(b.grilleHoleDiameter.value / 2), mm(d.t + 0.1), 20);
  holeGeo.rotateZ(Math.PI / 2);
  const grilleMat = vent();
  grilleMat.emissive = new THREE.Color("#000000");
  const pts = grilleOffsets(b.grillePitch.value, b.grilleRings.value).map(([dz, dy]) => [d.body.max[0] - d.t / 2 + 0.06, c[1] + dy, c[2] + dz]);
  const holes = named(instanced(holeGeo, grilleMat, pts), "buzzerGrilleHoles");
  holes.castShadow = false;
  const grille = group("buzzerGrille", holes);

  return group("buzzerAssembly", explode(group("buzzer", body, port), s.explode.buzzer.value), grille);
}

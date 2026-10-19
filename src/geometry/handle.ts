import * as THREE from "three";
import { mm, type Spec } from "../spec/dimensions";
import { brushedMetal } from "../materials";
import { group, cyl, at, explode, named, shadows, SEG } from "./util";

/** Vertical bar pull on the latch-side stile (placeholder shape, awaiting approval). */
export function build(s: Spec): THREE.Group {
  const h = s.handle;
  const [x, y, zFront] = h.center.value;
  const br = h.barDiameter.value / 2;
  const L = h.length.value;
  const barZ = zFront + h.standoff.value;

  // Brush direction runs along the bar (Y); lathe/capsule UVs run U around, so rotate 90°.
  const barGeo = new THREE.CapsuleGeometry(mm(br), mm(L - 2 * br), 12, SEG());
  const bar = named(shadows(new THREE.Mesh(barGeo, brushedMetal(Math.PI / 2))), "handleBar");
  at(bar, [x, y, barZ]);

  const pr = h.postDiameter.value / 2;
  const postLen = h.standoff.value;
  const posts = [-1, 1].map((k) => {
    const post = cyl(pr, postLen, brushedMetal(), "z");
    return at(post, [x, y + k * (L / 2 - br * 2), zFront + postLen / 2]);
  });
  return explode(group("handle", bar, ...posts), s.explode.handle.value);
}

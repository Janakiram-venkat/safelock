import * as THREE from "three";
import { mm, deg, type Spec } from "../spec/dimensions";
import { derive } from "../spec/derived";
import { materials as M } from "../spec/materials";
import { pcb, plastic, fresnelDome, lens, led, magnetBody, rfShield, vent, zincScrew } from "../materials";
import { group, rbox, cyl, lathe, at, explode, named, shadows, instanced, SEG } from "./util";

/** Door-mounted sensors: PIR on the top rail and the door-sensor magnet. */
export function buildDoorMounted(s: Spec): THREE.Group {
  return group("doorSensors", pir(s), magnet(s));
}

/** Body-mounted sensors: camera, reed switch, vibration, temperature/humidity. */
export function build(s: Spec): THREE.Group {
  return group("sensors", camera(s), reed(s), vibration(s), tempHumidity(s));
}

function pir(s: Spec): THREE.Group {
  const p = s.pir;
  const [x, y, zf] = p.center.value;
  const R = p.domeDiameter.value / 2;
  const bezelR = p.bezelDiameter.value / 2;
  const bh = p.bezelHeight.value;

  // Bezel ring, proud of the rail, with a rounded outer edge.
  const bezel = named(lathe([[R - 0.2, 0], [bezelR - 0.6, 0], [bezelR, 0.5], [bezelR - 0.4, bh], [R, bh]], plastic("white"), "z"), "pirBezel");
  at(bezel, [x, y, zf]);

  // Fresnel dome: spheroid cap scaled to the dome height.
  const domeGeo = new THREE.SphereGeometry(mm(R), SEG(), SEG() / 2, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.rotateX(Math.PI / 2); // cap points +Z
  domeGeo.scale(1, 1, p.domeHeight.value / R);
  const dome = named(shadows(new THREE.Mesh(domeGeo, fresnelDome())), "pirDome");
  at(dome, [x, y, zf + bh]);

  // Facet rings moulded into the Fresnel lens (thin torus lines).
  const facets = group("pirFacets");
  for (let i = 1; i <= 3; i++) {
    const phi = (i / 4) * (Math.PI / 2);
    const ringR = R * Math.cos(phi);
    const ringZ = p.domeHeight.value * Math.sin(phi);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(mm(ringR), mm(0.15), 6, SEG()), fresnelDome());
    facets.add(at(torus, [x, y, zf + bh + ringZ]));
  }

  // Sensor board inside the rail (hidden behind the frame face, kept for the exploded view).
  const [bw, bhh, bt] = p.boardSize.value;
  const board = named(rbox([bw, bhh, bt], pcb("green"), 0.4), "pirBoard");
  at(board, [x, y, zf - s.door.frontLipDepth.value - bt / 2]);

  return explode(group("pir", bezel, dome, facets, board), s.explode.pir.value);
}

function magnet(s: Spec): THREE.Group {
  const ds = s.doorSensor;
  const body = named(rbox(ds.magnetSize.value, magnetBody(), 1), "magnetBody");
  at(body, ds.magnetCenter.value);
  return explode(group("magnet", body), s.explode.magnet.value);
}

function reed(s: Spec): THREE.Group {
  const ds = s.doorSensor;
  const c = ds.reedCenter.value;
  const size = ds.reedSize.value;
  const body = named(rbox(size, magnetBody(), 1), "reedBody");
  at(body, c);
  // Fixing screws on the chamber-facing face.
  const screws = [-1, 1].map((k) => at(cyl(1.6, 0.6, zincScrew(), "x", 24), [c[0] - size[0] / 2 + 0.25, c[1] + k * (size[1] / 2 - 4), c[2]]));
  return explode(group("reed", body, ...screws), s.explode.reed.value);
}

function camera(s: Spec): THREE.Group {
  const c = s.camera;
  const d = derive(s);
  const cen = c.center.value;
  const [w, h, dd] = c.housingSize.value;

  // Ceiling mount plate and post (not tilted).
  const mp = c.mountPlateSize.value;
  const plate = named(rbox(mp, plastic("black"), 0.8), "cameraMount");
  at(plate, [cen[0], d.inner.max[1] - mp[1] / 2, cen[2]]);
  const postLen = d.inner.max[1] - mp[1] - cen[1];
  const post = cyl(c.postDiameter.value / 2, postLen, plastic("black"), "y");
  at(post, [cen[0], cen[1] + postLen / 2, cen[2]]);

  // Tilted housing: local −Z is the lens axis.
  const head = group("cameraHead");
  at(head, cen);
  head.rotation.x = deg(c.tilt.value);
  const housing = named(rbox([w, h, dd], plastic("black"), 3), "cameraHousing");
  head.add(housing);
  const lr = c.lensDiameter.value / 2;
  const ll = c.lensLength.value;
  const barrel = named(cyl(lr, ll, plastic("black"), "z"), "cameraBarrel");
  barrel.position.z = -mm(dd / 2 + ll / 2);
  const glass = named(lathe([[0, 0], [lr * 0.72, 0], [lr * 0.72, 0.4], [0, 1.0]], lens(), "z"), "cameraLens");
  glass.rotation.x = Math.PI; // dome faces −Z, out of the barrel
  glass.position.z = -mm(dd / 2 + ll - 0.9);
  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(mm(lr * 0.82), mm(0.4), 10, SEG()), rfShield());
  lensRing.position.z = -mm(dd / 2 + ll - 0.2);
  const illum = named(cyl(c.ledDiameter.value / 2, 0.6, led(M.led.colors.cameraIllumination), "z"), "cameraLed");
  illum.position.set(mm(c.ledOffsetX.value), 0, -mm(dd / 2 + 0.2));
  head.add(barrel, glass, lensRing, illum);

  return explode(group("camera", plate, post, head), s.explode.camera.value);
}

function vibration(s: Spec): THREE.Group {
  const v = s.vibration;
  const c = v.center.value;
  const [sx, sy, sz] = v.size.value;
  // Module board stands off the inner hinge-side wall; components face the chamber (+X).
  const bt = 1.6;
  const wallX = c[0] - sx / 2;
  const board = named(rbox([bt, sy, sz], pcb("blue"), 0.4), "vibrationBoard");
  at(board, [wallX + 3 + bt / 2, c[1], c[2]]);
  const standoffs = [-1, 1].map((k) => at(cyl(1.5, 3, zincScrew(), "x", 16), [wallX + 1.5, c[1], c[2] + k * (sz / 2 - 3)]));
  const can = named(cyl(2.5, 5.5, rfShield(), "x"), "vibrationSwitch");
  at(can, [wallX + 3 + bt + 2.75, c[1], c[2] - sz / 2 + 7]);
  const pot = rbox([4.5, 6.5, 6.5], plastic("blue"), 0.6);
  at(pot, [wallX + 3 + bt + 2.25, c[1], c[2] + 2]);
  const chip = rbox([1.5, 4, 5], plastic("black"), 0.3);
  at(chip, [wallX + 3 + bt + 0.75, c[1], c[2] + 10]);
  return explode(group("vibration", board, ...standoffs, can, pot, chip), s.explode.vibration.value);
}

function tempHumidity(s: Spec): THREE.Group {
  const t = s.tempHumidity;
  const c = t.center.value;
  const [sx, sy, sz] = t.size.value;
  const body = named(rbox([sx, sy, sz], plastic("white"), 1), "thBody");
  at(body, c);
  // Ventilation grille on the chamber-facing face: instanced slots.
  const slot = new THREE.BoxGeometry(mm(0.6), mm(1.4), mm(sz * 0.62));
  const rows = 6;
  const pts = Array.from({ length: rows }, (_, i) => [c[0] - sx / 2 + 0.2, c[1] + sy * 0.32 - i * ((sy * 0.6) / (rows - 1)), c[2]]);
  const slots = named(instanced(slot, vent(), pts), "thVents");
  return explode(group("tempHumidity", body, slots), s.explode.tempHumidity.value);
}

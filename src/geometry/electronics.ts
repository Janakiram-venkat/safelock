import * as THREE from "three";
import { mm, type Spec } from "../spec/dimensions";
import { derive, boxSize, boxCenter } from "../spec/derived";
import { powderCoat, pcb, rfShield, plastic, zincScrew, aluminium, ceramic } from "../materials";
import { group, rbox, cyl, at, explode, named, instanced, shadows } from "./util";

/**
 * Electronics bay at the bottom of the body: a steel cover (chamber floor)
 * and front panel, the ESP32-class controller board with the IMU on headers,
 * and the tamper microswitch on the cover underside.
 */
export function build(s: Spec): THREE.Group {
  const d = derive(s);
  const cover = named(rbox(boxSize(d.bayCover), powderCoat(), 0.8), "bayCover");
  at(cover, boxCenter(d.bayCover));
  const front = named(rbox(boxSize(d.bayFrontPanel), powderCoat(), 0.8), "bayFrontPanel");
  at(front, boxCenter(d.bayFrontPanel));

  const coverGroup = explode(group("bayCoverGroup", cover, tamper(s)), s.explode.bayCover.value);
  const internals = explode(group("bayInternals", controller(s), imu(s)), s.explode.bayInternals.value);
  return group("electronics", front, coverGroup, internals);
}

function controller(s: Spec): THREE.Group {
  const c = s.controller;
  const [bw, bt, bd] = c.boardSize.value;
  const bc = c.boardCenter.value;
  const board = named(rbox([bw, bt, bd], pcb("black"), 0.5), "controllerBoard");
  at(board, bc);
  const top = bc[1] + bt / 2;

  // Standoffs at the corners.
  const sh = c.standoffHeight.value;
  const si = c.standoffInset.value;
  const standoffs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([kx, kz]) =>
    at(cyl(c.standoffDiameter.value / 2, sh, aluminium(), "y", 6), [bc[0] + kx * (bw / 2 - si), bc[1] - bt / 2 - sh / 2, bc[2] + kz * (bd / 2 - si)]),
  );

  // ESP32-class module: PCB carrier + RF shield can, antenna end left bare.
  const [mw, mh, md] = c.mcuSize.value;
  const [mx, , mz] = c.mcuCenterXZ.value;
  const modPcb = rbox([mw, 0.8, md], pcb("black"), 0.3);
  at(modPcb, [mx, top + 0.4, mz]);
  const shieldD = md * 0.68;
  const shield = named(rbox([mw - 1, mh - 0.8, shieldD], rfShield(), 0.4), "mcuShield");
  at(shield, [mx, top + 0.8 + (mh - 0.8) / 2, mz + (md - shieldD) / 2 - 0.5]);

  // Passive components (instanced) and a USB connector at the board edge.
  const smd = new THREE.BoxGeometry(mm(1.6), mm(0.6), mm(0.8));
  const pts: number[][] = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) pts.push([bc[0] + 8 + i * 2.6, top + 0.3, bc[2] - 18 + j * 3.2]);
  const passives = named(instanced(smd, ceramic(), pts), "controllerPassives");
  const usb = rbox([7.5, 3, 5.6], rfShield(), 0.5);
  at(usb, [bc[0] + bw / 2 - 3.8, top + 1.5, bc[2] + 12]);
  const regulator = rbox([6.5, 2.3, 7], plastic("black"), 0.3);
  at(regulator, [bc[0] + 25, top + 1.15, bc[2] + 14]);

  return group("controller", board, ...standoffs, modPcb, shield, passives, usb, regulator);
}

function imu(s: Spec): THREE.Group {
  const m = s.imu;
  const c = m.center.value;
  const [w, h, dd] = m.size.value;
  const bt = 1.6;
  const board = named(rbox([w, bt, dd], pcb("blue"), 0.4), "imuBoard");
  const chipH = 0.9;
  const boardY = c[1] + h / 2 - chipH - bt / 2;
  at(board, [c[0], boardY, c[2]]);
  const chip = rbox([4, chipH, 4], plastic("black"), 0.2);
  at(chip, [c[0], c[1] + h / 2 - chipH / 2, c[2]]);
  // Pin header from the controller up to the IMU board.
  const headerH = h - bt - chipH;
  const header = named(rbox([w * 0.8, headerH * 0.35, 2.5], plastic("black"), 0.3), "imuHeader");
  at(header, [c[0], c[1] - h / 2 + headerH * 0.175, c[2] - dd / 2 + 2]);
  const pin = new THREE.BoxGeometry(mm(0.64), mm(headerH), mm(0.64));
  const pinPts = Array.from({ length: 8 }, (_, i) => [c[0] - (3.5 * 2.54) + i * 2.54, c[1] - h / 2 + headerH / 2, c[2] - dd / 2 + 2]);
  const pins = instanced(pin, aluminium(), pinPts);
  return named(group("imu", board, chip, header, pins), "imu");
}

function tamper(s: Spec): THREE.Group {
  const t = s.tamper;
  const c = t.center.value;
  const [w, h, dd] = t.size.value;
  // Microswitch body hangs from the cover underside; the lever presses on a
  // post on the bay floor when the cover is fitted.
  const bodyH = h * 0.6;
  const body = named(rbox([w, bodyH, dd], plastic("black"), 0.6), "tamperBody");
  at(body, [c[0], c[1] + h / 2 - bodyH / 2, c[2]]);
  const lever = named(rbox([w * 0.85, 0.5, dd * 0.7], zincScrew(), 0.2), "tamperLever");
  at(lever, [c[0] - w * 0.05, c[1] - h / 2 + 1.5, c[2]]);
  lever.rotation.z = 0.12;
  const plunger = cyl(1, h * 0.4 - 1.5, plastic("white"), "y", 16);
  at(plunger, [c[0] + w * 0.3, c[1] - h / 2 + 1.5 + (h * 0.4 - 1.5) / 2, c[2]]);
  return shadows(group("tamper", body, lever, plunger));
}

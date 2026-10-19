import * as THREE from "three";
import { materials as M } from "../spec/materials";
import { mm, spec } from "../spec/dimensions";
import { powderCoatNormal, brushedRoughness } from "./proceduralTextures";

/**
 * PBR material factories. Every call returns a NEW material (never share
 * mutable materials between parts). All numeric values come from
 * src/spec/materials.ts.
 */

const col = (hex: string) => new THREE.Color(hex);

export function powderCoat(): THREE.MeshPhysicalMaterial {
  const p = M.powderCoat;
  const normalMap = powderCoatNormal();
  return new THREE.MeshPhysicalMaterial({
    name: "powderCoat",
    color: col(p.color),
    metalness: p.metalness,
    roughness: p.roughness,
    clearcoat: p.clearcoat,
    clearcoatRoughness: p.clearcoatRoughness,
    normalMap,
    normalScale: new THREE.Vector2(p.normalScale, p.normalScale),
  });
}

/** Brushed metal; `rotation` turns the brush direction (radians) in UV space. */
export function brushedMetal(rotation: number = M.brushedMetal.anisotropyRotation): THREE.MeshPhysicalMaterial {
  const p = M.brushedMetal;
  return new THREE.MeshPhysicalMaterial({
    name: "brushedMetal",
    color: col(p.color),
    metalness: p.metalness,
    roughness: p.roughness,
    roughnessMap: brushedRoughness(),
    anisotropy: p.anisotropy,
    anisotropyRotation: rotation,
  });
}

export function zincScrew(): THREE.MeshStandardMaterial {
  const p = M.zincScrew;
  return new THREE.MeshStandardMaterial({ name: "zinc", color: col(p.color), metalness: p.metalness, roughness: p.roughness });
}

export function aluminium(): THREE.MeshStandardMaterial {
  const p = M.aluminium;
  return new THREE.MeshStandardMaterial({ name: "aluminium", color: col(p.color), metalness: p.metalness, roughness: p.roughness });
}

export function darkAluminium(): THREE.MeshStandardMaterial {
  const p = M.darkAluminium;
  return new THREE.MeshStandardMaterial({ name: "darkAluminium", color: col(p.color), metalness: p.metalness, roughness: p.roughness });
}

export function copper(): THREE.MeshStandardMaterial {
  const p = M.copper;
  return new THREE.MeshStandardMaterial({ name: "copper", color: col(p.color), metalness: p.metalness, roughness: p.roughness });
}

export interface GlassState {
  transmission: number;
  roughness: number;
  ior: number;
  color: string;
  attenuationColor: string;
  attenuationDistance: number;
}

/** Switchable PDLC smart glass. Starts transparent; see features/smartGlass.ts. */
export function smartGlass(): THREE.MeshPhysicalMaterial {
  const g = M.smartGlass;
  const t = g.transparent;
  return new THREE.MeshPhysicalMaterial({
    name: "smartGlass",
    color: col(t.color),
    metalness: 0,
    roughness: t.roughness,
    transmission: t.transmission,
    thickness: mm(spec.door.glassThickness.value),
    ior: t.ior,
    attenuationColor: col(t.attenuationColor),
    attenuationDistance: t.attenuationDistance,
    clearcoat: g.clearcoat,
    clearcoatRoughness: g.clearcoatRoughness,
    specularIntensity: g.specularIntensity,
    side: THREE.FrontSide,
  });
}

export function stripGlass(): THREE.MeshPhysicalMaterial {
  const p = M.stripGlass;
  return new THREE.MeshPhysicalMaterial({ name: "stripGlass", color: col(p.color), roughness: p.roughness, clearcoat: p.clearcoat, metalness: p.metalness });
}

export function rubber(): THREE.MeshStandardMaterial {
  const p = M.rubber;
  return new THREE.MeshStandardMaterial({ name: "rubber", color: col(p.color), roughness: p.roughness, metalness: p.metalness });
}

export function pcb(kind: "green" | "black" | "blue" = "green"): THREE.MeshPhysicalMaterial {
  const p = kind === "black" ? M.pcbBlack : M.pcbGreen;
  const color = kind === "blue" ? M.plasticBlue.color : p.color;
  return new THREE.MeshPhysicalMaterial({ name: `pcb-${kind}`, color: col(color), roughness: p.roughness, clearcoat: p.clearcoat, clearcoatRoughness: p.clearcoatRoughness });
}

export function rfShield(): THREE.MeshStandardMaterial {
  const p = M.rfShield;
  return new THREE.MeshStandardMaterial({ name: "rfShield", color: col(p.color), metalness: p.metalness, roughness: p.roughness });
}

export function plastic(kind: "black" | "white" | "blue" = "black"): THREE.MeshStandardMaterial {
  const p = kind === "white" ? M.plasticWhite : kind === "blue" ? M.plasticBlue : M.plasticBlack;
  return new THREE.MeshStandardMaterial({ name: `plastic-${kind}`, color: col(p.color), roughness: p.roughness, metalness: p.metalness });
}

export function fresnelDome(): THREE.MeshPhysicalMaterial {
  const p = M.fresnelDome;
  return new THREE.MeshPhysicalMaterial({ name: "fresnelDome", color: col(p.color), roughness: p.roughness, transmission: p.transmission, thickness: p.thickness });
}

export function lens(): THREE.MeshPhysicalMaterial {
  const p = M.lens;
  return new THREE.MeshPhysicalMaterial({ name: "lens", color: col(p.color), roughness: p.roughness, clearcoat: p.clearcoat, clearcoatRoughness: p.clearcoatRoughness, metalness: p.metalness });
}

export function magnetBody(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ name: "magnetBody", color: col(M.magnetBody.color), roughness: M.magnetBody.roughness });
}

export function ceramic(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ name: "ceramic", color: col(M.ceramic.color), roughness: M.ceramic.roughness });
}

export function vent(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ name: "vent", color: col(M.vent.color), roughness: M.vent.roughness });
}

/** LED lens. Emissive colour and intensity are driven by features/deviceState.ts. */
export function led(color: string = M.led.colors.idle): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    name: "led",
    color: col("#1a1a1a"),
    roughness: 0.2,
    emissive: col(color),
    emissiveIntensity: M.led.offIntensity,
  });
}

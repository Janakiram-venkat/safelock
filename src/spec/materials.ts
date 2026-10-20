/**
 * All material values. Colours are placeholders until the user supplies
 * RAL / hex codes for the prototype finishes.
 */
export const materials = {
  powderCoat: {
    color: "#3a3f44", // placeholder: anthracite, close to RAL 7016
    metalness: 0,
    roughness: 0.5,
    clearcoat: 0.15,
    clearcoatRoughness: 0.45,
    normalScale: 0.18,
    noiseScale: 900, // noise cells per metre
  },
  brushedMetal: {
    color: "#c9ccd0", // placeholder: brushed stainless
    metalness: 1,
    roughness: 0.3,
    anisotropy: 0.75,
    anisotropyRotation: 0, // radians, brush along the part's long axis
    streakScale: 1200,
  },
  zincScrew: { color: "#b7bcc2", metalness: 1, roughness: 0.35 },
  aluminium: { color: "#b9bdc2", metalness: 1, roughness: 0.42 },
  darkAluminium: { color: "#2b2e32", metalness: 0.9, roughness: 0.45 },
  smartGlass: {
    transparent: {
      transmission: 1,
      roughness: 0.02,
      ior: 1.5,
      color: "#f4f8f8",
      attenuationColor: "#e6f0ee",
      attenuationDistance: 0.5,
      opacity: 1,
    },
    opaque: {
      transmission: 0.9,
      roughness: 0.6,
      ior: 1.5,
      color: "#ffffff",
      attenuationColor: "#f2f2f0",
      attenuationDistance: 0.004,
      opacity: 1,
    },
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    specularIntensity: 1,
  },
  stripGlass: { color: "#0b0d10", roughness: 0.08, clearcoat: 1, metalness: 0 },
  rubber: { color: "#2a2a2a", roughness: 0.9, metalness: 0 },
  pcbGreen: { color: "#1f5a32", roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 },
  pcbBlack: { color: "#16181b", roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 },
  rfShield: { color: "#c4c7cb", metalness: 1, roughness: 0.25 },
  plasticBlack: { color: "#1b1c1e", roughness: 0.55, metalness: 0 },
  plasticWhite: { color: "#e9e9e6", roughness: 0.5, metalness: 0 },
  plasticBlue: { color: "#2a5bd7", roughness: 0.45, metalness: 0 },
  fresnelDome: { color: "#f3f3f0", roughness: 0.35, transmission: 0.35, thickness: 0.002 },
  lens: { color: "#07080a", roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, metalness: 0.2 },
  magnetBody: { color: "#e8e8e4", roughness: 0.5 },
  copper: { color: "#c27c48", metalness: 1, roughness: 0.35 },
  ceramic: { color: "#f1efe8", roughness: 0.6 },
  vent: { color: "#0d0e10", roughness: 0.9 },
  led: {
    offIntensity: 0,
    onIntensity: 6,
    colors: {
      idle: "#22e06b",
      alert: "#ff2a1f",
      unlocked: "#ffb020",
      cold: "#3aa0ff",
      normal: "#e8f2ff",
      warm: "#ff9a3c",
      network: "#18c8ff",
      cameraIllumination: "#fff4e0",
    },
  },
  chamberTint: { cold: "#7fbfff", normal: "#ffffff", warm: "#ffb070", intensity: 0.6 },
  overlay: { pir: "#22d3ee", camera: "#a78bfa", sensor: "#f59e0b", coneOpacity: 0.12 },
  shadowOpacity: 0.38,
  background: { hero: "#eef0f2", patent: "#ffffff" },
  /** Demo captions: one accent per Surakshit Bharat pillar, and the tricolour rule on the card. */
  demo: {
    pillars: { road: "#d97706", mobility: "#0284c7", cyber: "#7c3aed", emergency: "#dc2626", disaster: "#15803d" },
    flag: ["#ff9933", "#000080", "#138808"],
  },
} as const;

export type Materials = typeof materials;

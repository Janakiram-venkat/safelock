# CLAUDE.md — Safe Lock 3D Model (Three.js)

This file tells Claude how to build and maintain a photorealistic, dimensionally accurate 3D model of **Safe Lock – Intelligent Adaptive Secure Storage System** using Three.js. Read it fully before writing or changing any code.

---

## 1. What we are building

A browser-based, interactive 3D model of the Safe Lock vault that is used for three things:

1. **Design-patent drawings** — clean renders on a pure white background of the 7 required views: front, rear, left, right, top, bottom and a 45° top perspective.
2. **Presentations and demos** — realistic hero renders and short interactions (door opening, smart glass switching, sensors highlighted).
3. **Engineering reference** — an accurate, to-scale model with an exploded view showing where every component sits.

The product has these physical parts, and every one must appear in the model:

| Part | Notes |
|---|---|
| Vault body | Steel cuboid shell with real wall thickness, not a solid box |
| Front door | Switchable smart-glass (PDLC) panel in a metal frame |
| Hinges | Concealed, on the side set in `spec` |
| Locking mechanism | Electronic solenoid / motorised bolt engaging the body |
| Control / indicator strip | Status LEDs and access interface on the door frame |
| Internal shelves | Removable shelf or shelves |
| Internal camera module | Optical monitoring, with illumination LED |
| PIR sensor | Presence detection, facing outward |
| Door sensor | Reed switch + magnet pair at the door edge |
| Vibration sensor | Mounted to the inner wall |
| Accelerometer / IMU | On the controller board |
| Tamper switch | On the electronics enclosure cover |
| Temperature & humidity sensor | Inside the storage chamber |
| Thermoelectric (Peltier) unit | Module + heat sink + fan, vented on the rear or side |
| Buzzer | Behind a small grille |
| Controller board | Wi-Fi/BLE MCU (ESP32-class) in an electronics bay |
| Power | Power inlet + backup battery pack |
| Feet / mounting | Rubber feet, or wall-mount holes |

---

## 2. Accuracy rules (most important)

These rules exist because the model may be used for patent drawings. A wrong dimension is worse than a missing detail.

1. **Single source of truth.** Every dimension, position, clearance and colour lives in `src/spec/`. No geometry file may contain a hard-coded measurement. If you need a number that is not in the spec, add it to the spec first.
2. **Units.** 1 Three.js unit = 1 metre. Write dimensions in millimetres in the spec and convert once with `mm(x) = x / 1000`. Never mix units.
3. **Coordinate system.** Y is up. The origin is at the centre of the vault's footprint on the floor. +Z is the front (the door side). +X is the vault's right side when you face the door.
4. **Never invent a measurement.** Every spec value has a `source` field:
   - `"measured"` — taken from the physical prototype with calipers or a tape
   - `"datasheet"` — from the component's datasheet (put the part number in `note`)
   - `"placeholder"` — a sensible default until real data exists
   If you have to guess, use `"placeholder"` and say so in your reply. Never upgrade a placeholder to `"measured"` yourself.
5. **Placeholder report.** `npm run spec:report` prints every placeholder value. Run it after each change to the spec and list any new placeholders for the user.
6. **Geometry constraints are tested.** `src/spec/validate.ts` checks things that must physically be true, for example:
   - door + clearance fits the opening on all sides
   - inner chamber = outer size − 2 × wall thickness
   - no two components intersect (compare their bounding boxes)
   - every component sits inside the body or the electronics bay
   - shelf depth < inner depth − door inner clearance
   - door can swing to its open angle without hitting the body
   A failing check must fail the build. Do not loosen a check to make it pass; fix the spec or ask the user.
7. **Real scale, real optics.** Because the model is to scale, use physically based lighting and a real camera field of view so renders look right without fudging.

---

## 3. Spec file format

`src/spec/dimensions.ts`:

```ts
export type Source = "measured" | "datasheet" | "placeholder";
export interface Dim { value: number; unit: "mm" | "deg"; source: Source; note?: string }

export const spec = {
  body: {
    width:          { value: 450, unit: "mm", source: "placeholder" },
    height:         { value: 500, unit: "mm", source: "placeholder" },
    depth:          { value: 400, unit: "mm", source: "placeholder" },
    wallThickness:  { value: 3,   unit: "mm", source: "placeholder", note: "steel sheet" },
    edgeRadius:     { value: 6,   unit: "mm", source: "placeholder" },
  },
  door: {
    frameWidth:     { value: 25,  unit: "mm", source: "placeholder" },
    glassThickness: { value: 8,   unit: "mm", source: "placeholder", note: "laminated PDLC" },
    gap:            { value: 2,   unit: "mm", source: "placeholder", note: "clearance to body" },
    hingeSide:      "left" as "left" | "right",
    maxOpenAngle:   { value: 110, unit: "deg", source: "placeholder" },
  },
  // shelves, electronicsBay, components, materials ...
} as const;
```

When the user gives real measurements, update only the matching entries and change `source` to `"measured"`.

### Typical component sizes (verify before marking "datasheet")

These are common sizes for widely used hobby modules. Enter them as `"placeholder"` and ask the user to confirm the actual parts with calipers:

| Component | Common module | Approximate size |
|---|---|---|
| PIR sensor | HC-SR501 | board about 32 × 24 mm, dome about 23 mm diameter |
| Camera | ESP32-CAM / OV2640 | board about 40 × 27 mm |
| Temp/humidity | DHT22 / SHT3x | DHT22 about 25 × 15 × 8 mm |
| IMU | MPU-6050 (GY-521) | about 21 × 16 mm |
| Peltier | TEC1-12706 | 40 × 40 × 3.8 mm |
| Vibration | SW-420 module | about 32 × 14 mm |

Do not add any part number that the user has not confirmed.

---

## 4. Tech stack

- **Three.js**, pinned to an exact version in `package.json`. Check the current release before starting, and do not upgrade without being asked. Import addons from `three/addons/...`.
- **Vite + TypeScript** (strict mode).
- **WebGLRenderer** as the default for stability. Use WebGPU only if the user asks for it.
- **lil-gui** for the debug and control panel.
- **Vitest** for spec and geometry tests. **Playwright** for screenshot tests.
- No React or other framework unless the user asks.

```
src/
  main.ts                 entry: renderer, scene, loop
  spec/                   dimensions.ts, materials.ts, validate.ts, report.ts
  geometry/               one file per part: body.ts, door.ts, hinges.ts, lock.ts,
                          shelves.ts, electronics.ts, sensors.ts, peltier.ts ...
  materials/              PBR material factories
  scene/                  lighting.ts, environment.ts, cameras.ts, postprocessing.ts
  features/               doorAnimation.ts, smartGlass.ts, explodedView.ts,
                          sensorOverlay.ts, patentViews.ts
  ui/                     gui.ts
public/
  hdri/                   environment maps (record the source and licence)
  textures/               PBR texture sets (record the source and licence)
tests/
```

Every part file exports `build(spec): THREE.Group`. Name each group (`group.name = "door"`) so it can be found, animated and exploded.

---

## 5. Realism requirements

### Renderer and colour

- Use `renderer.outputColorSpace = THREE.SRGBColorSpace`.
- Use AgX or ACESFilmic tone mapping and expose the exposure setting in the GUI.
- Turn on physically correct lighting (the default in current Three.js) and shadows (`PCFSoftShadowMap`).
- Set the pixel ratio to `Math.min(devicePixelRatio, 2)`, with higher values allowed for still renders.
- Set colour textures to `SRGBColorSpace`. Leave normal, roughness, metalness and AO maps as linear.

### Environment and lighting

- Light reflections with an HDRI processed through `PMREMGenerator`. Use `HDRLoader`, which is called `RGBELoader` in older releases. Prefer CC0 HDRIs (for example from Poly Haven) and record the file name and licence in `public/hdri/SOURCES.md`.
- Keep `RoomEnvironment` as a fallback for when no HDRI is available.
- Add a key light that casts shadows, plus a soft fill light. Put a shadow-catcher floor under the vault (`ShadowMaterial`) so it sits naturally on white backgrounds.
- Do not use flat ambient light as the main light source.

### Geometry detail

- Use `RoundedBoxGeometry`, or bevelled extrusions, for every visible edge. Real objects have no perfectly sharp edges, so apply a 0.5–1 mm bevel even where the design looks sharp.
- Model the body as a hollow shell with the wall thickness from the spec.
- Model the door as a frame with the glass inset into it.
- Show real seams: the door gap, panel joints and the vent slots.
- Model visible fasteners (screws on the rear panel, hinge pins) where they would actually be.
- Smooth curved parts (sensor domes, the camera lens, feet) with at least 48 radial segments.

### Materials (`src/materials/`)

| Surface | Material and key settings |
|---|---|
| Powder-coated steel body | `MeshPhysicalMaterial`, metalness 0, roughness about 0.5, subtle noise normal map |
| Brushed metal frame and handle | metalness 1, roughness about 0.3, anisotropy along the brush direction |
| Smart glass, **transparent** state | `transmission` 1, `thickness` = glass thickness, `ior` 1.5, roughness about 0.02, very slight tint |
| Smart glass, **opaque** state | `transmission` about 0.9, roughness about 0.6, milky white `attenuationColor`, so it looks frosted rather than solid white |
| Rubber feet and seals | roughness about 0.9, dark grey |
| PCB boards | green or black solder mask with a clearcoat |
| Camera lens | clearcoat 1, dark glass with a reflection |
| LEDs | `emissive` colour plus intensity driven by the device state |

All material values go in `src/spec/materials.ts`, not inside the geometry files.

### Post-processing (optional, can be switched off)

- Ambient occlusion (`GTAOPass`) for contact shadows in the seams.
- Subtle bloom for the LEDs only.
- Anti-aliasing: SMAA, or MSAA through a multisampled render target.
- Post-processing must be switched **off** in patent-view mode.

---

## 6. Interactive features

All controls appear in the GUI and can also be set from the URL (for example `?view=front&glass=opaque`) so renders can be reproduced.

1. **Door** — opens and closes on the hinge axis with eased motion, limited to `maxOpenAngle`. The lock bolt must retract before the door moves.
2. **Smart glass** — toggles between transparent and opaque by interpolating the material values over a short transition. Read the duration from the spec, as a placeholder until it is measured.
3. **Security state** — idle / alert. In alert, the glass goes opaque, the status LED turns red and the buzzer grille pulses. This should match the breach-response flow in the patent form.
4. **Storage mode** — Cold / Normal / Warm, shown by the indicator LED colour and an optional subtle tint inside the chamber.
5. **Sensor overlay** — highlights each sensor with a label (`CSS2DRenderer`) and draws its coverage, such as the PIR detection cone. Take the cone angle and range from the spec.
6. **Exploded view** — a slider moves each part outward along a defined axis. The assembled positions must come back exactly when the slider returns to zero.
7. **Cutaway** — a clipping plane that shows the inside of the chamber and the electronics bay.

---

## 7. Patent-view mode (must be exact)

Patent drawings must show the design precisely, with nothing else in the background.

- Pure white background (`#FFFFFF`), no floor, no HDRI shown in the background, no labels, no post-processing.
- Use an **orthographic** camera for front, rear, left, right, top and bottom, aimed exactly along the axes.
- For the perspective view, use a perspective camera at 45° azimuth and 45° elevation from the top front corner.
- Frame every view with the same margin, calculated from the bounding box, so all 7 views have the same scale.
- Even, soft lighting with no harsh shadows, so every edge stays visible.
- Show the door closed, with the glass in the opaque state by default. Make both of these options.
- `npm run render:patent` uses Playwright to save the 7 PNGs at 3000 px or larger to `renders/patent/`, named `01-front.png` through `07-perspective.png`.

---

## 8. Commands

```
npm run dev            # local viewer
npm run build          # type-check + validate spec + build
npm run test           # Vitest: spec constraints, geometry bounding boxes
npm run spec:report    # list every placeholder value
npm run render:patent  # export the 7 patent views
npm run render:hero    # export high-resolution presentation renders
```

---

## 9. Working rules for Claude

- Before modelling a part, check the spec for its dimensions. If they are missing, add placeholders and tell the user which ones you added.
- After every change: run `npm run build` and `npm run test`, then render the front view and the 45° view and look at them before saying the change is done.
- Keep one part per file and one material per factory function. Do not share mutable materials between parts. Clone them instead.
- Dispose of geometries, materials and textures when they are rebuilt, so the viewer does not leak memory.
- Performance target: 60 fps on a mid-range laptop in interactive mode. Still renders may be slower. Use `InstancedMesh` for repeated parts such as screws and vent slots.
- Any texture or HDRI you add must have its source and licence recorded. Do not use anything with an unclear licence.
- Never change the product's design by yourself, even to make it look better. This includes the proportions, the hinge side, the position of the control strip and the colours. Propose the change and wait for approval.
- When you finish a task, report which values are still placeholders.

---

## 10. Still needed from the user

The model will only be as accurate as these inputs. Until they arrive, all of them are placeholders:

- Overall outer width × height × depth, and the wall thickness
- Door frame width, glass thickness and door gap
- Hinge side and the maximum opening angle
- Position and size of the control strip
- Number of shelves and their heights
- Positions of the sensors, camera, Peltier vent and buzzer
- The exact part numbers used for each component
- Colours and finishes (RAL or hex codes), plus photos of the prototype from the 7 patent views

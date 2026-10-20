# Safe Lock 3D model

An interactive, to-scale Three.js model of **Safe Lock – Intelligent Adaptive Secure Storage System**, built to the rules in `CLAUDE.md`.

```
npm install
npm run dev            # viewer at http://localhost:5180
npm run build          # type-check + spec validation + production build
npm run test           # Vitest: spec constraints, geometry envelopes, feature logic
npm run test:e2e       # Playwright: real-GPU viewer tests + screenshot baselines
npm run spec:report    # every placeholder value
npm run render:patent  # renders/patent/01-front.png … 07-perspective.png (3000 px)
npm run render:hero    # renders/hero/*.png (3000 × 2000)
```

## Where things live

| Path | What |
|---|---|
| `src/spec/dimensions.ts` | **Single source of truth**: every dimension, position and timing, each with `source` (`measured` / `datasheet` / `placeholder`). |
| `src/spec/materials.ts` | Every material value and colour. |
| `src/spec/derived.ts` | Arithmetic on the spec (opening, door, pivot, chamber, bay). No new numbers. |
| `src/spec/layout.ts` | Every component's envelope (mm, world, door closed). |
| `src/spec/validate.ts` | Physical constraint checks, including a swept door-swing collision test. Fails the build. |
| `src/geometry/*.ts` | One file per part; each `build(spec)` returns a named `THREE.Group`. |
| `src/features/*.ts` | Door/lock state machine, smart glass, device state, exploded view, cutaway, sensor overlay, patent views, URL state. |
| `src/scene/*.ts` | Lighting rigs, HDRI environment, lens-based camera, selective-bloom post chain. |

## URL parameters

Every GUI control is mirrored in the URL, so any render can be reproduced:

`view` (`hero` `front` `rear` `left` `right` `top` `bottom` `perspective`) · `glass` (`transparent` `opaque`) · `door` (`open` `closed` or degrees) · `state` (`idle` `alert`) · `mode` (`cold` `normal` `warm`) · `tint` · `overlay` · `explode` (0–1) · `cutaway` (0–1) · `patent` · `post` · `exposure` · `tonemap` (`agx` `aces`) · `hdri` · `gui` · `demo` (scenario id) / `step` · `w`/`h` (fixed render size in px)

Example: `?patent=1&view=top&glass=transparent`.

## Demo scenarios (Surakshit Bharat)

Click **Surakshit Bharat demos** (top left) or use *Demo scenarios* in the GUI. Each scenario is a sequence of narrated steps. Every step moves the camera, sets the door, glass, alert, storage mode, overlay, cutaway and exploded view, and sends sensor events to the simulated device. Each caption is tagged with the pillars it serves: road safety, smart mobility, cybersecurity, emergency response and disaster resilience. Anything the prototype does not do yet appears on a separate **Roadmap** line.

| Scenario | id | Story |
|---|---|---|
| Golden hour: highway crash | `highway` | PIR wake-up → SOS alarm → remote unlock by the control room → restock logging → pod network |
| Cyber-physical attack | `attack` | Loitering → prying (vibration) → tamper + power cut → tilt → PIN brute-force lockout → restore |
| Disaster: power cut and earthquake | `disaster` | Cold-chain medicines → grid failure on battery → aftershock alarm → responder access → power back |
| Inside the pod: sensor tour | `tour` | Exploded view and sensor overlay, mapped to the five pillars |

Keys: **→** next, **←** back, **Space** auto-play, **Esc** close. Deep link to a step: `?demo=highway&step=3`. Scripts live in `src/features/scenarios.ts`. Their numbers come from `src/spec/device.ts`, and the auto-play dwell and camera move times come from `spec.timing`. With `npm run dev` the device hub runs too, so the phone app follows the story live.

## Assets

- HDRI: Poly Haven *studio_small_09*, CC0 — see `public/hdri/SOURCES.md`.
- Textures: procedural, generated at runtime — see `public/textures/SOURCES.md`.

## Mobile screen and device hub

`npm run dev` also starts a **device hub** at `ws://<host>:5180/hub` that runs a simulated Safe Lock firmware (`src/device/simulator.ts`, behaviour values in `src/spec/device.ts`).

- **Phone:** open the `Phone screen: http://<your-ip>:5180/mobile.html` URL printed in the terminal on a phone on the same Wi-Fi. Add it to the home screen for an app-like window.
- **Beside the model:** tick *Phone screen* in the viewer GUI, or use `?phone=1`.
- The 3D viewer is a **digital twin**: lock, door, glass, storage mode and alerts stay in sync with the phone in both directions. *Simulate events* in the GUI injects knocks, motion, tamper, tilt and power cuts.
- Unlock and clearing an alert need a PIN: `SAFELOCK_PIN` (default `1234`). Five wrong PINs block remote unlock for 5 minutes.
- Readings are labelled **Simulated** until real firmware connects.

**Connecting the real controller (ESP32):** open a WebSocket to `/hub`, send `{"type":"hello","role":"device"}`, then publish `DeviceState` JSON (see `src/device/protocol.ts`) every ~500 ms. The hub then stops simulating and forwards every app command (`unlock`, `lock`, `setGlass`, `setMode`, `clearAlert`, `panic`) to the device. The phone needs no changes.

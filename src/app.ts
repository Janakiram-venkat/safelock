import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import type { Spec } from "./spec/dimensions";
import { materials as M } from "./spec/materials";
import { validate } from "./spec/validate";
import { buildVault, type Vault } from "./geometry/vault";
import { disposeObject } from "./geometry/util";
import { DoorController, applyDoor } from "./features/doorAnimation";
import { SmartGlassController, applyGlass } from "./features/smartGlass";
import { DeviceStateView } from "./features/deviceState";
import { ExplodedView } from "./features/explodedView";
import { Cutaway } from "./features/cutaway";
import { SensorOverlay } from "./features/sensorOverlay";
import { modelBox, orthoCamera, framePerspective, viewDirection, type PatentView } from "./features/patentViews";
import { toQuery, type ViewState } from "./features/urlState";
import { Lighting } from "./scene/lighting";
import { Environment } from "./scene/environment";
import { presentationCamera, heroDirection } from "./scene/cameras";
import { PostProcessing } from "./scene/postprocessing";
import { precompensate } from "./scene/toneMapCompensation";
import { sineInOut } from "./features/easing";
import type { DemoScene } from "./features/scenarios";
import type { DeviceClient } from "./device/client";
import type { DeviceState, PhysicalEvent } from "./device/protocol";

export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly labels: CSS2DRenderer;
  readonly lighting: Lighting;
  readonly env: Environment;
  readonly post: PostProcessing;
  readonly door: DoorController;
  readonly glass: SmartGlassController;
  vault!: Vault;
  device!: DeviceStateView;
  exploded!: ExplodedView;
  overlay!: SensorOverlay;
  readonly cutaway: Cutaway;
  /** Bounding box of the assembled, closed model: the framing reference for every view. */
  modelBounds = new THREE.Box3();
  private ortho: THREE.OrthographicCamera | null = null;
  fps = 0;
  ready = false;
  private last = performance.now();
  private time = 0;
  private frames = 0;
  private fpsT0 = performance.now();
  private raf = 0;
  /** Link to the device hub; the viewer then acts as the vault's digital twin. */
  link: DeviceClient | null = null;
  private doorWasOpen = false;
  private phone: HTMLElement | null = null;
  /** Camera move in progress (demo steps): orbit around the target, not a straight line. */
  private fly: { from: THREE.Spherical; to: THREE.Spherical; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; t: number } | null = null;
  /** Screen height (px) kept clear at the bottom, e.g. by the demo caption. */
  private reserveBottom = 0;
  /** Called every frame with dt in ms (demo player). */
  readonly tickers = new Set<(dt: number) => void>();

  constructor(private readonly container: HTMLElement, readonly spec: Spec, readonly state: ViewState) {
    const checks = validate(spec).filter((c) => !c.ok);
    if (checks.length) console.error("[safelock] spec checks failing:", checks);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was removed in r18x (it now falls back with a warning);
    // PCFShadowMap + shadow.radius is the current soft-shadow path.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    Object.assign(this.labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    container.appendChild(this.labels.domElement);

    this.camera = presentationCamera(spec, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.lighting = new Lighting(spec, this.scene);
    this.env = new Environment(this.renderer, this.scene);
    this.post = new PostProcessing(this.renderer, this.scene, this.camera, 2, 2);
    this.door = new DoorController(spec);
    this.glass = new SmartGlassController(spec);
    this.cutaway = new Cutaway(spec);

    this.build();
    this.door.snap(state.door);
    this.glass.set(this.effectiveGlass(), true);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.applyState({ reframe: true });
  }

  /** Build (or rebuild) the vault and everything that references its objects. */
  private build(): void {
    this.vault = buildVault(this.spec);
    this.scene.add(this.vault.root);
    this.device = new DeviceStateView(this.spec, this.vault);
    this.overlay = new SensorOverlay(this.spec, this.vault);
    this.exploded = new ExplodedView(this.vault.root, this.spec);
    this.cutaway.attach(this.vault.root);
    this.modelBounds = modelBox(this.vault.root);
  }

  /** Dispose and rebuild the model (spec hot-reload / leak check). */
  rebuild(): void {
    this.overlay.dispose();
    this.vault.root.removeFromParent();
    disposeObject(this.vault.root);
    this.build();
    this.applyState();
  }

  async init(): Promise<void> {
    await this.env.loadHdri();
    this.applyState();
    await this.renderer.compileAsync(this.scene, this.activeCamera());
    this.loop();
    this.renderOnce();
    this.ready = true;
  }

  private effectiveGlass() {
    return this.state.security === "alert" ? "opaque" : this.state.glass;
  }

  /** True when the device hub is reachable: device state then drives the model. */
  get linked(): boolean {
    return this.link !== null && this.link.status === "online" && this.link.state !== null && !this.state.patent;
  }

  attachDevice(client: DeviceClient): void {
    this.link = client;
    client.onState((d) => this.onDeviceState(d));
  }

  /** Mirror the device onto the model: bolt, glass, security state and storage mode. */
  private onDeviceState(d: DeviceState): void {
    if (this.state.patent) return;
    this.door.setLocked(d.lock === "locked");
    const s = this.state;
    if (s.glass !== d.glassSetting || s.security !== d.security || s.mode !== d.mode) {
      s.glass = d.glassSetting;
      s.security = d.security;
      s.mode = d.mode;
      this.applyState();
    }
  }

  /** GUI change to a device-owned setting: ask the device when linked, otherwise apply locally. */
  deviceCommand(key: "glass" | "security" | "mode"): void {
    const s = this.state;
    if (this.linked) {
      if (key === "glass") void this.link!.send({ type: "setGlass", glass: s.glass });
      if (key === "mode") void this.link!.send({ type: "setMode", mode: s.mode });
      if (key === "security") void this.link!.send(s.security === "alert" ? { type: "panic" } : { type: "clearAlert", via: "pad" });
    }
    this.applyState();
  }

  /** Inject a physical event into the simulated device (knock, tamper, power cut...). */
  simulate(event: PhysicalEvent): void {
    if (this.linked) void this.link!.send({ type: "physical", event });
  }

  openDoor(): void {
    // Opening at the vault means the user authenticated at the access pad.
    if (this.linked) void this.link!.send({ type: "unlock", via: "pad" });
    this.door.open();
  }

  closeDoor(): void {
    this.door.close();
  }

  /**
   * Move to a demo scenario scene. When linked, device-owned settings go to
   * the device and physical events are injected; offline, they apply locally.
   */
  playScene(t: DemoScene, events: readonly PhysicalEvent[]): void {
    const s = this.state;
    if (s.patent) this.setPatent(false);
    const reframe = s.view !== t.view || s.explode !== t.explode;
    const glass = s.glass !== t.glass;
    const security = s.security !== t.security;
    const mode = s.mode !== t.mode;
    s.view = t.view;
    s.glass = t.glass;
    s.security = t.security;
    s.mode = t.mode;
    s.tint = t.tint;
    s.overlay = t.overlay;
    s.explode = t.explode;
    s.cutaway = t.cutaway;
    s.phone = t.phone && this.linked;
    if (this.linked) {
      for (const e of events) this.simulate(e);
      if (glass) this.deviceCommand("glass");
      if (mode) this.deviceCommand("mode");
      // A knock or tilt raises the alert itself, with its own reason in the log.
      if (security && !(t.security === "alert" && events.length)) this.deviceCommand("security");
    }
    this.applyState();
    if (t.door === "open" && this.door.target !== "open") this.openDoor();
    if (t.door === "closed" && this.door.target !== "closed") this.closeDoor();
    if (reframe) this.frame({ animate: true });
  }

  setPatent(on: boolean): void {
    const s = this.state;
    s.patent = on;
    if (on) {
      // Patent defaults: closed door, opaque glass, nothing but the design.
      s.glass = "opaque";
      s.overlay = false;
      s.post = false;
      s.explode = 0;
      s.cutaway = 0;
      s.hdriBackground = false;
      if (s.view === "hero") s.view = "front";
      this.door.snap(0);
      this.glass.set("opaque", true);
    }
    this.applyState({ reframe: true });
  }

  /** Push the whole ViewState into the scene; keeps the URL in sync. */
  applyState(opts: { reframe?: boolean } = {}): void {
    const s = this.state;
    if (s.patent) {
      s.overlay = false;
      s.post = false;
    }
    this.renderer.toneMapping = s.toneMapping === "aces" ? THREE.ACESFilmicToneMapping : THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = s.exposure;
    this.lighting.setPatent(s.patent);
    this.renderer.shadowMap.enabled = !s.patent;
    // With post on, the background is tone mapped too; pre-compensate so it lands on the spec colour.
    const bgHex = s.patent ? M.background.patent : M.background.hero;
    const bg = s.post && !s.patent ? precompensate(bgHex, this.renderer.toneMapping, s.exposure) : new THREE.Color(bgHex);
    this.env.apply({ patent: s.patent, background: s.hdriBackground, backgroundColor: bg });
    this.glass.set(this.effectiveGlass());
    this.overlay.setVisible(s.overlay);
    this.labels.domElement.style.display = s.overlay ? "" : "none";
    this.showPhone(s.phone && !s.patent && !s.width);
    this.offsetView();
    this.exploded.set(s.explode);
    this.cutaway.set(s.cutaway);
    applyDoor(this.vault, this.spec, this.door);
    if (opts.reframe) this.frame();
    this.syncUrl();
  }

  syncUrl(): void {
    const s = this.state;
    if (typeof history !== "undefined" && !s.width) history.replaceState(null, "", `${location.pathname}${toQuery(s, this.door.maxAngle)}`);
  }

  activeCamera(): THREE.Camera {
    return this.ortho ?? this.camera;
  }

  /** Aim the camera for the current view; patent axis views use an orthographic camera. */
  frame(opts: { animate?: boolean } = {}): void {
    const s = this.state;
    const margin = this.spec.render.patentMargin.value;
    const aspect = this.aspect();
    const view = s.view;
    if (s.patent && view !== "perspective" && view !== "hero") {
      this.ortho = orthoCamera(view, this.modelBounds, aspect, margin);
      this.controls.enabled = false;
      return;
    }
    this.ortho = null;
    this.controls.enabled = true;
    this.camera.aspect = aspect;
    const { dir, up } = view === "hero" ? { dir: heroDirection(), up: new THREE.Vector3(0, 1, 0) } : viewDirection(view as PatentView);
    // Presentation views frame what is on screen now (open door, exploded parts);
    // patent views always use the assembled, closed bounds.
    const bounds = s.patent ? this.modelBounds : modelBox(this.vault.root);
    const m = view === "hero" ? margin * 0.6 : margin;
    if (opts.animate && !s.patent) {
      const goal = this.camera.clone();
      const toTarget = this.fit(goal, bounds, dir, up, m);
      const fromTarget = this.controls.target.clone();
      const from = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(fromTarget));
      const to = new THREE.Spherical().setFromVector3(goal.position.clone().sub(toTarget));
      // Take the short way round.
      while (to.theta - from.theta > Math.PI) to.theta -= 2 * Math.PI;
      while (from.theta - to.theta > Math.PI) to.theta += 2 * Math.PI;
      this.fly = { from, to, fromTarget, toTarget, t: 0 };
      this.camera.up.copy(up);
      this.camera.near = Math.min(this.camera.near, goal.near);
      this.camera.far = Math.max(this.camera.far, goal.far);
      this.camera.updateProjectionMatrix();
      return;
    }
    this.fly = null;
    const center = this.fit(this.camera, bounds, dir, up, m);
    this.controls.target.copy(center);
    this.controls.update();
  }

  private aspect(): number {
    const s = this.state;
    if (s.width) return s.width / (s.height || s.width);
    return this.container.clientWidth / Math.max(this.container.clientHeight, 1);
  }

  resize(): void {
    const s = this.state;
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    let w = cw;
    let h = ch;
    let pr = Math.min(window.devicePixelRatio, 2);
    if (s.width) {
      // Fixed-size still render: exact pixel size, displayed scaled to fit.
      w = s.width;
      h = s.height || s.width;
      pr = 1;
      const k = Math.min(cw / w, ch / h);
      Object.assign(this.renderer.domElement.style, { width: `${w * k}px`, height: `${h * k}px` });
    }
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, !s.width);
    this.post.setSize(w, h, pr);
    const css = this.renderer.domElement.getBoundingClientRect();
    this.labels.setSize(s.width ? css.width : cw, s.width ? css.height : ch);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.offsetView();
    if (this.ortho) this.frame();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(now - this.last, 50);
    this.last = now;
    this.step(dt);
    this.draw();
    this.frames++;
    if (now - this.fpsT0 > 500) {
      this.fps = (this.frames * 1000) / (now - this.fpsT0);
      this.frames = 0;
      this.fpsT0 = now;
    }
  };

  /** Advance animations by dt milliseconds (also used by tests for deterministic stepping). */
  step(dt: number): void {
    this.time += dt;
    this.door.autoLock = !this.linked;
    this.door.update(dt);
    // Report the reed switch to the device whenever the door opens or shuts.
    const open = this.door.angle > 0;
    if (open !== this.doorWasOpen) {
      this.doorWasOpen = open;
      if (this.linked) void this.link!.send({ type: "physical", event: open ? "doorOpened" : "doorClosed" });
    }
    // When the door comes to rest, record it so the URL reproduces the view.
    if (this.door.phase === "idle" && this.state.door !== this.door.angle) {
      this.state.door = this.door.angle;
      this.syncUrl();
    }
    this.glass.update(dt);
    applyDoor(this.vault, this.spec, this.door);
    applyGlass(this.vault.glass.material as THREE.MeshPhysicalMaterial, this.glass.value);
    this.device.apply(this.state, this.time, dt, this.door.bolt > 0);
    for (const fn of this.tickers) fn(dt);
    if (this.fly) this.stepFly(dt);
    if (this.controls.enabled) this.controls.update();
  }

  private stepFly(dt: number): void {
    const f = this.fly!;
    f.t = Math.min(f.t + dt / this.spec.timing.cameraFly.value, 1);
    const k = sineInOut(f.t);
    const lerp = (a: number, b: number) => a + (b - a) * k;
    const sph = new THREE.Spherical(lerp(f.from.radius, f.to.radius), lerp(f.from.phi, f.to.phi), lerp(f.from.theta, f.to.theta));
    this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    this.camera.position.setFromSpherical(sph).add(this.controls.target);
    this.camera.lookAt(this.controls.target);
    if (f.t >= 1) this.fly = null;
  }

  private draw(): void {
    const cam = this.activeCamera();
    // The post chain is bound to the presentation camera; patent mode never uses it.
    if (this.state.post && !this.state.patent) this.post.render();
    else this.renderer.render(this.scene, cam);
    if (this.state.overlay) this.labels.render(this.scene, cam);
  }

  /** Keep the bottom `px` of the screen clear of the model (demo caption). */
  setReserveBottom(px: number): void {
    if (px === this.reserveBottom) return;
    this.reserveBottom = px;
    this.offsetView();
    if (!this.state.patent) this.frame({ animate: true });
  }

  /** Frame `cam` on the bounds, pulled back so the model fits above the reserved strip. */
  private fit(cam: THREE.PerspectiveCamera, bounds: THREE.Box3, dir: THREE.Vector3, up: THREE.Vector3, margin: number): THREE.Vector3 {
    const center = framePerspective(cam, bounds, dir, up, margin);
    const h = this.container.clientHeight;
    const free = h - Math.min(this.reserveBottom, h / 2);
    if (free < h && !this.state.width) {
      cam.position.sub(center).multiplyScalar(h / free).add(center);
      cam.far *= h / free;
      cam.updateProjectionMatrix();
    }
    return center;
  }

  /** Keep the model centred in the space the phone frame and demo caption leave free. */
  private offsetView(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const phone = this.phone && !this.phone.hidden ? this.phone.getBoundingClientRect().width + 16 : 0;
    const x = phone && w > 900 ? -phone / 2 : 0;
    const y = Math.min(this.reserveBottom, h / 2) / 2;
    if ((x || y) && !this.state.width) this.camera.setViewOffset(w, h, x, y, w, h);
    else this.camera.clearViewOffset();
  }

  /** The mobile screen in a phone frame beside the model (presentations). */
  private showPhone(visible: boolean): void {
    if (!visible) {
      if (this.phone) this.phone.hidden = true;
      return;
    }
    if (!this.phone) {
      const frame = document.createElement("div");
      frame.className = "phone";
      const iframe = document.createElement("iframe");
      iframe.title = "Safe Lock mobile app";
      iframe.src = `${import.meta.env.BASE_URL}mobile.html`;
      frame.append(iframe);
      document.body.append(frame);
      this.phone = frame;
    }
    this.phone.hidden = false;
  }

  renderOnce(): void {
    this.step(0);
    this.draw();
  }

  /** Render a frame and return it as a PNG data URL (must run in the same task as the render). */
  capture(): string {
    this.renderOnce();
    return this.renderer.domElement.toDataURL("image/png");
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.overlay.dispose();
    disposeObject(this.vault.root);
    this.post.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}

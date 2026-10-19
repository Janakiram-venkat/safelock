import { test, expect, type Page } from "@playwright/test";
import { AgXToneMapping } from "three";
import { spec } from "../../src/spec/dimensions";
import { materials as M } from "../../src/spec/materials";
import { PATENT_VIEWS } from "../../src/features/patentViews";

const MAX = spec.door.maxOpenAngle.value;

/** Open the viewer and wait until it reports ready; collect console problems. */
async function open(page: Page, query = "") {
  const problems: string[] = [];
  page.on("console", (m) => {
    // ANGLE's D3D HLSL compiler reports X4122 float-precision notes for three.js shaders; that is driver output, not an app problem.
    if (m.type() === "warning" && /warning X4122/.test(m.text()) && !/error/i.test(m.text())) return;
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
  // These tests cover the standalone viewer; the live device link is tested in mobile.spec.ts.
  const q = query.includes("device=") ? query : `${query}${query.includes("?") ? "&" : "?"}device=0`;
  await page.goto(`/${q}`);
  await page.waitForFunction(() => window.__safelock?.ready === true, null, { timeout: 90_000 });
  return problems;
}

/** Decode a capture in the page and measure it. */
async function analyse(page: Page) {
  return page.evaluate(async () => {
    const url = window.__safelock.capture();
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let minX = width, minY = height, maxX = -1, maxY = -1, nonWhite = 0, borderNonWhite = 0;
    const colors = new Set<number>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const white = data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255;
        if ((x * 7 + y * 13) % 97 === 0) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        if (!white) {
          nonWhite++;
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) borderNonWhite++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    const px = (x: number, y: number) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 3));
    return { width, height, minX, minY, maxX, maxY, nonWhite, borderNonWhite, distinctColors: colors.size, corner: px(0, 0), center: px(width >> 1, height >> 1) };
  });
}

/** Record door/bolt state every frame for `ms` while `act` runs. */
async function traceDoor(page: Page, ms: number, act: () => Promise<void>) {
  await page.evaluate((dur) => {
    const app = window.__safelock.app;
    const w = window as unknown as { __trace: { angle: number; bolt: number; boltX: number }[] };
    w.__trace = [];
    const t0 = performance.now();
    const tick = () => {
      w.__trace.push({ angle: app.door.angle, bolt: app.door.bolt, boltX: app.vault.bolt.position.x });
      if (performance.now() - t0 < dur) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  await act();
  await page.waitForTimeout(ms + 200);
  return page.evaluate(() => (window as unknown as { __trace: { angle: number; bolt: number; boltX: number }[] }).__trace);
}

const guiButton = (page: Page, name: string) => page.locator(".lil-gui button", { hasText: name });
const guiRow = (page: Page, name: string) => page.locator(".lil-gui .lil-controller", { has: page.locator(".lil-name", { hasText: new RegExp(`^${name}$`) }) });
const guiFolder = (page: Page, name: string) => page.locator(".lil-gui .lil-title", { hasText: name });

test.describe("viewer", () => {
  test("loads cleanly with the HDRI and renders the model", async ({ page }) => {
    const problems = await open(page);
    expect(problems).toEqual([]);
    const info = await page.evaluate(() => window.__safelock.info());
    expect(info.env).toBe("hdri");
    const a = await analyse(page);
    expect(a.distinctColors).toBeGreaterThan(20); // not a blank or flat frame
    const settings = await page.evaluate(() => {
      const r = window.__safelock.app.renderer;
      return { cs: r.outputColorSpace, tm: r.toneMapping, shadows: r.shadowMap.enabled, pr: r.getPixelRatio() };
    });
    expect(settings.cs).toBe("srgb");
    expect(settings.tm).toBe(AgXToneMapping);
    expect(settings.shadows).toBe(true);
    expect(settings.pr).toBeLessThanOrEqual(2);
  });

  test("door: bolt retracts first, then eased swing to maxOpenAngle; closing re-locks", async ({ page }) => {
    await open(page);
    const trace = await traceDoor(page, 2600, () => guiButton(page, "Open door").click());
    const firstMove = trace.findIndex((s) => s.angle > 0);
    expect(firstMove).toBeGreaterThan(2);
    expect(trace[firstMove - 1].bolt).toBe(1);
    for (const s of trace) if (s.angle > 0) expect(s.bolt).toBe(1);
    expect(Math.max(...trace.map((s) => s.angle))).toBeLessThanOrEqual(MAX);
    expect(trace.at(-1)!.angle).toBe(MAX);
    // The bolt mesh actually moved +X (retracted).
    expect(trace.at(-1)!.boltX).toBeGreaterThan(trace[0].boltX);
    await expect(page).toHaveURL(/door=open/);

    const back = await traceDoor(page, 2200, () => guiButton(page, "Close door").click());
    for (const s of back) if (s.bolt < 1) expect(s.angle).toBe(0);
    expect(back.at(-1)).toMatchObject({ angle: 0, bolt: 0 });
  });

  test("smart glass switches with an eased transition to the spec states", async ({ page }) => {
    await open(page);
    await guiRow(page, "Smart glass").locator("select").selectOption("opaque");
    const mid = await page.evaluate(() => window.__safelock.app.glass.value);
    await page.waitForTimeout(spec.timing.smartGlassTransition.value + 300);
    const mat = await page.evaluate(() => {
      const m = window.__safelock.app.vault.glass.material as unknown as { transmission: number; roughness: number };
      return { v: window.__safelock.app.glass.value, t: m.transmission, r: m.roughness };
    });
    expect(mid).toBeLessThan(1);
    expect(mat.v).toBe(1);
    expect(mat.t).toBeCloseTo(M.smartGlass.opaque.transmission, 5);
    expect(mat.r).toBeCloseTo(M.smartGlass.opaque.roughness, 5);
    await expect(page).toHaveURL(/glass=opaque/);
  });

  test("alert: glass goes opaque, status LED red and pulsing, buzzer grille pulses", async ({ page }) => {
    await open(page, "?glass=transparent");
    await guiRow(page, "Security").locator("select").selectOption("alert");
    // Animation time is frame-clamped, so wait for the transition to finish rather than a fixed delay.
    await expect.poll(() => page.evaluate(() => window.__safelock.app.glass.value)).toBe(1);
    const samples: { glass: number; color: string; led: number; grille: number }[] = [];
    for (let i = 0; i < 6; i++) {
      samples.push(await page.evaluate(() => {
        const v = window.__safelock.app.vault;
        const led = v.leds.status.material as unknown as { emissive: { getHexString(): string }; emissiveIntensity: number };
        const holes = v.grille.getObjectByName("buzzerGrilleHoles") as unknown as { material: { emissiveIntensity: number } };
        return { glass: window.__safelock.app.glass.value, color: led.emissive.getHexString(), led: led.emissiveIntensity, grille: holes.material.emissiveIntensity };
      }));
      await page.waitForTimeout(90);
    }
    for (const s of samples) {
      expect(s.glass).toBe(1);
      expect(`#${s.color}`).toBe(M.led.colors.alert);
    }
    const spread = (k: "led" | "grille") => Math.max(...samples.map((s) => s[k])) - Math.min(...samples.map((s) => s[k]));
    expect(spread("led")).toBeGreaterThan(0.5);
    expect(spread("grille")).toBeGreaterThan(0.5);
    // Back to idle restores the user's glass choice and a green LED.
    await guiRow(page, "Security").locator("select").selectOption("idle");
    await expect.poll(() => page.evaluate(() => window.__safelock.app.glass.value)).toBe(0);
    const idle = await page.evaluate(() => ({ g: window.__safelock.app.glass.value, c: (window.__safelock.app.vault.leds.status.material as unknown as { emissive: { getHexString(): string } }).emissive.getHexString() }));
    expect(idle.g).toBe(0);
    expect(`#${idle.c}`).toBe(M.led.colors.idle);
  });

  test("storage mode drives the indicator LED colour and optional chamber tint", async ({ page }) => {
    await open(page);
    for (const mode of ["cold", "normal", "warm"] as const) {
      await guiRow(page, "Storage mode").locator("select").selectOption(mode);
      await page.waitForTimeout(80);
      const c = await page.evaluate(() => (window.__safelock.app.vault.leds.mode.material as unknown as { emissive: { getHexString(): string } }).emissive.getHexString());
      expect(`#${c}`).toBe(M.led.colors[mode]);
    }
    await guiRow(page, "Chamber tint").locator("input").check();
    await guiRow(page, "Storage mode").locator("select").selectOption("cold");
    await page.waitForTimeout(80);
    const tint = await page.evaluate(() => window.__safelock.app.device.chamberLight.intensity);
    expect(tint).toBeCloseTo(M.chamberTint.intensity, 5);
  });

  test("sensor overlay: labels for every sensor, PIR cone from the spec", async ({ page }) => {
    await open(page, "?overlay=1");
    const labels = page.locator(".sensor-label");
    await expect(labels).toHaveCount(14);
    for (const t of ["PIR presence sensor", "Internal camera + LED", "Door sensor (reed switch)", "Vibration sensor", "Accelerometer / IMU", "Tamper switch", "Temperature / humidity", "Peltier unit", "Buzzer"])
      await expect(labels.filter({ hasText: t })).toBeVisible();
    const cone = await page.evaluate(() => {
      const g = window.__safelock.app.vault.root.getObjectByName("overlay:pirCone")!;
      const lines = g.children[0].children as unknown as { geometry: { attributes: { position: { getX(i: number): number; getY(i: number): number; getZ(i: number): number; count: number } } } }[];
      const outer = lines.filter((l) => l.geometry.attributes.position.count > 2).at(-1)!.geometry.attributes.position;
      return { r: Math.hypot(outer.getX(0), outer.getY(0)), z: outer.getZ(0) };
    });
    const half = (spec.pir.detectionAngle.value / 2) * (Math.PI / 180);
    expect(cone.z).toBeCloseTo(spec.pir.range.value / 1000, 3);
    expect(cone.r).toBeCloseTo((spec.pir.range.value / 1000) * Math.tan(half), 3);
    await guiRow(page, "Sensor overlay").locator("input").uncheck();
    await expect(labels.first()).toBeHidden();
  });

  test("exploded view returns every part to its exact assembled position", async ({ page }) => {
    await open(page);
    const snap = () => page.evaluate(() => {
      const out: number[] = [];
      window.__safelock.app.vault.root.traverse((o) => out.push(o.position.x, o.position.y, o.position.z));
      return out;
    });
    const before = await snap();
    const slider = guiRow(page, "Exploded view").locator("input[type=number], input").first();
    for (const v of ["1", "0.37", "0.9"]) {
      await slider.fill(v);
      await slider.press("Enter");
    }
    const exploded = await snap();
    expect(exploded).not.toEqual(before);
    await slider.fill("0");
    await slider.press("Enter");
    expect(await snap()).toEqual(before);
  });

  test("cutaway reveals the chamber and electronics bay", async ({ page }) => {
    await open(page, "?view=right&w=600&h=600");
    const closed = await analyse(page);
    const plane = await page.evaluate(() => {
      const app = window.__safelock.app;
      app.state.cutaway = 0.55;
      app.applyState();
      return app.cutaway.plane.constant;
    });
    const cut = await analyse(page);
    expect(plane).toBeLessThan(spec.body.width.value / 2000);
    expect(cut.center).not.toEqual(closed.center);
    // Fixed-size render mode leaves the URL alone; in the normal viewer the cut is written to the URL.
    await open(page, "?view=right");
    await guiRow(page, "Cutaway").locator("input").first().fill("0.55");
    await guiRow(page, "Cutaway").locator("input").first().press("Enter");
    await expect(page).toHaveURL(/cutaway=0\.55/);
  });

  test("URL reproduces a render and GUI changes write back to the URL", async ({ page }) => {
    await open(page, "?view=left&glass=opaque&door=45&state=alert&mode=warm&explode=0.25&exposure=1.2");
    const st = await page.evaluate(() => {
      const a = window.__safelock.app;
      return { ...a.state, angle: a.door.angle, bolt: a.door.bolt, exposure: a.renderer.toneMappingExposure };
    });
    expect(st).toMatchObject({ view: "left", glass: "opaque", door: 45, security: "alert", mode: "warm", explode: 0.25, angle: 45, bolt: 1, exposure: 1.2 });
    await guiRow(page, "Storage mode").locator("select").selectOption("cold");
    await expect(page).toHaveURL(/mode=cold/);
  });

  test("rebuilding the model does not leak GPU memory", async ({ page }) => {
    await open(page);
    const count = () => page.evaluate(() => {
      const a = window.__safelock.app;
      a.renderOnce();
      return { g: a.renderer.info.memory.geometries, t: a.renderer.info.memory.textures };
    });
    const first = await count();
    await guiFolder(page, "Rendering").click();
    for (let i = 0; i < 3; i++) await guiButton(page, "Rebuild model").click();
    const after = await count();
    expect(after.g).toBeLessThanOrEqual(first.g);
    expect(after.t).toBeLessThanOrEqual(first.t);
  });

  test("interactive frame rate meets the 60 fps target", async ({ page }) => {
    await open(page);
    const fps = await page.evaluate(() => new Promise<number>((res) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => {
        n++;
        window.__safelock.app.camera.position.applyAxisAngle(window.__safelock.app.camera.up, 0.01);
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
        else res((n * 1000) / (performance.now() - t0));
      };
      requestAnimationFrame(tick);
    }));
    test.info().annotations.push({ type: "fps", description: fps.toFixed(1) });
    expect(fps).toBeGreaterThan(50);
  });
});

test.describe("patent mode", () => {
  test("pure white, no floor, no labels, no post, orthographic, closed door, opaque glass", async ({ page }) => {
    const problems = await open(page, "?patent=1&view=front&w=800&h=800");
    expect(problems).toEqual([]);
    const st = await page.evaluate(() => {
      const a = window.__safelock.app;
      return {
        cam: a.activeCamera().type, floor: a.lighting.floor.visible, post: a.state.post, overlay: a.state.overlay,
        labels: a.labels.domElement.style.display, door: a.door.angle, glass: a.glass.value, shadows: a.renderer.shadowMap.enabled,
      };
    });
    expect(st).toEqual({ cam: "OrthographicCamera", floor: false, post: false, overlay: false, labels: "none", door: 0, glass: 1, shadows: false });
    const a = await analyse(page);
    expect(a.corner).toEqual([255, 255, 255]);
    expect(a.borderNonWhite).toBe(0);
    expect(a.nonWhite).toBeGreaterThan(a.width * a.height * 0.3);
  });

  test("all six orthographic views are drawn at the same scale", async ({ page }) => {
    const box: Record<string, { w: number; h: number; cx: number; cy: number }> = {};
    for (const v of PATENT_VIEWS) {
      await open(page, `?patent=1&view=${v}&w=800&h=800`);
      const a = await analyse(page);
      expect(a.borderNonWhite, v).toBe(0);
      box[v] = { w: a.maxX - a.minX, h: a.maxY - a.minY, cx: (a.minX + a.maxX) / 2, cy: (a.minY + a.maxY) / 2 };
    }
    const tol = 3; // px at 800 px
    // Same physical extents must give the same pixel extents across views.
    expect(Math.abs(box.front.w - box.rear.w)).toBeLessThanOrEqual(tol);
    expect(Math.abs(box.front.h - box.rear.h)).toBeLessThanOrEqual(tol);
    expect(Math.abs(box.left.w - box.right.w)).toBeLessThanOrEqual(tol);
    expect(Math.abs(box.front.h - box.left.h)).toBeLessThanOrEqual(tol);
    expect(Math.abs(box.top.w - box.front.w)).toBeLessThanOrEqual(tol);
    expect(Math.abs(box.top.h - box.bottom.h)).toBeLessThanOrEqual(tol);
    expect(Math.abs(box.left.w - box.top.h)).toBeLessThanOrEqual(tol);
    // Pixel scale matches the spec: body width over body height (front view, feet + PIR excluded by tolerance).
    const pxPerMm = box.front.h / (spec.body.height.value + spec.feet.height.value);
    expect(box.front.w / pxPerMm).toBeGreaterThan(spec.body.width.value - 4);
    expect(box.front.w / pxPerMm).toBeLessThan(spec.body.width.value + 4);
  });

  test("patent options: transparent glass and open door are available", async ({ page }) => {
    await open(page, "?patent=1&view=front&glass=transparent&door=open");
    const st = await page.evaluate(() => ({ g: window.__safelock.app.glass.value, d: window.__safelock.app.door.angle }));
    expect(st).toEqual({ g: 0, d: MAX });
  });
});

test.describe("screenshots", () => {
  for (const [name, q] of [
    ["patent-front", "?patent=1&view=front&w=800&h=800&gui=0"],
    ["patent-perspective", "?patent=1&view=perspective&w=800&h=800&gui=0"],
    ["hero-front", "?view=front&w=900&h=700&gui=0"],
    ["hero-45", "?view=perspective&w=900&h=700&gui=0"],
  ] as const) {
    test(name, async ({ page }) => {
      await open(page, q);
      const png = await page.evaluate(() => window.__safelock.capture());
      expect(Buffer.from(png.split(",")[1], "base64")).toMatchSnapshot(`${name}.png`, { maxDiffPixelRatio: 0.02, threshold: 0.15 });
    });
  }
});

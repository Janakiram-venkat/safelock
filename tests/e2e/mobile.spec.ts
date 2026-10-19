import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { materials as M } from "../../src/spec/materials";
import { deviceSpec } from "../../src/spec/device";

/** Dev hub PIN (SAFELOCK_PIN unset → default). */
const PIN = process.env.SAFELOCK_PIN ?? "1234";

async function openPhone(ctx: BrowserContext, problems: string[] = []): Promise<Page> {
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(String(e)));
  await page.goto("/mobile.html");
  await page.waitForFunction(() => window.__safelockMobile?.client.state !== null && window.__safelockMobile.client.status === "online");
  return page;
}

async function openTwin(ctx: BrowserContext, query = ""): Promise<Page> {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__safelock?.ready === true && window.__safelock.app.linked, null, { timeout: 90_000 });
  return page;
}

/** Put the shared hub back into a known state (the hub persists between tests). */
async function resetDevice(phone: Page) {
  await phone.evaluate(async (pin) => {
    const c = window.__safelockMobile.client;
    for (const cmd of [
      { type: "physical", event: "tamperClose" },
      { type: "physical", event: "level" },
      { type: "physical", event: "powerRestore" },
      { type: "physical", event: "doorClosed" },
      { type: "clearAlert", pin },
      { type: "setGlass", glass: "transparent" },
      { type: "setMode", mode: "normal" },
      { type: "lock" },
    ] as const)
      await c.send(cmd as never);
  }, PIN);
  await expect(phone.locator("#lockWord")).toHaveText("Locked");
}

async function enterPin(phone: Page, pin: string) {
  for (const d of pin) await phone.locator(`#keypad button[data-key="${d}"]`).click();
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.describe("mobile screen", () => {
  test("shows live readings for every sensor, with no layout overflow", async ({ context }) => {
    const problems: string[] = [];
    const phone = await openPhone(context, problems);
    await resetDevice(phone);
    await expect(phone.locator("#linkText")).toHaveText("Simulated vault");
    await expect(phone.locator("#temp")).toHaveText(/^\d{1,2}\.\d$/);
    await expect(phone.locator("#humidity")).toHaveText(/^\d{1,3}%$/);
    const labels = await phone.locator("#sensors dt").allTextContents();
    expect(labels).toEqual(["Motion", "Vibration", "Tilt", "Door sensor", "Electronics cover", "Camera", "Peltier unit", "Power", "Wi-Fi"]);
    await expect(phone.locator("#sparkSvg path")).toHaveCount(1);
    await expect(phone.locator("#sourceNote")).toContainText("simulated");
    for (const width of [320, 360, 390, 430]) {
      await phone.setViewportSize({ width, height: 800 });
      expect(await phone.evaluate(() => document.documentElement.scrollWidth), `width ${width}`).toBeLessThanOrEqual(width);
    }
    // Readings update over time (publish interval), not just once.
    const t1 = await phone.evaluate(() => window.__safelockMobile.client.state!.t);
    await phone.waitForTimeout(deviceSpec.link.publishInterval.value * 3);
    expect(await phone.evaluate(() => window.__safelockMobile.client.state!.t)).toBeGreaterThan(t1);
    expect(problems).toEqual([]);
  });

  test("touch targets are at least 44 px", async ({ context }) => {
    const phone = await openPhone(context);
    const small = await phone.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("button, .modes span")]
        .filter((b) => b.offsetParent !== null)
        .map((b) => ({ t: b.textContent?.trim(), h: b.getBoundingClientRect().height }))
        .filter((b) => b.h < 44),
    );
    expect(small).toEqual([]);
  });

  test("unlock from the phone needs the PIN, and the 3D twin's bolt retracts", async ({ context }) => {
    const phone = await openPhone(context);
    await resetDevice(phone);
    const twin = await openTwin(context);
    await phone.bringToFront();

    await phone.locator("#lockBtn").click();
    await expect(phone.locator("#pinSheet")).toBeVisible();
    await expect(phone.locator("#pinTitle")).toHaveText("Enter your PIN to unlock");
    await enterPin(phone, "0000");
    await expect(phone.locator("#pinError")).toContainText("Wrong PIN");
    await expect(phone.locator("#lockWord")).toHaveText("Locked");

    await enterPin(phone, PIN);
    await expect(phone.locator("#pinSheet")).toBeHidden();
    await expect(phone.locator("#toast")).toHaveText("Unlocked");
    await expect(phone.locator("#lockWord")).toHaveText("Unlocked");
    await expect(phone.locator("#hint")).toContainText("Locks again in");
    await expect(phone.locator("#lockBtn")).toHaveText("Lock now");

    // The twin mirrors it: bolt retracted, door still shut.
    await expect.poll(() => twin.evaluate(() => window.__safelock.app.door.bolt)).toBe(1);
    expect(await twin.evaluate(() => window.__safelock.app.door.angle)).toBe(0);

    // Lock again from the phone; the twin's bolt extends.
    await phone.locator("#lockBtn").click();
    await expect(phone.locator("#lockWord")).toHaveText("Locked");
    await expect.poll(() => twin.evaluate(() => window.__safelock.app.door.bolt)).toBe(0);
  });

  test("opening the door in 3D shows on the phone; closing it locks", async ({ context }) => {
    const phone = await openPhone(context);
    await resetDevice(phone);
    const twin = await openTwin(context);
    await twin.locator(".lil-gui button", { hasText: "Open door" }).click();
    await expect(phone.locator("#lockWord")).toHaveText("Open", { timeout: 10_000 });
    await expect(phone.locator("#doorLine")).toHaveText("Door is open");
    await expect(phone.locator("#lockBtn")).toBeDisabled();
    await expect(phone.locator("#lockBtn")).toHaveText("Close the door to lock");
    await expect(phone.locator("#sensors div", { hasText: "Door sensor" }).locator("dd")).toHaveText("Open");
    await expect(phone.locator("#activity li").first()).toContainText("Door opened");
    // No alert: the door was opened after a pad unlock, not forced.
    await expect(phone.locator("#alert")).toBeHidden();

    await twin.locator(".lil-gui button", { hasText: "Close door" }).click();
    await expect(phone.locator("#lockWord")).toHaveText("Locked", { timeout: 10_000 });
    await expect(phone.locator("#activity li").first()).toContainText("Door closed and locked");
    await expect.poll(() => twin.evaluate(() => window.__safelock.app.door.bolt)).toBe(0);
  });

  test("storage mode and privacy glass from the phone drive the 3D model", async ({ context }) => {
    const phone = await openPhone(context);
    await resetDevice(phone);
    const twin = await openTwin(context);

    await phone.locator(".modes label", { hasText: "Cold" }).click();
    await expect(phone.locator("#target")).toHaveText(`${deviceSpec.climate.coldTarget.value} °C`);
    await expect(phone.locator("#sensors div", { hasText: "Peltier unit" }).locator("dd")).toContainText("Cooling");
    await expect.poll(() => twin.evaluate(() => (window.__safelock.app.vault.leds.mode.material as unknown as { emissive: { getHexString(): string } }).emissive.getHexString())).toBe(M.led.colors.cold.slice(1));

    await phone.locator("#glassBtn").click();
    await expect(phone.locator("#glassBtn")).toHaveAttribute("aria-checked", "true");
    await expect(phone.locator("#vault")).toHaveAttribute("data-glass", "opaque");
    await expect.poll(() => twin.evaluate(() => window.__safelock.app.glass.value), { timeout: 5000 }).toBe(1);

    // And the other way: the 3D GUI changes the mode, the phone follows.
    await twin.locator(".lil-gui .lil-controller", { has: twin.locator(".lil-name", { hasText: /^Storage mode$/ }) }).locator("select").selectOption("warm");
    await expect(phone.locator("input[name=mode][value=warm]")).toBeChecked();
  });

  test("breach: a knock raises the alert on both screens; the phone clears it with the PIN", async ({ context }) => {
    const phone = await openPhone(context);
    await resetDevice(phone);
    const twin = await openTwin(context);

    await twin.locator(".lil-gui .lil-title", { hasText: "Simulate events" }).click();
    await twin.locator(".lil-gui button", { hasText: "Knock on the vault" }).click();

    await expect(phone.locator("#alert")).toBeVisible();
    await expect(phone.locator("#alertTitle")).toHaveText("Vibration detected");
    await expect(phone.locator("#vault")).toHaveAttribute("data-security", "alert");
    await expect(phone.locator("#vault")).toHaveAttribute("data-glass", "opaque");
    await expect(phone.locator("#sensors div", { hasText: "Camera" }).locator("dd")).toHaveText("Recording");
    await expect.poll(() => twin.evaluate(() => window.__safelock.app.state.security)).toBe("alert");
    await expect.poll(() => twin.evaluate(() => window.__safelock.app.glass.value), { timeout: 5000 }).toBe(1);

    await phone.locator("#clearAlert").click();
    await expect(phone.locator("#pinTitle")).toHaveText("Enter your PIN to clear the alert");
    await enterPin(phone, PIN);
    await expect(phone.locator("#alert")).toBeHidden();
    await expect.poll(() => twin.evaluate(() => window.__safelock.app.state.security)).toBe("idle");
  });

  test("other sensors report on the phone: motion, tamper, tilt, power", async ({ context }) => {
    const phone = await openPhone(context);
    await resetDevice(phone);
    const twin = await openTwin(context);
    await twin.locator(".lil-gui .lil-title", { hasText: "Simulate events" }).click();
    const sim = (label: string) => twin.locator(".lil-gui button", { hasText: label }).click();
    const value = (row: string) => phone.locator("#sensors div", { hasText: row }).locator("dd");

    await sim("Someone walks by");
    await expect(value("Motion")).toContainText("Someone nearby");
    await sim("Cut mains power");
    await expect(value("Power")).toContainText("Battery");
    await sim("Open electronics cover");
    await expect(value("Electronics cover")).toHaveText("Opened");
    await expect(phone.locator("#alertTitle")).toHaveText("Electronics cover opened");
    await sim("Tilt the vault");
    await expect(value("Tilt")).toContainText("Vault has been moved");
    await resetDevice(phone);
  });

  test("panic needs a second tap so a stray tap never sounds the alarm", async ({ context }) => {
    const phone = await openPhone(context);
    await resetDevice(phone);
    await phone.locator("#panic").click();
    await expect(phone.locator("#panic")).toHaveText("Tap again to sound the alarm");
    await expect(phone.locator("#alert")).toBeHidden();
    await phone.locator("#panic").click();
    await expect(phone.locator("#alertTitle")).toHaveText("Panic alarm from the app");
    await resetDevice(phone);
  });

  test("the phone frame inside the 3D viewer runs the same app", async ({ context }) => {
    const phone = await openPhone(context);
    await resetDevice(phone);
    const twin = await openTwin(context, "?phone=1");
    const frame = twin.frameLocator(".phone iframe");
    await expect(frame.locator("#linkText")).toHaveText("Simulated vault", { timeout: 20_000 });
    await expect(frame.locator("#temp")).toHaveText(/^\d{1,2}\.\d$/);
    await expect(twin.locator(".phone")).toBeVisible();
  });
});

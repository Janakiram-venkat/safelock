import { chromium, type Browser, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Shot {
  url: string;
  out: string;
}

export async function launch(): Promise<Browser> {
  // ANGLE/D3D11 uses the real GPU on Windows; falls back to SwiftShader elsewhere.
  return chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
}

export async function openViewer(browser: Browser, url: string, errors: string[] = [], viewport = { width: 1280, height: 900 }): Promise<Page> {
  const page = await browser.newPage({ viewport });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.__safelock?.ready === true, null, { timeout: 180_000 });
  return page;
}

/**
 * Screenshot including DOM overlays (CSS2D sensor labels). Open the page with
 * a viewport equal to the render size so the canvas is shown 1:1.
 */
export async function captureDom(page: Page, out: string): Promise<void> {
  mkdirSync(dirname(out), { recursive: true });
  await page.evaluate(() => window.__safelock.app.renderOnce());
  await page.screenshot({ path: out });
}

/** Capture the canvas at its exact render size (not the scaled CSS size). */
export async function capture(page: Page, out: string): Promise<void> {
  const dataUrl = await page.evaluate(() => window.__safelock.capture());
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
}

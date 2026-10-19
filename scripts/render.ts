import { createServer } from "vite";
import { spec } from "../src/spec/dimensions";
import { PATENT_VIEWS, PATENT_FILES } from "../src/features/patentViews";
import { launch, openViewer, capture, captureDom } from "./lib/capture";

/**
 * npm run render:patent  → renders/patent/01-front.png … 07-perspective.png
 * npm run render:hero    → renders/hero/*.png
 * Extra query parameters can be appended, e.g. `npm run render:patent -- glass=transparent`.
 */
const kind = process.argv[2] ?? "patent";
const extra = process.argv.slice(3).join("&");

const server = await createServer({ logLevel: "error", server: { port: 5174, strictPort: false } });
await server.listen();
const base = server.resolvedUrls!.local[0];
const browser = await launch();
const errors: string[] = [];

try {
  if (kind === "patent") {
    const px = spec.render.patentSize.value;
    for (const v of PATENT_VIEWS) {
      const url = `${base}?patent=1&view=${v}&gui=0&w=${px}&h=${px}${extra ? `&${extra}` : ""}`;
      const page = await openViewer(browser, url, errors);
      const out = `renders/patent/${PATENT_FILES[v]}`;
      await capture(page, out);
      await page.close();
      console.log(`  ${out}  (${px} × ${px})`);
    }
  } else if (kind === "hero") {
    const px = spec.render.heroSize.value;
    const h = Math.round((px * 2) / 3);
    const shots: [string, string][] = [
      ["01-hero-transparent", "view=hero&glass=transparent"],
      ["02-hero-opaque", "view=hero&glass=opaque"],
      ["03-door-open", "view=hero&door=open&glass=transparent"],
      ["04-alert", "view=hero&state=alert"],
      ["05-sensor-overlay", "view=hero&overlay=1&glass=transparent"],
      ["06-exploded", "view=hero&explode=1"],
      ["07-cutaway", "view=right&cutaway=0.55&glass=transparent"],
      ["08-rear", "view=rear&mode=cold"],
    ];
    for (const [name, q] of shots) {
      const url = `${base}?${q}&gui=0&w=${px}&h=${h}${extra ? `&${extra}` : ""}`;
      const withLabels = q.includes("overlay=1");
      const page = await openViewer(browser, url, errors, withLabels ? { width: px, height: h } : undefined);
      if (withLabels) await captureDom(page, `renders/hero/${name}.png`);
      else await capture(page, `renders/hero/${name}.png`);
      await page.close();
      console.log(`  renders/hero/${name}.png  (${px} × ${h})`);
    }
  } else {
    throw new Error(`unknown render kind "${kind}"`);
  }
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) {
  console.error("Console errors during render:\n" + errors.join("\n"));
  process.exit(1);
}

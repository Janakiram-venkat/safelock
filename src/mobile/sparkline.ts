/**
 * Temperature sparkline: one series (so no legend; the block title names
 * it), a 2px line in the storage-mode colour, a dashed target reference line
 * labelled directly, and a crosshair readout on touch/pointer. Text stays in
 * ink colours, never the series colour.
 */
const NS = "http://www.w3.org/2000/svg";
const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export interface SparkData {
  points: [number, number][];
  target: number | null;
  lineColor: string;
}

const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export class Sparkline {
  private data: SparkData = { points: [], target: null, lineColor: "currentColor" };
  private hoverX: number | null = null;

  constructor(private readonly svg: SVGSVGElement, private readonly readout: HTMLElement, private readonly title: SVGTitleElement) {
    const move = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      this.hoverX = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
      this.draw();
    };
    svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointermove", move);
    const leave = () => {
      this.hoverX = null;
      this.draw();
    };
    svg.addEventListener("pointerleave", leave);
    svg.addEventListener("pointercancel", leave);
  }

  set(data: SparkData): void {
    this.data = data;
    this.draw();
  }

  private draw(): void {
    const { points, target, lineColor } = this.data;
    const svg = this.svg;
    const w = svg.clientWidth || 340;
    const h = svg.clientHeight || 72;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    for (const c of [...svg.childNodes]) if (c !== this.title) c.remove();
    if (points.length < 2) {
      this.readout.textContent = "Collecting readings";
      return;
    }
    const vals = points.map((p) => p[1]);
    let lo = Math.min(...vals, target ?? Infinity);
    let hi = Math.max(...vals, target ?? -Infinity);
    const pad = Math.max((hi - lo) * 0.15, 1); // at least ±1 °C so sensor noise on a flat trace stays flat
    lo -= pad;
    hi += pad;
    const t0 = points[0][0];
    const t1 = points[points.length - 1][0];
    const padTop = 4;
    const padBot = 4;
    const x = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * w;
    const y = (v: number) => padTop + (1 - (v - lo) / (hi - lo)) * (h - padTop - padBot);

    // Recessive baseline.
    svg.append(el("line", { x1: 0, x2: w, y1: h - 0.5, y2: h - 0.5, stroke: "var(--rule)", "stroke-width": 1 }));

    if (target !== null) {
      const ty = y(target);
      svg.append(el("line", { x1: 0, x2: w, y1: ty, y2: ty, stroke: "var(--ink-3)", "stroke-width": 1, "stroke-dasharray": "3 4" }));
      const label = el("text", { x: w, y: ty - 5, "text-anchor": "end", "font-size": 12, fill: "var(--ink-3)" });
      label.textContent = `Target ${target} °C`;
      svg.append(label);
    }

    const d = points.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    svg.append(el("path", { d, fill: "none", stroke: lineColor, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));

    const last = points[points.length - 1];
    const pick = this.hoverX === null ? last : points.reduce((best, p) => (Math.abs(x(p[0]) - this.hoverX! * w) < Math.abs(x(best[0]) - this.hoverX! * w) ? p : best), last);
    if (this.hoverX !== null) svg.append(el("line", { x1: x(pick[0]), x2: x(pick[0]), y1: 0, y2: h, stroke: "var(--ink-3)", "stroke-width": 1 }));
    svg.append(el("circle", { cx: x(pick[0]), cy: y(pick[1]), r: 4, fill: lineColor, stroke: "var(--mist)", "stroke-width": 2 }));

    this.readout.textContent = this.hoverX === null ? `Last ${Math.round((t1 - t0) / 60000)} minutes` : `${pick[1].toFixed(1)} °C at ${fmtTime(pick[0])}`;
    this.title.textContent = `Temperature over the last ${Math.round((t1 - t0) / 60000)} minutes, between ${Math.min(...vals).toFixed(1)} and ${Math.max(...vals).toFixed(1)} °C, now ${last[1].toFixed(1)} °C`;
  }
}

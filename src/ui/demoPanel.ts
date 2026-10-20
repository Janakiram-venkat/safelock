import type { App } from "../app";
import { deviceSpec } from "../spec/device";
import { materials as M } from "../spec/materials";
import { buildScenarios, PILLARS, ScenarioPlayer, type Pillar, type Scenario } from "../features/scenarios";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function chips(pillars: Pillar[]): HTMLElement {
  const row = el("div", "demo-chips");
  for (const p of pillars) {
    const c = el("span", "demo-chip", PILLARS[p]);
    c.style.setProperty("--c", M.demo.pillars[p]);
    row.append(c);
  }
  return row;
}

/**
 * Demo scenario UI: a picker card, then a caption card with narration,
 * pillar tags and step controls. Keyboard: ← → step, Space play/pause, Esc close.
 */
export class DemoPanel {
  readonly player: ScenarioPlayer;
  private readonly root = el("div", "demo");
  private readonly launcher = el("button", "demo-launch", "Surakshit Bharat demos");
  private segments: HTMLElement[] = [];
  private picking = false;
  private readonly resize = new ResizeObserver(() => this.reserve());
  private unlink: (() => void)[] = [];
  /** Called when a scenario starts (main.ts collapses the debug GUI). */
  onStart: () => void = () => {};

  constructor(private readonly app: App) {
    this.player = new ScenarioPlayer(
      buildScenarios(deviceSpec),
      app.spec.timing.demoStep.value,
      (scene, events) => app.playScene(scene, events),
      () => this.changed(),
    );
    this.root.hidden = true;
    this.root.style.setProperty("--flag", `linear-gradient(90deg, ${M.demo.flag[0]} 0 33.3%, ${M.demo.flag[1]} 33.3% 66.6%, ${M.demo.flag[2]} 66.6%)`);
    this.launcher.addEventListener("click", () => this.open());
    document.body.append(this.root, this.launcher);
    window.addEventListener("keydown", this.onKey);
    app.tickers.add(this.tick);
    this.resize.observe(this.root);
    // The hub's state overwrites the viewer when it (re)connects; push the current step back to it.
    const link = app.link;
    if (link) {
      let synced = false;
      this.unlink.push(
        link.onStatus((st) => {
          if (st !== "online") synced = false;
        }),
        link.onState(() => {
          if (synced) return;
          synced = true;
          this.player.refresh();
        }),
      );
    }
    this.render();
    const s = app.state;
    if (s.demo && !this.player.start(s.demo, s.step - 1)) {
      s.demo = "";
      app.syncUrl();
    }
  }

  get scenarios(): Scenario[] {
    return this.player.scenarios;
  }

  /** Show the scenario picker. */
  open(): void {
    this.player.pause();
    this.picking = true;
    this.render();
  }

  start(id: string, index = 0, play = false): void {
    this.picking = false;
    this.onStart();
    this.player.start(id, index, play);
  }

  close(): void {
    this.picking = false;
    this.player.stop();
  }

  private changed(): void {
    const s = this.app.state;
    const p = this.player;
    s.demo = p.scenario?.id ?? "";
    s.step = p.index + 1;
    this.app.syncUrl();
    this.render();
  }

  /** Keep the caption card clear of the model; the picker is a temporary overlay. */
  private reserve(): void {
    const card = this.root.firstElementChild as HTMLElement | null;
    const caption = !this.root.hidden && !this.picking && this.player.scenario !== null && card;
    this.app.setReserveBottom(caption && innerWidth > 0 ? Math.round(card.getBoundingClientRect().height) + 20 : 0);
  }

  private readonly tick = (dt: number): void => {
    this.player.update(dt);
    const seg = this.segments[this.player.index];
    if (seg) seg.style.setProperty("--p", String(this.player.playing ? this.player.progress : 1));
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.root.hidden) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
    const p = this.player;
    if (e.key === "Escape") this.close();
    else if (!p.scenario) return;
    else if (e.key === "ArrowRight") p.next();
    else if (e.key === "ArrowLeft") p.prev();
    else if (e.key === " ") p.togglePlay();
    else return;
    e.preventDefault();
  };

  private render(): void {
    const p = this.player;
    const s = this.app.state;
    const active = this.picking || p.scenario !== null;
    this.root.hidden = !active;
    this.launcher.hidden = active || s.patent || s.width > 0;
    this.root.classList.toggle("demo--beside-phone", s.phone && !this.picking);
    this.root.replaceChildren(this.picking || !p.scenario ? this.picker() : this.caption(p.scenario));
    this.reserve();
  }

  private picker(): HTMLElement {
    const card = el("div", "demo-card demo-picker");
    const head = el("div", "demo-head");
    head.append(el("span", "demo-eyebrow", "Surakshit Bharat · Safe Lock"), this.button("Close", "×", () => this.close(), "demo-icon"));
    card.append(head, el("h2", "demo-title", "Choose a demo scenario"));
    const list = el("div", "demo-list");
    for (const sc of this.scenarios) {
      const b = el("button", "demo-option");
      b.append(chips(sc.pillars), el("strong", "", sc.title), el("span", "demo-summary", sc.summary), el("span", "demo-meta", `${sc.steps.length} steps`));
      b.addEventListener("click", () => this.start(sc.id));
      list.append(b);
    }
    card.append(list);
    return card;
  }

  private caption(sc: Scenario): HTMLElement {
    const p = this.player;
    const step = p.step!;
    const card = el("div", "demo-card");
    const head = el("div", "demo-head");
    head.append(el("span", "demo-eyebrow", sc.title), el("span", "demo-count", `${p.index + 1} / ${sc.steps.length}`));
    card.append(head, chips(step.pillars), el("h2", "demo-title", step.title), el("p", "demo-text", step.text));
    if (step.planned) {
      const planned = el("p", "demo-planned");
      planned.append(el("b", "", "Roadmap "), document.createTextNode(step.planned));
      card.append(planned);
    }
    const bar = el("div", "demo-bar");
    this.segments = sc.steps.map((_, i) => {
      const seg = el("button", "demo-seg");
      seg.setAttribute("aria-label", `Step ${i + 1}`);
      seg.style.setProperty("--p", i < p.index ? "1" : i === p.index && !p.playing ? "1" : "0");
      seg.addEventListener("click", () => p.start(sc.id, i, p.playing));
      bar.append(seg);
      return seg;
    });
    const controls = el("div", "demo-controls");
    controls.append(
      this.button("Scenarios", "☰ Scenarios", () => this.open(), "demo-ghost"),
      el("span", "demo-spacer"),
      this.button("Previous step", "◀", () => p.prev(), "demo-icon", p.index === 0),
      this.button(p.playing ? "Pause" : "Auto-play", p.playing ? "❚❚" : "▶", () => p.togglePlay(), "demo-icon demo-play"),
      this.button("Next step", "▶▶", () => p.next(), "demo-icon", p.index === sc.steps.length - 1),
      this.button("Close demo", "×", () => this.close(), "demo-icon"),
    );
    card.append(bar, controls);
    return card;
  }

  private button(label: string, text: string, fn: () => void, cls: string, disabled = false): HTMLButtonElement {
    const b = el("button", cls, text);
    b.title = label;
    b.setAttribute("aria-label", label);
    b.disabled = disabled;
    b.addEventListener("click", fn);
    return b;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKey);
    this.resize.disconnect();
    for (const off of this.unlink) off();
    this.app.setReserveBottom(0);
    this.app.tickers.delete(this.tick);
    this.root.remove();
    this.launcher.remove();
  }
}

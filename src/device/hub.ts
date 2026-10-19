import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { deviceSpec } from "../spec/device";
import { DeviceSimulator } from "./simulator";
import { parseCommand, parseHello, isDeviceState, type Role, type ServerMessage, type DeviceState } from "./protocol";

export interface HubOptions {
  pin: string;
  tickMs?: number;
  publishMs?: number;
  now?: () => number;
}

/**
 * Device hub (Node). Runs the firmware simulator and relays between the
 * mobile app, the 3D twin and — when one connects — a real device, which
 * then takes over from the simulator.
 */
export function createHub(opts: HubOptions) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const roles = new Map<WebSocket, Role>();
  const sim = new DeviceSimulator(deviceSpec, { pin: opts.pin, now: opts.now });
  let device: WebSocket | null = null;
  let lastDeviceState: DeviceState | null = null;
  let last = Date.now();

  const send = (ws: WebSocket, msg: ServerMessage) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));
  const current = (): DeviceState => (device && lastDeviceState ? lastDeviceState : sim.snapshot());
  const broadcast = () => {
    const state = JSON.stringify(current());
    for (const ws of roles.keys()) if (ws !== device && ws.readyState === WebSocket.OPEN) ws.send(state);
  };

  const tick = setInterval(() => {
    const now = Date.now();
    sim.tick(now - last);
    last = now;
  }, opts.tickMs ?? 100);
  const publish = setInterval(() => {
    if (!device) broadcast();
  }, opts.publishMs ?? deviceSpec.link.publishInterval.value);
  // Never keep a process alive just for the simulator.
  tick.unref?.();
  publish.unref?.();

  wss.on("connection", (ws) => {
    roles.set(ws, "app");
    send(ws, current());
    ws.on("message", (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(String(data));
      } catch {
        return send(ws, { type: "error", message: "Message is not valid JSON" });
      }
      const role = parseHello(raw);
      if (role) {
        roles.set(ws, role);
        if (role === "device") device = ws;
        return send(ws, current());
      }
      if (ws === device) {
        if (isDeviceState(raw)) {
          lastDeviceState = { ...raw, source: "device" };
          broadcast();
        }
        return;
      }
      const cmd = parseCommand(raw);
      const id = typeof (raw as { id?: unknown }).id === "string" ? String((raw as { id: string }).id).slice(0, 32) : undefined;
      if (!cmd) return send(ws, { type: "error", message: "Unknown command" });
      if (device) {
        device.send(JSON.stringify({ ...cmd, id }));
        return send(ws, { type: "ack", command: cmd.type, ok: true, message: "Sent to device", ...(id ? { id } : {}) } as ServerMessage);
      }
      const res = sim.handle(cmd, roles.get(ws) ?? "app");
      send(ws, { type: "ack", command: cmd.type, ok: res.ok, message: res.message, ...(id ? { id } : {}) } as ServerMessage);
      broadcast();
    });
    ws.on("close", () => {
      roles.delete(ws);
      if (ws === device) {
        device = null;
        lastDeviceState = null;
      }
    });
  });

  return {
    sim,
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    },
    clients: () => roles.size,
    close() {
      clearInterval(tick);
      clearInterval(publish);
      for (const ws of roles.keys()) ws.terminate();
      wss.close();
    },
  };
}

export type Hub = ReturnType<typeof createHub>;

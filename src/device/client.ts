import { isDeviceState, type Command, type DeviceState, type Role } from "./protocol";

export type LinkStatus = "connecting" | "online" | "offline";

interface Ack {
  type: "ack";
  id?: string;
  ok: boolean;
  message: string;
}

/**
 * Browser connection to the device hub with automatic reconnect.
 * `send` resolves with the hub's acknowledgement.
 */
export class DeviceClient {
  state: DeviceState | null = null;
  status: LinkStatus = "connecting";
  private ws: WebSocket | null = null;
  private seq = 0;
  private retry = 500;
  private closed = false;
  private readonly pending = new Map<string, (a: Ack) => void>();
  private readonly stateListeners = new Set<(s: DeviceState) => void>();
  private readonly statusListeners = new Set<(s: LinkStatus) => void>();

  constructor(private readonly role: Role, private readonly url = DeviceClient.defaultUrl()) {
    this.connect();
  }

  static defaultUrl(): string {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}/hub`;
  }

  onState(fn: (s: DeviceState) => void): () => void {
    this.stateListeners.add(fn);
    if (this.state) fn(this.state);
    return () => this.stateListeners.delete(fn);
  }

  onStatus(fn: (s: LinkStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: LinkStatus): void {
    if (s === this.status) return;
    this.status = s;
    for (const fn of this.statusListeners) fn(s);
  }

  private connect(): void {
    if (this.closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.setStatus("offline");
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 500;
      ws.send(JSON.stringify({ type: "hello", role: this.role }));
      this.setStatus("online");
    };
    ws.onmessage = (ev) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (isDeviceState(msg)) {
        this.state = msg;
        for (const fn of this.stateListeners) fn(msg);
        return;
      }
      const ack = msg as Ack;
      if (ack.type === "ack" && ack.id && this.pending.has(ack.id)) {
        this.pending.get(ack.id)!(ack);
        this.pending.delete(ack.id);
      }
    };
    ws.onclose = () => {
      this.ws = null;
      for (const [id, fn] of this.pending) fn({ type: "ack", id, ok: false, message: "Connection to the vault was lost" });
      this.pending.clear();
      this.setStatus(this.closed ? "offline" : "connecting");
      if (!this.closed) {
        setTimeout(() => this.connect(), this.retry);
        this.retry = Math.min(this.retry * 2, 8000);
        if (this.retry >= 4000) this.setStatus("offline");
      }
    };
  }

  send(cmd: Command): Promise<{ ok: boolean; message: string }> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve({ ok: false, message: "The vault is offline. Check that it is powered and on Wi-Fi" });
    const id = `c${++this.seq}`;
    return new Promise((resolve) => {
      this.pending.set(id, (a) => resolve({ ok: a.ok, message: a.message }));
      ws.send(JSON.stringify({ ...cmd, id }));
      setTimeout(() => {
        if (this.pending.delete(id)) resolve({ ok: false, message: "The vault did not respond. Try again" });
      }, 5000);
    });
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}

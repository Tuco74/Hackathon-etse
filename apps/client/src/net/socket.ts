import type { C2SMessage, S2CMessage } from "@trastero/shared";
import { session } from "../game/session";

type Handler = (msg: S2CMessage) => void;
export type NetStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";
type StatusHandler = (status: NetStatus, detail?: string) => void;

interface ConnectOptions {
  /** Run the offline mock transport instead of opening a WebSocket. */
  mock?: boolean;
  /** Mock only: number of rounds in the demo match. */
  mockRounds?: number;
  /** Mock only: round after which the roulette opens (default 2). */
  mockRoulette?: number;
}

const MAX_QUEUE = 32;
const MAX_RETRIES = 8;
const PING_INTERVAL_MS = 4000;

/**
 * Typed transport. Responsibilities:
 * - envelope encode/decode + message dedupe by `id`
 * - offline queue (short) and automatic reconnection with backoff
 * - clock offset estimation from the server timestamp / PONG samples
 * - optional in-memory mock server (`?mock=1`) for working without B
 */
export class GameSocket {
  private ws: WebSocket | null = null;
  private mock: { send(msg: C2SMessage): void; stop(): void } | null = null;
  private handlers = new Set<Handler>();
  private statusHandlers = new Set<StatusHandler>();
  private queue: C2SMessage[] = [];
  private seen = new Set<string>();
  private offsets: number[] = [];
  private url = "";
  private mockMode = false;
  private closedByUser = false;
  private retry = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private currentStatus: NetStatus = "idle";
  private lastRtt = 0;

  async connect(url: string, opts: ConnectOptions = {}): Promise<void> {
    this.closedByUser = false;
    if (opts.mock) {
      await this.connectMock(opts.mockRounds, opts.mockRoulette);
      return;
    }
    this.url = url;
    this.mockMode = false;
    await this.open();
  }

  private async connectMock(rounds?: number, rouletteAfter?: number): Promise<void> {
    this.mockMode = true;
    this.setStatus("connecting");
    const { createMockServer } = await import("./mockServer");
    this.mock = createMockServer((msg) => this.deliver(msg, Date.now()), {
      ...(rounds ? { rounds } : {}),
      ...(rouletteAfter ? { rouletteAfter } : {}),
    });
    this.setStatus("open");
    this.flush();
    this.startPing();
  }

  private open(): Promise<void> {
    this.setStatus(this.retry > 0 ? "reconnecting" : "connecting");
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("WebSocket inválido"));
        return;
      }
      this.ws = ws;

      ws.onopen = () => {
        settled = true;
        this.retry = 0;
        this.setStatus("open");
        this.flush();
        this.startPing();
        resolve();
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error("No se pudo conectar al servidor"));
        }
      };

      ws.onmessage = (ev) => {
        let env: { id?: string; ts?: number; payload?: S2CMessage } | null;
        try {
          env = JSON.parse(String(ev.data)) as {
            id?: string;
            ts?: number;
            payload?: S2CMessage;
          } | null;
        } catch {
          return;
        }
        if (!env?.payload) return;
        if (env.id) {
          if (this.seen.has(env.id)) return;
          this.seen.add(env.id);
          if (this.seen.size > 500) this.seen.clear();
        }
        if (typeof env.ts === "number") this.sampleOffset(env.ts - Date.now(), 0);
        this.deliver(env.payload, typeof env.ts === "number" ? env.ts : Date.now());
      };

      ws.onclose = () => {
        this.stopPing();
        this.ws = null;
        if (this.closedByUser) {
          this.setStatus("closed");
          return;
        }
        this.scheduleReconnect();
      };
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    if (this.retry >= MAX_RETRIES) {
      this.setStatus("closed", "No se pudo reconectar. Recarga la página.");
      return;
    }
    const delay = Math.min(8000, 800 * 2 ** this.retry);
    this.retry += 1;
    this.setStatus("reconnecting", `Reconectando en ${(delay / 1000).toFixed(1)} s…`);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closedByUser || this.mockMode) return;
      this.open().catch(() => this.scheduleReconnect());
    }, delay);
  }

  /** Force an immediate reconnect attempt (retry button / `online` event). */
  retryNow(): void {
    if (this.mockMode || this.closedByUser) return;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.retry = 0;
    if (!this.ws) this.open().catch(() => this.scheduleReconnect());
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.currentStatus);
    return () => this.statusHandlers.delete(handler);
  }

  send(msg: C2SMessage): void {
    if (this.mock && this.mockMode) {
      this.mock.send(msg);
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.queue.length >= MAX_QUEUE) this.queue.shift();
      this.queue.push(msg);
      return;
    }
    this.ws.send(
      JSON.stringify({
        v: 1,
        type: msg.type,
        id: crypto.randomUUID(),
        ts: Date.now(),
        payload: msg,
      }),
    );
  }

  close(): void {
    this.closedByUser = true;
    this.stopPing();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.mock?.stop();
    this.mock = null;
    this.ws?.close();
    this.ws = null;
    this.setStatus("closed");
  }

  get connected(): boolean {
    if (this.mockMode) return this.mock !== null;
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get isMock(): boolean {
    return this.mockMode;
  }

  get rtt(): number {
    return this.lastRtt;
  }

  // ---- internals ---------------------------------------------------------

  private flush(): void {
    const pending = this.queue;
    this.queue = [];
    for (const msg of pending) this.send(msg);
  }

  private deliver(msg: S2CMessage, serverTs: number): void {
    if (msg.type === "S2C_PONG") {
      const rtt = Math.max(0, Date.now() - msg.clientTs);
      const offset = msg.serverTs - (msg.clientTs + rtt / 2);
      this.sampleOffset(offset, rtt);
    } else if (serverTs > 0) {
      // every envelope carries the server timestamp; cheap offset sample
      this.sampleOffset(serverTs - Date.now(), 0);
    }
    for (const handler of this.handlers) handler(msg);
  }

  private sampleOffset(offset: number, rtt: number): void {
    this.offsets.push(offset);
    if (this.offsets.length > 9) this.offsets.shift();
    const sorted = [...this.offsets].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    this.lastRtt = rtt || this.lastRtt;
    window.dispatchEvent(
      new CustomEvent("tw:clock", { detail: { offset: median, rtt: this.lastRtt } }),
    );
  }

  private startPing(): void {
    this.stopPing();
    // The room rejects everything (even PING) before C2S_JOIN, so wait for a seat.
    const ping = () => {
      if (session.playerId) this.send({ type: "C2S_PING", clientTs: Date.now() });
    };
    ping();
    this.pingTimer = window.setInterval(ping, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private setStatus(status: NetStatus, detail?: string): void {
    this.currentStatus = status;
    for (const handler of this.statusHandlers) handler(status, detail);
  }
}

// Single shared connection for the whole app (Phaser + DOM overlays).
export const socket = new GameSocket();

import type { C2SMessage, S2CMessage } from "@trastero/shared";

type Handler = (msg: S2CMessage) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private queue: C2SMessage[] = [];
  private seen = new Set<string>();

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        for (const m of this.queue) this.send(m);
        this.queue = [];
        resolve();
      };
      ws.onerror = () => reject(new Error("No se pudo conectar al servidor"));
      ws.onmessage = (ev) => {
        let env: { id?: string; payload?: S2CMessage } | null = null;
        try {
          env = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (!env?.payload) return;
        if (env.id) {
          if (this.seen.has(env.id)) return; // dedupe
          this.seen.add(env.id);
        }
        for (const h of this.handlers) h(env.payload);
      };
    });
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(msg: C2SMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
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

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Single shared connection for the whole app (Phaser scene + DOM overlays).
export const socket = new GameSocket();
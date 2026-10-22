// The server owns every timer. The UI only needs to translate server
// timestamps (`endsAt`) into "seconds left", which requires knowing the offset
// between the browser clock and the server clock.

import type { C2SMessage } from "@trastero/shared";

export class ServerClock {
  private offsetMs = 0;
  private timer: number | null = null;
  private pending = new Map<number, number>();

  constructor(private readonly send: (msg: C2SMessage) => void) {}

  start(): void {
    if (this.timer !== null) return;
    this.ping();
    this.timer = window.setInterval(() => this.ping(), 15_000);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private ping(): void {
    const clientTs = Date.now();
    this.pending.set(clientTs, performance.now());
    if (this.pending.size > 8) {
      const oldest = this.pending.keys().next().value;
      if (oldest !== undefined) this.pending.delete(oldest);
    }
    this.send({ type: "C2S_PING", clientTs });
  }

  onPong(clientTs: number, serverTs: number): void {
    const sentAt = this.pending.get(clientTs);
    if (sentAt === undefined) return;
    this.pending.delete(clientTs);
    const rtt = performance.now() - sentAt;
    const sample = serverTs + rtt / 2 - Date.now();
    // Smooth over jitter, but converge fast on the first sample.
    this.offsetMs = this.offsetMs === 0 ? sample : this.offsetMs * 0.6 + sample * 0.4;
  }

  now(): number {
    return Date.now() + this.offsetMs;
  }

  remaining(endsAt: number): number {
    return Math.max(0, endsAt - this.now());
  }
}

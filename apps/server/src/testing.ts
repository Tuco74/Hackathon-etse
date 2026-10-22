import { randomUUID } from "node:crypto";
import type { S2CMessage } from "@trastero/shared";
import type { Logger } from "./log.js";
import type { Conn } from "./room.js";

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class FakeSocket {
  readyState = 1;
  sent: string[] = [];
  closed: { code: number | undefined; reason: string | undefined } | null = null;

  send(data: string): void {
    if (this.readyState !== 1) return;
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.closed = { code, reason };
  }

  terminate(): void {
    this.readyState = 3;
  }

  get open(): boolean {
    return this.readyState === 1;
  }
}

export function makeConn(id = randomUUID()): { conn: Conn; ws: FakeSocket } {
  const ws = new FakeSocket();
  const conn: Conn = { id, playerId: "", nickname: "", ws, room: null };
  return { conn, ws };
}

export function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

export function decode(ws: FakeSocket): S2CMessage[] {
  return ws.sent.map((raw) => (JSON.parse(raw) as { payload: S2CMessage }).payload);
}

/** Payloads a given connection received for the first time. */
export function newMessages(ws: FakeSocket, fromIndex: number): S2CMessage[] {
  return decode(ws).slice(fromIndex);
}

export function rawText(ws: FakeSocket): string {
  return ws.sent.join("\n");
}

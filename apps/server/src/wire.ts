import { z } from "zod";
import {
  C2S_TYPES,
  CONFIG,
  EnvelopeSchema,
  parseC2S,
  type C2SMessage,
  type ErrorCode,
} from "@trastero/shared";

const WireEnvelope = EnvelopeSchema.extend({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
});

export type ParseFailure = {
  ok: false;
  /** ErrorCode to answer with. */
  code: Extract<ErrorCode, "INVALID_PAYLOAD" | "UNKNOWN_MESSAGE">;
  detail: string;
  id?: string;
};

export type ParseResult = { ok: true; id: string; message: C2SMessage } | ParseFailure;

/**
 * Validate the envelope *and* the payload. A malicious client must not be able
 * to smuggle a payload whose `type` disagrees with the envelope, or a message
 * without an id (ids make retransmissions idempotent).
 */
export function parseWire(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: "INVALID_PAYLOAD", detail: "JSON inválido" };
  }

  const env = WireEnvelope.safeParse(json);
  if (!env.success) return { ok: false, code: "INVALID_PAYLOAD", detail: "Sobre inválido" };
  const { id, type, payload } = env.data;

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, code: "INVALID_PAYLOAD", detail: "payload debe ser un objeto", id };
  }
  const payloadType = (payload as { type?: unknown }).type;
  if (payloadType !== type) {
    return { ok: false, code: "INVALID_PAYLOAD", detail: "type del sobre y payload no coinciden", id };
  }
  if (!C2S_TYPES.has(type)) {
    return { ok: false, code: "UNKNOWN_MESSAGE", detail: `Tipo desconocido: ${type}`, id };
  }

  const message = parseC2S(payload);
  if (!message) return { ok: false, code: "INVALID_PAYLOAD", detail: "Payload no válido", id };
  return { ok: true, id, message };
}

/** Bounded set of recently seen message ids: retransmissions are ignored. */
export class Dedupe {
  private seen = new Set<string>();
  private order: string[] = [];

  constructor(private readonly limit: number = CONFIG.server.dedupeWindow) {}

  /** Returns true only the first time an id is seen. */
  accept(id: string): boolean {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    this.order.push(id);
    while (this.order.length > this.limit) {
      const old = this.order.shift();
      if (old !== undefined) this.seen.delete(old);
    }
    return true;
  }
}

/** Token bucket: absorbs normal bursts (bids) but stops message floods. */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number = CONFIG.server.rateLimit.capacity,
    private readonly refillPerSec: number = CONFIG.server.rateLimit.refillPerSec,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  allow(): boolean {
    const t = this.now();
    const elapsedSec = Math.max(0, t - this.last) / 1000;
    this.last = t;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

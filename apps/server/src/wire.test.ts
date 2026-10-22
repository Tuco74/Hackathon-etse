import { describe, expect, it } from "vitest";
import { Dedupe, parseWire, RateLimiter } from "./wire.js";

const envelope = (payload: unknown, type?: string, id = "msg-1") => ({
  v: 1,
  type: type ?? (payload as { type: string }).type,
  id,
  ts: 1,
  payload,
});

const joinPayload = { type: "C2S_JOIN", nickname: "Ana", roomCode: "ABCD" };

describe("parseWire", () => {
  it("accepts a valid envelope and payload", () => {
    const res = parseWire(JSON.stringify(envelope(joinPayload)));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.id).toBe("msg-1");
      expect(res.message.type).toBe("C2S_JOIN");
    }
  });

  it("rejects invalid JSON", () => {
    const res = parseWire("{not json");
    expect(res).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
  });

  it("rejects a wrong protocol version", () => {
    const res = parseWire(JSON.stringify({ ...envelope(joinPayload), v: 2 }));
    expect(res).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
  });

  it("rejects envelope/payload type mismatch", () => {
    const res = parseWire(JSON.stringify(envelope(joinPayload, "C2S_BID")));
    expect(res).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
  });

  it("rejects a known type with an invalid payload", () => {
    const res = parseWire(JSON.stringify(envelope({ type: "C2S_BID", amount: -5 })));
    expect(res).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
  });

  it("reports unknown message types and keeps the ref id", () => {
    const res = parseWire(JSON.stringify(envelope({ type: "C2S_HACK" }, "C2S_HACK", "ref-9")));
    expect(res).toMatchObject({ ok: false, code: "UNKNOWN_MESSAGE", id: "ref-9" });
  });

  it("rejects payloads that are not objects", () => {
    const res = parseWire(JSON.stringify({ v: 1, type: "C2S_BID", id: "x", ts: 1, payload: 42 }));
    expect(res).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
  });

  it("never throws on fuzzed input", () => {
    const seeds = [
      "", "null", "0", "[]", "{}", '{"v":1}', "\u0000", "💥",
      JSON.stringify({ v: 1, type: "C2S_BID", id: "", ts: -1, payload: null }),
      JSON.stringify({ v: 1, type: "C2S_BID", id: "a", ts: 1.5, payload: { type: "C2S_BID", amount: 1 } }),
    ];
    for (const seed of seeds) {
      expect(() => parseWire(seed)).not.toThrow();
    }

    // deterministic pseudo-random corpus: random type, id, payload shapes
    let x = 123456789;
    const rand = () => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x / 0x100000000;
    };
    const types = ["C2S_JOIN", "C2S_BID", "C2S_RECONNECT", "C2S_NOPE", 42, null];
    for (let i = 0; i < 500; i++) {
      const candidate = {
        v: rand() < 0.9 ? 1 : 0,
        type: types[Math.floor(rand() * types.length)],
        id: rand() < 0.8 ? `id-${i}` : "",
        ts: Math.floor(rand() * 10_000) - 1,
        payload: {
          type: types[Math.floor(rand() * types.length)],
          amount: Math.floor(rand() * 2000) - 1000,
          nickname: "x".repeat(Math.floor(rand() * 30)),
        },
      };
      const res = parseWire(JSON.stringify(candidate));
      expect(typeof res.ok).toBe("boolean");
    }
  });
});

describe("Dedupe", () => {
  it("accepts the first id and drops retransmissions", () => {
    const d = new Dedupe(3);
    expect(d.accept("a")).toBe(true);
    expect(d.accept("a")).toBe(false);
    expect(d.accept("b")).toBe(true);
  });

  it("evicts the oldest ids beyond the window", () => {
    const d = new Dedupe(2);
    expect(d.accept("a")).toBe(true);
    expect(d.accept("b")).toBe(true);
    expect(d.accept("c")).toBe(true);
    // "a" fell out of the window: it can be accepted again (bounded memory)
    expect(d.accept("a")).toBe(true);
  });
});

describe("RateLimiter", () => {
  it("allows a burst, blocks the flood and refills over time", () => {
    let t = 0;
    const rl = new RateLimiter(3, 1, () => t);
    expect(rl.allow()).toBe(true);
    expect(rl.allow()).toBe(true);
    expect(rl.allow()).toBe(true);
    expect(rl.allow()).toBe(false);

    t += 1000;
    expect(rl.allow()).toBe(true);
    expect(rl.allow()).toBe(false);

    t += 500;
    expect(rl.allow()).toBe(false);
    t += 500;
    expect(rl.allow()).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { CONFIG } from "@trastero/shared";
import {
  startMatch, setReady, startGame, startRound, placeBid, resolveAuction, reveal,
  afterReveal, tick, minNextBid, spinRoulette, rouletteResultFromSeed,
} from "./match";
import { generateLot } from "./lotGenerator";

// Deterministic LCG seeded by the first value. It must produce a varied stream:
// a degenerate constant RNG used to expose (and now cannot trigger) hangs in pickers.
function rngSeq(vals: number[]): () => number {
  let x = (Math.floor((vals[0] ?? 0.5) * 0xffffffff) >>> 0) || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}
const now = () => 1000;

describe("auction basics", () => {
  it("opens at minBid", () => {
    let s = startMatch([{id:"a",nickname:"A"},{id:"b",nickname:"B"}], "ABCD", rngSeq([0.5,0.5,0.5]), () => 1000);
    s = setReady(s, "a", true); s = setReady(s, "b", true);
    s = startGame(s, rngSeq([0.5,0.5,0.5]), () => 1000);
    expect(s.phase).toBe("AUCTION");
    const r = placeBid(s, "a", 10, () => 1000);
    expect(r.ok).toBe(true);
    expect(r.state.currentRound!.auction!.currentBid).toBe(10);
    expect(r.state.currentRound!.auction!.highBidderId).toBe("a");
  });

  it("rejects bid below min", () => {
    let s = startMatch([{id:"a",nickname:"A"},{id:"b",nickname:"B"}], "ABCD", rngSeq([0.5]), () => 1000);
    s = setReady(s, "a", true); s = setReady(s, "b", true);
    s = startGame(s, rngSeq([0.5]), () => 1000);
    const r = placeBid(s, "a", 5, () => 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("BID_TOO_LOW");
  });

  it("rejects insufficient funds", () => {
    let s = startMatch([{id:"a",nickname:"A"},{id:"b",nickname:"B"}], "ABCD", rngSeq([0.5]), () => 1000);
    s = setReady(s, "a", true); s = setReady(s, "b", true);
    s = startGame(s, rngSeq([0.5]), () => 1000);
    // drain money
    (s.players[0] as { money: number }).money = 5;
    const r = placeBid(s, "a", 10, () => 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("INSUFFICIENT_FUNDS");
  });

  it("rejects self outbid", () => {
    let s = startMatch([{id:"a",nickname:"A"},{id:"b",nickname:"B"}], "ABCD", rngSeq([0.5]), () => 1000);
    s = setReady(s, "a", true); s = setReady(s, "b", true);
    s = startGame(s, rngSeq([0.5]), () => 1000);
    s = placeBid(s, "a", 10, () => 1000).state;
    const r = placeBid(s, "a", 35, () => 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("NOT_YOUR_TURN");
  });

  it("increment min enforced", () => {
    let s = startMatch([{id:"a",nickname:"A"},{id:"b",nickname:"B"}], "ABCD", rngSeq([0.5]), () => 1000);
    s = setReady(s, "a", true); s = setReady(s, "b", true);
    s = startGame(s, rngSeq([0.5]), () => 1000);
    s = placeBid(s, "a", 10, () => 1000).state;
    const r = placeBid(s, "b", 20, () => 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("BID_TOO_LOW");
    const r2 = placeBid(s, "b", 35, () => 1000);
    expect(r2.ok).toBe(true);
  });

  it("deserted lot when no bids", () => {
    let s = startMatch([{id:"a",nickname:"A"},{id:"b",nickname:"B"}], "ABCD", rngSeq([0.5]), () => 1000);
    s = setReady(s, "a", true); s = setReady(s, "b", true);
    s = startGame(s, rngSeq([0.5]), () => 1000);
    s = tick(s, () => 1000 + 20000, rngSeq([0.5]));
    expect(s.phase).toBe("REVEAL");
    expect(s.currentRound!.deserted).toBe(true);
  });

  it("reveal applies money to winner", () => {
    let s = startMatch([{id:"a",nickname:"A"},{id:"b",nickname:"B"}], "ABCD", rngSeq([0.5,0.2,0.3]), () => 1000);
    s = setReady(s, "a", true); s = setReady(s, "b", true);
    s = startGame(s, rngSeq([0.5,0.2,0.3]), () => 1000);
    s = placeBid(s, "a", 10, () => 1000).state;
    s = tick(s, () => 1000 + 20000, rngSeq([0.5,0.2,0.3]));
    expect(s.phase).toBe("REVEAL");
    const before = s.players.find(p=>p.id==="a")!.money;
    s = reveal(s);
    const after = s.players.find(p=>p.id==="a")!.money;
    // money changed
    expect(after).not.toBe(1000);
  });
});

describe("anti-snipe extensions", () => {
  it("stops restarting the timer once the 3 extensions are spent", () => {
    let s = startMatch([{id:"a",nickname:"A"},{id:"b",nickname:"B"}], "ABCD", rngSeq([0.5]), () => 1000);
    s = setReady(s, "a", true); s = setReady(s, "b", true);
    s = startGame(s, rngSeq([0.5]), () => 1000);

    let r = placeBid(s, "a", 10, () => 1000);
    expect(r.ok).toBe(true);
    s = r.state;

    for (const [playerId, amount, t] of [
      ["b", 35, 11500], // inside the 3 s window -> extension 1
      ["a", 60, 23000],
      ["b", 85, 34500],
    ] as const) {
      const endsAt = s.currentRound!.auction!.endsAt;
      r = placeBid(s, playerId, amount, () => (t === 11500 ? t : endsAt - 500));
      expect(r.ok).toBe(true);
      s = r.state;
    }
    expect(s.currentRound!.auction!.extensionsUsed).toBe(CONFIG.auction.maxExtensions);

    // a fourth last-second bid is accepted but no longer moves the deadline
    const endsAt = s.currentRound!.auction!.endsAt;
    r = placeBid(s, "a", 110, () => endsAt - 500);
    expect(r.ok).toBe(true);
    expect(r.state.currentRound!.auction!.endsAt).toBe(endsAt);
    expect(r.state.currentRound!.auction!.extensionsUsed).toBe(CONFIG.auction.maxExtensions);

    // and the closed lot no longer accepts bids
    const late = placeBid(r.state, "b", 200, () => endsAt);
    expect(late.ok).toBe(false);
    expect(late.error).toBe("PHASE_INVALID");
  });
});

describe("lot generator", () => {
  it("values within band", () => {
    const { secret } = generateLot(3, rngSeq([0.1,0.2,0.3,0.4,0.5]));
    expect(secret.trueTotal).toBeGreaterThanOrEqual(150);
    expect(secret.trueTotal).toBeLessThanOrEqual(900);
  });
  it("late band higher", () => {
    const { secret } = generateLot(18, rngSeq([0.1,0.2,0.3,0.4,0.5]));
    expect(secret.trueTotal).toBeGreaterThanOrEqual(700);
  });
  it("trap pairs keep the total inside the round band", () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const round of [1, 8, 18]) {
        const band = round <= 5
          ? CONFIG.lotValueRanges.early
          : round <= 14 ? CONFIG.lotValueRanges.mid : CONFIG.lotValueRanges.late;
        const { secret } = generateLot(round, rngSeq([seed / 1000]));
        expect(secret.trueTotal).toBeGreaterThanOrEqual(band.min);
        expect(secret.trueTotal).toBeLessThanOrEqual(band.max);
      }
    }
  });
  it("object count in range", () => {
    const { public: pub } = generateLot(5, rngSeq([0.1,0.2,0.3]));
    expect(pub.objectCount).toBeGreaterThanOrEqual(2);
    expect(pub.objectCount).toBeLessThanOrEqual(5);
  });
  it("no trueValue in public", () => {
    const { public: pub } = generateLot(1, rngSeq([0.1]));
    expect((pub as any).trueValue).toBeUndefined();
    expect((pub as any).value).toBeUndefined();
  });
});

describe("roulette", () => {
  it("spin result is derived from the committed seed", () => {
    let s = startMatch([{id:"a",nickname:"A"},{id:"b",nickname:"B"}], "ABCD", rngSeq([0.5]), () => 1000);
    s = {
      ...s,
      phase: "ROULETTE",
      roulette: {
        round: 5, seed: "seed_123", windowEndsAt: 0,
        bets: [{ playerId: "a", choice: "red", amount: 10 }],
        spun: false, result: null, payouts: [],
      },
    };
    const spun = spinRoulette(s, rngSeq([0.9]), () => 1000);
    expect(spun.roulette!.result).toBe(rouletteResultFromSeed("seed_123"));
    expect(spun.roulette!.result).toBeGreaterThanOrEqual(0);
    expect(spun.roulette!.result).toBeLessThanOrEqual(36);
    // the same seed always yields the same spin, whatever the rng does
    const again = spinRoulette(s, rngSeq([0.1]), () => 1000);
    expect(again.roulette!.result).toBe(spun.roulette!.result);
  });
});
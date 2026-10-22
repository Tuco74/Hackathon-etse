import { describe, it, expect } from "vitest";
import { startMatch, setReady, startGame, placeBid, reveal } from "./match.js";
import { generateLot } from "./lotGenerator.js";

// Anti-leak: nothing sent before REVEAL may carry object values.
// The server builds S2C payloads from exactly these projections.

function rngSeq(seed = 7): () => number {
  let x = (seed >>> 0) || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

const now = () => 1000;

describe("anti-leak", () => {
  it("LotPublic carries no value fields", () => {
    for (let i = 0; i < 50; i++) {
      const { public: pub } = generateLot((i % 20) + 1, rngSeq(i + 1));
      const json = JSON.stringify(pub);
      expect(json).not.toMatch(/trueValue/);
      expect(json).not.toMatch(/trueTotal/);
      expect(json).not.toMatch(/"value"/);
      expect(Object.keys(pub).sort()).toEqual(
        ["category", "clues", "id", "objectCount", "round", "silhouettes"].sort(),
      );
    }
  });

  it("pre-reveal S2C payloads contain no object values", () => {
    let s = startMatch(
      [{ id: "a", nickname: "Ana" }, { id: "b", nickname: "Beto" }],
      "LEAK",
      rngSeq(3),
      now,
    );
    s = setReady(s, "a", true);
    s = setReady(s, "b", true);
    s = startGame(s, rngSeq(4), now);
    s = placeBid(s, "a", 500, now).state;

    const r = s.currentRound!;
    // Exactly what the server sends during ROUND_INTRO / AUCTION.
    const preRevealPayloads = [
      {
        type: "S2C_ROUND_INTRO",
        round: r.round,
        lot: r.lotPublic,
        countdownSec: 3,
      },
      {
        type: "S2C_AUCTION_STATE",
        state: {
          lotId: r.lotPublic.id,
          currentBid: r.auction!.currentBid,
          highBidderId: r.auction!.highBidderId,
          endsAt: r.auction!.endsAt,
          extensionsUsed: r.auction!.extensionsUsed,
          minNextBid: r.auction!.minNextBid,
          canBid: true,
        },
      },
    ];
    const json = JSON.stringify(preRevealPayloads);
    expect(json).not.toMatch(/trueValue/);
    expect(json).not.toMatch(/trueTotal/);
    // no secret object names either (they only appear at reveal)
    for (const obj of r.lotSecret.objects) {
      expect(json).not.toContain(obj.name);
    }

    // After REVEAL the values are allowed.
    const revealed = reveal(s);
    const revealJson = JSON.stringify(revealed.currentRound!.revealData);
    expect(revealJson).toContain('"value"');
  });

  it("secret totals exist only inside the round secret", () => {
    let s = startMatch(
      [{ id: "a", nickname: "Ana" }, { id: "b", nickname: "Beto" }],
      "LEAK",
      rngSeq(11),
      now,
    );
    s = setReady(s, "a", true);
    s = setReady(s, "b", true);
    s = startGame(s, rngSeq(12), now);
    const r = s.currentRound!;
    const publicJson = JSON.stringify(r.lotPublic);
    expect(publicJson).not.toContain(String(r.lotSecret.trueTotal));
  });
});
import { describe, expect, it } from "vitest";
import {
  betChips,
  bidDisabledReason,
  bidOptions,
  categoryLabel,
  colourLabel,
  colourSymbol,
  money,
  ordinal,
  phaseLabel,
  rouletteColour,
  seconds,
  signedMoney,
} from "./format";
import { CONFIG } from "@trastero/shared";

describe("money", () => {
  it("formats euros with Spanish thousands separator", () => {
    expect(money(0)).toBe("0 €");
    expect(money(1234)).toBe("1.234 €");
    expect(money(1234.6)).toBe("1.235 €");
  });

  it("never hides non-finite values behind a fake number", () => {
    expect(money(Number.NaN)).toBe("—");
  });
});

describe("signedMoney", () => {
  it("uses typographic minus and plus", () => {
    expect(signedMoney(320)).toBe("+320 €");
    expect(signedMoney(-80)).toBe("−80 €");
    expect(signedMoney(0)).toBe("±0 €");
  });
});

describe("seconds", () => {
  it("shows one decimal under 10 s", () => {
    expect(seconds(8400)).toBe("8,4 s");
  });

  it("rounds up whole seconds above 10 s", () => {
    expect(seconds(11_200)).toBe("12 s");
  });

  it("clamps negatives to zero", () => {
    expect(seconds(-500)).toBe("0,0 s");
  });
});

describe("bidOptions", () => {
  it("builds the ladder from the server minimum", () => {
    const options = bidOptions(250, 1000, CONFIG.auction.minIncrement);
    expect(options.map((o) => o.amount)).toEqual([250, 275, 350, 1000]);
    expect(options[3]?.kind).toBe("max");
  });

  it("does not offer an all-in below the minimum bid", () => {
    const options = bidOptions(500, 100, 25);
    expect(options.some((o) => o.kind === "max")).toBe(false);
  });
});

describe("bidDisabledReason", () => {
  const base = { phase: "AUCTION", canBid: true, isHighBidder: false, cash: 1000, amount: 250 };

  it("allows a legal bid", () => {
    expect(bidDisabledReason(base)).toBeNull();
  });

  it("explains every rejection with words, not colour", () => {
    expect(bidDisabledReason({ ...base, phase: "REVEAL" })).toBe("fuera de fase");
    expect(bidDisabledReason({ ...base, isHighBidder: true })).toBe("ya vas ganando");
    expect(bidDisabledReason({ ...base, cash: 100 })).toBe("sin fondos");
    expect(bidDisabledReason({ ...base, canBid: false })).toBe("no puedes pujar ahora");
  });
});

describe("betChips", () => {
  it("offers 10/25/50/100 % floored to 10 €", () => {
    expect(betChips(1000).map((c) => c.amount)).toEqual([100, 250, 500, 1000]);
  });

  it("deduplicates tiny banks and respects the minimum", () => {
    const chips = betChips(30).map((c) => c.amount);
    expect(new Set(chips).size).toBe(chips.length);
    expect(Math.min(...chips)).toBe(CONFIG.roulette.minBet);
  });

  it("returns nothing when the player cannot afford the minimum", () => {
    expect(betChips(5)).toEqual([]);
  });
});

describe("roulette colours", () => {
  it("maps pockets like a standard wheel", () => {
    expect(rouletteColour(0)).toBe("green");
    expect(rouletteColour(1)).toBe("red");
    expect(rouletteColour(2)).toBe("black");
    expect(rouletteColour(36)).toBe("red");
  });

  it("always pairs colour with a symbol and a label", () => {
    expect(colourSymbol("red")).not.toBe(colourSymbol("black"));
    expect(colourLabel("green")).toContain("Verde");
  });
});

describe("labels", () => {
  it("translates phases and categories", () => {
    expect(phaseLabel("AUCTION")).toBe("Subasta");
    expect(phaseLabel("GAME_OVER")).toBe("Final");
    expect(categoryLabel("collectibles")).toBe("Coleccionables");
    expect(ordinal(1)).toBe("1º");
  });
});

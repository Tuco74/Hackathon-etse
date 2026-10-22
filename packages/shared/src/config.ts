// packages/shared/src/config.ts
// Single source of truth for all tunable numbers. Nobody hardcodes these elsewhere.

export const CONFIG = {
  match: {
    minPlayers: 2,
    maxPlayers: 5,
    targetPlayers: 5,
    rounds: 20,
    startingMoney: 1000,
    currency: "EUR",
  },
  auction: {
    minBid: 10,
    minIncrement: 25,
    bidTimerSec: 12,
    maxExtensions: 3,
    antiSnipeSec: 3,
    openingBid: 0,
  },
  lot: {
    minObjects: 2,
    maxObjects: 5,
    // weight favors 3+
    objectCountWeights: [0, 0, 1, 3, 4, 5], // index = count
  },
  lotValueRanges: {
    // total value of a lot by round band
    early: { min: 150, max: 900 },   // rounds 1-5
    mid: { min: 400, max: 1800 },   // rounds 6-14
    late: { min: 700, max: 3000 },  // rounds 15-20
  },
  roulette: {
    windowSec: 20,
    minBet: 10,
    // payouts (net gain = bet * multiplier)
    redBlackMultiplier: 1,
    greenMultiplier: 35,
    houseEdgeApprox: 0.027,
  },
  reconnect: {
    seatReserveSec: 45,
  },
  client: {
    internalWidth: 480,
    internalHeight: 270,
    scaleFactors: [3, 4],
  },
  // feature flags
  features: {
    emotes: true,
    music: true,
    characterAnimations: true,
    rouletteComplexBets: true,
    particles: true,
  },
} as const;

export type Config = typeof CONFIG;

export function lotValueBand(round: number): "early" | "mid" | "late" {
  if (round <= 5) return "early";
  if (round <= 14) return "mid";
  return "late";
}
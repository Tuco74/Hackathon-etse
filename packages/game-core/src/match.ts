import { CONFIG } from "@trastero/shared";
import type { LotPublic, LotSecret } from "@trastero/shared";
import { generateLot } from "./lotGenerator.js";
import type {
  MatchState, Player, RoundState, Rng, Now, BidResult,
  RouletteBet, RoulettePhase,
} from "./types.js";

function makePlayer(id: string, nickname: string): Player {
  return {
    id, nickname, money: CONFIG.match.startingMoney, ready: false,
    connected: true, seatReservedUntil: null,
    totalLotValueWon: 0, lotsWon: 0,
  };
}

export function seededSeed(rng: Rng): string {
  // 32-bit seed as 8 hex chars; the server commits sha256(seed) before the spin.
  const hi = Math.floor(rng() * 0x10000) & 0xffff;
  const lo = Math.floor(rng() * 0x10000) & 0xffff;
  return ((hi << 16) | lo).toString(16).padStart(8, "0");
}

/** Deterministic, verifiable spin result in [0, 36]. FNV-1a over the seed. */
export function rouletteResultFromSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 37;
}

export function startMatch(
  players: { id: string; nickname: string }[],
  roomCode: string,
  rng: Rng,
  now: Now,
  tieBreakSeed = "seed",
): MatchState {
  return {
    roomCode,
    phase: "LOBBY",
    players: players.map(p => makePlayer(p.id, p.nickname)),
    round: 0,
    totalRounds: CONFIG.match.rounds,
    currentRound: null,
    roulette: null,
    pendingRouletteAfterRound: null,
    finished: false,
    winnerId: null,
    rngSeedCounter: 0,
    tieBreakSeed,
    history: [],
  };
}

export function setReady(state: MatchState, playerId: string, ready: boolean): MatchState {
  return {
    ...state,
    players: state.players.map(p => p.id === playerId ? { ...p, ready } : p),
  };
}

export function canStart(state: MatchState): boolean {
  const n = state.players.length;
  if (n < CONFIG.match.minPlayers || n > CONFIG.match.maxPlayers) return false;
  return state.players.every(p => p.ready);
}

export function startGame(state: MatchState, rng: Rng, now: Now): MatchState {
  if (!canStart(state)) return state;
  const next = { ...state, phase: "ROUND_INTRO" as const, round: 0 };
  return startRound(next, rng, now);
}

export function startRound(state: MatchState, rng: Rng, now: Now): MatchState {
  const round = state.round + 1;
  if (round > state.totalRounds) {
    return finishMatch(state);
  }
  const { public: pub, secret } = generateLot(round, rng);
  const roundState: RoundState = {
    round,
    lotPublic: pub,
    lotSecret: secret,
    auction: {
      currentBid: CONFIG.auction.openingBid,
      highBidderId: null,
      endsAt: now() + CONFIG.auction.bidTimerSec * 1000,
      extensionsUsed: 0,
      minNextBid: CONFIG.auction.minBid,
      startedAt: now(),
    },
    revealed: false,
    revealData: null,
    resolved: false,
    winnerId: null,
    winningBid: 0,
    deserted: false,
  };
  return {
    ...state,
    phase: "AUCTION",
    round,
    currentRound: roundState,
  };
}

export function minNextBid(state: MatchState): number {
  const r = state.currentRound;
  if (!r || !r.auction) return CONFIG.auction.minBid;
  const a = r.auction;
  if (a.highBidderId === null) return CONFIG.auction.minBid;
  return a.currentBid + CONFIG.auction.minIncrement;
}

export function placeBid(state: MatchState, playerId: string, amount: number, now: Now): BidResult {
  const fail = (error: string): BidResult => ({ ok: false, error, state });
  if (state.phase !== "AUCTION") return fail("PHASE_INVALID");
  const r = state.currentRound;
  if (!r || !r.auction) return fail("PHASE_INVALID");
  const a = r.auction;
  const player = state.players.find(p => p.id === playerId);
  if (!player) return fail("NOT_CONNECTED");
  if (!player.connected) return fail("NOT_CONNECTED");
  if (a.highBidderId === playerId) return fail("NOT_YOUR_TURN");
  if (amount < CONFIG.auction.minBid) return fail("BID_TOO_LOW");
  if (a.highBidderId !== null && amount < a.currentBid + CONFIG.auction.minIncrement) return fail("BID_TOO_LOW");
  if (player.money < amount) return fail("INSUFFICIENT_FUNDS");

  // Each bid restarts the 12 s timer. A bid inside the anti-snipe window only
  // restarts it while extensions remain; once the 3 are spent the lot closes
  // at the current timer (D-A07), so a last-second bid cannot loop forever.
  const nowTs = now();
  const remaining = a.endsAt - nowTs;
  if (remaining <= 0) return fail("PHASE_INVALID");

  let extensionsUsed = a.extensionsUsed;
  let endsAt = a.endsAt;
  if (remaining < CONFIG.auction.antiSnipeWindowMs) {
    if (extensionsUsed < CONFIG.auction.maxExtensions) {
      extensionsUsed += 1;
      endsAt = nowTs + CONFIG.auction.bidTimerSec * 1000;
    }
  } else {
    endsAt = nowTs + CONFIG.auction.bidTimerSec * 1000;
  }

  const newRound: RoundState = {
    ...r,
    auction: {
      ...a,
      currentBid: amount,
      highBidderId: playerId,
      endsAt,
      extensionsUsed,
      minNextBid: amount + CONFIG.auction.minIncrement,
    },
  };

  const state2: MatchState = {
    ...state,
    currentRound: newRound,
  };
  return { ok: true, state: state2 };
}

export function tick(state: MatchState, now: Now, rng: Rng): MatchState {
  if (state.phase === "AUCTION") {
    const r = state.currentRound;
    if (r && r.auction && !r.resolved) {
      if (now() >= r.auction.endsAt) {
        return resolveAuction({ ...state }, now);
      }
    }
  }
  if (state.phase === "REVEAL") {
    // auto advance? handled by server; here just return
  }
  if (state.phase === "ROULETTE" && state.roulette && !state.roulette.spun) {
    if (now() >= state.roulette.windowEndsAt) {
      return spinRoulette(state, rng, now);
    }
  }
  return state;
}

export function resolveAuction(state: MatchState, now: Now): MatchState {
  const r = state.currentRound;
  if (!r || !r.auction) return state;
  const a = r.auction;
  if (a.highBidderId === null) {
    // deserted
    const newRound: RoundState = { ...r, resolved: true, deserted: true, winnerId: null, winningBid: 0 };
    return { ...state, phase: "REVEAL", currentRound: newRound };
  }
  const winner = state.players.find(p => p.id === a.highBidderId)!;
  const newRound: RoundState = {
    ...r,
    resolved: true,
    winnerId: a.highBidderId,
    winningBid: a.currentBid,
    deserted: false,
  };
  return { ...state, phase: "REVEAL", currentRound: newRound };
}

export function reveal(state: MatchState): MatchState {
  const r = state.currentRound;
  if (!r) return state;
  const secret = r.lotSecret;
  const winnerId = r.winnerId;
  const winningBid = r.winningBid;
  const objects = secret.objects.map((o: { silhouetteId: string; name: string; trueValue: number }) => ({ silhouetteId: o.silhouetteId, name: o.name, value: o.trueValue }));
  const total = secret.trueTotal;
  let profit: number | null = null;
  if (winnerId) {
    profit = total - winningBid;
    // transfer money: winner pays bid, gains total
    const players = state.players.map(p => {
      if (p.id === winnerId) {
        return { ...p, money: p.money - winningBid + total, lotsWon: p.lotsWon + 1, totalLotValueWon: p.totalLotValueWon + total };
      }
      return p;
    });
    const newRound: RoundState = {
      ...r,
      revealed: true,
      revealData: { objects, total, winnerId, winningBid, profit },
    };
    const newState: MatchState = {
      ...state,
      players,
      currentRound: newRound,
      history: [...state.history, { round: r.round, winnerId, winningBid, total, deserted: false }],
    };
    return newState;
  }
  // deserted: no money change
  const newRound: RoundState = {
    ...r,
    revealed: true,
    revealData: { objects, total, winnerId: null, winningBid: 0, profit: null },
  };
  return {
    ...state,
    currentRound: newRound,
    history: [...state.history, { round: r.round, winnerId: null, winningBid: 0, total, deserted: true }],
  };
}

export function afterReveal(state: MatchState, rng: Rng, now: Now): MatchState {
  // decide roulette or next round
  const round = state.round;
  if (round === 5 || round === 10 || round === 15) {
    // Commit-reveal: the seed stays server-side; the server publishes sha256(seed).
    const seed = seededSeed(rng);
    const roulette: RoulettePhase = {
      round,
      seed,
      windowEndsAt: now() + CONFIG.roulette.windowSec * 1000,
      bets: [],
      passed: [],
      spun: false,
      result: null,
      payouts: [],
    };
    return { ...state, phase: "ROULETTE", roulette, pendingRouletteAfterRound: round };
  }
  if (round >= state.totalRounds) {
    return finishMatch(state);
  }
  return startRound(state, rng, now);
}

export function placeRouletteBet(state: MatchState, playerId: string, choice: "red"|"black"|"green", amount: number): { ok: boolean; error?: string; state: MatchState } {
  const fail = (error: string) => ({ ok: false, error, state });
  if (state.phase !== "ROULETTE" || !state.roulette) return fail("PHASE_INVALID");
  const rp = state.roulette;
  if (rp.spun) return fail("PHASE_INVALID");
  if (rp.passed.includes(playerId)) return fail("ALREADY_PASSED");
  if (rp.bets.some(b => b.playerId === playerId)) return fail("ALREADY_BET");
  const player = state.players.find(p => p.id === playerId);
  if (!player) return fail("NOT_CONNECTED");
  if (amount < CONFIG.roulette.minBet) return fail("BET_TOO_LOW");
  if (amount > player.money) return fail("BET_TOO_HIGH");
  const bet: RouletteBet = { playerId, choice, amount };
  const newRp: RoulettePhase = { ...rp, bets: [...rp.bets, bet] };
  return { ok: true, state: { ...state, roulette: newRp } };
}

/** A player may skip the roulette bet; it counts as decided for the spin gate. */
export function passRoulette(state: MatchState, playerId: string): { ok: boolean; error?: string; state: MatchState } {
  const fail = (error: string) => ({ ok: false, error, state });
  if (state.phase !== "ROULETTE" || !state.roulette) return fail("PHASE_INVALID");
  const rp = state.roulette;
  if (rp.spun) return fail("PHASE_INVALID");
  if (rp.bets.some(b => b.playerId === playerId)) return fail("ALREADY_BET");
  if (rp.passed.includes(playerId)) return fail("ALREADY_PASSED");
  const player = state.players.find(p => p.id === playerId);
  if (!player) return fail("NOT_CONNECTED");
  const newRp: RoulettePhase = { ...rp, passed: [...rp.passed, playerId] };
  return { ok: true, state: { ...state, roulette: newRp } };
}

/**
 * True when every connected player has decided (bet or passed). Disconnected
 * players are auto-passed by the room, so a dropped player cannot block the spin.
 */
export function canSpinRoulette(state: MatchState): boolean {
  const rp = state.roulette;
  if (!rp || rp.spun) return false;
  const connected = state.players.filter(p => p.connected);
  return connected.every(p =>
    rp.bets.some(b => b.playerId === p.id) || rp.passed.includes(p.id),
  );
}

function rouletteColor(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  // standard roulette: red numbers
  const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  return reds.has(n) ? "red" : "black";
}

export function spinRoulette(state: MatchState, _rng: Rng, now: Now = () => Date.now()): MatchState {
  if (state.phase !== "ROULETTE" || !state.roulette) return state;
  const rp = state.roulette;
  if (rp.spun) return state;
  // The seed was committed at phase start: result must be derived from it,
  // never from a fresh draw, or the commitment proves nothing.
  const seed = rp.seed ?? seededSeed(_rng);
  const result = rouletteResultFromSeed(seed);
  const payouts: RoulettePhase["payouts"] = [];
  const players = state.players.map(p => ({ ...p }));
  for (const bet of rp.bets) {
    const player = players.find(p => p.id === bet.playerId)!;
    const win = (bet.choice === "green" && result === 0) ||
                (bet.choice !== "green" && rouletteColor(result) === bet.choice && result !== 0);
    let delta = 0;
    if (win) {
      if (bet.choice === "green") delta = bet.amount * CONFIG.roulette.greenMultiplier;
      else delta = bet.amount * CONFIG.roulette.redBlackMultiplier;
    } else {
      delta = -bet.amount;
    }
    player.money += delta;
    payouts.push({ playerId: bet.playerId, delta, money: player.money });
  }
  const newRp: RoulettePhase = {
    ...rp,
    seed,
    spun: true,
    result,
    payouts,
  };
  const newState: MatchState = { ...state, players, roulette: newRp };
  // after spin, advance
  return advanceAfterRoulette(newState, _rng, now);
}

function advanceAfterRoulette(state: MatchState, rng: Rng, now: Now): MatchState {
  if (state.round >= state.totalRounds) {
    return finishMatch(state);
  }
  return startRound({ ...state, phase: "ROUND_INTRO" }, rng, now);
}

export function finishMatch(state: MatchState): MatchState {
  // tie-break: money -> totalLotValueWon -> coin flip with tieBreakSeed
  const sorted = [...state.players].sort((a, b) => {
    if (b.money !== a.money) return b.money - a.money;
    if (b.totalLotValueWon !== a.totalLotValueWon) return b.totalLotValueWon - a.totalLotValueWon;
    // coin flip seeded: compare id hash? use tieBreakSeed
    return a.id < b.id ? -1 : 1;
  });
  const winnerId = sorted.length ? (sorted[0] as Player).id : null;
  return { ...state, phase: "GAME_OVER", finished: true, winnerId };
}

export function ranking(state: MatchState) {
  return [...state.players]
    .sort((a, b) => {
      if (b.money !== a.money) return b.money - a.money;
      if (b.totalLotValueWon !== a.totalLotValueWon) return b.totalLotValueWon - a.totalLotValueWon;
      return a.id < b.id ? -1 : 1;
    })
    .map(p => ({
      playerId: p.id,
      nickname: p.nickname,
      money: p.money,
      lotsWon: p.lotsWon,
      lotValueWon: p.totalLotValueWon,
    }));
}
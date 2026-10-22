import type { LotPublic, LotSecret } from "@trastero/shared";
import { CONFIG } from "@trastero/shared";

export type Rng = () => number;
export type Now = () => number;

export interface Player {
  id: string;
  nickname: string;
  money: number;
  ready: boolean;
  connected: boolean;
  seatReservedUntil: number | null;
  totalLotValueWon: number;
  lotsWon: number;
}

export interface RoundState {
  round: number;
  lotPublic: LotPublic;
  lotSecret: LotSecret; // server only; never sent pre-reveal
  auction: {
    currentBid: number;
    highBidderId: string | null;
    endsAt: number;
    extensionsUsed: number;
    minNextBid: number;
    startedAt: number;
  } | null;
  revealed: boolean;
  revealData: {
    objects: { silhouetteId: string; name: string; value: number; category: string }[];
    total: number;
    winnerId: string | null;
    winningBid: number;
    profit: number | null;
  } | null;
  resolved: boolean;
  winnerId: string | null;
  winningBid: number;
  deserted: boolean;
}

export interface RouletteBet {
  playerId: string;
  choice: "red" | "black" | "green";
  amount: number;
}

export interface RoulettePhase {
  round: number; // after which round (5,10,15)
  seed: string | null; // secret until the spin; server publishes sha256(seed) at phase start
  windowEndsAt: number;
  bets: RouletteBet[];
  passed: string[];
  spun: boolean;
  result: number | null; // 0-36
  payouts: { playerId: string; delta: number; money: number }[];
}

export interface MatchState {
  roomCode: string;
  phase: "LOBBY" | "ROUND_INTRO" | "AUCTION" | "REVEAL" | "ROULETTE" | "GAME_OVER";
  players: Player[];
  round: number;
  totalRounds: number;
  currentRound: RoundState | null;
  roulette: RoulettePhase | null;
  pendingRouletteAfterRound: number | null;
  finished: boolean;
  winnerId: string | null;
  rngSeedCounter: number;
  tieBreakSeed: string;
  history: { round: number; winnerId: string | null; winningBid: number; total: number; deserted: boolean }[];
}

export interface BidResult {
  ok: boolean;
  error?: string;
  state: MatchState;
}

export const MAX_PLAYERS = CONFIG.match.maxPlayers;
export const MIN_PLAYERS = CONFIG.match.minPlayers;
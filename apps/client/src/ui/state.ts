// Presentation state derived exclusively from server messages.
// Nothing here decides a game outcome; it only remembers what the server said
// so the DOM can render it. Pure reducer => unit-testable without a browser.

import type {
  AuctionState,
  GamePhase,
  LotPublic,
  PlayerPublic,
  S2CMessage,
} from "@trastero/shared";
import type {
  GameOverMessage,
  RevealMessage,
  RoulettePhaseMessage,
  RouletteResultMessage,
} from "./messages";

export type UiPhase = GamePhase | "CONNECTING";

export interface RevealedObject {
  name: string;
  value: number;
}

export interface RoundReveal {
  round: number;
  winnerId: string | null;
  winningBid: number;
  total: number;
  profit: number | null;
  objects: RevealedObject[];
}

export interface MoneySnapshot {
  round: number;
  /** playerId -> money at the end of that round */
  money: Record<string, number>;
}

export interface UiState {
  phase: UiPhase;
  roomCode: string;
  round: number;
  totalRounds: number;
  players: PlayerPublic[];
  pendingNick: string | null;
  meId: string | null;
  lot: LotPublic | null;
  auction: AuctionState | null;
  reveal: RevealMessage | null;
  roulette: RoulettePhaseMessage | null;
  rouletteRound: number | null;
  rouletteResult: RouletteResultMessage | null;
  gameOver: GameOverMessage | null;
  history: RoundReveal[];
  moneyHistory: MoneySnapshot[];
  introUntil: number | null;
  lastError: { code: string; message: string; at: number } | null;
}

export function createState(pendingNick: string | null = null): UiState {
  return {
    phase: "CONNECTING",
    roomCode: "",
    round: 0,
    totalRounds: 0,
    players: [],
    pendingNick,
    meId: null,
    lot: null,
    auction: null,
    reveal: null,
    roulette: null,
    rouletteRound: null,
    rouletteResult: null,
    gameOver: null,
    history: [],
    moneyHistory: [],
    introUntil: null,
    lastError: null,
  };
}

export function joinRoom(state: UiState, nickname: string, roomCode: string): UiState {
  return { ...state, pendingNick: nickname, roomCode, phase: "CONNECTING" };
}

function resolveMe(state: UiState): string | null {
  if (state.meId) return state.meId;
  if (!state.pendingNick) return null;
  const matches = state.players.filter((p) => p.nickname === state.pendingNick);
  return matches.length > 0 ? (matches[matches.length - 1]?.id ?? null) : null;
}

function snapshotMoney(state: UiState): MoneySnapshot[] {
  if (state.round < 1 || state.players.length === 0) return state.moneyHistory;
  if (state.moneyHistory.some((s) => s.round === state.round)) return state.moneyHistory;
  const money: Record<string, number> = {};
  for (const p of state.players) money[p.id] = p.money;
  return [...state.moneyHistory, { round: state.round, money }];
}

export function reduce(state: UiState, msg: S2CMessage, now: number): UiState {
  switch (msg.type) {
    case "S2C_ROOM_STATE": {
      const next: UiState = {
        ...state,
        phase: msg.phase,
        roomCode: msg.roomCode,
        round: msg.round,
        totalRounds: msg.totalRounds,
        players: msg.players,
      };
      next.meId = resolveMe(next);
      // A new round resets the per-round overlays; room state is authoritative.
      if (msg.phase === "LOBBY" || msg.phase === "GAME_OVER") {
        next.reveal = null;
        next.roulette = null;
      }
      if (msg.phase === "ROUND_INTRO" || msg.phase === "AUCTION") {
        next.gameOver = null;
      }
      return { ...next, moneyHistory: snapshotMoney(next) };
    }

    case "S2C_ROUND_INTRO":
      return {
        ...state,
        phase: "AUCTION",
        round: msg.round,
        lot: msg.lot,
        auction: null,
        reveal: null,
        roulette: null,
        rouletteRound: null,
        rouletteResult: null,
        introUntil: now + Math.max(0, msg.countdownSec) * 1000,
      };

    case "S2C_AUCTION_STATE":
      return { ...state, phase: "AUCTION", auction: msg.state, introUntil: null };

    case "S2C_BID_EVENT": {
      if (!state.auction) return state;
      return {
        ...state,
        auction: {
          ...state.auction,
          currentBid: msg.amount,
          highBidderId: msg.playerId,
          endsAt: msg.endsAt,
          extensionsUsed: msg.extensionsUsed,
          // minNextBid and canBid are server-owned: the AUCTION_STATE that
          // follows this event carries the authoritative values.
          canBid: state.auction.highBidderId !== msg.playerId ? state.auction.canBid : false,
        },
      };
    }

    case "S2C_REVEAL": {
      const entry: RoundReveal = {
        round: state.round,
        winnerId: msg.winnerId,
        winningBid: msg.winningBid,
        total: msg.total,
        profit: msg.profit,
        objects: msg.objects.map((o) => ({ name: o.name, value: o.value })),
      };
      const history = state.history.some((h) => h.round === entry.round)
        ? state.history
        : [...state.history, entry];
      return {
        ...state,
        phase: "REVEAL",
        reveal: msg,
        auction: null,
        history,
      };
    }

    case "S2C_ROULETTE_PHASE":
      return {
        ...state,
        phase: "ROULETTE",
        roulette: msg,
        rouletteRound: state.round,
        rouletteResult: null,
        reveal: null,
      };

    case "S2C_ROULETTE_RESULT":
      return { ...state, rouletteResult: msg, roulette: null };

    case "S2C_GAME_OVER":
      return {
        ...state,
        phase: "GAME_OVER",
        gameOver: msg,
        auction: null,
        reveal: null,
        roulette: null,
      };

    case "S2C_ERROR":
      return { ...state, lastError: { code: msg.code, message: msg.message, at: now } };

    default:
      return state;
  }
}

// ---------- selectors ----------

export function me(state: UiState): PlayerPublic | null {
  return state.players.find((p) => p.id === state.meId) ?? null;
}

export function cash(state: UiState): number {
  return me(state)?.money ?? 0;
}

export function playerName(state: UiState, id: string | null): string {
  if (!id) return "Nadie";
  return state.players.find((p) => p.id === id)?.nickname ?? "?";
}

export function isHighBidder(state: UiState): boolean {
  return !!state.auction && state.auction.highBidderId !== null && state.auction.highBidderId === state.meId;
}

export function isMyLot(state: UiState): boolean {
  return !!state.reveal && state.reveal.winnerId !== null && state.reveal.winnerId === state.meId;
}

/** Best and worst lot bought by me, by net profit. */
export function myBestWorst(state: UiState): { best: RoundReveal | null; worst: RoundReveal | null } {
  const mine = state.history.filter((h) => h.winnerId !== null && h.winnerId === state.meId && h.profit !== null);
  if (mine.length === 0) return { best: null, worst: null };
  const sorted = [...mine].sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
  return { best: sorted[0] ?? null, worst: sorted[sorted.length - 1] ?? null };
}

export function allReady(state: UiState): boolean {
  return state.players.length >= 2 && state.players.every((p) => p.ready);
}

export function rankingOf(state: UiState): GameOverMessage["ranking"] {
  if (state.gameOver) return state.gameOver.ranking;
  return [...state.players]
    .sort((a, b) => b.money - a.money)
    .map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      money: p.money,
      lotsWon: 0,
      lotValueWon: 0,
    }));
}

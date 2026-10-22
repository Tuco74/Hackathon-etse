import { z } from "zod";
import { CONFIG } from "./config.js";

// ---------- envelope ----------
export const EnvelopeSchema = z.object({
  v: z.literal(1),
  type: z.string(),
  id: z.string().min(1),
  ts: z.number().int().nonnegative(),
  payload: z.unknown(),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

// ---------- phases ----------
export const GamePhase = z.enum([
  "LOBBY",
  "ROUND_INTRO",
  "AUCTION",
  "REVEAL",
  "ROULETTE",
  "GAME_OVER",
]);
export type GamePhase = z.infer<typeof GamePhase>;

export const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  LOBBY: ["ROUND_INTRO"],
  ROUND_INTRO: ["AUCTION"],
  AUCTION: ["REVEAL"],
  REVEAL: ["ROULETTE", "ROUND_INTRO", "GAME_OVER"],
  ROULETTE: ["ROUND_INTRO", "GAME_OVER"],
  GAME_OVER: [],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ---------- lot types ----------
// Public: no values, no trueValue. Server only.
export const LotPublicSchema = z.object({
  id: z.string(),
  round: z.number().int().positive(),
  objectCount: z.number().int().min(CONFIG.lot.minObjects).max(CONFIG.lot.maxObjects),
  silhouettes: z.array(z.string()), // silhouette ids
  clues: z.array(z.string()), // ambiguous hints
  category: z.string(),
});
export type LotPublic = z.infer<typeof LotPublicSchema>;

// Secret lot shape lives in ./secret.ts (server only, excluded from the client bundle).
import type { LotSecret } from "./secret.js";
export type { LotSecret, LotObjectSecret } from "./secret.js";

// ---------- player ----------
export const PlayerPublicSchema = z.object({
  id: z.string(),
  nickname: z.string().min(1).max(16),
  money: z.number().int(),
  ready: z.boolean(),
  connected: z.boolean(),
  seatReservedUntil: z.number().int().nullable().optional(),
});
export type PlayerPublic = z.infer<typeof PlayerPublicSchema>;

// ---------- auction state ----------
export const AuctionStateSchema = z.object({
  lotId: z.string(),
  currentBid: z.number().int().nonnegative(),
  highBidderId: z.string().nullable(),
  endsAt: z.number().int(), // server timestamp ms
  extensionsUsed: z.number().int().min(0).max(CONFIG.auction.maxExtensions),
  minNextBid: z.number().int().nonnegative(),
  canBid: z.boolean(), // for the receiving client hint; server authoritative
});
export type AuctionState = z.infer<typeof AuctionStateSchema>;

// ---------- errors ----------
export const ErrorCode = z.enum([
  "NOT_YOUR_TURN",
  "INSUFFICIENT_FUNDS",
  "BID_TOO_LOW",
  "PHASE_INVALID",
  "ROOM_FULL",
  "INVALID_PAYLOAD",
  "UNKNOWN_MESSAGE",
  "ALREADY_BET",
  "BET_TOO_LOW",
  "BET_TOO_HIGH",
  "NOT_CONNECTED",
  "ROOM_NOT_FOUND",
  "NOT_ALL_READY",
  "RATE_LIMITED",
  "RECONNECT_FAILED",
  "SEAT_EXPIRED",
  "NAME_TAKEN",
  "ALREADY_JOINED",
  "GAME_ALREADY_STARTED",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

// ---------- C2S messages ----------
export const C2S_JOIN = z.object({ type: z.literal("C2S_JOIN"), nickname: z.string().min(1).max(16), roomCode: z.string().min(4).max(6) });
export const C2S_RECONNECT = z.object({
  type: z.literal("C2S_RECONNECT"),
  roomCode: z.string().min(4).max(6),
  playerId: z.string().uuid(),
  token: z.string().min(16).max(128),
});
export const C2S_SET_READY = z.object({ type: z.literal("C2S_SET_READY"), ready: z.boolean() });
export const C2S_START_GAME = z.object({ type: z.literal("C2S_START_GAME") });
export const C2S_BID = z.object({ type: z.literal("C2S_BID"), amount: z.number().int().positive() });
export const C2S_ROULETTE_BET = z.object({ type: z.literal("C2S_ROULETTE_BET"), choice: z.enum(["red", "black", "green"]), amount: z.number().int().positive() });
export const C2S_EMOTE = z.object({ type: z.literal("C2S_EMOTE"), emoteId: z.number().int().min(0).max(5) });
export const C2S_PING = z.object({ type: z.literal("C2S_PING"), clientTs: z.number().int() });

export const C2SMessage = z.discriminatedUnion("type", [
  C2S_JOIN, C2S_RECONNECT, C2S_SET_READY, C2S_START_GAME, C2S_BID, C2S_ROULETTE_BET, C2S_EMOTE, C2S_PING,
]);
export type C2SMessage = z.infer<typeof C2SMessage>;

export const C2S_TYPES: ReadonlySet<string> = new Set([
  "C2S_JOIN", "C2S_RECONNECT", "C2S_SET_READY", "C2S_START_GAME",
  "C2S_BID", "C2S_ROULETTE_BET", "C2S_EMOTE", "C2S_PING",
]);

// ---------- S2C messages ----------
// Private handshake: only the receiving socket gets its playerId and token.
// Never broadcast this payload.
export const S2C_JOINED = z.object({
  type: z.literal("S2C_JOINED"),
  roomCode: z.string(),
  playerId: z.string(),
  token: z.string(),
  reconnected: z.boolean(),
});
export const S2C_ROOM_STATE = z.object({
  type: z.literal("S2C_ROOM_STATE"),
  roomCode: z.string(),
  phase: GamePhase,
  players: z.array(PlayerPublicSchema),
  round: z.number().int().nonnegative(),
  totalRounds: z.number().int(),
});
export const S2C_ROUND_INTRO = z.object({
  type: z.literal("S2C_ROUND_INTRO"),
  round: z.number().int().positive(),
  lot: LotPublicSchema,
  countdownSec: z.number().int(),
});
export const S2C_AUCTION_STATE = z.object({
  type: z.literal("S2C_AUCTION_STATE"),
  state: AuctionStateSchema,
});
export const S2C_BID_EVENT = z.object({
  type: z.literal("S2C_BID_EVENT"),
  playerId: z.string(),
  amount: z.number().int(),
  endsAt: z.number().int(),
  extensionsUsed: z.number().int(),
});
export const S2C_REVEAL = z.object({
  type: z.literal("S2C_REVEAL"),
  lotId: z.string(),
  objects: z.array(z.object({ silhouetteId: z.string(), name: z.string(), value: z.number().int() })),
  total: z.number().int(),
  winnerId: z.string().nullable(),
  winningBid: z.number().int(),
  profit: z.number().int().nullable(),
});
export const S2C_ROULETTE_PHASE = z.object({
  type: z.literal("S2C_ROULETTE_PHASE"),
  hashSeed: z.string(),
  windowSec: z.number().int(),
  players: z.array(z.object({ id: z.string(), money: z.number().int() })),
});
export const S2C_ROULETTE_RESULT = z.object({
  type: z.literal("S2C_ROULETTE_RESULT"),
  seed: z.string(),
  result: z.number().int(), // 0-36
  payouts: z.array(z.object({ playerId: z.string(), delta: z.number().int(), money: z.number().int() })),
});
export const S2C_GAME_OVER = z.object({
  type: z.literal("S2C_GAME_OVER"),
  ranking: z.array(z.object({
    playerId: z.string(),
    nickname: z.string(),
    money: z.number().int(),
    lotsWon: z.number().int(),
    lotValueWon: z.number().int(),
  })),
  winnerId: z.string(),
});
export const S2C_ERROR = z.object({
  type: z.literal("S2C_ERROR"),
  code: ErrorCode,
  message: z.string(),
  refId: z.string().optional(),
});
export const S2C_PONG = z.object({ type: z.literal("S2C_PONG"), clientTs: z.number().int(), serverTs: z.number().int() });
export const S2C_EMOTE = z.object({
  type: z.literal("S2C_EMOTE"),
  playerId: z.string(),
  emoteId: z.number().int().min(0).max(5),
});

export const S2CMessage = z.discriminatedUnion("type", [
  S2C_JOINED, S2C_ROOM_STATE, S2C_ROUND_INTRO, S2C_AUCTION_STATE, S2C_BID_EVENT,
  S2C_REVEAL, S2C_ROULETTE_PHASE, S2C_ROULETTE_RESULT, S2C_GAME_OVER,
  S2C_ERROR, S2C_PONG, S2C_EMOTE,
]);
export type S2CMessage = z.infer<typeof S2CMessage>;

export function parseC2S(raw: unknown): C2SMessage | null {
  const r = C2SMessage.safeParse(raw);
  return r.success ? r.data : null;
}
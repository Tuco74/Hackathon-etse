// The shared package exports zod schemas (values); these aliases extract the
// corresponding payload types from the discriminated union.
import type { S2CMessage } from "@trastero/shared";

export type RevealMessage = Extract<S2CMessage, { type: "S2C_REVEAL" }>;
export type RoulettePhaseMessage = Extract<S2CMessage, { type: "S2C_ROULETTE_PHASE" }>;
export type RouletteResultMessage = Extract<S2CMessage, { type: "S2C_ROULETTE_RESULT" }>;
export type GameOverMessage = Extract<S2CMessage, { type: "S2C_GAME_OVER" }>;
export type RoomStateMessage = Extract<S2CMessage, { type: "S2C_ROOM_STATE" }>;
export type AuctionStateMessage = Extract<S2CMessage, { type: "S2C_AUCTION_STATE" }>;

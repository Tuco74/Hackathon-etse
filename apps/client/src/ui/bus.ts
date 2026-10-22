// Wiring between the socket and the two consumers: the Phaser scene (through a
// window event bus, kept for compatibility) and the DOM UI (direct callback).
// State-like messages are cached so a late-booting scene can catch up.

import type { S2CMessage } from "@trastero/shared";
import type { GameSocket } from "../net/socket";

const STATE_TYPES: ReadonlySet<S2CMessage["type"]> = new Set([
  "S2C_ROOM_STATE",
  "S2C_ROUND_INTRO",
  "S2C_AUCTION_STATE",
  "S2C_REVEAL",
  "S2C_ROULETTE_PHASE",
  "S2C_ROULETTE_RESULT",
  "S2C_GAME_OVER",
]);

export function wireMessages(
  socket: GameSocket,
  onMessage: (msg: S2CMessage) => void,
): () => void {
  const latest = new Map<string, S2CMessage>();

  const unsubscribe = socket.on((msg) => {
    if (STATE_TYPES.has(msg.type)) latest.set(msg.type, msg);
    window.dispatchEvent(new CustomEvent("tw:msg", { detail: msg }));
    onMessage(msg);
  });

  const replay = (): void => {
    for (const msg of latest.values()) {
      window.dispatchEvent(new CustomEvent("tw:msg", { detail: msg }));
    }
  };
  window.addEventListener("tw:scene-ready", replay);

  return () => {
    unsubscribe();
    window.removeEventListener("tw:scene-ready", replay);
  };
}

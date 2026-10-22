# Protocolo

Sobre: `{ v: 1, type, id, ts, payload }`. Cada mensaje lleva `id` para deduplicar.

## C2S
- `C2S_JOIN` { nickname, roomCode }
- `C2S_SET_READY` { ready }
- `C2S_START_GAME` {}
- `C2S_BID` { amount }
- `C2S_ROULETTE_BET` { choice: red|black|green, amount }
- `C2S_EMOTE` { emoteId: 0..5 }
- `C2S_PING` { clientTs }

## S2C
- `S2C_ROOM_STATE` { roomCode, phase, players[], round, totalRounds }
- `S2C_ROUND_INTRO` { round, lot: LotPublic, countdownSec }
- `S2C_AUCTION_STATE` { state: AuctionState }
- `S2C_BID_EVENT` { playerId, amount, endsAt, extensionsUsed }
- `S2C_REVEAL` { lotId, objects[{silhouetteId,name,value}], total, winnerId, winningBid, profit }
- `S2C_ROULETTE_PHASE` { hashSeed, windowSec, players[{id,money}] }
- `S2C_ROULETTE_RESULT` { seed, result, payouts[{playerId,delta,money}] }
- `S2C_GAME_OVER` { ranking[], winnerId }
- `S2C_ERROR` { code, message, refId? }
- `S2C_PONG` { clientTs, serverTs }

## Transiciones de fase
LOBBY → ROUND_INTRO → AUCTION → REVEAL → (ROULETTE | ROUND_INTRO | GAME_OVER)
ROULETTE → ROUND_INTRO | GAME_OVER

## Validación
Servidor valida todo con zod; ignora mensajes desconocidos; responde S2C_ERROR sin tumbar la sala.
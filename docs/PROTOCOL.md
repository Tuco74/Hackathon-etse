# Protocolo

Sobre: `{ v: 1, type, id, ts, payload }`. Cada mensaje lleva `id` para deduplicar.

## Handshake y reconexión

1. `C2S_JOIN` `{ nickname, roomCode }` →
   `S2C_JOINED` `{ roomCode, playerId, token, reconnected: false }` (privado, solo a ese socket)
   + `S2C_ROOM_STATE` al resto de la sala.
2. Si el socket cae, el asiento se reserva **45 s**. Al volver:
   `C2S_RECONNECT` `{ roomCode, playerId, token }` →
   `S2C_JOINED` `{ ..., reconnected: true }` + snapshot de la fase actual.
3. El `token` (32 bytes en hex) **nunca** viaja en `S2C_ROOM_STATE` ni se difunde:
   solo lo recibe su dueño en `S2C_JOINED`. Sin token válido → `RECONNECT_FAILED`;
   pasados los 45 s → `SEAT_EXPIRED`.

Snapshot tras reconectar, según `phase`:

- `AUCTION` / `ROUND_INTRO`: `S2C_ROOM_STATE` + `S2C_ROUND_INTRO` + `S2C_AUCTION_STATE`
- `REVEAL`: `S2C_ROOM_STATE` + `S2C_REVEAL`
- `ROULETTE`: `S2C_ROOM_STATE` + (`S2C_ROULETTE_PHASE` | `S2C_ROULETTE_RESULT`)
- `GAME_OVER`: `S2C_ROOM_STATE` + `S2C_GAME_OVER`

## C2S
- `C2S_JOIN` { nickname, roomCode }
- `C2S_RECONNECT` { roomCode, playerId, token }
- `C2S_SET_READY` { ready }
- `C2S_START_GAME` {}
- `C2S_BID` { amount }
- `C2S_ROULETTE_BET` { choice: red|black|green, amount }
- `C2S_EMOTE` { emoteId: 0..5 }
- `C2S_PING` { clientTs }

## S2C
- `S2C_JOINED` { roomCode, playerId, token, reconnected }
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
- `S2C_EMOTE` { playerId, emoteId }

`S2C_ERROR.refId` repite el `id` del sobre que causó el error (si se pudo leer).

## Transiciones de fase
LOBBY → ROUND_INTRO → AUCTION → REVEAL → (ROULETTE | ROUND_INTRO | GAME_OVER)
ROULETTE → ROUND_INTRO | GAME_OVER

## Validación y abuso
- Todo C2S se valida con zod (sobre **y** payload). El `type` del sobre debe coincidir
  con el del payload; un tipo desconocido responde `S2C_ERROR(UNKNOWN_MESSAGE)`.
- Dedupe por `id` y conexión (ventana de 256): una retransmisión no se aplica dos veces.
- Rate limit por conexión: ráfaga de 30 mensajes, recarga 15/s → `RATE_LIMITED`.
- `maxPayload` 16 KiB; el heartbeat corta sockets mudos a los ~15 s.
- La sala nunca cae por un payload malo: se responde `S2C_ERROR` y se sigue.

Códigos: `NOT_YOUR_TURN`, `INSUFFICIENT_FUNDS`, `BID_TOO_LOW`, `PHASE_INVALID`,
`ROOM_FULL`, `INVALID_PAYLOAD`, `UNKNOWN_MESSAGE`, `ALREADY_BET`, `BET_TOO_LOW`,
`BET_TOO_HIGH`, `NOT_CONNECTED`, `ROOM_NOT_FOUND`, `NOT_ALL_READY`, `RATE_LIMITED`,
`RECONNECT_FAILED`, `SEAT_EXPIRED`, `NAME_TAKEN`, `ALREADY_JOINED`, `GAME_ALREADY_STARTED`.

## Ruleta: commit–reveal verificable
Al abrir la fase se publica `hashSeed = sha256(seed)` (64 hex). Al girar se revela `seed`
y el resultado se deriva de ella:

```
result = FNV1a32(seed) % 37        // FNV-1a de 32 bits, offset 0x811c9dc5, primo 0x01000193
```

Cualquiera puede comprobar `sha256(seed) === hashSeed` y recalcular `result` con
`rouletteResultFromSeed(seed)` de `@trastero/game-core`. El servidor no vuelve a tirar
el dado en el giro: si lo hiciera, el compromiso no probaría nada.

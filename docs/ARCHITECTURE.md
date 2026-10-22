# Arquitectura

## Capas
- packages/shared: protocolo zod, tipos, constantes, config, errores. Fuente de verdad de números.
- packages/game-core: reglas puras (sin red/disco/Math.random/Date.now). Inyecta rng y now. Única fuente de verdad de reglas.
- apps/server: `ws` rooms, timers, transporte, autorización, commit-reveal, reconexión. Orquesta game-core.
- apps/client: Phaser 3 + Vite + TS. Presentación e input. Nunca reimplementa reglas.

## Módulos del servidor
- `src/index.ts`: HTTP estático + `/healthz`, `WebSocketServer`, guards de entrada
  (parseo de sobre, dedupe, rate limit, `refId`), heartbeat, apagado limpio.
- `src/room.ts`: sala autoritativa. Único dueño del `MatchState`, de los tokens de
  reconexión y del bucle de timers. Habla con `game-core` y emite S2C.
- `src/wire.ts`: validación del sobre + payload, dedupe acotado y token bucket.
- `src/clock.ts`: reloj monótono (epoch ms) inyectable; tests usan un reloj falso.
- `src/log.ts`: logs JSON de una línea con `scope`/`event`; nunca valores de lote,
  semillas ni tokens.

## Flujo de ronda
1. Servidor: startRound → envía S2C_ROUND_INTRO con LotPublic (sin valores).
2. Subasta: clientes envían C2S_BID; servidor valida y broadcast S2C_BID_EVENT.
3. Timer server-side; al expirar → resolveAuction → reveal → S2C_REVEAL con valores.
4. Si ronda 5/10/15 → ROULETTE: publica hash(seed); ventana 20s; apuestas; spin → revela seed + resultado; payouts.
5. Avanza a siguiente ronda o GAME_OVER.

## Tiempo
Una sola fuente: `Room` recibe `now()` (por defecto el reloj monótono de `clock.ts`).
`tick()` se ejecuta cada `CONFIG.server.tickMs` y procesa expiraciones de subasta,
reserva de asientos y fin de revelado. Ningún `setTimeout` decide reglas; los timers
solo despiertan al `tick`, así que una pausa del proceso no adelanta ni retrasa fases.

## Reconexión y ciclo de vida
- `C2S_JOIN` crea `playerId` + token; el token solo se envía a ese socket.
- Al caer el socket: `connected=false` y `seatReservedUntil = now + 45 s`.
- `C2S_RECONNECT` valida token (comparación en tiempo constante), restaura el asiento y
  reenvía el snapshot de la fase. Un socket viejo que no cerró se reemplaza.
- Al expirar la reserva se invalida el token; el jugador permanece en el ranking como
  desconectado y ya no puede volver.
- Una sala sin conexiones se libera solo en LOBBY/GAME_OVER o cuando todos los asientos
  expiraron; así una partida en curso sobrevive a una caída de todos los clientes.

## Anti-fuga
Valores reales en campos privados del servidor (clase sin @type). Nunca en RoomState ni bundle. Test anti-fuga.

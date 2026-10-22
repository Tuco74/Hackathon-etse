# Arquitectura

## Capas
- packages/shared: protocolo zod, tipos, constantes, config, errores. Fuente de verdad de números.
- packages/game-core: reglas puras (sin red/disco/Math.random/Date.now). Inyecta rng y now. Única fuente de verdad de reglas.
- apps/server: Colyseus rooms, timers, transporte, autorización, commit-reveal, reconexión. Orquesta game-core.
- apps/client: Phaser 3 + Vite + TS. Presentación e input. Nunca reimplementa reglas.

## Flujo de ronda
1. Servidor: startRound → envía S2C_ROUND_INTRO con LotPublic (sin valores).
2. Subasta: clientes envían C2S_BID; servidor valida y broadcast S2C_BID_EVENT.
3. Timer server-side; al expirar → resolveAuction → reveal → S2C_REVEAL con valores.
4. Si ronda 5/10/15 → ROULETTE: publica hash(seed); ventana 20s; apuestas; spin → revela seed + resultado; payouts.
5. Avanza a siguiente ronda o GAME_OVER.

## Anti-fuga
Valores reales en campos privados del servidor (clase sin @type). Nunca en RoomState ni bundle. Test anti-fuga.
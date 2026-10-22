# Trastero Wars

Juego web multijugador en tiempo real de subastas de trasteros (estilo *Storage Wars*).
2–5 jugadores, 20 rondas, subasta ascendente, revelado y ruleta de remontada. Pixel art, UI en español.

## Arrancar en menos de 5 minutos

Requisitos: **Node 22+** y **pnpm 9+**.

```bash
pnpm install

# 1) compilar los paquetes compartidos (necesario la primera vez)
pnpm --filter @trastero/shared --filter @trastero/game-core exec tsc -b

# 2) compilar el cliente y arrancar el servidor
pnpm --filter @trastero/client run build
pnpm --filter @trastero/server run start
```

Abre <http://localhost:2567> en **dos pestañas**, usa el mismo código de sala (p. ej. `ABCD`),
pulsa *Estoy listo* en ambas y luego *Empezar partida*.

Para una partida corta de prueba: `GAME_ROUNDS=2`.

### Desarrollo con recarga

```bash
# terminal 1
pnpm --filter @trastero/server run dev

# terminal 2 (proxy de /ws hacia :2567)
pnpm --filter @trastero/client run dev
```

### Cliente sin servidor (mock)

El cliente trae una sala simulada con bots y timers reales:

```bash
pnpm --filter @trastero/client run dev
# http://localhost:5173/?mock=1        partida de 3 rondas, ruleta tras la 2
# http://localhost:5173/?mock=1&roulette=1   adelanta la ruleta a la ronda 1
```

Es solo para desarrollo/demo: los valores viven en el chunk del mock y nunca se
envían antes del revelado.

### Reconexión

Cada pestaña guarda su sesión (`{roomCode, playerId, token}`) en `sessionStorage`, así
que dos pestañas pueden ser dos jugadores distintos. Si recargas o se cae la red, el
cliente envía `C2S_RECONNECT` y recupera el mismo asiento durante **45 s**, con el
snapshot de la fase actual (subasta incluida). Pasado ese plazo el asiento se libera y
el servidor responde `SEAT_EXPIRED`.

### Ruleta

Tras las rondas **5, 10 y 15** se abre la ruleta. Elige cantidad y color, o pulsa
*Pasar*; cuando todos los jugadores han decidido se habilita **Girar ahora**. Si nadie
lo pulsa, el servidor gira sola al agotar la ventana de 20 s. El resultado y los pagos
llegan del servidor y la partida continúa en la ronda siguiente.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm exec vitest run` | Tests unitarios + anti-fuga |
| `node tools/check-leak.mjs` | Falla si el bundle del cliente filtra valores secretos |
| `node tools/smoke.mjs` | E2E por WebSocket: 2 clientes, partida completa (requiere servidor con `GAME_ROUNDS=2`) |
| `node tools/reconnect-smoke.mjs` | E2E de reconexión a mitad de subasta + payload basura (requiere servidor) |
| `node tools/balance-sim/src/sim.js` | Simulación de 1.000 partidas con bots |
| `pnpm --filter @trastero/client run build` | Build del cliente (Vite) |

## Despliegue

```bash
docker compose up --build -d
```

`docker-compose.yml` levanta la app y Caddy con TLS automático. Edita `Caddyfile` con tu dominio.

## Estructura

```
apps/client        Phaser 3 + Vite (presentación e input)
apps/server        Node + ws autoritativo (salas, timers, commit-reveal)
packages/shared    Protocolo zod, tipos, config (fuente única de números)
packages/game-core Reglas puras: subasta, economía, ruleta, generador de lotes
tools/             Smoke E2E, check anti-fuga, simulador de balance
docs/              GDD, protocolo, arquitectura, arte, balance, tickets, decisiones
```

## Principios que no se negocian

- **Servidor autoritativo**: el cliente nunca decide pujas, timers, RNG ni valores.
- **Anti-fuga**: los valores reales no salen del servidor antes del revelado. Hay un test
  unitario y un escáner del bundle que fallan si aparece `trueValue`/`trueTotal`.
- **`game-core` puro**: sin red, disco, `Math.random()` ni `Date.now()`; `rng` y `now` se inyectan.
- **Números en un solo sitio**: `packages/shared/src/config.ts`.

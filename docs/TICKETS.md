# Tickets

Estado: `[x]` hecho · `[~]` en curso · `[ ]` pendiente.
Cada ticket indica dueño, ficheros que toca y Definition of Done.

## Fase 0 — contratos y esqueleto (dueño: A)

- [x] **T0.1 Monorepo + CI + CODEOWNERS**
  Ficheros: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`,
  `.github/workflows/ci.yml`, `CODEOWNERS`.
  DoD: `main` verde con typecheck, tests, build, escáner anti-fuga, smoke E2E y docker build.

- [x] **T0.2 `packages/shared`**
  `config.ts` (todos los números), `protocol.ts` (sobre + uniones zod C2S/S2C, `GamePhase`
  y transiciones válidas, códigos de error), `secret.ts` (server-only).
  DoD: `tsc -b` sin errores; el cliente no importa `secret.ts`.

- [x] **T0.3 `packages/game-core` + tests**
  `match.ts` (startMatch, startRound, placeBid, tick, resolveAuction, reveal, afterReveal,
  placeRouletteBet, spinRoulette, finishMatch), `lotGenerator.ts` (bandas de valor, pares
  trampa, objeto gancho).
  DoD: 15 tests verdes, incluidos los 3 anti-fuga.

- [x] **T0.4 Walking skeleton**
  `apps/server` (sala autoritativa `ws`, timers, reconexión con reserva de asiento,
  commit-reveal) + `apps/client` (Phaser 3 + overlay DOM de lobby).
  DoD: `tools/smoke.mjs` completa una partida de 2 rondas con 2 clientes y hay pujas reales.

- [x] **T0.5 Documentación**
  `docs/GDD.md`, `PROTOCOL.md`, `ARCHITECTURE.md`, `ART.md`, `BALANCE.md`, `TICKETS.md`,
  `DECISIONS.md`, `README.md`.
  DoD: otra persona arranca en menos de 5 minutos siguiendo el README.

## Workstream A — core y balance (`packages/game-core`, `tools/balance-sim`)

- [x] **A1** Máquina de estados de partida como funciones puras.
- [x] **A2** Generador de lotes con pares trampa y objeto gancho.
- [x] **A3** Simulador de 1.000 partidas con 4 bots (`tools/balance-sim`).
  DoD: reporta mediana, % de lotes rentables, quiebras y duración media → `docs/BALANCE.md`.
- [~] **A4** Tests de propiedades (invariantes de dinero, determinismo por semilla).
  Falta: `fast-check` sobre 1.000 secuencias aleatorias y conservación de dinero.
- [ ] **A5** Reajustar curva de valor con los resultados del simulador (la mediana actual
  de 33.227 € indica que los bots pujan demasiado bajo).

## Workstream B — servidor (`apps/server`)

- [x] **B1** Sala, join/leave, reserva de asiento 45 s.
- [x] **B2** Timers de subasta, resolución y revelado automático.
- [x] **B3** Commit–reveal de la ruleta.
- [~] **B4** Endurecer validación: límite de mensajes por segundo y `refId` en errores.
- [ ] **B5** Tests de integración de la sala (dobles de WebSocket) además del smoke.

## Workstream C — cliente (`apps/client`)

- [x] **C1** Phaser 3 + Vite + lobby DOM + conexión WebSocket con deduplicación.
- [x] **C2** Escena de trastero, siluetas placeholder, pujas, revelado, ruleta, fin de partida.
- [ ] **C3** `net/mockServer.ts` para trabajar sin servidor (mock-first).
- [ ] **C4** Interpolación de la cuenta atrás y snap a píxel en tweens.

## Workstream D — UI/UX

- [x] **D1** Tipografía pixel con `ñ` y acentos verificada en Chromium/Firefox.
      Silkscreen OFL autoalojada (400/700) en `apps/client/src/ui/fonts/`.
- [x] **D2** Accesibilidad: nunca color como única información (formas + etiquetas).
      Ruleta con símbolo+etiqueta, ganancia/pérdida con icono+signo, foco visible,
      `aria-live`, `prefers-reduced-motion`, botones deshabilitados con motivo.
- [x] **D3** Layout legible a 1280×720 y 1920×1080 sin blur. Probado además a
      900×600; la UI es DOM en píxeles reales sobre el canvas.
- [x] **D4** Lobby completo (apodo, código, enlace, lista, listo, empezar).
- [x] **D5** HUD de subasta (dinero, ronda, fase, timer, mejor puja, atajos).
- [x] **D6** Revelado escalonado con total, pagado y neto; ruleta y ranking final
      con gráfico de evolución y mejores/peores compras.
- [x] **D7** `docs/UI.md` con pantallas, atajos, accesibilidad y límites conocidos.

## Workstream E — arte y audio

- [ ] **E1** Atlas de siluetas (12) y objetos revelados, mismo contraste para todos.
- [ ] **E2** Paleta cerrada de 32–48 colores documentada en `docs/ART.md`.
- [ ] **E3** SFX chiptune (mazo, monedas, giro) con volumen y mute persistentes.
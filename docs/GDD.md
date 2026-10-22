# GDD - Trastero Wars

## Concepto
Juego web multijugador en tiempo real de subastas de trasteros/garajes (estilo Storage Wars) para 2-5 jugadores, 20 rondas, pixel art.

## Bucle
1. Cada jugador empieza con 1.000 €.
2. Cada ronda se abre un trastero con 2-5 objetos de valor desconocido.
3. Vista previa ambigua: siluetas, polvo, cajas, iluminación. Sugiere sin confirmar.
4. Subasta ascendente en tiempo real. Ganador paga puja y suma valor de objetos.
5. Revelado: volteo de objetos con nombre y valor, total, puja, beneficio/pérdida.
6. Tras rondas 5, 10 y 15: ruleta opcional para remontar.
7. Gana quien tenga más dinero al final de la ronda 20.

## Mecánicas clave
- Sin cuentas/login, sin matchmaking, sin chat libre (emotes).
- Sin inventario persistente; objetos → dinero al revelar; historial de lotes.
- Servidor autoritativo; cliente no confiable.
- Valores reales nunca al cliente pre-revelado.

## Reglas
Ver packages/shared/src/config.ts (única fuente de verdad).
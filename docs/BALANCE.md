# Balance

Parámetros en packages/shared/src/config.ts. Lotes: valor total por banda de ronda.
- Rondas 1-5: 150-900 €
- Rondas 6-14: 400-1.800 €
- Rondas 15-20: 700-3.000 €

Objetos por lote: 2-5 (peso mayor a 3). Puja mín 10, incremento mín 25. Timer 12s, máx 3 prórrogas.

Ruleta: rojo/negro 1:1, verde 0 35:1, ventaja casa ~2.7%. Apuesta mín 10, máx todo el dinero. Ventana 20s.

Simulador headless (tools/balance-sim) ejecutado: 1.000 partidas, 4 bots. Resultados: mediana dinero final (ganador) 33.227 €, 100% lotes rentables, 0 quiebras, 20 rondas/partida. Los bots pujan bajo (incremento mínimo), lo que infla rentabilidad; ajustar agresividad de bots y/o incremento mínimo en futuras iteraciones. Números actuales en config.ts.
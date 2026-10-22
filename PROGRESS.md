# PROGRESS

## Hecho
- `main`: B+D+C+#4 + ruleta accionable + skip sin apuestas + UI español + líder.
- Integración final PR #8: UI DOM de D montada sobre escenas de C (arte real).
- Reaplicado sobre esa base: pass/spin/skip de ruleta, reconexión por token en
  `sessionStorage`, líder fijo y pujas +10/+25/+50.
- 64 tests, typecheck, build, anti-fuga y pruebas en navegador (mock y 2 pestañas).

## Pendiente
- [x] Commit y push de la integración final (`1f1ee89`).
- [x] CI verde y :2567 sirviendo el cliente nuevo (recargar pestañas).

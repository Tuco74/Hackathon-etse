# PROGRESS

## Hecho
- Integración `main` (B+D+C+#4), CI verde, servidor :2567.
- Ruleta accionable: apuesta/pase/giro con `readyToSpin`, tests y smoke.
- UTF-8: `docs/DECISIONS.md` reparado (CP850→UTF-8); sin mojibake en el repo.
- Ruleta sin apuestas: `skipped: true`, sin animación ni pausa, ronda siguiente al instante.
- UI 100% español: categorías, `compromiso`, `SONIDO ACTIVADO/SILENCIADO`, errores sin códigos en inglés.
- Líder fijo arriba: `👑 VAS GANANDO` / `👑 VA GANANDO: <nombre> · <dinero>`.
- Verificado: 64 tests, typecheck, build, anti-fuga y prueba en navegador (skip + líder).

## Pendiente
- [ ] Commit, push y merge a `main`; reiniciar :2567 con el fix.

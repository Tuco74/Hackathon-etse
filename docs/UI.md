# UI — Trastero Wars (workstream D)

Interfaz DOM sobre el canvas de Phaser. El canvas dibuja la escena (trastero y
siluetas); **todo lo legible y pulsable es HTML**, para que funcione con teclado,
lector de pantalla y cualquier tamaño de ventana sin reescalar texto.

## 1. Mapa de pantallas

| Fase del servidor | Pantalla | Fichero |
|---|---|---|
| `CONNECTING` / sin sala | Entrada: apodo + código + enlace | `ui/lobby.ts` |
| `LOBBY` | Sala de espera: código, lista, listo, empezar | `ui/lobby.ts` |
| `AUCTION` | HUD: ronda, fase, timer, jugadores, panel de puja | `ui/hud.ts` |
| `REVEAL` | Tarjeta de revelado objeto a objeto + neto | `ui/reveal.ts` |
| `ROULETTE` | Ruleta: cantidad, color, compromiso, resultado | `ui/roulette.ts` |
| `GAME_OVER` | Ranking, evolución del dinero, compras, revancha | `ui/results.ts` |

La UI **no decide reglas**. Solo pinta lo que llega en `packages/shared`. En
particular: `canBid`, `minNextBid`, `endsAt`, el resultado de la ruleta y los
valores revelados vienen del servidor. El cliente no conoce ningún valor antes
de `S2C_REVEAL`.

## 2. Reloj

`ui/clock.ts` mide el desfase con `C2S_PING`/`S2C_PONG` y lo suaviza. La cuenta
atrás se calcula como `endsAt - clock.now()`. **Los timers son del servidor**: la
UI solo interpola. El primer ping se envía después del `C2S_JOIN` (un ping antes
de unirse recibe `ROOM_NOT_FOUND` porque la conexión aún no tiene sala).

## 3. Teclado

| Tecla | Acción |
|---|---|
| `Enter` | Pujar la cantidad mínima |
| `1` `2` `3` | Mínima, +25 €, +100 € |
| `M` | Pujar todo el dinero (confirmación) |
| `R` `N` `V` | Ruleta: rojo, negro, verde |
| `?` | Ayuda y atajos |
| `Esc` | Cerrar diálogos (los resultados no se cierran: no hay a dónde volver) |

Los atajos se ignoran mientras se escribe en un campo o hay un diálogo abierto.
Los botones deshabilitados siempre explican el motivo en texto visible
(`sin fondos`, `ya vas ganando`, `fuera de fase`), no solo con color.

## 4. Accesibilidad

- Controles nativos (`button`, `input`, `dialog`) con foco visible
  (`outline` amarillo de 2 px).
- Región `aria-live` para pujas, cierre de subasta y resultado de ruleta.
- Nunca color como única información: colores de ruleta con símbolo (`◆ ● ★`) y
  etiqueta; ganancia/pérdida con icono, signo y palabra.
- `prefers-reduced-motion`: sin animación de giro, sin aparición escalonada del
  revelado, sin desplazamientos; el estado se muestra completo al instante.
- Diálogos modales con `showModal()`: foco atrapado, `Esc` cierra, `::backdrop`.
- Textos en español; el estado principal no depende del microcopy con humor.

## 5. Sistema visual

- **Fuente**: Silkscreen (OFL, `ui/fonts/`), 400 y 700, autoalojada. Incluye
  `ñ`, vocales acentuadas, `¡ ¿ €` y guiones. Caja de 8 px: tamaños 10/12/16/24/32.
- **Paleta**: solo los 46 colores de `assets/palette.json` (variables CSS en
  `styles.css`). Sombras duras, sin degradados en la UI, sin blur.
- **Paneles**: bordes de 2 px y bisel con `inset` (sin `border-radius`).
- **Iconos**: frames del atlas `ui` de E (`icon_*`, `gavel`, `wheel`, `pointer`,
  `coin_*`), importados con `?url` desde `assets/atlases/ui.png` y dibujados a
  escala 2 con `image-rendering: pixelated`. No se copia `assets/` entero al
  bundle: contiene el catálogo privado.
- **Escalado**: la UI vive en píxeles CSS reales sobre el canvas. Breakpoints:
  900 px (ruleta en columna, jugadores compactos), 720 px (panel de puja en
  rejilla, sin pistas), 700 px de alto (panel de puja compacto; en 900×600 todo
  cabe incluso con la línea de motivo visible).

## 6. Microcopy

Tono de trastero, seco y con humor, siempre subordinado al dato:

- Entrada: «Compra a ciegas. Reza en el revelado.»
- Sin pujas: «Ni un euro. El polvo está gratis.»
- Sin fondos: «No te llega el dinero. Ni para el polvo.»
- Ruleta: «La ruleta del trastero: el polvo también cotiza.»
- Puja máxima: «Si vale menos, te quedas sin remontada.»

## 7. Pruebas

- `ui/format.test.ts`: formato de dinero, escalera de pujas, motivos de
  deshabilitado, fichas de ruleta, colores/símbolos.
- `ui/state.test.ts`: identidad por apodo, lote público sin valores, pujas,
  historial sin duplicados, snapshots de dinero, error, mejores/peores compras.
- Verificación manual con Chromium (Playwright, fuera del repo): 4 clientes,
  partida de 6 rondas con ruleta, capturas a 900×600, 1280×720 y 1920×1080,
  sin errores de consola; `prefers-reduced-motion` muestra todo al instante.
- `pnpm --filter @trastero/client run build` + `node tools/check-leak.mjs` en verde.

## 8. Decisiones y límites conocidos

- **`GameScene` ya no pinta texto ni botones**: eran placeholders de C y
  duplicaban la UI. Queda como escenario (sala + siluetas).
- **Categoría en el revelado**: el generador usa una categoría por lote y el
  payload público no lleva categoría por objeto; la tarjeta usa
  `lot.category`. Los iconos de E cubren 8 categorías; `jewelry`/`art` se
  mapean a `collectibles`, `antique` a `furniture`, `misc` a `mystery`.
- **Siluetas**: el generador usa ids `s_*`, que no existen en el atlas de E
  (`sil_*`). El escenario sigue con placeholders de C hasta que se unifiquen.
- **Post-ruleta**: el servidor avanzaba la ronda sin reenviar `S2C_ROUND_INTRO`
  (se pujaba a ciegas en la ronda siguiente). Se corrigió en `room.ts`
  anunciando el lote 4 s después del resultado.
- **Sin reconexión de UI**: si cae el socket no hay reintento ni rejoin; es
  trabajo de B/C. La UI conserva el asiento vía `S2C_ROOM_STATE` cuando el
  servidor lo reenvía.

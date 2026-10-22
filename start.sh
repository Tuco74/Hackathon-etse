#!/usr/bin/env bash
# Trastero Wars — arranque local en un comando.
# Uso: ./start.sh            (http://localhost:2567)
#      PORT=8080 ./start.sh  (otro puerto)
#      SKIP_BUILD=1 ./start.sh
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-2567}"
URL="http://localhost:${PORT}"

# 1) Node 22+ (acepta una instalación local en /tmp/opencode/node)
if ! command -v node >/dev/null 2>&1; then
  if [ -x /tmp/opencode/node/bin/node ]; then
    export PATH="/tmp/opencode/node/bin:$PATH"
  else
    echo "Falta Node 22+. Instálalo desde https://nodejs.org y vuelve a ejecutar." >&2
    exit 1
  fi
fi
if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable --install-directory "$(dirname "$(command -v node)")" >/dev/null 2>&1 || true
    corepack prepare pnpm@9.15.0 --activate >/dev/null 2>&1 || true
  fi
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "Falta pnpm 9+. Ejecuta: corepack enable && corepack prepare pnpm@9.15.0 --activate" >&2
  exit 1
fi

# 2) Dependencias y compilación (idempotente)
if [ ! -d node_modules ]; then
  echo "→ Instalando dependencias…"
  pnpm install --frozen-lockfile
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "→ Compilando paquetes y cliente…"
  pnpm --filter @trastero/shared --filter @trastero/game-core exec tsc -b
  pnpm --filter @trastero/client run build >/dev/null
fi

# 3) Servidor (HTTP + WebSocket en el mismo puerto)
echo "→ Trastero Wars en ${URL}  (Ctrl+C para parar)"
(
  for _ in $(seq 1 60); do
    if command -v curl >/dev/null 2>&1; then
      curl -sf "${URL}/healthz" >/dev/null 2>&1 && break
    else
      wget -qO- "${URL}/healthz" >/dev/null 2>&1 && break
    fi
    sleep 0.25
  done
  if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${URL}" >/dev/null 2>&1 || true
  fi
) &

exec env PORT="$PORT" pnpm --filter @trastero/server run start

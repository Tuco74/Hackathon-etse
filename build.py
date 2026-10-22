#!/usr/bin/env python3
"""Regenera los prompts de prompts/ a partir de PROMPT-AGENTE.md.

Uso: python3 prompts/build.py   (desde la raíz del repo)
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "PROMPT-AGENTE.md"
OUT = ROOT / "prompts"

src = SRC.read_text(encoding="utf-8")
lines = src.splitlines(keepends=True)


def idx(pattern: str) -> int:
    for i, line in enumerate(lines):
        if re.match(pattern, line):
            return i
    raise SystemExit(f"no match: {pattern}")


s1 = idx(r"^## §1 ")
s2 = idx(r"^## §2 ")
master = "".join(lines[s1:s2]).rstrip() + "\n"

ORDER = ["A", "B", "C", "D", "E"]
blocks: dict[str, str] = {}
for k, letter in enumerate(ORDER):
    start = idx(rf"^### {letter} —")
    end = idx(rf"^### {ORDER[k + 1]} —") if k + 1 < len(ORDER) else idx(r"^## §3 ")
    blocks[letter] = "".join(lines[start:end]).rstrip() + "\n"

FIRST = """
---

## Estado actual del repo (leer antes de empezar)

El repo está **vacío**: tú eres quien ejecuta la **Fase 0** completa (§1.4) y deja el esqueleto
verde en `main`. Después continúas con tu workstream.

Antes de escribir código, dime en 10 líneas tu plan de Fase 0 y espera mi OK si algo
del alcance te parece inviable en 90 minutos.
"""

AFTER = """
---

## Estado actual del repo (leer antes de empezar)

La **Fase 0 ya está completada** en `main`: repo, monorepo, contratos en `packages/shared`,
`packages/game-core` vacío con tests base, CI verde, `CODEOWNERS` y walking skeleton.

Reglas para esta conversación:
- Trabaja en una rama `feat/<tu-workstream>-<tema>`, nunca directamente en `main`.
- **No repitas ni reescribas la Fase 0** ni el scaffold. Si algo del esqueleto no encaja, propón el cambio y documenta el motivo.
- No edites ficheros de otros workstreams (ver `CODEOWNERS`). Si los necesitas, pide el cambio.
- Antes de escribir código: lee `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md` y `docs/TICKETS.md`, y dime en 5 líneas tu plan y qué tickets vas a cerrar.
- Ejecuta `pnpm install && pnpm test` antes de tu primer commit y deja `main` verde.
"""

DOCS = {
    "A-core": ("A", "Core / arquitectura", FIRST),
    "B-servidor": ("B", "Servidor / netcode", AFTER),
    "C-cliente": ("C", "Cliente Phaser", AFTER),
    "D-ui": ("D", "UI/UX", AFTER),
    "E-arte": ("E", "Arte / contenido", AFTER),
}

INDEX = """# Prompts listos para pegar

Cada persona abre **su** fichero, copia todo el contenido y lo pega como primer mensaje
en una conversación nueva, con el directorio de trabajo = raíz del repo.

| Fichero | Quién | Pegar |
|---|---|---|
| `A-core.md` | Persona A (arquitecta) | Todo (hace Fase 0 y luego el core) |
| `B-servidor.md` | Persona B | Todo |
| `C-cliente.md` | Persona C | Todo |
| `D-ui.md` | Persona D | Todo |
| `E-arte.md` | Persona E | Todo |

**Orden:** A empieza ya. B, C y D esperan a que A anuncie «Fase 0 en main»
(y mientras montan el entorno y leen la especificación). E puede empezar en paralelo
desde el minuto 0 con la guía de arte y los sprites.

**No pegues §3 (checklist):** es para revisar `main` al final, no para el agente.

Regenerar estos ficheros tras editar `PROMPT-AGENTE.md`: `python3 prompts/build.py`
"""

OUT.mkdir(exist_ok=True)
for name, (letter, short, note) in DOCS.items():
    body = (
        f"# Prompt — Workstream {short}\n\n"
        "> Pega **todo** este fichero como primer mensaje en una conversación nueva.\n\n---\n\n"
        + master
        + "\n---\n\n## Tu workstream\n\n"
        + blocks[letter]
        + note
    )
    (OUT / f"{name}.md").write_text(body, encoding="utf-8")

(OUT / "README.md").write_text(INDEX, encoding="utf-8")
print(f"generados {len(DOCS)} prompts en {OUT}")

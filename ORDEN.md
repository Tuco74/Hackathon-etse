# Prompts listos para pegar

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

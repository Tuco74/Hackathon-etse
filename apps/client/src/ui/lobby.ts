import { allReady, me, type UiState } from "./state";
import { el, joinNames, setText, toggleClass } from "./dom";
import { note, updateNote } from "./toast";
import { money } from "./format";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomRoomCode(length = 4): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)] ?? "A";
  }
  return code;
}

export interface LobbyOptions {
  onJoin(nickname: string, roomCode: string): void;
  onReady(ready: boolean): void;
  onStart(): void;
  onCopy(code: string): void;
}

export class Lobby {
  readonly el: HTMLDivElement;

  private readonly entry: HTMLFormElement;
  private readonly nickname: HTMLInputElement;
  private readonly roomCode: HTMLInputElement;
  private readonly entryNote: HTMLParagraphElement;
  private readonly waiting: HTMLElement;
  private readonly codeLabel: HTMLElement;
  private readonly roster: HTMLUListElement;
  private readonly readyBtn: HTMLButtonElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly waitingNote: HTMLParagraphElement;
  private readonly options: LobbyOptions;

  constructor(options: LobbyOptions) {
    this.options = options;

    const nameInput = el("input", {
      cls: "input",
      attrs: {
        id: "nickname",
        name: "nickname",
        maxlength: 16,
        autocomplete: "nickname",
        placeholder: "p. ej. Marta",
        required: true,
        "aria-describedby": "entryNote",
      },
    });
    nameInput.value = localStorage.getItem("tw.nickname") ?? "";

    const roomInput = el("input", {
      cls: "input",
      attrs: {
        id: "roomCode",
        name: "roomCode",
        maxlength: 6,
        minlength: 4,
        autocomplete: "off",
        autocapitalize: "characters",
        spellcheck: "false",
        placeholder: "ABCD",
        required: true,
        "aria-describedby": "entryNote",
      },
    });
    const params = new URLSearchParams(location.search);
    roomInput.value = (params.get("room") ?? "").toUpperCase();
    roomInput.addEventListener("input", () => {
      roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });
    nameInput.addEventListener("input", () => {
      nameInput.value = nameInput.value.slice(0, 16);
    });

    this.nickname = nameInput;
    this.roomCode = roomInput;
    this.entryNote = note("Elige un apodo y un código de 4 a 6 caracteres.");
    this.entryNote.id = "entryNote";

    const surprise = el(
      "button",
      {
        cls: "btn btn--ghost",
        text: "Sorpréndeme",
        attrs: { type: "button", title: "Genera un código de sala al azar" },
        on: {
          click: () => {
            roomInput.value = randomRoomCode();
            roomInput.focus();
          },
        },
      },
    );

    const submit = el("button", {
      cls: "btn btn--primary",
      text: "Entrar en la sala",
      attrs: { type: "submit" },
    });

    this.entry = el(
      "form",
      {
        cls: "panel panel--entry",
        attrs: { novalidate: true },
        on: {
          submit: (event) => {
            event.preventDefault();
            this.submitJoin();
          },
        },
      },
      el("h1", { cls: "logo", text: "TRASTERO WARS" }),
      el("p", { cls: "tagline", text: "Compra a ciegas. Reza en el revelado." }),
      el(
        "div",
        { cls: "field" },
        el("label", { text: "Tu apodo", attrs: { for: "nickname" } }),
        nameInput,
      ),
      el(
        "div",
        { cls: "field" },
        el("label", { text: "Código de sala", attrs: { for: "roomCode" } }),
        roomInput,
        el("p", { cls: "hint", text: "4–6 caracteres. Te lo pasa quien organice la partida." }),
      ),
      el("div", { cls: "row" }, submit, surprise),
      this.entryNote,
      el("p", {
        cls: "hint hint--footer",
        text: "2–5 jugadores · 20 trasteros · ruleta cada 5 rondas",
      }),
    );

    this.codeLabel = el("strong", { cls: "roomcode__value", text: "----" });
    this.roster = el("ul", { cls: "roster", attrs: { "aria-label": "Jugadores en la sala" } });
    this.readyBtn = el("button", {
      cls: "btn btn--primary",
      text: "Estoy listo",
      attrs: { type: "button" },
      on: { click: () => this.options.onReady(this.readyBtn.dataset.ready !== "true") },
    });
    this.startBtn = el("button", {
      cls: "btn btn--gold",
      text: "Empezar la partida",
      attrs: { type: "button" },
      on: { click: () => this.options.onStart() },
    });
    this.waitingNote = note("");

    this.waiting = el(
      "section",
      { cls: "panel panel--waiting", attrs: { "aria-labelledby": "waitingTitle" } },
      el("h2", { cls: "eyebrow", text: "Sala de espera", attrs: { id: "waitingTitle" } }),
      el(
        "div",
        { cls: "roomcode" },
        el("span", { cls: "roomcode__label", text: "Código" }),
        this.codeLabel,
        el(
          "button",
          {
            cls: "btn btn--small btn--ghost",
            attrs: { type: "button" },
            on: {
              click: () => {
                const code = this.codeLabel.textContent ?? "";
                this.options.onCopy(code);
              },
            },
          },
          el("span", { text: "Copiar enlace" }),
        ),
      ),
      el("p", { cls: "hint", text: "Que cada jugador abra el enlace o escriba el código." }),
      this.roster,
      el("div", { cls: "row row--actions" }, this.readyBtn, this.startBtn),
      this.waitingNote,
    );

    this.el = el("div", { cls: "screen screen--lobby" }, this.entry, this.waiting);
    this.showEntry();
  }

  private submitJoin(): void {
    const nickname = this.nickname.value.trim();
    const code = this.roomCode.value.trim().toUpperCase();
    if (nickname.length < 1) {
      updateNote(this.entryNote, "Sin apodo no hay subasta. Escribe uno.", "error");
      this.nickname.focus();
      return;
    }
    if (code.length < 4 || code.length > 6) {
      updateNote(this.entryNote, "El código tiene entre 4 y 6 caracteres.", "error");
      this.roomCode.focus();
      return;
    }
    localStorage.setItem("tw.nickname", nickname);
    updateNote(this.entryNote, "Llamando a la puerta del trastero…");
    this.options.onJoin(nickname, code);
  }

  showEntry(message = ""): void {
    toggleClass(this.entry, "hidden", false);
    toggleClass(this.waiting, "hidden", true);
    setText(this.entryNote, message);
    this.entryNote.className = message ? "note note--error" : "note";
    this.startBtn.disabled = true;
    this.readyBtn.disabled = false;
    this.nickname.disabled = false;
    this.roomCode.disabled = false;
    const submit = this.entry.querySelector<HTMLButtonElement>("button[type=submit]");
    if (submit) submit.disabled = false;
    if (!this.nickname.value) this.nickname.focus();
  }

  showWaiting(): void {
    toggleClass(this.entry, "hidden", true);
    toggleClass(this.waiting, "hidden", false);
    this.entryNote.textContent = "";
  }

  showEntryError(message: string): void {
    this.showEntry(message);
  }

  update(state: UiState): void {
    if (!state.meId) {
      this.showEntry();
      return;
    }
    this.showWaiting();
    setText(this.codeLabel, state.roomCode || "----");

    const mePlayer = me(state);
    const ready = !!mePlayer?.ready;
    this.readyBtn.dataset.ready = String(ready);
    setText(this.readyBtn, ready ? "Quitar «listo»" : "Estoy listo");
    this.readyBtn.setAttribute("aria-pressed", String(ready));

    const pending = state.players.filter((p) => !p.ready && p.id !== state.meId);
    this.startBtn.disabled = !allReady(state);
    if (state.players.length < 2) {
      updateNote(this.waitingNote, "Falta gente: hacen falta al menos 2 jugadores.");
    } else if (!allReady(state)) {
      updateNote(
        this.waitingNote,
        pending.length > 0
          ? `Esperando a ${joinNames(pending.map((p) => p.nickname))}.`
          : "Esperando a que todos estén listos.",
      );
    } else {
      updateNote(this.waitingNote, "Todos listos. Quien quiera puede abrir el primer trastero.");
    }
    this.waitingNote.className = this.startBtn.disabled ? "note" : "note note--good";

    this.roster.replaceChildren(
      ...state.players.map((player) => {
        const isMe = player.id === state.meId;
        return el(
          "li",
          { cls: `roster__row${isMe ? " is-me" : ""}`, attrs: { "data-player-id": player.id } },
          el("span", { cls: "roster__seat", text: player.connected ? "●" : "○", attrs: { "aria-hidden": "true" } }),
          el("span", { cls: "roster__name", text: isMe ? `${player.nickname} (tú)` : player.nickname }),
          el("span", { cls: "roster__money", text: money(player.money) }),
          el("span", {
            cls: `badge ${player.ready ? "badge--good" : "badge--muted"}`,
            text: player.ready ? "LISTO" : "ESPERA",
          }),
        );
      }),
      ...(state.players.length < 2
        ? [el("li", { cls: "roster__row roster__row--ghost", text: "Aquí falta alguien. Comparte el código." })]
        : []),
    );
    this.readyBtn.disabled = false;
  }
}

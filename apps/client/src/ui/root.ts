import type { S2CMessage } from "@trastero/shared";
import type { GameSocket } from "../net/socket";
import { session } from "../game/session";
import { ServerClock } from "./clock";
import { cash, createState, joinRoom, reduce, type UiState } from "./state";
import { el } from "./dom";
import { Lobby, randomRoomCode } from "./lobby";
import { Hud } from "./hud";
import { Reveal } from "./reveal";
import { Roulette } from "./roulette";
import { Results } from "./results";
import { Toasts, friendlyError } from "./toast";
import { HelpDialog, ConfirmDialog } from "./dialogs";
import { money } from "./format";

function socketUrl(): string {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws`;
}

const SESSION_KEY = "tw.session";

interface SavedSession {
  roomCode: string;
  playerId: string;
  token: string;
}

function readSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SavedSession>;
    if (typeof s.roomCode !== "string" || typeof s.playerId !== "string" || typeof s.token !== "string") {
      return null;
    }
    return { roomCode: s.roomCode, playerId: s.playerId, token: s.token };
  } catch {
    return null;
  }
}

function saveSession(saved: SavedSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
}

function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("tw.playerId");
}

const IGNORED_ERRORS = new Set(["UNKNOWN_MESSAGE"]);

export class UiRoot {
  private state: UiState = createState();
  private readonly layer: HTMLDivElement;
  private readonly live: HTMLDivElement;
  private readonly clock: ServerClock;

  private readonly lobby: Lobby;
  private readonly hud: Hud;
  private readonly reveal: Reveal;
  private readonly roulette: Roulette;
  private readonly results: Results;
  private readonly toasts: Toasts;
  private readonly help: HelpDialog;
  private readonly confirm: ConfirmDialog;

  private raf = 0;
  private lastTick = 0;

  constructor(private readonly socket: GameSocket) {
    this.clock = new ServerClock((message) => this.socket.send(message));

    this.toasts = new Toasts();
    this.lobby = new Lobby({
      onJoin: (nickname, code) => void this.join(nickname, code),
      onReady: (ready) => this.socket.send({ type: "C2S_SET_READY", ready }),
      onStart: () => this.socket.send({ type: "C2S_START_GAME" }),
      onCopy: () => this.copyInvite(),
    });
    this.hud = new Hud({
      onBid: (amount) => this.socket.send({ type: "C2S_BID", amount }),
      onMaxBid: () => void this.maxBid(),
      onHelp: () => this.help.open(),
      onCopy: () => this.copyInvite(),
      onAnnounce: (text) => this.announce(text),
    });
    this.reveal = new Reveal();
    this.roulette = new Roulette({
      onBet: (choice, amount) => this.socket.send({ type: "C2S_ROULETTE_BET", choice, amount }),
      onPass: () => this.socket.send({ type: "C2S_ROULETTE_PASS" }),
      onSpin: () => this.socket.send({ type: "C2S_ROULETTE_SPIN" }),
      onAnnounce: (text) => this.announce(text),
    });
    this.results = new Results({
      onRematch: () => this.rematch(),
      onCopy: () => this.copyInvite(),
    });
    this.help = new HelpDialog();
    this.confirm = new ConfirmDialog();

    this.live = el("div", {
      cls: "sr-only",
      attrs: { "aria-live": "polite", "aria-atomic": "true", role: "status" },
    });

    this.layer = el(
      "div",
      { cls: "ui-layer" },
      this.lobby.el,
      this.hud.el,
      this.reveal.el,
      this.roulette.el,
      this.toasts.el,
    );
    this.hud.el.classList.add("hidden");
    this.reveal.el.classList.add("hidden");
    this.roulette.el.classList.add("hidden");
  }

  mount(parent: HTMLElement): void {
    parent.append(this.layer, this.live, this.help.el, this.confirm.el, this.results.el);
    document.addEventListener("keydown", this.onKeyDown);
    this.loop();
    void this.resumeSession();
  }

  /** Entry point for messages wired by ui/index.ts (socket + scene bus). */
  receive(message: S2CMessage): void {
    this.onMessage(message);
  }

  private onMessage(message: S2CMessage): void {
    if (message.type === "S2C_JOINED") {
      session.playerId = message.playerId;
      session.token = message.token;
      session.roomCode = message.roomCode;
      saveSession({
        roomCode: message.roomCode,
        playerId: message.playerId,
        token: message.token,
      });
      this.clock.start();
    }

    if (message.type === "S2C_PONG") {
      this.clock.onPong(message.clientTs, message.serverTs);
      return;
    }

    if (message.type === "S2C_ERROR") {
      this.onError(message.code, message.message);
    }

    const before = this.state;
    this.state = reduce(this.state, message, Date.now());
    this.apply(before);
  }

  private onError(code: string, serverMessage: string): void {
    if (IGNORED_ERRORS.has(code)) return;

    if (code === "RECONNECT_FAILED" || code === "SEAT_EXPIRED") {
      clearSession();
      session.playerId = "";
      session.token = "";
      this.state = createState();
      this.lobby.showEntryError("La sesión caducó. Vuelve a entrar.");
      this.apply(this.state);
      return;
    }

    if (code === "NAME_TAKEN" || code === "GAME_ALREADY_STARTED") {
      clearSession();
      this.state = createState();
      this.lobby.showEntryError(friendlyError(code, serverMessage));
      this.apply(this.state);
      return;
    }

    if (
      code === "ALREADY_BET" ||
      code === "ALREADY_PASSED" ||
      code === "SPIN_NOT_READY" ||
      code.startsWith("BET_")
    ) {
      this.roulette.resetPending();
    }
    this.toasts.push(friendlyError(code, serverMessage), { kind: "error" });

    const fatal = code === "ROOM_FULL" || code === "ROOM_NOT_FOUND";
    if (fatal && !this.state.meId) {
      this.state = createState();
      this.lobby.showEntryError(friendlyError(code, serverMessage));
      this.apply(this.state);
    }
  }

  private async join(nickname: string, code: string): Promise<void> {
    try {
      if (!this.socket.connected) {
        // An explicit join starts a new seat: don't let onopen resume the old one.
        clearSession();
        session.playerId = "";
        session.token = "";
        await this.socket.connect(socketUrl());
      }
      this.state = joinRoom(this.state, nickname, code);
      this.socket.send({ type: "C2S_JOIN", nickname, roomCode: code });
      // Only ping the clock once the server knows our room: a ping before the
      // join is answered with ROOM_NOT_FOUND (no room attached yet).
      this.clock.start();
      history.replaceState(null, "", `?room=${encodeURIComponent(code)}`);
    } catch {
      this.lobby.showEntryError("No se pudo conectar al servidor. ¿Está arrancado?");
    }
  }

  /** Reload/lost connection: resume the reserved seat (the socket sends C2S_RECONNECT). */
  private async resumeSession(): Promise<void> {
    const saved = readSession();
    if (!saved) return;
    const wanted = (new URLSearchParams(location.search).get("room") ?? saved.roomCode).toUpperCase();
    if (wanted !== saved.roomCode.toUpperCase()) return;

    session.playerId = saved.playerId;
    session.token = saved.token;
    session.roomCode = saved.roomCode;
    try {
      if (!this.socket.connected) await this.socket.connect(socketUrl());
      this.clock.start();
    } catch {
      clearSession();
    }
  }

  private apply(before: UiState): void {
    const state = this.state;
    const joined = state.meId !== null;
    const inLobby = state.phase === "LOBBY" || state.phase === "CONNECTING";

    const showLobby = !joined || inLobby;
    this.lobby.el.classList.toggle("hidden", !showLobby);
    this.hud.el.classList.toggle("hidden", !joined || inLobby);

    if (joined && inLobby) this.lobby.update(state);
    if (joined && !inLobby) this.hud.update(state);

    this.reveal.update(state);
    this.roulette.update(state);

    if (state.gameOver) this.results.open(state);

    if (state.phase === "GAME_OVER" && before.phase !== "GAME_OVER") this.announce("Fin de la partida.");
  }

  private announce(text: string): void {
    this.live.textContent = "";
    // Force a mutation so repeated identical announcements are read again.
    window.setTimeout(() => {
      this.live.textContent = text;
    }, 30);
  }

  private async maxBid(): Promise<void> {
    const state = this.state;
    const auction = state.auction;
    if (state.phase !== "AUCTION" || !auction) return;
    const amount = cash(state);
    if (!auction.canBid) {
      this.toasts.push(
        auction.highBidderId === state.meId
          ? "Ya vas ganando: no puedes pujarte a ti mismo."
          : "No puedes pujar en este momento.",
        { kind: "error" },
      );
      return;
    }
    if (amount < auction.minNextBid) {
      this.toasts.push("No te llega para la puja mínima. Ni para el polvo.", { kind: "error" });
      return;
    }
    const ok = await this.confirm.ask({
      title: "Pujar todo tu dinero",
      body: `Vas a pujar ${money(amount)} por un trastero que no has visto por dentro. Si vale menos, te quedas sin remontada.`,
      confirmLabel: `Pujar ${money(amount)}`,
      danger: true,
    });
    if (ok) this.socket.send({ type: "C2S_BID", amount });
  }

  private copyInvite(): void {
    const state = this.state;
    const code = state.roomCode || new URLSearchParams(location.search).get("room") || "";
    if (!code) {
      this.toasts.push("Todavía no hay código de sala.", { kind: "error" });
      return;
    }
    const url = new URL(location.href);
    url.search = `?room=${encodeURIComponent(code)}`;
    const text = url.toString();
    const done = (): void => this.toasts.push(`Enlace copiado: ${code}`, { kind: "good" });
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => this.fallbackCopy(text, code));
    } else {
      this.fallbackCopy(text, code);
    }
  }

  private fallbackCopy(text: string, code: string): void {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    this.toasts.push(ok ? `Enlace copiado: ${code}` : "Copia el código a mano, el navegador no deja.", {
      kind: ok ? "good" : "error",
    });
  }

  private rematch(): void {
    const code = randomRoomCode();
    this.results.close();
    location.href = `${location.origin}${location.pathname}?room=${code}`;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const typing =
      !!target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (typing) return;

    if (this.help.isOpen || this.confirm.el.open || this.results.el.open) return;
    if (this.state.phase === "LOBBY" || this.state.meId === null) return;

    const key = event.key.toLowerCase();

    if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
      event.preventDefault();
      this.help.open();
      return;
    }

    if (this.state.phase === "ROULETTE") {
      const colour = key === "r" ? "red" : key === "n" ? "black" : key === "v" ? "green" : null;
      if (colour) {
        event.preventDefault();
        this.roulette.quickBet(colour);
      }
      return;
    }

    if (this.state.phase !== "AUCTION") return;

    if (event.key === "Enter") {
      event.preventDefault();
      this.hud.bidByIndex(0);
    } else if (key === "1" || key === "2" || key === "3") {
      event.preventDefault();
      this.hud.bidByIndex(Number(key) - 1);
    } else if (key === "m") {
      event.preventDefault();
      void this.maxBid();
    }
  };

  private loop = (): void => {
    this.raf = window.requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const now = performance.now();
    if (now - this.lastTick < 90) return;
    this.lastTick = now;
    this.hud.tick(this.clock);
    this.roulette.tick(this.clock.now());
  };

  destroy(): void {
    window.cancelAnimationFrame(this.raf);
    document.removeEventListener("keydown", this.onKeyDown);
    this.clock.stop();
  }
}

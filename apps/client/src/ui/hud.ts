import { CONFIG, type PlayerPublic } from "@trastero/shared";
import { cash, isHighBidder, me, playerName, type UiState } from "./state";
import { el, prefersReducedMotion, setText, toggleClass } from "./dom";
import { icon } from "./icons";
import {
  bidDisabledReason,
  bidOptions,
  money,
  phaseHint,
  phaseLabel,
  seconds,
} from "./format";
import type { ServerClock } from "./clock";

export interface HudOptions {
  onBid(amount: number): void;
  onMaxBid(): void;
  onHelp(): void;
  onCopy(): void;
  onAnnounce(text: string): void;
}

export class Hud {
  readonly el: HTMLDivElement;

  private readonly roundEl: HTMLElement;
  private readonly phaseEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly timerBarEl: HTMLElement;
  private readonly roomEl: HTMLElement;
  private readonly playersEl: HTMLElement;
  private readonly lotEl: HTMLElement;
  private readonly cluesEl: HTMLElement;
  private readonly currentEl: HTMLElement;
  private readonly bidderEl: HTMLElement;
  private readonly nextEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly whyEl: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly panel: HTMLElement;
  private readonly leaderEl: HTMLElement;

  private state: UiState | null = null;
  private announcedAt: number | null = null;
  private announced: Set<number> = new Set();
  private lastHighBidder: string | null = null;

  constructor(private readonly options: HudOptions) {
    this.roundEl = el("span", { cls: "topbar__round", text: "Ronda —" });
    this.phaseEl = el("span", { cls: "chip", text: "Conectando" });
    this.timerEl = el("span", { cls: "topbar__timer-value", text: "—" });
    this.timerBarEl = el("span", { cls: "timerbar__fill" });
    this.roomEl = el("span", { cls: "topbar__room", text: "----" });

    const topbar = el(
      "header",
      { cls: "topbar" },
      el("span", { cls: "topbar__brand", text: "TRASTERO WARS" }),
      el("div", { cls: "topbar__mid" }, this.roundEl, this.phaseEl),
      el(
        "div",
        { cls: "topbar__right" },
        el("span", { cls: "topbar__timer", attrs: { "aria-hidden": "true" } },
          icon("timer", 1),
          this.timerEl,
        ),
        el("button", {
          cls: "btn btn--icon",
          text: "?",
          attrs: { type: "button", "aria-label": "Ayuda y atajos de teclado", title: "Ayuda (?)" },
          on: { click: () => this.options.onHelp() },
        }),
      ),
    );

    this.playersEl = el("ol", { cls: "players", attrs: { "aria-label": "Jugadores" } });

    this.lotEl = el("h2", { cls: "bid__lot", text: "Trastero" });
    this.cluesEl = el("p", { cls: "bid__clues", text: "" });
    this.currentEl = el("strong", { cls: "bid__amount", text: "—" });
    this.bidderEl = el("span", { cls: "bid__who", text: "" });
    this.nextEl = el("strong", { cls: "bid__next-value", text: "—" });
    this.statusEl = el("p", { cls: "bid__status", text: "", attrs: { role: "status" } });
    this.whyEl = el("p", { cls: "bid__why", text: "", attrs: { id: "bidWhy" } });

    const makeButton = (kind: "primary" | "plus" | "max"): HTMLButtonElement => {
      const button = el("button", {
        cls: `btn ${kind === "primary" ? "btn--bid" : kind === "max" ? "btn--danger" : "btn--ghost"}`,
        text: "—",
        attrs: { type: "button", "aria-describedby": "bidWhy" },
      });
      button.addEventListener("click", () => {
        if (button.dataset.amount) this.options.onBid(Number(button.dataset.amount));
      });
      this.buttons.push(button);
      return button;
    };

    const primary = makeButton("primary");
    const plus1 = makeButton("plus");
    const plus2 = makeButton("plus");

    this.panel = el(
      "section",
      { cls: "bid", attrs: { "aria-label": "Subasta del trastero" } },
      el("div", { cls: "timerbar", attrs: { "aria-hidden": "true" } }, this.timerBarEl),
      el("div", { cls: "bid__head" }, this.lotEl, this.cluesEl),
      el(
        "div",
        { cls: "bid__figures" },
        el("div", { cls: "bid__figure" }, el("span", { cls: "eyebrow", text: "Puja actual" }), this.currentEl, this.bidderEl),
        el("div", { cls: "bid__figure bid__figure--next" }, el("span", { cls: "eyebrow", text: "Siguiente mínima" }), this.nextEl),
      ),
      this.statusEl,
      el("div", { cls: "bid__actions" }, primary, plus1, plus2),
      this.whyEl,
      el("p", {
        cls: "bid__keys",
        text: "Intro puja · 1/2/3 atajos · M todo · ? ayuda",
      }),
    );

    this.leaderEl = el("div", {
      cls: "leader hidden",
      attrs: { role: "status", "aria-live": "polite" },
    });

    this.el = el(
      "div",
      { cls: "hud" },
      topbar,
      this.leaderEl,
      this.playersEl,
      this.panel,
      this.roomChip(),
    );
    this.updateRoomChip();
  }

  private roomChip(): HTMLElement {
    return el(
      "button",
      {
        cls: "roomchip",
        attrs: { type: "button", title: "Copiar el enlace de la sala" },
        on: { click: () => this.options.onCopy() },
      },
      el("span", { cls: "roomchip__label", text: "Sala" }),
      this.roomEl,
    );
  }

  private updateRoomChip(): void {
    this.roomEl.textContent = this.state?.roomCode ?? "----";
  }

  update(state: UiState): void {
    this.state = state;
    // While the roulette result is on screen the server may already have
    // advanced to the next round. Keep showing "Ruleta" until the next
    // ROUND_INTRO clears the result, otherwise the HUD contradicts the card.
    const displayPhase =
      state.rouletteResult && state.phase !== "GAME_OVER" ? "ROULETTE" : state.phase;
    const displayRound = displayPhase === "ROULETTE" && state.rouletteResult && state.rouletteRound
      ? state.rouletteRound
      : state.round;
    this.el.dataset.phase = displayPhase;
    setText(this.roundEl, displayRound > 0 ? `Ronda ${displayRound}/${state.totalRounds}` : "Ronda —");
    setText(this.phaseEl, phaseLabel(displayPhase));
    this.phaseEl.dataset.phase = displayPhase;
    this.updateRoomChip();
    this.renderPlayers(state);
    this.renderLeader(state);
    this.renderLot(state);
    this.renderBid(state);
    this.renderStatus(state);
  }

  private renderPlayers(state: UiState): void {
    const myTurnHigh = isHighBidder(state);
    const rows = state.players.map((player) => this.playerCard(state, player, myTurnHigh));
    this.playersEl.replaceChildren(...rows);
  }

  private renderLeader(state: UiState): void {
    const show =
      state.players.length > 0 && state.phase !== "LOBBY" && state.phase !== "GAME_OVER";
    toggleClass(this.leaderEl, "hidden", !show);
    if (!show) return;

    const top = state.players.reduce((best, player) =>
      player.money > best.money ? player : best,
    );
    setText(
      this.leaderEl,
      top.id === state.meId
        ? "👑 VAS GANANDO"
        : `👑 VA GANANDO: ${top.nickname} · ${money(top.money)}`,
    );
  }

  private playerCard(state: UiState, player: PlayerPublic, myTurnHigh: boolean): HTMLElement {
    const isMe = player.id === state.meId;
    const isHigh = state.auction?.highBidderId === player.id;
    const classes = [
      "player",
      isMe ? "is-me" : "",
      isHigh ? "is-high" : "",
      player.connected ? "" : "is-offline",
    ]
      .filter(Boolean)
      .join(" ");

    const badges: HTMLElement[] = [];
    if (isHigh) {
      badges.push(
        el("span", { cls: "badge badge--gold" }, icon("gavel", 1), el("span", { text: "PUJA" })),
      );
    }
    if (!player.connected) {
      badges.push(el("span", { cls: "badge badge--muted", text: "SIN CONEXIÓN" }));
    }

    const label = [
      isMe ? `${player.nickname} (tú)` : player.nickname,
      money(player.money),
      isHigh ? "mejor puja" : "",
      player.connected ? "" : "desconectado",
    ]
      .filter(Boolean)
      .join(", ");

    return el(
      "li",
      {
        cls: classes,
        attrs: { "data-player-id": player.id, "aria-label": label, title: isMe && myTurnHigh ? "Vas ganando la subasta" : undefined },
      },
      el("span", { cls: "player__name", text: isMe ? `${player.nickname} · tú` : player.nickname }),
      el("span", { cls: "player__money", text: money(player.money) }),
      ...badges,
    );
  }

  private renderLot(state: UiState): void {
    if (!state.lot) {
      setText(this.lotEl, state.phase === "LOBBY" ? "Trastero" : `Trastero ${state.round}`);
      this.cluesEl.replaceChildren();
      return;
    }
    const lotRound = state.lot.round === state.round ? state.lot.round : state.round;
    setText(this.lotEl, `Trastero ${lotRound} · ${state.lot.objectCount} objetos`);
    const hints = state.lot.clues
      .filter((clue) => !/^\d+\s+objetos?$/i.test(clue))
      .slice(0, 2);
    this.cluesEl.replaceChildren(
      ...hints.map((hint) => el("span", { cls: "clue", text: hint })),
    );
    toggleClass(this.cluesEl, "hidden", hints.length === 0);
  }

  private renderBid(state: UiState): void {
    const auction = state.auction;
    // Three buttons that add to the current bid (0 € before the first bid).
    const options = bidOptions(auction?.currentBid ?? 0);
    this.buttons.forEach((button, index) => {
      const option = options[index];
      setText(button, option?.label ?? "—");
      if (option) button.dataset.amount = String(option.amount);
      else delete button.dataset.amount;
    });

    if (!auction) {
      this.currentEl.textContent = "—";
      this.bidderEl.textContent = "";
      this.nextEl.textContent = "—";
      for (const button of this.buttons) button.disabled = true;
      return;
    }

    setText(this.currentEl, auction.currentBid > 0 ? money(auction.currentBid) : "Sin pujas");
    setText(this.bidderEl, auction.currentBid > 0 ? playerName(state, auction.highBidderId) : "Nadie ha abierto");
    setText(this.nextEl, money(auction.minNextBid));

    const whileAuction = state.phase === "AUCTION";
    this.buttons.forEach((button, index) => {
      const amount = options[index]?.amount;
      const reason = amount === undefined
        ? "no disponible"
        : bidDisabledReason({
            phase: state.phase,
            canBid: auction.canBid,
            isHighBidder: isHighBidder(state),
            cash: cash(state),
            amount,
          });
      button.disabled = !whileAuction || reason !== null;
      button.title = reason ?? `Pujar ${money(amount ?? 0)}`;
    });

    const mainReason = whileAuction
      ? bidDisabledReason({
          phase: state.phase,
          canBid: auction.canBid,
          isHighBidder: isHighBidder(state),
          cash: cash(state),
          amount: options[0]?.amount ?? 0,
        })
      : null;
    const why = !whileAuction
      ? ""
      : mainReason
        ? `No puedes pujar: ${mainReason}.`
        : "";
    setText(this.whyEl, why);
    toggleClass(this.whyEl, "hidden", why.length === 0);

    if (auction.highBidderId !== this.lastHighBidder) {
      this.lastHighBidder = auction.highBidderId;
      if (auction.highBidderId) {
        this.options.onAnnounce(
          `${playerName(state, auction.highBidderId)} va ganando con ${money(auction.currentBid)}.`,
        );
      }
    }
  }

  private renderStatus(state: UiState): void {
    let text = "";
    if (state.phase === "REVEAL" && state.reveal) {
      text = state.reveal.winnerId
        ? `Adjudicado a ${playerName(state, state.reveal.winnerId)} por ${money(state.reveal.winningBid)}.`
        : "Lote desierto: nadie ha pujado.";
    } else if (state.phase === "ROULETTE") {
      text = "La ruleta está girando. Mira el panel.";
    } else if (state.phase === "AUCTION") {
      text = phaseHint("AUCTION");
    } else if (state.phase === "ROUND_INTRO") {
      text = phaseHint("ROUND_INTRO");
    }
    setText(this.statusEl, text);
    toggleClass(this.statusEl, "hidden", text.length === 0);
  }

  /** Called from the rAF loop; only touches text nodes, never rebuilds. */
  tick(clock: ServerClock): void {
    const state = this.state;
    const auction = state?.auction;
    if (!state || !auction || state.phase !== "AUCTION") {
      setText(this.timerEl, "—");
      this.timerBarEl.style.width = "0%";
      this.announcedAt = null;
      this.announced.clear();
      return;
    }

    if (this.announcedAt !== auction.endsAt) {
      this.announcedAt = auction.endsAt;
      this.announced.clear();
    }

    const left = clock.remaining(auction.endsAt);
    setText(this.timerEl, seconds(left));
    const total = Math.max(1, CONFIG.auction.bidTimerSec * 1000);
    this.timerBarEl.style.width = `${Math.min(100, (left / total) * 100)}%`;
    toggleClass(this.panel, "is-urgent", left <= 3000 && left > 0);
    toggleClass(this.panel, "is-closed", left <= 0);
    if (prefersReducedMotion()) this.timerEl.textContent = seconds(left);

    for (const mark of [10_000, 5_000, 3_000]) {
      if (left <= mark && left > 0 && !this.announced.has(mark)) {
        this.announced.add(mark);
        this.options.onAnnounce(`Quedan ${Math.ceil(left / 1000)} segundos para cerrar la subasta.`);
      }
    }
  }

  /** Keyboard entry point (root maps keys to indices 0..3). */
  bidByIndex(index: number): void {
    const button = this.buttons[index];
    if (!button || button.disabled) return;
    const amount = Number(button.dataset.amount ?? "");
    if (Number.isFinite(amount) && amount > 0) this.options.onBid(amount);
  }

  get meId(): string | null {
    return this.state?.meId ?? null;
  }

  get isMine(): boolean {
    return !!this.state && me(this.state) !== null;
  }
}

import type { RouletteResultMessage } from "./messages";
import { CONFIG } from "@trastero/shared";
import { cash, playerName, type UiState } from "./state";
import {
  betChips,
  colourLabel,
  colourSymbol,
  money,
  rouletteColour,
  seconds,
  signedMoney,
  type RouletteColour,
} from "./format";
import { el, prefersReducedMotion, setText, toggleClass } from "./dom";
import { icon } from "./icons";

export interface RouletteOptions {
  onBet(choice: RouletteColour, amount: number): void;
  onAnnounce(text: string): void;
}

type Mode = "hidden" | "betting" | "waiting" | "result";

export class Roulette {
  readonly el: HTMLElement;

  private readonly subtitleEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly bettingPane: HTMLElement;
  private readonly waitingPane: HTMLElement;
  private readonly resultPane: HTMLElement;
  private readonly chipsEl: HTMLElement;
  private readonly amountInput: HTMLInputElement;
  private readonly whyEl: HTMLElement;
  private readonly colourButtons = new Map<RouletteColour, HTMLButtonElement>();
  private readonly passBtn: HTMLButtonElement;
  private readonly resultNumberEl: HTMLElement;
  private readonly resultColourEl: HTMLElement;
  private readonly resultDeltaEl: HTMLElement;
  private readonly payoutsEl: HTMLElement;
  private readonly hashEl: HTMLElement;
  private readonly disc: HTMLElement;
  private readonly seedEl: HTMLElement;

  private mode: Mode = "hidden";
  private amount: number = CONFIG.roulette.minBet;
  private deadline = 0;
  private phaseKey = "";
  private pending: { choice: RouletteColour; amount: number } | null = null;
  private lastResult: RouletteResultMessage | null = null;
  private state: UiState | null = null;

  constructor(private readonly options: RouletteOptions) {
    this.subtitleEl = el("p", { cls: "roulette__subtitle", text: "" });
    this.timerEl = el("span", { cls: "chip chip--timer", text: "" });
    this.chipsEl = el("div", { cls: "chips", attrs: { role: "group", "aria-label": "Cantidad a apostar" } });
    this.amountInput = el("input", {
      cls: "input input--amount",
      attrs: {
        type: "number",
        min: CONFIG.roulette.minBet,
        id: "betAmount",
        step: 10,
        inputmode: "numeric",
        "aria-label": "Cantidad exacta a apostar en euros",
      },
    });
    this.amountInput.addEventListener("input", () => {
      const value = Number(this.amountInput.value);
      if (Number.isFinite(value)) this.setAmount(value);
    });
    this.whyEl = el("p", { cls: "roulette__why", text: "", attrs: { "aria-live": "polite" } });

    const colours: RouletteColour[] = ["red", "black", "green"];
    const colourRow = el("div", { cls: "roulette__colours" });
    for (const colour of colours) {
      const button = el(
        "button",
        {
          cls: `btn btn--colour btn--${colour}`,
          attrs: { type: "button", "aria-label": `${colourLabel(colour)}, paga ${colour === "green" ? "35 a 1" : "1 a 1"}` },
          on: { click: () => this.placeBet(colour) },
        },
        el("span", { cls: "btn__symbol", text: colourSymbol(colour), attrs: { "aria-hidden": "true" } }),
        el("span", { cls: "btn__colourlabel", text: colourLabel(colour) }),
        el("span", { cls: "btn__odds", text: colour === "green" ? "35:1" : "1:1" }),
      );
      this.colourButtons.set(colour, button);
      colourRow.append(button);
    }

    this.passBtn = el("button", {
      cls: "btn btn--ghost btn--small",
      text: "Pasar de la ruleta",
      attrs: { type: "button" },
      on: { click: () => this.pass() },
    });

    this.bettingPane = el(
      "div",
      { cls: "roulette__betting" },
      el("p", { cls: "eyebrow", text: "1 · Elige cuánto" }),
      this.chipsEl,
      el("div", { cls: "field field--inline" }, el("label", { text: "Cantidad", attrs: { for: "betAmount" } }), this.amountInput),
      el("p", { cls: "eyebrow", text: "2 · Elige el color" }),
      colourRow,
      this.whyEl,
      this.passBtn,
    );

    const changeMind = el("button", {
      cls: "btn btn--ghost btn--small",
      text: "Cambiar de idea",
      attrs: { type: "button" },
      on: {
        click: () => {
          if (!this.pending && this.deadline > Date.now()) this.setMode("betting");
        },
      },
    });
    this.waitingPane = el(
      "div",
      { cls: "roulette__waiting" },
      icon("pointer", 3),
      el("p", { cls: "roulette__waiting-text", text: "" }),
      changeMind,
      el("p", { cls: "hint", text: "La apuesta no se puede cambiar una vez enviada." }),
    );

    this.resultNumberEl = el("strong", { cls: "roulette__number", text: "—" });
    this.resultColourEl = el("span", { cls: "chip", text: "" });
    this.resultDeltaEl = el("p", { cls: "roulette__delta", text: "" });
    this.payoutsEl = el("ul", { cls: "roulette__payouts" });
    this.seedEl = el("p", { cls: "hash hash--revealed", text: "" });
    this.resultPane = el(
      "div",
      { cls: "roulette__result" },
      el("p", { cls: "eyebrow", text: "Ha salido" }),
      el("div", { cls: "roulette__resulthead" }, this.resultNumberEl, this.resultColourEl),
      this.resultDeltaEl,
      this.payoutsEl,
      this.seedEl,
    );

    this.disc = icon("wheel", 2);
    this.disc.classList.add("roulette__disc");
    const pointer = icon("pointer", 2);
    pointer.classList.add("roulette__pointer");

    this.hashEl = el("p", { cls: "hash", text: "" });

    this.el = el(
      "section",
      {
        cls: "stagecard roulette",
        attrs: { "aria-labelledby": "rouletteTitle", "aria-live": "polite" },
      },
      el("p", { cls: "eyebrow", text: "Ruleta" }),
      el(
        "div",
        { cls: "roulette__head" },
        el("h2", { cls: "roulette__title", text: "La ruleta del trastero", attrs: { id: "rouletteTitle" } }),
        this.timerEl,
      ),
      this.subtitleEl,
      el("div", { cls: "roulette__body" }, el("div", { cls: "roulette__wheel" }, this.disc, pointer), el("div", { cls: "roulette__pane" }, this.bettingPane, this.waitingPane, this.resultPane)),
      this.hashEl,
    );

    this.setMode("hidden");
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    toggleClass(this.el, "hidden", mode === "hidden");
    toggleClass(this.bettingPane, "hidden", mode !== "betting");
    toggleClass(this.waitingPane, "hidden", mode !== "waiting");
    toggleClass(this.resultPane, "hidden", mode !== "result");
  }

  private availableCash(): number {
    return this.state ? cash(this.state) : 0;
  }

  private setAmount(value: number): void {
    const top = this.availableCash();
    const rounded = Math.floor(Math.max(0, value) / 10) * 10;
    const ceiling = top >= CONFIG.roulette.minBet ? top : CONFIG.roulette.minBet;
    this.amount = Math.max(CONFIG.roulette.minBet, Math.min(ceiling, rounded || CONFIG.roulette.minBet));
    this.amountInput.value = String(this.amount);
    this.refreshAffordability();
  }

  private refreshAffordability(): void {
    const top = this.availableCash();
    const unaffordable = top < CONFIG.roulette.minBet || this.amount > top || this.amount < CONFIG.roulette.minBet;
    for (const button of this.colourButtons.values()) button.disabled = unaffordable;
    this.amountInput.max = String(Math.max(0, top));
    let why = "";
    if (top < CONFIG.roulette.minBet) why = "No te queda dinero para apostar. El polvo es gratis.";
    else if (this.amount > top) why = "Esa cantidad no la tienes.";
    else if (this.amount < CONFIG.roulette.minBet) why = `La apuesta mínima son ${money(CONFIG.roulette.minBet)}.`;
    setText(this.whyEl, why);
    toggleClass(this.whyEl, "hidden", why.length === 0);
  }

  private placeBet(choice: RouletteColour): void {
    if (this.mode !== "betting") return;
    this.pending = { choice, amount: this.amount };
    setText(
      this.waitingPane.querySelector(".roulette__waiting-text") as HTMLElement,
      `Has apostado ${money(this.amount)} al ${colourLabel(choice).toLowerCase()}. Esperando el giro…`,
    );
    this.setMode("waiting");
    this.options.onBet(choice, this.amount);
    this.options.onAnnounce(`Apuesta de ${money(this.amount)} al ${colourLabel(choice).toLowerCase()}.`);
  }

  private pass(): void {
    this.pending = null;
    setText(this.whyEl, "Te quedas fuera de la ruleta. Prudente.");
    toggleClass(this.whyEl, "hidden", false);
    this.setMode("waiting");
    setText(
      this.waitingPane.querySelector(".roulette__waiting-text") as HTMLElement,
      "Has pasado. Otros están tentando a la suerte.",
    );
  }

  /** Keyboard shortcut entry point (r / n / v). */
  quickBet(choice: RouletteColour): void {
    if (this.mode === "betting") this.placeBet(choice);
  }

  /** Root calls this when the server rejects a bet so the panel is usable again. */
  resetPending(): void {
    if (this.state?.phase !== "ROULETTE") return;
    this.pending = null;
    this.setMode("betting");
  }

  update(state: UiState): void {
    this.state = state;

    if (state.gameOver) {
      this.setMode("hidden");
      this.phaseKey = "";
      return;
    }

    if (state.phase !== "ROULETTE" && !state.rouletteResult) {
      this.setMode("hidden");
      this.phaseKey = "";
      return;
    }

    // Result can arrive when the match has already advanced; keep it visible.
    if (state.rouletteResult) {
      if (state.rouletteResult !== this.lastResult) {
        this.lastResult = state.rouletteResult;
        this.renderResult(state, state.rouletteResult);
      }
      this.setMode("result");
      return;
    }

    const phase = state.roulette;
    if (!phase) {
      this.setMode("hidden");
      return;
    }

    const key = `${state.round}:${phase.hashSeed}`;
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      this.pending = null;
      this.lastResult = null;
      this.deadline = Date.now() + phase.windowSec * 1000;
      setText(this.subtitleEl, `Tras la ronda ${state.round}. Apuesta, o mira cómo se arruinan los demás.`);
      this.setAmount(Math.max(CONFIG.roulette.minBet, this.defaultAmount(state)));
      this.buildChips(state);
      this.refreshAffordability();
      this.setMode("betting");
    }
    setText(this.hashEl, `Compromiso del giro: ${phase.hashSeed.slice(0, 16)}…`);
    this.hashEl.title = phase.hashSeed;
  }

  private defaultAmount(state: UiState): number {
    const top = cash(state);
    return Math.max(CONFIG.roulette.minBet, Math.floor((top * 25) / 100 / 10) * 10);
  }

  private buildChips(state: UiState): void {
    const chips = betChips(cash(state));
    if (chips.length === 0) {
      this.chipsEl.replaceChildren(el("p", { cls: "hint", text: "Sin dinero para apostar." }));
      return;
    }
    this.chipsEl.replaceChildren(
      ...chips.map((chip) =>
        el("button", {
          cls: "chip chip--chip",
          text: `${chip.label} · ${money(chip.amount)}`,
          attrs: { type: "button", "aria-pressed": "false", "data-amount": chip.amount },
          on: {
            click: (event) => {
              this.setAmount(chip.amount);
              this.syncChips(event.currentTarget as HTMLElement);
            },
          },
        }),
      ),
    );
    this.syncChips();
  }

  private syncChips(active?: HTMLElement): void {
    const buttons = Array.from(this.chipsEl.querySelectorAll<HTMLElement>("[data-amount]"));
    for (const button of buttons) {
      const amount = Number(button.dataset.amount);
      const isActive = active ? button === active : amount === this.amount;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  private renderResult(state: UiState, result: RouletteResultMessage): void {
    const colour = rouletteColour(result.result);
    setText(this.timerEl, "");
    setText(this.resultNumberEl, String(result.result));
    this.resultColourEl.className = `chip chip--${colour}`;
    this.resultColourEl.replaceChildren(
      el("span", { cls: "btn__symbol", text: colourSymbol(colour), attrs: { "aria-hidden": "true" } }),
      el("span", { text: colourLabel(colour) }),
    );

    const myId = state.meId;
    const mine = myId ? result.payouts.find((p) => p.playerId === myId) : undefined;
    if (this.pending) {
      setText(
        this.resultDeltaEl,
        mine
          ? `Tu apuesta: ${signedMoney(mine.delta)}. Saldo: ${money(mine.money)}.`
          : "Tu apuesta no aparece. Cosas del polvo.",
      );
      toggleClass(this.resultDeltaEl, "is-loss", !!mine && mine.delta < 0);
      toggleClass(this.resultDeltaEl, "is-gain", !!mine && mine.delta >= 0);
      this.options.onAnnounce(
        mine
          ? `Ruleta: ${result.result}, ${colourLabel(colour)}. ${mine.delta >= 0 ? "Ganas" : "Pierdes"} ${money(Math.abs(mine.delta))}.`
          : `Ruleta: ${result.result}, ${colourLabel(colour)}.`,
      );
    } else {
      setText(this.resultDeltaEl, `No apostaste. Ha salido el ${result.result}, ${colourLabel(colour).toLowerCase()}.`);
      this.resultDeltaEl.className = "roulette__delta";
    }

    this.payoutsEl.replaceChildren(
      ...result.payouts.map((payout) =>
        el(
          "li",
          { cls: `payout ${payout.delta >= 0 ? "is-gain" : "is-loss"}` },
          el("span", { cls: "payout__name", text: playerName(state, payout.playerId) }),
          el("span", { cls: "payout__delta", text: signedMoney(payout.delta) }),
          el("span", { cls: "payout__money", text: money(payout.money) }),
        ),
      ),
      ...(result.payouts.length === 0
        ? [el("li", { cls: "payout payout--empty", text: "Nadie se atrevió a apostar. Respetable." })]
        : []),
    );
    setText(this.seedEl, `Semilla revelada: ${result.seed.slice(0, 24)}…`);
    this.seedEl.title = result.seed;

    this.spin(result.result);
  }

  private spin(result: number): void {
    if (prefersReducedMotion()) return;
    const target = 360 * 4 + (result / 37) * 360;
    this.disc.style.transition = "none";
    this.disc.style.transform = "rotate(0deg)";
    void this.disc.offsetWidth; // restart the animation
    this.disc.style.transition = "transform 2.4s steps(37, end)";
    this.disc.style.transform = `rotate(${target}deg)`;
  }

  tick(now: number): void {
    if ((this.mode !== "betting" && this.mode !== "waiting") || this.deadline === 0) return;
    const left = Math.max(0, this.deadline - now);
    setText(this.timerEl, seconds(left));
    toggleClass(this.timerEl, "is-urgent", left <= 5000);
    if (left <= 0) {
      for (const button of this.colourButtons.values()) button.disabled = true;
      this.passBtn.disabled = true;
      setText(this.whyEl, "Apuestas cerradas. La bola ya está rodando.");
      toggleClass(this.whyEl, "hidden", false);
    }
  }
}

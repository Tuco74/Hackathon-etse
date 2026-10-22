import { isMyLot, playerName, type UiState } from "./state";
import { categoryLabel, money, signedMoney } from "./format";
import { el, prefersReducedMotion, setText, toggleClass } from "./dom";
import { categoryIcon, icon } from "./icons";

const ITEM_DELAY_MS = 420;
const FIRST_DELAY_MS = 220;

export class Reveal {
  readonly el: HTMLElement;

  private readonly titleEl: HTMLElement;
  private readonly winnerEl: HTMLElement;
  private readonly itemsEl: HTMLUListElement;
  private readonly totalEl: HTMLElement;
  private readonly paidEl: HTMLElement;
  private readonly netEl: HTMLElement;
  private readonly netLabelEl: HTMLElement;
  private readonly netValueEl: HTMLElement;
  private readonly summaryEl: HTMLElement;

  private timers: number[] = [];
  private lastKey = "";

  constructor() {
    this.titleEl = el("h2", { cls: "reveal__title", text: "Se enciende la luz", attrs: { id: "revealTitle" } });
    this.winnerEl = el("p", { cls: "reveal__winner", text: "" });
    this.itemsEl = el("ul", { cls: "reveal__items", attrs: { "aria-label": "Objetos del trastero" } });
    this.totalEl = el("strong", { text: "—" });
    this.paidEl = el("strong", { text: "—" });
    this.netLabelEl = el("span", { cls: "eyebrow", text: "NETO" });
    this.netValueEl = el("strong", { text: "—" });
    this.netEl = el(
      "div",
      { cls: "reveal__net" },
      icon("profit", 2),
      el("div", { cls: "reveal__nettext" }, this.netLabelEl, this.netValueEl),
    );
    this.summaryEl = el(
      "div",
      { cls: "reveal__summary" },
      el("div", { cls: "reveal__stat" }, el("span", { cls: "eyebrow", text: "VALOR TOTAL" }), this.totalEl),
      el("div", { cls: "reveal__stat" }, el("span", { cls: "eyebrow", text: "PAGADO" }), this.paidEl),
      this.netEl,
    );

    this.el = el(
      "section",
      {
        cls: "stagecard reveal",
        attrs: { "aria-labelledby": "revealTitle", "aria-live": "polite" },
      },
      el("p", { cls: "eyebrow", text: "Revelado" }),
      this.titleEl,
      this.winnerEl,
      this.itemsEl,
      this.summaryEl,
    );
  }

  private clearTimers(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
  }

  update(state: UiState): void {
    const reveal = state.reveal;
    if (!reveal) {
      this.clearTimers();
      this.lastKey = "";
      toggleClass(this.el, "hidden", true);
      return;
    }
    toggleClass(this.el, "hidden", false);

    const key = `${state.round}:${reveal.lotId}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.clearTimers();

    const reduced = prefersReducedMotion();
    const mine = isMyLot(state);
    const winner = reveal.winnerId ? playerName(state, reveal.winnerId) : null;

    setText(this.titleEl, mine ? "¡Es tuyo!" : winner ? `Se lo lleva ${winner}` : "Nadie ha pujado");
    setText(
      this.winnerEl,
      winner
        ? `${winner} paga ${money(reveal.winningBid)} por el lote.`
        : "El trastero vuelve a la oscuridad. El polvo sigue gratis.",
    );
    toggleClass(this.winnerEl, "is-mine", mine);

    this.itemsEl.replaceChildren(
      ...reveal.objects.map((object) => {
        // The generator builds every lot from one category; the public lot
        // carries it, so the reveal can label each object without leaking
        // per-object values or names.
        const category = state.lot?.category ?? "misc";
        return el(
          "li",
          { cls: `reveal__item${reduced ? " is-shown" : ""}` },
          categoryIcon(category, 2),
          el(
            "div",
            { cls: "reveal__itemtext" },
            el("span", { cls: "reveal__name", text: object.name }),
            el("span", { cls: "reveal__cat", text: categoryLabel(category) }),
          ),
          el("strong", { cls: "reveal__value", text: money(object.value) }),
        );
      }),
    );

    setText(this.totalEl, money(reveal.total));
    setText(this.paidEl, reveal.winnerId ? money(reveal.winningBid) : "0 €");

    const profit = reveal.profit;
    const positive = (profit ?? 0) >= 0;
    setText(this.netLabelEl, profit === null ? "NETO" : positive ? "GANANCIA" : "PÉRDIDA");
    setText(this.netValueEl, profit === null ? "—" : signedMoney(profit));
    this.netEl.className = `reveal__net ${profit === null ? "is-neutral" : positive ? "is-gain" : "is-loss"}`;
    const netIcon = this.netEl.querySelector<HTMLElement>(".icon");
    if (netIcon) netIcon.replaceWith(icon(profit !== null && profit < 0 ? "loss" : "profit", 2));

    this.summaryEl.classList.remove("is-shown");
    if (!reduced) {
      const items = Array.from(this.itemsEl.children) as HTMLElement[];
      items.forEach((item, index) => {
        const timer = window.setTimeout(() => {
          item.classList.add("is-shown");
        }, FIRST_DELAY_MS + index * ITEM_DELAY_MS);
        this.timers.push(timer);
      });
      const summaryTimer = window.setTimeout(() => {
        this.summaryEl.classList.add("is-shown");
      }, FIRST_DELAY_MS + items.length * ITEM_DELAY_MS);
      this.timers.push(summaryTimer);
    } else {
      this.summaryEl.classList.add("is-shown");
    }

    toggleClass(this.el, "is-loss", profit !== null && profit < 0);
    toggleClass(this.el, "is-gain", profit !== null && profit > 0);
  }
}

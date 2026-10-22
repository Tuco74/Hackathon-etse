import type { GameOverMessage } from "./messages";
import { money, ordinal, signedMoney } from "./format";
import { myBestWorst, type RoundReveal, type UiState } from "./state";
import { el, prefersReducedMotion, setText } from "./dom";
import { icon } from "./icons";

export interface ResultsOptions {
  onRematch(): void;
  onCopy(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

const PLAYER_COLOURS = ["#f0d27a", "#7fb6dd", "#8fcf74", "#e35d68", "#b07ac4"];

export class Results {
  readonly el: HTMLDialogElement;

  private readonly rankingEl: HTMLTableSectionElement;
  private readonly championEl: HTMLElement;
  private readonly chartEl: HTMLElement;
  private readonly bestEl: HTMLElement;
  private readonly worstEl: HTMLElement;
  private readonly copyBtn: HTMLButtonElement;

  constructor(private readonly options: ResultsOptions) {
    this.championEl = el("h2", { cls: "results__champion", text: "" });
    this.rankingEl = el("tbody");
    this.chartEl = el("div", { cls: "results__chart" });
    this.bestEl = el("div", { cls: "buy buy--best" });
    this.worstEl = el("div", { cls: "buy buy--worst" });
    this.copyBtn = el("button", {
      cls: "btn btn--ghost",
      text: "Copiar código",
      attrs: { type: "button" },
      on: { click: () => this.options.onCopy() },
    });

    this.el = el(
      "dialog",
      { cls: "dialog dialog--results", attrs: { "aria-labelledby": "resultsTitle" } },
      el(
        "div",
        { cls: "dialog__body" },
        el("p", { cls: "eyebrow", text: "Fin de la partida" }),
        el("h2", { cls: "results__title", text: "Se cierra el trastero", attrs: { id: "resultsTitle" } }),
        this.championEl,
        el(
          "table",
          { cls: "ranking" },
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", { text: "Puesto", attrs: { scope: "col" } }),
              el("th", { text: "Jugador", attrs: { scope: "col" } }),
              el("th", { text: "Dinero", attrs: { scope: "col" } }),
              el("th", { text: "Lotes", attrs: { scope: "col" } }),
              el("th", { text: "Valor comprado", attrs: { scope: "col" } }),
            ),
          ),
          this.rankingEl,
        ),
        el("h3", { cls: "eyebrow", text: "Evolución del dinero" }),
        this.chartEl,
        el(
          "div",
          { cls: "results__buys" },
          el("h3", { cls: "eyebrow", text: "Tus compras" }),
          this.bestEl,
          this.worstEl,
        ),
        el(
          "div",
          { cls: "row row--actions" },
          el("button", {
            cls: "btn btn--gold",
            text: "Revancha en otra sala",
            attrs: { type: "button" },
            on: { click: () => this.options.onRematch() },
          }),
          this.copyBtn,
        ),
        el("p", {
          cls: "hint",
          text: "La revancha abre una sala nueva con otro código: pásalo al grupo.",
        }),
      ),
    );

    // The match is over: closing the dialog would leave no way forward.
    this.el.addEventListener("cancel", (event) => event.preventDefault());
  }

  open(state: UiState): void {
    if (!state.gameOver) return;
    const game = state.gameOver;
    this.renderChampion(state, game);
    this.renderRanking(state, game);
    this.renderChart(state);
    this.renderPurchases(state);
    if (!this.el.open) this.el.showModal();
    // Focus the dialog itself (not the first button): focusing the bottom
    // action would scroll the ranking out of view on short screens.
    this.el.setAttribute("tabindex", "-1");
    this.el.focus({ preventScroll: true });
    if (prefersReducedMotion()) this.el.classList.add("is-static");
  }

  close(): void {
    if (this.el.open) this.el.close();
  }

  private renderChampion(state: UiState, game: GameOverMessage): void {
    const winner = game.ranking.find((r) => r.playerId === game.winnerId);
    const mine = winner?.playerId === state.meId;
    this.championEl.replaceChildren(
      icon("gavel", 3),
      el("span", {
        text: mine
          ? `Ganas tú con ${money(winner?.money ?? 0)}`
          : `Gana ${winner?.nickname ?? "?"} con ${money(winner?.money ?? 0)}`,
      }),
    );
    this.championEl.classList.toggle("is-mine", mine);
  }

  private renderRanking(state: UiState, game: GameOverMessage): void {
    this.rankingEl.replaceChildren(
      ...game.ranking.map((row, index) => {
        const isMe = row.playerId === state.meId;
        return el(
          "tr",
          { cls: isMe ? "is-me" : "" },
          el("td", { cls: "ranking__pos", text: ordinal(index + 1) }),
          el("td", { text: isMe ? `${row.nickname} (tú)` : row.nickname }),
          el("td", { cls: "ranking__money", text: money(row.money) }),
          el("td", { text: String(row.lotsWon) }),
          el("td", { text: money(row.lotValueWon) }),
        );
      }),
    );
  }

  private renderPurchases(state: UiState): void {
    const { best, worst } = myBestWorst(state);
    this.bestEl.replaceChildren(...this.buyRows(best, "Mejor compra"));
    this.worstEl.replaceChildren(...this.buyRows(worst, "Peor compra"));
  }

  private buyRows(entry: RoundReveal | null, label: string): HTMLElement[] {
    if (!entry) {
      return [el("p", { cls: "buy__empty", text: "No compraste ningún trastero. Digno de estudio." })];
    }
    const positive = (entry.profit ?? 0) >= 0;
    return [
      el("p", { cls: "buy__label", text: `${label} · trastero ${entry.round}` }),
      el(
        "p",
        { cls: `buy__value ${positive ? "is-gain" : "is-loss"}` },
        icon(positive ? "profit" : "loss", 2),
        el("span", { text: signedMoney(entry.profit ?? 0) }),
      ),
      el("p", {
        cls: "buy__detail",
        text: `Pagaste ${money(entry.winningBid)} y valía ${money(entry.total)}.`,
      }),
    ];
  }

  private renderChart(state: UiState): void {
    this.chartEl.replaceChildren();
    const history = state.moneyHistory;
    if (history.length < 2) {
      this.chartEl.append(el("p", { cls: "hint", text: "Partida demasiado corta para dibujar la evolución." }));
      return;
    }

    const players = state.players;
    const values = history.flatMap((snapshot) => Object.values(snapshot.money));
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = Math.max(50, Math.round((rawMax - rawMin) * 0.12));
    const min = Math.max(0, rawMin - padding);
    const max = rawMax + padding;
    const span = Math.max(1, max - min);
    const w = 360;
    const h = 120;
    const pad = 10;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Evolución del dinero de cada jugador por ronda");
    svg.classList.add("chart");

    for (const [index, player] of players.entries()) {
      const colour = PLAYER_COLOURS[index % PLAYER_COLOURS.length] ?? "#cfc9d9";
      const points = history
        .map((snapshot, i) => {
          const value = snapshot.money[player.id] ?? 0;
          const x = pad + (history.length === 1 ? 0 : (i / (history.length - 1)) * (w - pad * 2));
          const y = h - pad - ((value - min) / span) * (h - pad * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");

      const line = document.createElementNS(SVG_NS, "polyline");
      line.setAttribute("points", points);
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", colour);
      line.setAttribute("stroke-width", player.id === state.meId ? "3" : "2");
      line.setAttribute("stroke-linejoin", "miter");
      line.setAttribute("opacity", player.id === state.meId ? "1" : "0.75");
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${player.nickname}: ${money(player.money)}`;
      line.append(title);
      svg.append(line);
    }

    this.chartEl.append(
      svg,
      el(
        "ul",
        { cls: "legend" },
        ...players.map((player, index) =>
          el(
            "li",
            { cls: "legend__item" },
            el("span", {
              cls: "legend__swatch",
              style: { background: PLAYER_COLOURS[index % PLAYER_COLOURS.length] ?? "#cfc9d9" },
            }),
            el("span", {
              text: player.id === state.meId ? `${player.nickname} (tú)` : player.nickname,
            }),
          ),
        ),
      ),
    );
  }
}

// Pure presentation helpers. No rules live here: every number that decides a
// game outcome comes from the server (canBid, minNextBid, money...). These
// helpers only format and lay out that data, which keeps them unit-testable.

import { CONFIG } from "@trastero/shared";

// Spanish CLDR only groups from 5 digits (1234 -> "1234"), which is hard to
// scan in a bidding game. de-DE groups every three digits with the same dot
// separator, so the result reads like Spanish: 1.234 €.
const eur = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

/** 1234 -> "1.234 €" */
export function money(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${eur.format(Math.round(value))} €`;
}

/** -80 -> "−80 €", 80 -> "+80 €", 0 -> "±0 €" */
export function signedMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  return `${sign}${eur.format(Math.abs(rounded))} €`;
}

/** Milliseconds -> "8,4 s" (one decimal below 10 s, whole seconds above). */
export function seconds(ms: number): string {
  const clamped = Math.max(0, ms);
  const s = clamped / 1000;
  if (s >= 10) return `${Math.ceil(s)} s`;
  return `${s.toFixed(1).replace(".", ",")} s`;
}

export function ordinal(position: number): string {
  return `${position}º`;
}

export function phaseLabel(phase: string): string {
  switch (phase) {
    case "LOBBY":
      return "Sala de espera";
    case "ROUND_INTRO":
      return "Abriendo trastero";
    case "AUCTION":
      return "Subasta";
    case "REVEAL":
      return "Revelado";
    case "ROULETTE":
      return "Ruleta";
    case "GAME_OVER":
      return "Final";
    default:
      return "Conectando";
  }
}

export function phaseHint(phase: string): string {
  switch (phase) {
    case "LOBBY":
      return "Todos listos para abrir el primer trastero.";
    case "ROUND_INTRO":
      return "La puerta chirría. Todavía no se ve nada.";
    case "AUCTION":
      return "Puja alto, paga a ciegas.";
    case "REVEAL":
      return "Se enciende la luz. Momento de la verdad.";
    case "ROULETTE":
      return "La ruleta del trastero: el polvo también cotiza.";
    case "GAME_OVER":
      return "Se cierra el trastero. Cuenta el dinero.";
    default:
      return "Buscando el trastero…";
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  electronics: "Electrónica",
  tools: "Herramientas",
  furniture: "Muebles",
  collectibles: "Coleccionables",
  clothing: "Ropa",
  sports: "Deportes",
  kitchen: "Cocina",
  mystery: "Misterio",
  jewelry: "Joyas",
  art: "Arte",
  antique: "Antigüedades",
  misc: "Miscelánea",
  mixed: "Surtido",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export interface BidOption {
  readonly amount: number;
  readonly label: string;
  readonly kind: "primary" | "plus";
}

/** Steps requested for the auction bar: three buttons that add to the bid. */
export const BID_DELTAS = [10, 25, 50] as const;

/**
 * Three quick bids relative to the current bid. With no bids yet (0 €) they
 * open at 10/25/50 €; with a 100 € bid they offer 110/125/150 €.
 * Amounts above the player's cash are still rendered (disabled + reason) so
 * the player understands why they cannot press them.
 */
export function bidOptions(
  currentBid: number,
  deltas: readonly number[] = BID_DELTAS,
): BidOption[] {
  const base = Math.max(0, Math.round(currentBid));
  return deltas.map((delta, index) => ({
    amount: base + delta,
    label: `+${money(delta)}`,
    kind: index === 0 ? "primary" : "plus",
  }));
}

export interface BidGate {
  phase: string;
  canBid: boolean;
  isHighBidder: boolean;
  cash: number;
  amount: number;
}

/** Human reason why a bid button is disabled, or null when it is allowed. */
export function bidDisabledReason(gate: BidGate): string | null {
  if (gate.phase !== "AUCTION") return "fuera de fase";
  if (gate.isHighBidder) return "ya vas ganando";
  if (gate.cash < gate.amount) return "sin fondos";
  if (!gate.canBid) return "no puedes pujar ahora";
  return null;
}

export interface BetChip {
  readonly label: string;
  readonly amount: number;
}

/** Percentage chips for the roulette, floored to 10 € and deduplicated. */
export function betChips(cash: number): BetChip[] {
  const usable = Math.max(0, Math.round(cash));
  if (usable < CONFIG.roulette.minBet) return [];
  const seen = new Set<number>();
  const chips: BetChip[] = [];
  for (const pct of [10, 25, 50, 100] as const) {
    const raw = Math.floor((usable * pct) / 100 / 10) * 10;
    const amount = Math.min(usable, Math.max(CONFIG.roulette.minBet, raw));
    if (seen.has(amount)) continue;
    seen.add(amount);
    chips.push({ label: pct === 100 ? "Todo" : `${pct} %`, amount });
  }
  return chips;
}

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type RouletteColour = "red" | "black" | "green";

/** Presentation only: which pocket colour a number belongs to. */
export function rouletteColour(result: number): RouletteColour {
  if (result === 0) return "green";
  return RED_NUMBERS.has(result) ? "red" : "black";
}

export function colourLabel(colour: RouletteColour): string {
  return colour === "red" ? "Rojo" : colour === "black" ? "Negro" : "Verde (0)";
}

export function colourSymbol(colour: RouletteColour): string {
  // Shape, not only colour: the symbol survives colour-blindness.
  return colour === "red" ? "◆" : colour === "black" ? "●" : "★";
}

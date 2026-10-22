import { el, setText } from "./dom";
import { icon } from "./icons";
import type { ErrorCode } from "@trastero/shared";

export type ToastKind = "info" | "error" | "good";

export interface ToastOptions {
  kind?: ToastKind;
  /** ms on screen; errors stay a bit longer */
  ttl?: number;
}

export class Toasts {
  readonly el: HTMLDivElement;

  constructor() {
    this.el = el("div", {
      cls: "toasts",
      attrs: { role: "status", "aria-live": "polite", "aria-atomic": "false" },
    });
  }

  push(message: string, options: ToastOptions = {}): void {
    const kind = options.kind ?? "info";
    const ttl = options.ttl ?? (kind === "error" ? 5200 : 3200);
    const node = el(
      "div",
      { cls: `toast toast--${kind}`, attrs: { role: kind === "error" ? "alert" : "status" } },
      icon(kind === "good" ? "profit" : kind === "error" ? "loss" : "gavel", 2),
      el("span", { cls: "toast__text", text: message }),
    );
    this.el.append(node);
    window.setTimeout(() => {
      node.classList.add("is-leaving");
      window.setTimeout(() => node.remove(), 220);
    }, ttl);
  }

  clear(): void {
    this.el.replaceChildren();
  }
}

const ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  ROOM_FULL: "Sala llena: 5 trasteros, 5 humanos. Prueba otro código.",
  ROOM_NOT_FOUND: "Ese código no existe. Revisa las letras.",
  NOT_ALL_READY: "Todavía falta gente por dar el visto bueno.",
  INSUFFICIENT_FUNDS: "No te llega el dinero. Ni para el polvo.",
  BID_TOO_LOW: "Alguien ha pujado más. Sube el tiro.",
  PHASE_INVALID: "Ese momento ya pasó.",
  ALREADY_BET: "Ya has apostado en esta ronda. La codicia es así.",
  BET_TOO_LOW: "La apuesta mínima son 10 €.",
  BET_TOO_HIGH: "No puedes apostar dinero que no tienes.",
  INVALID_PAYLOAD: "El servidor no entendió ese botón. Prueba otra vez.",
  NOT_CONNECTED: "Conexión perdida con el trastero.",
};

export function friendlyError(code: string, serverMessage: string): string {
  const known = ERROR_TEXT[code as ErrorCode];
  if (known) return known;
  if (serverMessage && serverMessage.trim().length > 0) return serverMessage;
  return "Algo ha crujido en el trastero. Inténtalo otra vez.";
}

/** Small reusable inline message line (form validation, empty states…). */
export function note(text: string, kind: "info" | "error" = "info"): HTMLParagraphElement {
  const node = el("p", { cls: `note note--${kind}`, text });
  if (kind === "error") node.setAttribute("role", "alert");
  return node;
}

export function updateNote(node: HTMLElement, text: string, kind: "info" | "error" = "info"): void {
  setText(node, text);
  node.className = `note note--${kind}`;
}

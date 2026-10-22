import { el } from "./dom";

/** Accessible modal for the rules / keyboard map. */
export class HelpDialog {
  readonly el: HTMLDialogElement;

  constructor() {
    const close = el("button", {
      cls: "btn btn--gold",
      text: "Entendido",
      attrs: { type: "button" },
      on: { click: () => this.close() },
    });

    this.el = el(
      "dialog",
      { cls: "dialog", attrs: { "aria-labelledby": "helpTitle" } },
      el(
        "div",
        { cls: "dialog__body" },
        el("p", { cls: "eyebrow", text: "Ayuda" }),
        el("h2", { text: "Cómo se juega", attrs: { id: "helpTitle" } }),
        el(
          "ul",
          { cls: "rules" },
          el("li", { text: "20 trasteros. Empiezas con 1.000 €. Gana quien acabe con más dinero." }),
          el("li", { text: "Solo ves siluetas y pistas ambiguas: el valor se descubre al revelar." }),
          el("li", { text: "Si ganas la subasta, pagas tu puja y sumas el valor real del lote." }),
          el("li", { text: "Nadie puja, nadie gana: el trastero se queda con el polvo." }),
          el("li", { text: "Tras las rondas 5, 10 y 15 hay ruleta opcional. Es la vía de remontar… o de hundirte." }),
          el("li", { text: "Rojo y negro pagan 1:1. El verde (0) paga 35:1." }),
        ),
        el("h3", { cls: "eyebrow", text: "Atajos" }),
        el(
          "dl",
          { cls: "keys" },
          el("dt", { text: "Enter" }),
          el("dd", { text: "Pujar la cantidad mínima" }),
          el("dt", { text: "1 / 2 / 3" }),
          el("dd", { text: "Sumar +10 €, +25 € o +50 € a la puja actual" }),
          el("dt", { text: "M" }),
          el("dd", { text: "Pujar todo tu dinero (pide confirmación)" }),
          el("dt", { text: "R / N / V" }),
          el("dd", { text: "En la ruleta: rojo, negro o verde" }),
          el("dt", { text: "?" }),
          el("dd", { text: "Abrir esta ayuda" }),
          el("dt", { text: "Esc" }),
          el("dd", { text: "Cerrar ventanas" }),
        ),
        el("p", {
          cls: "hint",
          text: "Los timers y el azar viven en el servidor: la interfaz solo los muestra.",
        }),
        el("div", { cls: "row row--actions" }, close),
      ),
    );

    this.el.addEventListener("click", (event) => {
      if (event.target === this.el) this.close();
    });
  }

  open(): void {
    if (!this.el.open) this.el.showModal();
    this.el.querySelector<HTMLButtonElement>("button")?.focus();
  }

  close(): void {
    if (this.el.open) this.el.close();
  }

  get isOpen(): boolean {
    return this.el.open;
  }
}

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** Promise-based confirmation dialog. Esc / cancel resolve to false. */
export class ConfirmDialog {
  readonly el: HTMLDialogElement;
  private resolve: ((ok: boolean) => void) | null = null;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly confirmBtn: HTMLButtonElement;
  private readonly cancelBtn: HTMLButtonElement;

  constructor() {
    this.titleEl = el("h2", { text: "", attrs: { id: "confirmTitle" } });
    this.bodyEl = el("p", { cls: "dialog__text", text: "" });
    this.confirmBtn = el("button", {
      cls: "btn btn--danger",
      text: "Confirmar",
      attrs: { type: "button" },
      on: { click: () => this.finish(true) },
    });
    this.cancelBtn = el("button", {
      cls: "btn btn--ghost",
      text: "Cancelar",
      attrs: { type: "button" },
      on: { click: () => this.finish(false) },
    });

    this.el = el(
      "dialog",
      { cls: "dialog dialog--confirm", attrs: { "aria-labelledby": "confirmTitle" } },
      el(
        "div",
        { cls: "dialog__body" },
        this.titleEl,
        this.bodyEl,
        el("div", { cls: "row row--actions" }, this.cancelBtn, this.confirmBtn),
      ),
    );
    this.el.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.finish(false);
    });
  }

  ask(options: ConfirmOptions): Promise<boolean> {
    this.titleEl.textContent = options.title;
    this.bodyEl.textContent = options.body;
    this.confirmBtn.textContent = options.confirmLabel;
    this.cancelBtn.textContent = options.cancelLabel ?? "Cancelar";
    this.confirmBtn.className = options.danger ? "btn btn--danger" : "btn btn--gold";
    this.cancelBtn.focus();
    if (!this.el.open) this.el.showModal();
    return new Promise<boolean>((resolve) => {
      this.resolve = resolve;
    });
  }

  private finish(ok: boolean): void {
    if (this.el.open) this.el.close();
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.(ok);
  }
}

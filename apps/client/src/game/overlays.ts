// Accessible DOM overlays for the Phaser client: the rules/shortcuts sheet and
// the all-in confirmation. Native <dialog> gives focus trapping and Esc for free.

let helpDialog: HTMLDialogElement | null = null;
let confirmDialog: HTMLDialogElement | null = null;
let confirmResolve: ((ok: boolean) => void) | null = null;
let confirmBody: HTMLElement | null = null;
let confirmOk: HTMLButtonElement | null = null;
let confirmCancel: HTMLButtonElement | null = null;

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  if (primary) node.className = "dialog__primary";
  node.addEventListener("click", onClick);
  return node;
}

function ensureHelp(): HTMLDialogElement {
  if (helpDialog) return helpDialog;

  const dialog = document.createElement("dialog");
  dialog.className = "dialog";
  dialog.setAttribute("aria-labelledby", "helpTitle");
  dialog.innerHTML = `
    <h2 id="helpTitle">CÓMO SE JUEGA</h2>
    <ul>
      <li>20 trasteros. Empiezas con 1.000 €. Gana quien acabe con más dinero.</li>
      <li>Solo ves siluetas y pistas ambiguas: el valor se descubre al revelar.</li>
      <li>Si ganas la subasta, pagas tu puja y sumas el valor real del lote.</li>
      <li>Nadie puja, nadie gana: el trastero se queda con el polvo.</li>
      <li>Tras las rondas 5, 10 y 15 hay ruleta opcional: la vía de remontar… o de hundirte.</li>
      <li>Rojo y negro pagan 1:1. El verde (0) paga 35:1.</li>
    </ul>
    <h3>ATAJOS</h3>
    <dl>
      <dt>Enter</dt><dd>Pujar la cantidad mínima</dd>
      <dt>1 / 2 / 3</dt><dd>Sumar +10 €, +25 € o +50 € a la puja actual</dd>
      <dt>T</dt><dd>Pujar todo tu dinero (pide confirmación)</dd>
      <dt>R / N / V</dt><dd>En la ruleta: rojo, negro o verde</dd>
      <dt>?</dt><dd>Abrir esta ayuda</dd>
      <dt>M</dt><dd>Silenciar el sonido</dd>
      <dt>Esc</dt><dd>Cerrar ventanas</dd>
    </dl>
    <p class="dialog__hint">Los timers y el azar viven en el servidor: la interfaz solo los muestra.</p>
    <div class="dialog__actions"><button type="button" data-close>ENTENDIDO</button></div>
  `;
  dialog.querySelector<HTMLButtonElement>("[data-close]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  helpDialog = dialog;
  return dialog;
}

export function openHelp(): void {
  const dialog = ensureHelp();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector<HTMLButtonElement>("[data-close]")?.focus();
}

function ensureConfirm(): HTMLDialogElement {
  if (confirmDialog) return confirmDialog;

  const dialog = document.createElement("dialog");
  dialog.className = "dialog";
  dialog.setAttribute("aria-labelledby", "confirmTitle");
  const title = document.createElement("h2");
  title.id = "confirmTitle";
  title.textContent = "PUJAR TODO TU DINERO";
  confirmBody = document.createElement("p");
  confirmOk = button("PUJAR TODO", () => finishConfirm(true), true);
  confirmCancel = button("CANCELAR", () => finishConfirm(false));
  const actions = document.createElement("div");
  actions.className = "dialog__actions";
  actions.append(confirmCancel, confirmOk);
  dialog.append(title, confirmBody, actions);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    finishConfirm(false);
  });
  document.body.append(dialog);
  confirmDialog = dialog;
  return dialog;
}

function finishConfirm(ok: boolean): void {
  confirmDialog?.close();
  const resolve = confirmResolve;
  confirmResolve = null;
  resolve?.(ok);
}

/** Resolves false on Esc / cancel. */
export function confirmAllIn(amount: number): Promise<boolean> {
  const dialog = ensureConfirm();
  if (confirmBody) {
    confirmBody.textContent =
      `Vas a pujar ${amount.toLocaleString("de-DE")} € por un trastero que no has visto ` +
      "por dentro. Si vale menos, te quedas sin remontada.";
  }
  if (confirmOk) confirmOk.textContent = `PUJAR ${amount.toLocaleString("de-DE")} €`;
  if (!dialog.open) dialog.showModal();
  confirmCancel?.focus();
  return new Promise<boolean>((resolve) => {
    confirmResolve = resolve;
  });
}

export function anyDialogOpen(): boolean {
  return Array.from(document.querySelectorAll("dialog")).some((dialog) => dialog.open);
}

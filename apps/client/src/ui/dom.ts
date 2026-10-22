// Tiny DOM helpers. We deliberately avoid a framework: the UI is small, it is
// owned by one workstream, and update-in-place keeps focus on the bid buttons.

export type Attrs = Record<string, string | number | boolean | null | undefined>;

export interface ElOptions {
  cls?: string;
  text?: string;
  attrs?: Attrs;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
  style?: Partial<Record<keyof CSSStyleDeclaration, string>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.cls) node.className = options.cls;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  if (options.on) {
    for (const [event, handler] of Object.entries(options.on)) {
      if (handler) node.addEventListener(event, handler);
    }
  }
  if (options.style) Object.assign(node.style, options.style);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  return node;
}

export function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function toggleClass(node: Element, name: string, on: boolean): void {
  node.classList.toggle(name, on);
}

export function clear(node: Element): void {
  node.replaceChildren();
}

/** Spanish-safe list join: "Ana, Beto y Cleo" */
export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Shared screen-reader announcer (the DOM shell owns the aria-live region). */
export function announce(text: string): void {
  const node = document.getElementById("a11y");
  if (!node) return;
  node.textContent = "";
  window.setTimeout(() => {
    node.textContent = text;
  }, 30);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

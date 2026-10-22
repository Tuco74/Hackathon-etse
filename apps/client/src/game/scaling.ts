import Phaser from "phaser";

export const INTERNAL_WIDTH = 480;
export const INTERNAL_HEIGHT = 270;

/** Largest whole-number scale that fits the viewport. Never fractional: a
 *  half-pixel scale is exactly the blur the art direction forbids. */
export function integerZoom(): number {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  return Math.max(
    1,
    Math.floor(Math.min(width / INTERNAL_WIDTH, height / INTERNAL_HEIGHT)),
  );
}

export function attachIntegerScaling(game: Phaser.Game): () => void {
  const apply = () => {
    const zoom = integerZoom();
    if (game.scale.zoom !== zoom) game.scale.setZoom(zoom);
  };
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  apply();
  return () => {
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
  };
}

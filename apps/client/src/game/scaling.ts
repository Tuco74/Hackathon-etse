import Phaser from "phaser";

export const INTERNAL_WIDTH = 480;
export const INTERNAL_HEIGHT = 270;

/** Vertical space reserved for the DOM HUD (players on top, actions at the
 *  bottom). Without it a 1920x1080 viewport scales the canvas to exactly 4x and
 *  the HUD covers the in-canvas round/timer bar. */
const HUD_RESERVE_Y = 132;
const HUD_RESERVE_X = 24;

/** Largest whole-number scale that fits the viewport. Never fractional: a
 *  half-pixel scale is exactly the blur the art direction forbids. */
export function integerZoom(): number {
  const width = Math.max(1, window.innerWidth - HUD_RESERVE_X);
  const height = Math.max(1, window.innerHeight - HUD_RESERVE_Y);
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

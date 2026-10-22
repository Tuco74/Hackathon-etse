import Phaser from "phaser";
import { CONFIG } from "@trastero/shared";
import { GameScene } from "./scenes/GameScene";
import { socket } from "./net/socket";
import { mountUi } from "./ui";

// The canvas is only the stage (garage + silhouettes). Every readable element,
// control and dialog is DOM, owned by the UI workstream, so it stays accessible
// and crisp at any window size.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: CONFIG.client.internalWidth,
  height: CONFIG.client.internalHeight,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
});

mountUi({ socket });

export { game, socket };

declare global {
  interface Window {
    __tw?: { socket: typeof socket; game: Phaser.Game };
  }
}
// Debug/E2E hook. The client is untrusted by design: exposing the socket gives
// no advantage, because every rule lives on the server.
window.__tw = { socket, game };

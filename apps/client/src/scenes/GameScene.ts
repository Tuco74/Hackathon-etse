import Phaser from "phaser";
import { CONFIG, type LotPublic, type S2CMessage } from "@trastero/shared";

const W = CONFIG.client.internalWidth;
const H = CONFIG.client.internalHeight;

// Stage only: the garage and the ambiguous silhouettes. All text, panels and
// controls live in the DOM layer (src/ui), which is the UI workstream's turf.
const COLORS = {
  bg: 0x14121a,
  floor: 0x2c2536,
  wall: 0x3a3145,
  silhouette: 0x6d6480,
  silhouetteShade: 0x5b5370,
};

export class GameScene extends Phaser.Scene {
  private visibleLotId = "";

  constructor() {
    super("game");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.drawRoom();

    // The DOM layer owns the socket and fans out every message, so the scene
    // never misses state that arrived before Phaser finished booting.
    window.addEventListener("tw:msg", this.onBusMessage as EventListener);
    this.events.once("shutdown", () => {
      window.removeEventListener("tw:msg", this.onBusMessage as EventListener);
    });

    window.dispatchEvent(new CustomEvent("tw:scene-ready"));
  }

  private onBusMessage = (event: Event): void => {
    const message = (event as CustomEvent).detail as S2CMessage;
    this.onMessage(message);
  };

  private drawRoom(): void {
    this.add.rectangle(W / 2, 80, W, 160, COLORS.wall);
    this.add.rectangle(W / 2, 190, W, 160, COLORS.floor);
    this.add.rectangle(W / 2, 92, 150, 96, 0x2a2433).setStrokeStyle(2, 0x1a1620);
    for (let i = 0; i < 6; i++) {
      this.add.rectangle(W / 2 - 60 + i * 24, 130, 22, 3, 0x3a3145);
    }
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(Math.random() * W);
      const y = Math.floor(60 + Math.random() * 150);
      this.add.rectangle(x, y, 1, 1, 0x8a819c, 0.5);
    }
  }

  private clearLot(): void {
    this.children.list
      .filter((object) => object.name === "lotpip")
      .forEach((object) => object.destroy());
    this.visibleLotId = "";
  }

  private drawLot(lot: LotPublic): void {
    if (lot.id === this.visibleLotId) return;
    this.clearLot();
    this.visibleLotId = lot.id;

    const count = lot.silhouettes.length;
    const spacing = 46;
    const startX = W / 2 - ((count - 1) * spacing) / 2;
    lot.silhouettes.forEach((silhouette, index) => {
      const height = 26 + ((silhouette.length * 7) % 18);
      const width = 20 + ((silhouette.length * 5) % 12);
      const box = this.add.container(startX + index * spacing, 150);
      box.name = "lotpip";
      const body = this.add
        .rectangle(0, 0, width, height, COLORS.silhouette)
        .setStrokeStyle(1, 0x1a1620);
      const shade = this.add.rectangle(width / 4, height / 4, width / 3, height / 3, COLORS.silhouetteShade);
      box.add([body, shade]);
    });
  }

  private onMessage(message: S2CMessage): void {
    switch (message.type) {
      case "S2C_ROUND_INTRO":
        this.drawLot(message.lot);
        break;
      case "S2C_GAME_OVER":
        this.clearLot();
        break;
      default:
        break;
    }
  }
}

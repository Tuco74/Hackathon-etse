import Phaser from "phaser";
import { getManifest } from "../game/bus";
import { createBackdrop, type Backdrop } from "../render/backdrop";

/** Storage-room backdrop behind D's lobby. */
export class LobbyScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;

  constructor() {
    super("lobby");
  }

  create(): void {
    this.backdrop = createBackdrop(this, getManifest(this), "unit_a");
  }

  update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }
}

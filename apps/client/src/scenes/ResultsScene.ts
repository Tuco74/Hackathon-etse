import Phaser from "phaser";
import { getManifest } from "../game/bus";
import { session } from "../game/session";
import { createBackdrop, unitForRound, type Backdrop } from "../render/backdrop";
import { DEPTH } from "../render/stage";

/** Final stage behind D's results dialog. */
export class ResultsScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;

  constructor() {
    super("results");
  }

  create(): void {
    this.backdrop = createBackdrop(
      this,
      getManifest(this),
      unitForRound(session.round || 20),
    );
    this.add
      .rectangle(0, 0, 480, 270, 0x0b0910, 0.55)
      .setOrigin(0, 0)
      .setDepth(DEPTH.lot - 1);
  }

  update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }
}

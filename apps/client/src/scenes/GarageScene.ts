import Phaser from "phaser";
import type { S2CMessage } from "@trastero/shared";
import { getManifest, onGameMessage } from "../game/bus";
import { session } from "../game/session";
import { silhouetteFor } from "../game/assetMap";
import { createBackdrop, unitForRound, type Backdrop } from "../render/backdrop";
import { DEPTH } from "../render/stage";

const W = 480;

/**
 * Stage only: storage room plus the ambiguous silhouettes. The auction HUD,
 * bid ladder and countdown are DOM (workstream D), never Phaser text.
 */
export class GarageScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;
  private lotRoot: Phaser.GameObjects.Container | null = null;

  constructor() {
    super("garage");
  }

  create(): void {
    this.backdrop = createBackdrop(this, getManifest(this), unitForRound(session.round || 1));
    this.lotRoot = this.add.container(0, 0).setDepth(DEPTH.lot);
    this.buildLot();

    onGameMessage(this, (msg: S2CMessage) => {
      if (msg.type === "S2C_ROUND_INTRO") this.buildLot();
    });
  }

  update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }

  private buildLot(): void {
    if (!this.lotRoot) return;
    this.lotRoot.removeAll(true);
    const lot = session.lot;
    if (!lot) return;

    const manifest = getManifest(this);
    const count = lot.silhouettes.length;
    const spacing = count >= 5 ? 62 : count === 4 ? 74 : count === 3 ? 86 : 100;
    const startX = W / 2 - ((count - 1) * spacing) / 2;

    lot.silhouettes.forEach((silhouetteId, index) => {
      const ref = silhouetteFor(manifest, silhouetteId);
      const x = startX + index * spacing;
      const shadow = this.add.ellipse(x, 194, 42, 8, 0x0b0910, 0.5).setDepth(DEPTH.lot - 1);
      const sprite = ref
        ? this.add
            .image(x, 192, ref.atlas, ref.frame)
            .setOrigin(0.5, 1)
            .setScale(2)
            .setDepth(DEPTH.lot)
        : this.add.rectangle(x, 192, 24, 32, 0x4a4459).setOrigin(0.5, 1);
      this.lotRoot?.add([shadow, sprite]);

      // 1 px idle bob, linear and snapped: tension without breaking the grid
      this.tweens.add({
        targets: sprite,
        y: 191,
        duration: 1200 + index * 90,
        yoyo: true,
        repeat: -1,
        ease: "Linear",
      });
    });
  }
}

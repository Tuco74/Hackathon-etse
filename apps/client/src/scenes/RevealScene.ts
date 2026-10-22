import Phaser from "phaser";
import { getCatalog, getManifest } from "../game/bus";
import { audio } from "../game/audio";
import { session } from "../game/session";
import { silhouetteFor, spriteForObject } from "../game/assetMap";
import { createBackdrop, unitForRound, type Backdrop } from "../render/backdrop";
import { DEPTH } from "../render/stage";

const W = 480;

/**
 * Stage reveal: each object flips from silhouette to its coloured sprite while
 * D's DOM panel prints names, values, totals and the net result.
 */
export class RevealScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;

  constructor() {
    super("reveal");
  }

  create(): void {
    const manifest = getManifest(this);
    const catalog = getCatalog(this);
    this.backdrop = createBackdrop(this, manifest, unitForRound(session.round || 1));

    this.add
      .rectangle(0, 0, 480, 270, 0x0b0910, 0.4)
      .setOrigin(0, 0)
      .setDepth(DEPTH.lot - 2);

    const reveal = session.reveal;
    if (!reveal) return;

    const count = reveal.objects.length;
    const spacing = count >= 5 ? 62 : count === 4 ? 74 : count === 3 ? 86 : 100;
    const startX = W / 2 - ((count - 1) * spacing) / 2;

    reveal.objects.forEach((object, index) => {
      const x = startX + index * spacing;
      const silhouette = silhouetteFor(manifest, object.silhouetteId)?.frame ?? "sil_crate";
      const sprite = this.add
        .image(x, 190, "objects", silhouette)
        .setOrigin(0.5, 1)
        .setScale(2)
        .setDepth(DEPTH.lot);
      this.add.ellipse(x, 192, 42, 8, 0x0b0910, 0.5).setDepth(DEPTH.lot - 1);

      const finalFrame = spriteForObject(manifest, catalog, object.name, object.silhouetteId);
      this.time.delayedCall(350 + index * 420, () => {
        this.flip(sprite, finalFrame);
      });
    });
  }

  update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }

  private flip(sprite: Phaser.GameObjects.Image, finalFrame: string): void {
    this.tweens.add({
      targets: sprite,
      scaleX: 0,
      duration: 90,
      ease: "Linear",
      onComplete: () => {
        if (this.textures.exists("objects") && finalFrame) sprite.setTexture("objects", finalFrame);
        this.tweens.add({
          targets: sprite,
          scaleX: 1,
          duration: 110,
          ease: "Linear",
          onComplete: () => audio.play("sfx_coin"),
        });
      },
    });
  }
}

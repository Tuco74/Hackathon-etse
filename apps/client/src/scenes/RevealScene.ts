import Phaser from "phaser";
import { session } from "../game/session";
import { getCatalog, getManifest } from "../game/bus";
import { silhouetteFor, spriteForObject } from "../game/assetMap";
import { audio } from "../game/audio";
import { createBackdrop, unitForRound, type Backdrop } from "../render/backdrop";
import {
  DEPTH,
  GOLD,
  GREY,
  RED,
  WHITE,
  addLabel,
  addPanel,
  money,
} from "../render/stage";

const W = 480;

/** Object-by-object reveal: flip, name, value, then the round summary. */
export class RevealScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;

  constructor() {
    super("reveal");
  }

  create(): void {
    const manifest = getManifest(this);
    const catalog = getCatalog(this);
    this.backdrop = createBackdrop(this, manifest, unitForRound(session.round || 1));

    // dim the room so the revealed objects read as the focus of the shot
    this.add
      .rectangle(0, 0, 480, 270, 0x0b0910, 0.4)
      .setOrigin(0, 0)
      .setDepth(DEPTH.lot - 2);

    addPanel(this, 4, 4, 472, 24, "panel_dark").setDepth(DEPTH.hud);
    addLabel(
      this,
      12,
      9,
      `RONDA ${session.round}/${session.totalRounds}`,
      GOLD,
    ).setDepth(DEPTH.hud + 1);

    const reveal = session.reveal;
    if (!reveal) {
      addLabel(this, W / 2, 130, "Esperando el revelado…", GREY, [0.5, 0.5]);
      return;
    }

    const totalLabel = addLabel(this, 468, 9, "TOTAL 0 €", WHITE, [1, 0]).setDepth(DEPTH.hud + 1);
    const nameLabel = addLabel(this, W / 2, 46, "", GOLD, [0.5, 0]).setDepth(DEPTH.hud + 1);

    const count = reveal.objects.length;
    const spacing = count >= 5 ? 62 : count === 4 ? 74 : count === 3 ? 86 : 100;
    const startX = W / 2 - ((count - 1) * spacing) / 2;
    let revealed = 0;

    reveal.objects.forEach((object, index) => {
      const x = startX + index * spacing;
      const silhouette = silhouetteFor(manifest, object.silhouetteId)?.frame ?? "sil_crate";
      const sprite = this.add
        .image(x, 190, "objects", silhouette)
        .setOrigin(0.5, 1)
        .setScale(2)
        .setDepth(DEPTH.lot);
      const shadow = this.add
        .ellipse(x, 192, 42, 8, 0x0b0910, 0.5)
        .setDepth(DEPTH.lot - 1);
      const valueLabel = addLabel(this, x, 196, "", GOLD, [0.5, 0]).setAlpha(0);
      sprite.setData("shadow", shadow);
      sprite.setData("valueLabel", valueLabel);
      sprite.setData("name", object.name);
      sprite.setData("sprite", spriteForObject(manifest, catalog, object.name, object.silhouetteId));

      this.time.delayedCall(350 + index * 420, () => {
        nameLabel.setText(object.name);
        this.flip(sprite, () => {
          valueLabel.setText(money(object.value)).setAlpha(1);
          revealed += 1;
          const partial = reveal.objects
            .slice(0, revealed)
            .reduce((sum, o) => sum + o.value, 0);
          totalLabel.setText(`TOTAL ${money(partial)}`);
          audio.play("sfx_coin");
        });
      });
    });

    this.time.delayedCall(500 + count * 420, () => {
      nameLabel.setText("");
      this.showSummary();
    });
  }

  update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }

  private flip(sprite: Phaser.GameObjects.Image, onDone: () => void): void {
    const targetFrame = sprite.getData("sprite") as string | undefined;
    this.tweens.add({
      targets: sprite,
      scaleX: 0,
      duration: 90,
      ease: "Linear",
      onComplete: () => {
        if (targetFrame) sprite.setTexture("objects", targetFrame);
        this.tweens.add({
          targets: sprite,
          scaleX: 1,
          duration: 110,
          ease: "Linear",
          onComplete: onDone,
        });
      },
    });
  }

  private showSummary(): void {
    const reveal = session.reveal;
    if (!reveal) return;
    const winner = session.players.find((p) => p.id === reveal.winnerId);
    const isMe = reveal.winnerId === session.playerId;

    const panel = addPanel(this, 108, 36, 264, 98, "panel_dark").setDepth(DEPTH.overlay);
    const lines: Phaser.GameObjects.BitmapText[] = [];
    const add = (y: number, text: string, tint: number): void => {
      lines.push(addLabel(this, 240, y, text, tint, [0.5, 0]).setDepth(DEPTH.overlay + 1));
    };

    if (!reveal.winnerId) {
      add(46, "LOTE DESIERTO", GREY);
      add(68, "Nadie puja: no hay premio", WHITE);
      add(90, `Valor real ${money(reveal.total)}`, GOLD);
    } else {
      add(44, isMe ? "¡GANASTE EL LOTE!" : `SE LO LLEVA ${winner?.nickname ?? "?"}`, isMe ? GOLD : WHITE);
      add(66, `Total ${money(reveal.total)}`, WHITE);
      add(86, `Pagado ${money(reveal.winningBid)}`, GREY);
      const profit = reveal.profit ?? 0;
      this.add
        .image(196, 112, "ui", profit >= 0 ? "icon_profit" : "icon_loss")
        .setDepth(DEPTH.overlay + 1);
      lines.push(
        addLabel(
          this,
          240,
          104,
          `${profit >= 0 ? "+" : "−"}${money(Math.abs(profit))}`,
          profit >= 0 ? GOLD : RED,
          [0.5, 0],
        ).setDepth(DEPTH.overlay + 1),
      );
      if (profit >= 0) audio.play("sfx_win");
      else audio.play("sfx_lose");
    }

    panel.setAlpha(0);
    lines.forEach((line) => line.setAlpha(0));
    this.tweens.add({ targets: [panel, ...lines], alpha: 1, duration: 180 });
  }
}

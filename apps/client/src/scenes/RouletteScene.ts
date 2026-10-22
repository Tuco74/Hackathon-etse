import Phaser from "phaser";
import type { S2CMessage } from "@trastero/shared";
import { getManifest, onGameMessage } from "../game/bus";
import { audio } from "../game/audio";
import { session } from "../game/session";
import { createBackdrop, unitForRound, type Backdrop } from "../render/backdrop";
import { DEPTH } from "../render/stage";

const W = 480;

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function colourOf(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

type ResultMsg = Extract<S2CMessage, { type: "S2C_ROULETTE_RESULT" }>;

/** Stage roulette: the wheel spin. Bets, commit hash and payout are DOM. */
export class RouletteScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;
  private wheel!: Phaser.GameObjects.Image;
  private spinning = false;

  constructor() {
    super("roulette");
  }

  create(): void {
    this.backdrop = createBackdrop(this, getManifest(this), unitForRound(session.round || 1));

    this.wheel = this.add.image(W / 2, 142, "ui", "wheel").setScale(2).setDepth(DEPTH.lot);
    this.add.image(W / 2, 44, "ui", "pointer").setOrigin(0.5, 1).setScale(2).setDepth(DEPTH.lot + 1);

    onGameMessage(this, (msg: S2CMessage) => {
      if (msg.type === "S2C_ROULETTE_RESULT") this.spinTo(msg);
    });

    if (session.rouletteResult) this.spinTo(session.rouletteResult);
  }

  update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }

  private spinTo(result: ResultMsg): void {
    // No bets: the server advances immediately, so there is no wheel to spin.
    if (result.skipped || this.spinning) return;
    this.spinning = true;
    audio.play("sfx_spin");

    const colour = colourOf(result.result);
    const sectors = 16;
    const candidates: number[] = [];
    for (let i = 0; i < sectors; i += 1) {
      const sectorColour = i === 0 ? "green" : i % 2 === 0 ? "red" : "black";
      if (sectorColour === colour) candidates.push(i);
    }
    const sector = candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
    const target = 360 * 5 - sector * (360 / sectors);

    this.tweens.add({
      targets: this.wheel,
      angle: target,
      duration: 3200,
      ease: Phaser.Math.Easing.Cubic.Out,
      onComplete: () => audio.play("sfx_roulette"),
    });
  }
}

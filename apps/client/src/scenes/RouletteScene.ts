import Phaser from "phaser";
import type { S2CMessage } from "@trastero/shared";
import { getManifest, onGameMessage } from "../game/bus";
import { audio } from "../game/audio";
import { session } from "../game/session";
import { createBackdrop, unitForRound, type Backdrop } from "../render/backdrop";
import { DEPTH, GOLD, GREY, RED, WHITE, addLabel, addPanel, money } from "../render/stage";
import { CONFIG } from "@trastero/shared";

const W = 480;

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function colourOf(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

type ResultMsg = Extract<S2CMessage, { type: "S2C_ROULETTE_RESULT" }>;

/** Roulette phase: stylised wheel, commit hash and server-authoritative result. */
export class RouletteScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;
  private wheel!: Phaser.GameObjects.Image;
  private countdown!: Phaser.GameObjects.BitmapText;
  private status!: Phaser.GameObjects.BitmapText;
  private spinning = false;
  private shown = false;
  private windowEnd = 0;

  constructor() {
    super("roulette");
  }

  create(): void {
    const manifest = getManifest(this);
    this.backdrop = createBackdrop(this, manifest, unitForRound(session.round || 1));

    addPanel(this, 4, 4, 472, 24, "panel_dark").setDepth(DEPTH.hud);
    addLabel(this, 10, 9, `RULETA · RONDA ${session.round}`, GOLD).setDepth(DEPTH.hud + 1);
    this.countdown = addLabel(this, 470, 9, "", WHITE, [1, 0]).setDepth(DEPTH.hud + 1);

    const phase = session.roulettePhase;
    this.windowEnd = session.rouletteEndsAt || session.now() + CONFIG.roulette.windowSec * 1000;
    addLabel(
      this,
      W / 2,
      32,
      phase ? `commit ${phase.hashSeed.slice(0, 20)}…` : "ruleta",
      GREY,
      [0.5, 0],
    ).setDepth(DEPTH.hud);

    this.wheel = this.add.image(W / 2, 142, "ui", "wheel").setScale(2).setDepth(DEPTH.lot);
    this.add.image(W / 2, 44, "ui", "pointer").setOrigin(0.5, 1).setScale(2).setDepth(DEPTH.lot + 1);

    addPanel(this, 108, 240, 264, 26, "panel_dark").setDepth(DEPTH.hud);
    this.status = addLabel(this, W / 2, 245, "Apuesta en el panel inferior", WHITE, [0.5, 0])
      .setDepth(DEPTH.hud + 1);

    onGameMessage(this, (msg: S2CMessage) => {
      if (msg.type === "S2C_ROULETTE_RESULT") this.spinTo(msg);
    });

    if (session.rouletteResult) this.spinTo(session.rouletteResult);

    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => this.tick(),
    });
  }

  update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }

  private tick(): void {
    if (this.shown) return;
    const left = Math.max(0, (this.windowEnd - session.now()) / 1000);
    this.countdown.setText(`${left.toFixed(1)}s`);
    this.countdown.setTint(left <= 3 ? RED : WHITE);
    if (left <= 0) this.status.setText("Girando…");
  }

  private spinTo(result: ResultMsg): void {
    if (this.spinning || this.shown) return;
    this.spinning = true;
    this.status.setText("Girando…");
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
      onComplete: () => this.showResult(result),
    });
  }

  private showResult(result: ResultMsg): void {
    this.shown = true;
    audio.play("sfx_roulette");
    const colour = colourOf(result.result);
    const colourEs = colour === "red" ? "ROJO" : colour === "black" ? "NEGRO" : "VERDE 0";
    const mine = result.payouts.find((p) => p.playerId === session.playerId);
    const delta = mine?.delta ?? 0;

    addPanel(this, 108, 208, 264, 58, "panel_dark").setDepth(DEPTH.overlay);
    addLabel(this, W / 2, 212, `${result.result} · ${colourEs}`, GOLD, [0.5, 0]).setDepth(
      DEPTH.overlay + 1,
    );
    const text =
      mine === undefined
        ? "No apostaste"
        : delta === 0
          ? "Apuesta devuelta"
          : `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))} · saldo ${money(mine.money)}`;
    addLabel(this, W / 2, 232, text, delta > 0 ? GOLD : delta < 0 ? RED : GREY, [0.5, 0]).setDepth(
      DEPTH.overlay + 1,
    );
    addLabel(this, 12, 252, `semilla ${result.seed.slice(0, 24)}…`, GREY).setDepth(
      DEPTH.overlay + 1,
    );
  }
}

import Phaser from "phaser";
import { getManifest } from "../game/bus";
import { session } from "../game/session";
import { createBackdrop, unitForRound, type Backdrop } from "../render/backdrop";
import {
  DEPTH,
  GOLD,
  GREY,
  WHITE,
  PixelButton,
  addLabel,
  addPanel,
  money,
} from "../render/stage";

const W = 480;

/** Final ranking with money, lots won and lot value. */
export class ResultsScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;

  constructor() {
    super("results");
  }

  create(): void {
    const manifest = getManifest(this);
    this.backdrop = createBackdrop(this, manifest, unitForRound(session.round || 20));

    const dim = this.add
      .rectangle(0, 0, W, 270, 0x0b0910, 0.55)
      .setOrigin(0, 0)
      .setDepth(DEPTH.lot - 1);

    addLabel(this, W / 2, 22, "FIN DE LA PARTIDA", GOLD, [0.5, 0])
      .setScale(2)
      .setDepth(DEPTH.hud);

    const game = session.gameOver;
    if (!game) {
      addLabel(this, W / 2, 130, "Esperando resultados…", GREY, [0.5, 0.5]);
      return;
    }

    game.ranking.forEach((row, index) => {
      const y = 74 + index * 30;
      const isMe = row.playerId === session.playerId;
      const isWinner = index === 0;
      addPanel(this, 84, y, 312, 26, isWinner ? "panel_gold" : isMe ? "panel" : "panel_dark")
        .setDepth(DEPTH.hud);
      addLabel(this, 94, y + 6, `${index + 1}.`, GOLD).setDepth(DEPTH.hud + 1);
      addLabel(
        this,
        116,
        y + 6,
        `${row.nickname}${isMe ? " (tú)" : ""}`,
        isWinner ? 0x1a1420 : isMe ? WHITE : GREY,
      ).setDepth(DEPTH.hud + 1);
      addLabel(this, 384, y + 6, money(row.money), isWinner ? 0x1a1420 : WHITE, [1, 0]).setDepth(
        DEPTH.hud + 1,
      );
      addLabel(
        this,
        300,
        y + 6,
        `${row.lotsWon} lote${row.lotsWon === 1 ? "" : "s"}`,
        isWinner ? 0x1a1420 : GREY,
        [1, 0],
      ).setDepth(
        DEPTH.hud + 1,
      );
    });

    addLabel(
      this,
      W / 2,
      220,
      `Ganador: ${game.ranking[0]?.nickname ?? "?"} · ${money(game.ranking[0]?.money ?? 0)}`,
      GOLD,
      [0.5, 0],
    ).setDepth(DEPTH.hud + 1);

    const again = new PixelButton(this, W / 2, 250, "REVANCHA", {
      w: 140,
      h: 24,
      frame: "button_bid",
      onClick: () => window.location.reload(),
    });
    again.go.setDepth(DEPTH.hud + 1);

    dim.setAlpha(0.55);
  }

  update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }
}

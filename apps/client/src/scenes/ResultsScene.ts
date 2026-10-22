import Phaser from "phaser";
import { getManifest, onGameMessage } from "../game/bus";
import { session } from "../game/session";
import { announce } from "../game/a11y";
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

const CHART_COLOURS = [0xffd166, 0x7fb6dd, 0x8fcf74, 0xe35d68, 0xb07ac4];

function signed(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "±";
  return `${sign}${Math.abs(value).toLocaleString("de-DE")} €`;
}

/** Final ranking, money evolution and purchase summary. */
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

    addLabel(this, W / 2, 12, "FIN DE LA PARTIDA", GOLD, [0.5, 0])
      .setScale(2)
      .setDepth(DEPTH.hud);

    const game = session.gameOver;
    if (!game) {
      // The director may switch to this scene on ROOM_STATE before the
      // S2C_GAME_OVER payload arrives. Rebuild instead of showing a dead end.
      addLabel(this, W / 2, 130, "Esperando resultados…", GREY, [0.5, 0.5]);
      onGameMessage(this, (msg) => {
        if (msg.type === "S2C_GAME_OVER") this.scene.restart();
      });
      return;
    }

    this.buysLabel();

    game.ranking.forEach((row, index) => {
      const y = 56 + index * 26;
      const isMe = row.playerId === session.playerId;
      const isWinner = index === 0;
      addPanel(this, 84, y, 312, 24, isWinner ? "panel_gold" : isMe ? "panel" : "panel_dark")
        .setDepth(DEPTH.hud);
      // The position number carries the player's chart colour: the chart has
      // no room for a legend, and colour is never the only signal.
      addLabel(this, 92, y + 5, `${index + 1}.`, this.colourFor(row.playerId)).setDepth(
        DEPTH.hud + 1,
      );
      addLabel(
        this,
        114,
        y + 5,
        `${row.nickname}${isMe ? " (tú)" : ""}`,
        isWinner ? 0x1a1420 : isMe ? WHITE : GREY,
      ).setDepth(DEPTH.hud + 1);
      addLabel(this, 384, y + 5, money(row.money), isWinner ? 0x1a1420 : WHITE, [1, 0]).setDepth(
        DEPTH.hud + 1,
      );
      addLabel(
        this,
        300,
        y + 5,
        `${row.lotsWon} lote${row.lotsWon === 1 ? "" : "s"}`,
        isWinner ? 0x1a1420 : GREY,
        [1, 0],
      ).setDepth(DEPTH.hud + 1);
    });

    const rowsEnd = 56 + game.ranking.length * 26;
    this.drawChart(Math.min(196, rowsEnd + 8));

    const again = new PixelButton(this, W / 2, 252, "REVANCHA", {
      w: 140,
      h: 24,
      frame: "button_bid",
      onClick: () => window.location.reload(),
    });
    again.go.setDepth(DEPTH.hud + 1);

    dim.setAlpha(0.55);
    announce(
      `Fin de la partida. Gana ${game.ranking[0]?.nickname ?? "?"} con ${money(
        game.ranking[0]?.money ?? 0,
      )}.`,
    );
  }

  update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }

  /** Colour follows the final position, so the number in the table and the
   * line in the chart are the same colour. */
  private colourFor(playerId: string): number {
    const rank = session.gameOver?.ranking.findIndex((row) => row.playerId === playerId) ?? 0;
    return CHART_COLOURS[(rank < 0 ? 0 : rank) % CHART_COLOURS.length] ?? GOLD;
  }

  private buysLabel(): void {
    const mine = session.revealHistory.filter(
      (entry) => entry.winnerId === session.playerId && entry.profit !== null,
    );
    if (mine.length === 0) {
      addLabel(this, W / 2, 36, "NO COMPRASTE NINGÚN TRASTERO", GREY, [0.5, 0]).setDepth(
        DEPTH.hud,
      );
      return;
    }
    const sorted = [...mine].sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const text =
      sorted.length === 1
        ? `TU COMPRA: ${signed(best?.profit ?? 0)} · RONDA ${best?.round ?? "?"}`
        : `MEJOR ${signed(best?.profit ?? 0)} · PEOR ${signed(worst?.profit ?? 0)}`;
    addLabel(this, W / 2, 36, text, GREY, [0.5, 0]).setDepth(DEPTH.hud);
  }

  /** Compact sparklines of every player's money, one point per round. */
  private drawChart(y: number): void {
    const history = session.moneyHistory;
    const height = 42;
    if (history.length < 2) return;

    addPanel(this, 84, y, 312, height, "panel_dark").setDepth(DEPTH.hud);
    addLabel(this, 90, y + 2, "EVOLUCIÓN", GREY).setDepth(DEPTH.hud + 1);

    const values = history.flatMap((snapshot) => Object.values(snapshot.money));
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = Math.max(50, Math.round((rawMax - rawMin) * 0.12));
    const min = Math.max(0, rawMin - padding);
    const max = rawMax + padding;
    const span = Math.max(1, max - min);

    const left = 88;
    const right = 392;
    const top = y + 14;
    const bottom = y + height - 5;

    const graphics = this.add.graphics().setDepth(DEPTH.hud + 1);
    for (const player of session.players) {
      graphics.lineStyle(2, this.colourFor(player.id), player.id === session.playerId ? 1 : 0.8);
      graphics.beginPath();
      history.forEach((snapshot, index) => {
        const value = snapshot.money[player.id] ?? 0;
        const x = left + (index / (history.length - 1)) * (right - left);
        const py = bottom - ((value - min) / span) * (bottom - top);
        if (index === 0) graphics.moveTo(x, py);
        else graphics.lineTo(x, py);
      });
      graphics.strokePath();
    }
  }
}

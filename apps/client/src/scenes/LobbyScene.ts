import Phaser from "phaser";
import type { S2CMessage } from "@trastero/shared";
import { getManifest, onGameMessage } from "../game/bus";
import { session } from "../game/session";
import { createBackdrop, type Backdrop } from "../render/backdrop";
import { DEPTH, GOLD, GREY, WHITE, addLabel, addPanel, money } from "../render/stage";

/**
 * Room is shown behind the DOM lobby: title, room code and ready state.
 * Input (nickname/room/ready) stays in the DOM overlay owned by D.
 */
export class LobbyScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;
  private codeLabel: Phaser.GameObjects.BitmapText | null = null;
  private playersRoot: Phaser.GameObjects.Container | null = null;
  private hint: Phaser.GameObjects.BitmapText | null = null;

  constructor() {
    super("lobby");
  }

  create(): void {
    const manifest = getManifest(this);
    this.backdrop = createBackdrop(this, manifest, "unit_a");
    this.cameras.main.setBackgroundColor(0x14111d);

    const dim = this.add
      .rectangle(0, 0, 480, 270, 0x0b0910, 0.35)
      .setOrigin(0, 0)
      .setDepth(DEPTH.lot - 1);

    const title = addLabel(this, 240, 62, "TRASTERO WARS", GOLD, [0.5, 0.5]);
    title.setScale(2).setDepth(DEPTH.lot);

    addLabel(this, 240, 84, "Subastas de trasteros", GREY, [0.5, 0.5]).setDepth(DEPTH.lot);

    addPanel(this, 150, 106, 180, 22, "panel_dark").setDepth(DEPTH.lot);
    this.codeLabel = addLabel(this, 240, 117, "SALA ----", WHITE, [0.5, 0.5]).setDepth(DEPTH.lot);

    this.playersRoot = this.add.container(0, 0).setDepth(DEPTH.lot);
    this.hint = addLabel(this, 240, 236, "Escribe tu apodo para entrar", GREY, [0.5, 0.5])
      .setDepth(DEPTH.lot);

    this.refresh();
    onGameMessage(this, (msg: S2CMessage) => {
      if (msg.type === "S2C_ROOM_STATE") this.refresh();
      if (msg.type === "S2C_ERROR") this.hint?.setText(`${msg.message} (${msg.code})`);
    });

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => this.refresh(),
    });

    dim.setAlpha(0.35);
  }

  update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }

  private refresh(): void {
    if (!this.codeLabel || !this.playersRoot || !this.hint) return;
    const code = session.roomCode || "----";
    this.codeLabel.setText(`SALA ${code}`);

    const root = this.playersRoot;
    root.removeAll(true);
    const players = session.players;
    players.forEach((player, index) => {
      const y = 140 + index * 18;
      const isMe = player.id === session.playerId;
      const line = `${player.nickname}${isMe ? " (tú)" : ""} · ${money(player.money)} · ${
        player.ready ? "LISTO" : "…"
      }`;
      const label = addLabel(
        this,
        isMe ? 244 : 236,
        y,
        line,
        player.ready ? GOLD : isMe ? WHITE : GREY,
        [0.5, 0.5],
      );
      root.add(label);
    });

    if (session.players.length === 0) {
      this.hint.setText("Escribe tu apodo para entrar");
    } else if (session.players.length < 2) {
      this.hint.setText("Falta al menos otro jugador");
    } else if (session.players.every((p) => p.ready)) {
      this.hint.setText("Todos listos: pulsa EMPEZAR PARTIDA");
    } else {
      this.hint.setText("Marca ESTOY LISTO cuando quieras");
    }
  }
}

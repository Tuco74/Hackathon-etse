import Phaser from "phaser";
import { CONFIG, type S2CMessage } from "@trastero/shared";
import { getManifest, onGameMessage } from "../game/bus";
import { silhouetteFor } from "../game/assetMap";
import { audio } from "../game/audio";
import { session } from "../game/session";
import { createBackdrop, unitForRound, type Backdrop } from "../render/backdrop";
import {
  DEPTH,
  GOLD,
  GREY,
  RED,
  WHITE,
  PixelButton,
  addLabel,
  addPanel,
  money,
} from "../render/stage";
import { socket } from "../net/socket";
import { announce, prefersReducedMotion } from "../game/a11y";
import { confirmAllIn } from "../game/overlays";

const W = 480;

const CATEGORY_ES: Record<string, string> = {
  electronics: "Electrónica",
  tools: "Herramientas",
  furniture: "Muebles",
  collectibles: "Coleccionables",
  clothing: "Ropa",
  sports: "Deportes",
  kitchen: "Cocina",
  mystery: "Misterio",
  jewelry: "Joyería",
  art: "Arte",
  antique: "Antigüedades",
  misc: "Varios",
};

/** Preview + ascending auction (workstream C). */
export class GarageScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;
  private lotRoot: Phaser.GameObjects.Container | null = null;
  private bidsRoot: Phaser.GameObjects.Container | null = null;

  private roundLabel!: Phaser.GameObjects.BitmapText;
  private currentBidLabel!: Phaser.GameObjects.BitmapText;
  private cashLabel!: Phaser.GameObjects.BitmapText;
  private timerLabel!: Phaser.GameObjects.BitmapText;
  private categoryLabel!: Phaser.GameObjects.BitmapText;
  private clueLabel!: Phaser.GameObjects.BitmapText;
  private reasonLabel!: Phaser.GameObjects.BitmapText;
  private bidAmounts: number[] = [];

  constructor() {
    super("garage");
  }

  create(): void {
    const manifest = getManifest(this);
    this.backdrop = createBackdrop(this, manifest, unitForRound(session.round || 1));

    addPanel(this, 4, 4, 472, 24, "panel_dark").setDepth(DEPTH.hud);
    this.roundLabel = addLabel(this, 10, 9, "", GOLD).setDepth(DEPTH.hud + 1);
    this.add.image(152, 16, "ui", "icon_money").setDepth(DEPTH.hud + 1);
    this.cashLabel = addLabel(this, 162, 9, "", WHITE).setDepth(DEPTH.hud + 1);
    // Persistent "current bid" readout: the auction is a live number, not just
    // the last bid flash.
    this.currentBidLabel = addLabel(this, 300, 9, "SIN PUJAS", GREY, [0.5, 0]).setDepth(
      DEPTH.hud + 1,
    );
    this.add.image(412, 16, "ui", "icon_clock").setDepth(DEPTH.hud + 1);
    this.timerLabel = addLabel(this, 470, 9, "", WHITE, [1, 0]).setDepth(DEPTH.hud + 1);

    this.categoryLabel = addLabel(this, W / 2, 40, "", GREY, [0.5, 0]).setDepth(DEPTH.hud);
    this.clueLabel = addLabel(this, W / 2, 208, "", GREY, [0.5, 0]).setDepth(DEPTH.hud);
    this.reasonLabel = addLabel(this, W / 2, 220, "", RED, [0.5, 0]).setDepth(DEPTH.hud);

    this.lotRoot = this.add.container(0, 0).setDepth(DEPTH.lot);
    this.bidsRoot = this.add.container(0, 0).setDepth(DEPTH.hud);

    this.refreshTopBar();
    this.buildLot();
    this.refreshBids();

    onGameMessage(this, (msg: S2CMessage) => this.onMessage(msg));

    this.input.keyboard?.on("keydown-ONE", () => this.tryBid(0));
    this.input.keyboard?.on("keydown-TWO", () => this.tryBid(1));
    this.input.keyboard?.on("keydown-THREE", () => this.tryBid(2));
  }

  update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
    this.refreshTopBar();
  }

  private onMessage(msg: S2CMessage): void {
    switch (msg.type) {
      case "S2C_ROUND_INTRO": {
        this.reasonLabel.setText("");
        this.buildLot();
        this.bidsRoot?.removeAll(true);
        this.bidAmounts = [];
        this.refreshBids();
        break;
      }
      case "S2C_AUCTION_STATE": {
        this.reasonLabel.setText("");
        this.refreshBids();
        break;
      }
      case "S2C_BID_EVENT": {
        this.refreshBids();
        this.flashBid(msg.playerId, msg.amount);
        break;
      }
      case "S2C_ROOM_STATE": {
        this.refreshTopBar();
        break;
      }
      case "S2C_ERROR": {
        this.reasonLabel.setText(`${msg.message} (${msg.code})`);
        this.reasonLabel.setTint(RED);
        break;
      }
      default:
        break;
    }
  }

  private refreshTopBar(): void {
    this.roundLabel.setText(`RONDA ${session.round || 1}/${session.totalRounds || CONFIG.match.rounds}`);
    this.cashLabel.setText(money(session.money()));

    const auction = session.auction;
    const bid = auction?.currentBid ?? 0;
    const bidText = bid > 0 ? `PUJA ${money(bid)}` : "SIN PUJAS";
    if (this.currentBidLabel.text !== bidText) this.currentBidLabel.setText(bidText);
    this.currentBidLabel.setTint(bid > 0 ? GOLD : GREY);

    if (auction && session.phase === "AUCTION") {
      const left = Math.max(0, (auction.endsAt - session.now()) / 1000);
      this.timerLabel.setText(`${left.toFixed(1)}s`);
      this.timerLabel.setTint(left <= 3 ? RED : WHITE);
    } else {
      this.timerLabel.setText("—");
      this.timerLabel.setTint(GREY);
    }
  }

  private buildLot(): void {
    if (!this.lotRoot) return;
    this.lotRoot.removeAll(true);
    const lot = session.lot;
    if (!lot) return;

    this.categoryLabel.setText(
      `${lot.objectCount} objetos · ${CATEGORY_ES[lot.category] ?? lot.category}`,
    );
    this.clueLabel.setText(lot.clues.slice(0, 2).join(" · "));

    const manifest = getManifest(this);
    const count = lot.silhouettes.length;
    const spacing = count >= 5 ? 62 : count === 4 ? 74 : count === 3 ? 86 : 100;
    const startX = W / 2 - ((count - 1) * spacing) / 2;

    lot.silhouettes.forEach((silhouetteId, index) => {
      const ref = silhouetteFor(manifest, silhouetteId);
      const x = startX + index * spacing;
      const shadow = this.add
        .ellipse(x, 194, 42, 8, 0x0b0910, 0.5)
        .setDepth(DEPTH.lot - 1);
      const sprite = ref
        ? this.add
            .image(x, 192, ref.atlas, ref.frame)
            .setOrigin(0.5, 1)
            .setScale(2)
            .setDepth(DEPTH.lot)
        : this.add.rectangle(x, 192, 24, 32, 0x4a4459).setOrigin(0.5, 1);
      this.lotRoot?.add([shadow, sprite]);

      // idle bob, 1 px and snapped: tension without breaking the pixel grid
      if (prefersReducedMotion()) return;
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

  private bidReason(): string {
    const auction = session.auction;
    if (!auction || session.phase !== "AUCTION") return "Fuera de fase";
    if (auction.highBidderId === session.playerId) return "Vas ganando";
    if (session.money() < auction.minNextBid) return "Sin fondos";
    if (!auction.canBid) return "Espera tu turno";
    return "";
  }

  private refreshBids(): void {
    if (!this.bidsRoot) return;
    this.bidsRoot.removeAll(true);
    this.bidAmounts = [];
    const auction = session.auction;
    if (!auction || session.phase !== "AUCTION") {
      this.reasonLabel.setText("");
      return;
    }

    const canBid = auction.canBid && session.money() >= auction.minNextBid;
    // Buttons add to the current bid. The cheapest one (+10) is exactly the
    // server's minimum increment, so it always passes validation.
    const deltas = [10, 25, 50] as const;
    const amounts = deltas.map((delta) => auction.currentBid + delta);
    this.bidAmounts = amounts;

    amounts.forEach((amount, index) => {
      const x = W / 2 + (index - 1) * 98;
      const affordable = amount <= session.money();
      const button = new PixelButton(this, x, 240, `+${money(deltas[index] ?? 0)}`, {
        w: 90,
        h: 22,
        frame: "button_bid",
        tint: WHITE,
        onClick: () => this.tryBid(index),
      });
      button.setEnabled(canBid && affordable);
      this.bidsRoot?.add(button.go);
    });

    const reason = this.bidReason();
    this.reasonLabel.setTint(reason === "Vas ganando" ? GOLD : RED);
    this.reasonLabel.setText(reason);
  }

  /** Keyboard/assistive entry point: bid the minimum next amount. */
  bidMinimum(): void {
    this.tryBid(0);
  }

  /** "Todo": bid every euro the player owns, after an explicit confirmation. */
  async allIn(): Promise<void> {
    const auction = session.auction;
    if (!auction || session.phase !== "AUCTION") return;
    if (auction.highBidderId === session.playerId) {
      this.showReason("Vas ganando");
      return;
    }
    const amount = session.money();
    if (amount < auction.minNextBid) {
      this.showReason("Sin fondos");
      return;
    }
    if (!auction.canBid) {
      this.showReason("Espera tu turno");
      return;
    }
    if (!(await confirmAllIn(amount))) return;
    socket.send({ type: "C2S_BID", amount });
    audio.play("sfx_bid");
    announce(`Pujas todo tu dinero: ${money(amount)}.`);
  }

  private showReason(reason: string): void {
    this.reasonLabel.setTint(reason === "Vas ganando" ? GOLD : RED);
    this.reasonLabel.setText(reason);
    announce(reason);
  }

  private tryBid(index: number): void {
    const amount = this.bidAmounts[index];
    if (amount === undefined) return;
    if (!session.auction?.canBid || session.phase !== "AUCTION") return;
    if (amount > session.money()) return;
    socket.send({ type: "C2S_BID", amount });
    audio.play("sfx_bid");
    announce(`Pujas ${money(amount)}.`);
  }

  private flashBid(playerId: string, amount: number): void {
    const player = session.players.find((p) => p.id === playerId);
    this.reasonLabel.setTint(WHITE);
    this.reasonLabel.setText(`${player?.nickname ?? "Alguien"} puja ${money(amount)}`);
  }
}

import Phaser from "phaser";
import { CONFIG, type AuctionState, type LotPublic, type PlayerPublic, type S2CMessage } from "@trastero/shared";
import { socket } from "../net/socket";

const W = CONFIG.client.internalWidth;
const H = CONFIG.client.internalHeight;

const COLORS = {
  bg: 0x14121a,
  floor: 0x2c2536,
  wall: 0x3a3145,
  gold: 0xf4b942,
  ink: 0xf2e9d8,
  red: 0xd9534f,
  green: 0x7ac74f,
  silhouette: 0x6d6480,
};

export class GameScene extends Phaser.Scene {
  private roster: PlayerPublic[] = [];
  private lot: LotPublic | null = null;
  private auction: AuctionState | null = null;
  private phase = "LOBBY";
  private round = 0;
  private playerId = "";
  private bidButtons: Phaser.GameObjects.Container | null = null;
  private statusText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private revealText!: Phaser.GameObjects.Text;

  constructor() {
    super("game");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.drawRoom();

    this.roundText = this.add.text(8, 6, "", { fontFamily: "monospace", fontSize: "10px", color: "#f4b942" });
    this.timerText = this.add.text(W - 8, 6, "", { fontFamily: "monospace", fontSize: "10px", color: "#f2e9d8" }).setOrigin(1, 0);
    this.statusText = this.add.text(W / 2, H / 2 + 8, "", { fontFamily: "monospace", fontSize: "12px", color: "#f2e9d8", align: "center" }).setOrigin(0.5);
    this.revealText = this.add.text(W / 2, H - 44, "", { fontFamily: "monospace", fontSize: "10px", color: "#f4b942", align: "center" }).setOrigin(0.5);

    // The DOM layer owns the socket and fans out every message, so the scene
    // never misses state that arrived before Phaser finished booting.
    window.addEventListener("tw:msg", this.onBusMessage as EventListener);
    this.events.once("shutdown", () => {
      window.removeEventListener("tw:msg", this.onBusMessage as EventListener);
    });

    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => this.updateTimer(),
    });

    const me = localStorage.getItem("tw.playerId");
    if (me) this.playerId = me;

    window.dispatchEvent(new CustomEvent("tw:scene-ready"));
  }

  private onBusMessage = (ev: Event): void => {
    const msg = (ev as CustomEvent).detail as S2CMessage;
    this.onMessage(msg);
  };

  private drawRoom(): void {
    // back wall + floor, flat pixel blocks
    this.add.rectangle(W / 2, 80, W, 160, COLORS.wall);
    this.add.rectangle(W / 2, 190, W, 160, COLORS.floor);
    // storage unit door
    this.add.rectangle(W / 2, 92, 150, 96, 0x2a2433).setStrokeStyle(2, 0x1a1620);
    for (let i = 0; i < 6; i++) {
      this.add.rectangle(W / 2 - 60 + i * 24, 130, 22, 3, 0x3a3145);
    }
    // dust particles as static pixels
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(Math.random() * W);
      const y = Math.floor(60 + Math.random() * 150);
      this.add.rectangle(x, y, 1, 1, 0x8a819c, 0.5);
    }
  }

  private drawLot(lot: LotPublic): void {
    this.children.list
      .filter((o) => o.name === "lotpip")
      .forEach((o) => o.destroy());

    const count = lot.silhouettes.length;
    const spacing = 46;
    const startX = W / 2 - ((count - 1) * spacing) / 2;
    lot.silhouettes.forEach((sil, i) => {
      const height = 26 + ((sil.length * 7) % 18);
      const width = 20 + ((sil.length * 5) % 12);
      const box = this.add.container(startX + i * spacing, 150);
      box.name = "lotpip";
      const body = this.add.rectangle(0, 0, width, height, COLORS.silhouette).setStrokeStyle(1, 0x1a1620);
      const shade = this.add.rectangle(width / 4, height / 4, width / 3, height / 3, 0x5b5370);
      box.add([body, shade]);
      box.setAlpha(0.95);
    });

    this.revealText.setText(`${lot.objectCount} objetos · ${lot.category}`);
  }

  private clearBidButtons(): void {
    this.bidButtons?.destroy(true);
    this.bidButtons = null;
  }

  private showBidButtons(minNext: number, canBid: boolean): void {
    this.clearBidButtons();
    const container = this.add.container(W / 2, H - 24);
    this.bidButtons = container;
    const labels = [minNext, minNext + 25, minNext + 100];
    labels.forEach((amount, i) => {
      const x = (i - 1) * 78;
      const rect = this.add.rectangle(x, 0, 70, 18, 0x221d2e).setStrokeStyle(1, 0x4a3f5c);
      const text = this.add.text(x, 0, `${amount}€`, {
        fontFamily: "monospace", fontSize: "9px", color: "#f2e9d8",
      }).setOrigin(0.5);
      rect.setInteractive({ useHandCursor: canBid });
      rect.on("pointerdown", () => {
        if (!this.auction?.canBid) return;
        socket.send({ type: "C2S_BID", amount });
      });
      rect.on("pointerover", () => rect.setStrokeStyle(1, COLORS.gold));
      rect.on("pointerout", () => rect.setStrokeStyle(1, 0x4a3f5c));
      container.add([rect, text]);
    });
    if (!canBid) container.setAlpha(0.4);
  }

  private onMessage(msg: S2CMessage): void {
    switch (msg.type) {
      case "S2C_ROOM_STATE": {
        this.roster = msg.players;
        this.phase = msg.phase;
        this.round = msg.round;
        this.roundText.setText(`RONDA ${msg.round}/${msg.totalRounds} · ${msg.phase}`);
        window.dispatchEvent(new CustomEvent("tw:room", { detail: msg }));
        break;
      }
      case "S2C_ROUND_INTRO": {
        this.lot = msg.lot;
        this.drawLot(msg.lot);
        this.statusText.setText(`RONDA ${msg.round}\nSe abre el trastero...`);
        this.clearBidButtons();
        break;
      }
      case "S2C_AUCTION_STATE": {
        this.auction = msg.state;
        this.statusText.setText(
          msg.state.highBidderId
            ? `Mejor puja: ${msg.state.currentBid}€`
            : `Sin pujas · mínimo ${msg.state.minNextBid}€`,
        );
        this.showBidButtons(msg.state.minNextBid, msg.state.canBid);
        break;
      }
      case "S2C_BID_EVENT": {
        const who = this.roster.find((p) => p.id === msg.playerId);
        this.statusText.setText(`${who?.nickname ?? "?"} puja ${msg.amount}€`);
        break;
      }
      case "S2C_REVEAL": {
        this.clearBidButtons();
        const lines = msg.objects.map((o) => `${o.name}: ${o.value}€`).join("\n");
        const outcome = msg.winnerId
          ? `${msg.winnerId === this.playerId ? "¡Ganaste!" : "Adjudicado"} por ${msg.winningBid}€ · total ${msg.total}€ · neto ${msg.profit ?? 0}€`
          : "Lote desierto";
        this.statusText.setText(outcome);
        this.revealText.setText(lines);
        break;
      }
      case "S2C_ROULETTE_PHASE": {
        this.clearBidButtons();
        this.statusText.setText(`RULETA · ${msg.windowSec}s`);
        this.revealText.setText(`commit: ${msg.hashSeed.slice(0, 18)}...`);
        window.dispatchEvent(new CustomEvent("tw:roulette", { detail: msg }));
        break;
      }
      case "S2C_ROULETTE_RESULT": {
        this.statusText.setText(`Resultado: ${msg.result}`);
        this.revealText.setText(`semilla revelada: ${msg.seed.slice(0, 22)}`);
        break;
      }
      case "S2C_GAME_OVER": {
        this.clearBidButtons();
        const table = msg.ranking
          .map((r, i) => `${i + 1}. ${r.nickname} — ${r.money}€ (${r.lotsWon} lotes)`)
          .join("\n");
        this.statusText.setText("FIN DE LA PARTIDA");
        this.revealText.setText(table);
        window.dispatchEvent(new CustomEvent("tw:gameover", { detail: msg }));
        break;
      }
      case "S2C_ERROR": {
        this.statusText.setText(`⚠ ${msg.message} (${msg.code})`);
        break;
      }
      default:
        break;
    }
  }

  setPlayerId(id: string): void {
    this.playerId = id;
    localStorage.setItem("tw.playerId", id);
  }

  private updateTimer(): void {
    if (!this.auction || this.phase !== "AUCTION") {
      this.timerText.setText("");
      return;
    }
    const left = Math.max(0, this.auction.endsAt - Date.now());
    this.timerText.setText(`${(left / 1000).toFixed(1)}s`);
  }
}
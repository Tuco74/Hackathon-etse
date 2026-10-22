import { CONFIG, type AuctionState, type GamePhase, type LotPublic, type PlayerPublic, type S2CMessage } from "@trastero/shared";

type RevealMsg = Extract<S2CMessage, { type: "S2C_REVEAL" }>;
type RoulettePhaseMsg = Extract<S2CMessage, { type: "S2C_ROULETTE_PHASE" }>;
type RouletteResultMsg = Extract<S2CMessage, { type: "S2C_ROULETTE_RESULT" }>;
type GameOverMsg = Extract<S2CMessage, { type: "S2C_GAME_OVER" }>;
type RoomStateMsg = Extract<S2CMessage, { type: "S2C_ROOM_STATE" }>;

/**
 * Single source of truth for the client's view of the match.
 * Nothing here is authoritative: the server owns all rules, money and timers.
 */
class Session {
  playerId = "";
  nickname = "";
  roomCode = "";
  phase: GamePhase = "LOBBY";
  round = 0;
  totalRounds = 0;
  players: PlayerPublic[] = [];

  lot: LotPublic | null = null;
  auction: AuctionState | null = null;
  reveal: RevealMsg | null = null;
  roulettePhase: RoulettePhaseMsg | null = null;
  rouletteResult: RouletteResultMsg | null = null;
  /** local estimate of the betting window end (server sends windowSec) */
  rouletteEndsAt = 0;
  gameOver: GameOverMsg | null = null;

  /** Player money at the end of each round (public data, for the final chart). */
  moneyHistory: Array<{ round: number; money: Record<string, number> }> = [];
  /** Every reveal, for best/worst purchase summaries. */
  revealHistory: Array<{
    round: number;
    winnerId: string | null;
    winningBid: number;
    total: number;
    profit: number | null;
  }> = [];

  /** server clock minus local clock, estimated from PONG samples */
  clockOffset = 0;
  /** last gateway status for the connection banner */
  netStatus: "idle" | "connecting" | "open" | "reconnecting" | "closed" = "idle";
  rttMs = 0;
  /** private reconnect token from S2C_JOINED (never broadcast) */
  token = "";

  now(): number {
    return Date.now() + this.clockOffset;
  }

  me(): PlayerPublic | undefined {
    return this.players.find((p) => p.id === this.playerId);
  }

  money(): number {
    return this.me()?.money ?? 0;
  }

  apply(msg: S2CMessage): void {
    switch (msg.type) {
      case "S2C_JOINED": {
        this.playerId = msg.playerId;
        this.token = msg.token;
        this.roomCode = msg.roomCode;
        break;
      }
      case "S2C_ROOM_STATE": {
        this.applyRoomState(msg);
        break;
      }
      case "S2C_ROUND_INTRO": {
        this.phase = "ROUND_INTRO";
        this.lot = msg.lot;
        this.round = msg.round;
        this.auction = null;
        this.reveal = null;
        this.roulettePhase = null;
        this.rouletteResult = null;
        break;
      }
      case "S2C_AUCTION_STATE": {
        this.phase = "AUCTION";
        this.auction = msg.state;
        break;
      }
      case "S2C_BID_EVENT": {
        if (this.auction) {
          this.auction = {
            ...this.auction,
            currentBid: msg.amount,
            highBidderId: msg.playerId,
            endsAt: msg.endsAt,
            extensionsUsed: msg.extensionsUsed,
            minNextBid: msg.amount + CONFIG.auction.minIncrement,
          };
        }
        break;
      }
      case "S2C_REVEAL": {
        this.phase = "REVEAL";
        this.reveal = msg;
        this.auction = null;
        if (!this.revealHistory.some((entry) => entry.round === this.round)) {
          this.revealHistory.push({
            round: this.round,
            winnerId: msg.winnerId,
            winningBid: msg.winningBid,
            total: msg.total,
            profit: msg.profit,
          });
        }
        break;
      }
      case "S2C_ROULETTE_PHASE": {
        const newPhase = this.roulettePhase?.hashSeed !== msg.hashSeed;
        this.phase = "ROULETTE";
        this.roulettePhase = msg;
        this.rouletteResult = null;
        // Snapshots are re-broadcast on every bet/pass: don't reset the countdown.
        if (newPhase) this.rouletteEndsAt = this.now() + msg.windowSec * 1000;
        break;
      }
      case "S2C_ROULETTE_RESULT": {
        this.rouletteResult = msg;
        break;
      }
      case "S2C_GAME_OVER": {
        this.phase = "GAME_OVER";
        this.gameOver = msg;
        break;
      }
      default:
        break;
    }
  }

  private applyRoomState(msg: RoomStateMsg): void {
    this.roomCode = msg.roomCode;
    this.phase = msg.phase;
    this.round = msg.round;
    this.totalRounds = msg.totalRounds;
    this.players = msg.players;
    // Own seat is identified by the DOM shell (roster delta on join), not by
    // nickname: two players may share a nickname.

    // One money snapshot per round: the chart needs it and there is no
    // historical endpoint in the protocol.
    if (this.round > 0 && msg.phase !== "LOBBY" && !this.moneyHistory.some((s) => s.round === this.round)) {
      const money: Record<string, number> = {};
      for (const player of msg.players) money[player.id] = player.money;
      this.moneyHistory.push({ round: this.round, money });
    }

  }

  resetForNewMatch(): void {
    this.lot = null;
    this.auction = null;
    this.reveal = null;
    this.roulettePhase = null;
    this.rouletteResult = null;
    this.rouletteEndsAt = 0;
    this.gameOver = null;
    this.moneyHistory = [];
    this.revealHistory = [];
  }
}

export const session = new Session();

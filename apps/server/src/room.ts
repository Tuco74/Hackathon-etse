import { randomUUID, createHash } from "node:crypto";
import type { WebSocket } from "ws";
import {
  CONFIG,
  type C2SMessage,
  type S2CMessage,
  type GamePhase,
  type AuctionState,
} from "@trastero/shared";
import {
  startMatch, setReady, canStart, startGame, placeBid, tick, reveal,
  afterReveal, placeRouletteBet, ranking, minNextBid,
  type MatchState, type Rng,
} from "@trastero/game-core";

interface Conn {
  id: string;
  playerId: string;
  nickname: string;
  ws: WebSocket;
  room: Room | null;
}

const TICK_MS = 200;
const REVEAL_MS = 6000;
const INTRO_MS = 3000;
// The roulette result needs a beat on screen before the next lot is announced.
const RESULT_PAUSE_MS = 4000;

export function seededRng(seed: number): Rng {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

export class Room {
  readonly code: string;
  private conns = new Map<string, Conn>(); // playerId -> conn
  private state: MatchState;
  private rng: Rng;
  private timer: NodeJS.Timeout | null = null;
  private phaseDeadline = 0;
  private pendingIntroDeadline = 0;
  private gameOverAnnounced = false;
  private readonly totalRounds: number;

  constructor(code: string, totalRounds: number = CONFIG.match.rounds) {
    this.code = code;
    this.totalRounds = totalRounds;
    this.rng = seededRng(Date.now() % 2147483647);
    this.state = startMatch([], code, this.rng, () => Date.now());
    this.state.totalRounds = totalRounds;
  }

  get playerCount(): number {
    return this.conns.size;
  }

  get isEmpty(): boolean {
    return this.conns.size === 0;
  }

  get phase(): GamePhase {
    return this.state.phase;
  }

  join(conn: Conn, nickname: string): string | { error: string } {
    if (this.conns.size >= CONFIG.match.maxPlayers) return { error: "ROOM_FULL" };
    if (this.state.phase !== "LOBBY") return { error: "PHASE_INVALID" };

    const playerId = randomUUID();
    conn.playerId = playerId;
    conn.nickname = nickname;
    conn.room = this;
    this.conns.set(playerId, conn);

    this.state = startMatch(
      [...this.conns.values()].map(c => ({ id: c.playerId, nickname: c.nickname })),
      this.code,
      this.rng,
      () => Date.now(),
    );
    this.state.totalRounds = this.totalRounds;
    // preserve readiness of players that already toggled
    this.broadcastRoomState();
    return playerId;
  }

  leave(playerId: string): void {
    const conn = this.conns.get(playerId);
    if (!conn) return;
    conn.room = null;
    if (this.state.phase === "LOBBY") {
      this.conns.delete(playerId);
      this.state = {
        ...this.state,
        players: this.state.players.filter(p => p.id !== playerId),
      };
    } else {
      // reserve seat 45s
      this.state = {
        ...this.state,
        players: this.state.players.map(p =>
          p.id === playerId
            ? { ...p, connected: false, seatReservedUntil: Date.now() + CONFIG.reconnect.seatReserveSec * 1000 }
            : p,
        ),
      };
      this.conns.delete(playerId);
    }
    this.broadcastRoomState();
  }

  reconnect(conn: Conn, playerId: string): boolean {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return false;
    if (player.connected && this.conns.has(playerId)) return false;
    conn.playerId = playerId;
    conn.nickname = player.nickname;
    conn.room = this;
    this.conns.set(playerId, conn);
    this.state = {
      ...this.state,
      players: this.state.players.map(p =>
        p.id === playerId ? { ...p, connected: true, seatReservedUntil: null } : p,
      ),
    };
    this.broadcastRoomState();
    this.sendAuctionState(conn);
    return true;
  }

  handle(conn: Conn, msg: C2SMessage): void {
    switch (msg.type) {
      case "C2S_SET_READY": {
        this.state = setReady(this.state, conn.playerId, msg.ready);
        this.broadcastRoomState();
        break;
      }
      case "C2S_START_GAME": {
        if (this.state.phase !== "LOBBY") {
          this.sendError(conn, "PHASE_INVALID", "La partida ya ha empezado");
          return;
        }
        if (!canStart(this.state)) {
          this.sendError(conn, "NOT_ALL_READY", "Faltan jugadores o no están listos");
          return;
        }
        this.state = startGame(this.state, this.rng, () => Date.now());
        this.beginIntro();
        break;
      }
      case "C2S_BID": {
        const res = placeBid(this.state, conn.playerId, msg.amount, () => Date.now());
        if (!res.ok) {
          this.sendError(conn, (res.error ?? "BID_TOO_LOW") as never, "Puja rechazada");
          return;
        }
        this.state = res.state;
        const a = this.state.currentRound?.auction;
        if (a) {
          this.broadcast({
            type: "S2C_BID_EVENT",
            playerId: conn.playerId,
            amount: a.currentBid,
            endsAt: a.endsAt,
            extensionsUsed: a.extensionsUsed,
          });
        }
        this.broadcastAuctionState();
        break;
      }
      case "C2S_ROULETTE_BET": {
        const res = placeRouletteBet(this.state, conn.playerId, msg.choice, msg.amount);
        if (!res.ok) {
          this.sendError(conn, (res.error ?? "ALREADY_BET") as never, "Apuesta rechazada");
          return;
        }
        this.state = res.state;
        this.broadcastRoomState();
        break;
      }
      case "C2S_EMOTE": {
        if (!CONFIG.features.emotes) return;
        this.broadcast({ type: "S2C_ERROR", code: "UNKNOWN_MESSAGE", message: `emote:${msg.emoteId}` });
        break;
      }
      case "C2S_PING": {
        this.send(conn, { type: "S2C_PONG", clientTs: msg.clientTs, serverTs: Date.now() });
        break;
      }
      default:
        break;
    }
  }

  startLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.loop(), TICK_MS);
  }

  stopLoop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private loop(): void {
    const now = Date.now();
    if (this.state.phase === "AUCTION" || this.state.phase === "ROULETTE") {
      const before = this.state.phase;
      this.state = tick(this.state, () => now, this.rng);
      if (before === "AUCTION" && this.state.phase === "REVEAL") {
        this.state = reveal(this.state);
        this.broadcastReveal();
        this.phaseDeadline = now + REVEAL_MS;
      } else if (before === "ROULETTE" && this.state.phase !== "ROULETTE") {
        // spinRoulette already advanced the match (next round or GAME_OVER)
        this.broadcastRouletteResult();
        this.phaseDeadline = now + REVEAL_MS;
        // The next round exists already, but its lot was never announced:
        // without this, players bid blind after every roulette. Announce it
        // once the result has been on screen for a moment.
        if (this.state.phase !== "GAME_OVER") {
          this.pendingIntroDeadline = now + RESULT_PAUSE_MS;
        }
      }
      if (
        this.pendingIntroDeadline > 0 &&
        now >= this.pendingIntroDeadline &&
        this.state.phase === "AUCTION"
      ) {
        this.pendingIntroDeadline = 0;
        this.beginIntro();
      }
      this.announceGameOverIfNeeded();
    } else if (this.state.phase === "REVEAL" && this.phaseDeadline && now >= this.phaseDeadline) {
      this.phaseDeadline = 0;
      this.state = afterReveal(this.state, this.rng, () => Date.now());
      if (this.state.phase === "ROULETTE") {
        this.broadcastRoulettePhase();
        const rp = this.state.roulette;
        if (rp) this.phaseDeadline = rp.windowEndsAt;
      } else if (this.state.phase !== "GAME_OVER") {
        this.beginIntro();
      }
      this.announceGameOverIfNeeded();
    } else if (this.state.phase === "ROUND_INTRO" && this.phaseDeadline && now >= this.phaseDeadline) {
      this.phaseDeadline = 0;
      this.broadcastRoomState();
      this.broadcastAuctionState();
    }
  }

  private announceGameOverIfNeeded(): void {
    if (this.state.phase === "GAME_OVER" && !this.gameOverAnnounced) {
      this.gameOverAnnounced = true;
      this.broadcastGameOver();
    }
  }

  /** Operational snapshot for /healthz. Never includes lot values. */
  describe(): { round: number; totalRounds: number; phase: GamePhase; money: Record<string, number> } {
    return {
      round: this.state.round,
      totalRounds: this.state.totalRounds,
      phase: this.state.phase,
      money: Object.fromEntries(this.state.players.map((p) => [p.nickname, p.money])),
    };
  }

  private beginIntro(): void {
    this.phaseDeadline = Date.now() + INTRO_MS;
    const r = this.state.currentRound;
    if (!r) return;
    this.broadcast({
      type: "S2C_ROUND_INTRO",
      round: r.round,
      lot: r.lotPublic,
      countdownSec: Math.ceil(INTRO_MS / 1000),
    });
    this.broadcastRoomState();
    // the auction is already open server-side; clients need the initial
    // per-player view (canBid / minNextBid) or nobody would ever bid
    this.broadcastAuctionState();
  }

  // ---------- outbound ----------

  private envelope(msg: S2CMessage) {
    return JSON.stringify({ v: 1, type: msg.type, id: randomUUID(), ts: Date.now(), payload: msg });
  }

  private send(conn: Conn, msg: S2CMessage): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(this.envelope(msg));
  }

  private broadcast(msg: S2CMessage): void {
    const data = this.envelope(msg);
    for (const c of this.conns.values()) {
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
    }
  }

  private sendError(conn: Conn, code: never | string, message: string): void {
    this.send(conn, { type: "S2C_ERROR", code: code as never, message });
  }

  broadcastRoomState(): void {
    this.broadcast({
      type: "S2C_ROOM_STATE",
      roomCode: this.code,
      phase: this.state.phase,
      round: this.state.round,
      totalRounds: this.state.totalRounds,
      players: this.state.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        money: p.money,
        ready: p.ready,
        connected: p.connected,
        seatReservedUntil: p.seatReservedUntil,
      })),
    });
  }

  private auctionStateFor(playerId: string): AuctionState {
    const r = this.state.currentRound;
    const a = r?.auction;
    const me = this.state.players.find(p => p.id === playerId);
    const current = a?.currentBid ?? 0;
    const next = a?.highBidderId === null ? CONFIG.auction.minBid : minNextBid(this.state);
    return {
      lotId: r?.lotPublic.id ?? "",
      currentBid: current,
      highBidderId: a?.highBidderId ?? null,
      endsAt: a?.endsAt ?? 0,
      extensionsUsed: a?.extensionsUsed ?? 0,
      minNextBid: next,
      canBid:
        this.state.phase === "AUCTION" &&
        !!me && me.connected &&
        a?.highBidderId !== playerId &&
        me.money >= next,
    };
  }

  private broadcastAuctionState(): void {
    for (const c of this.conns.values()) {
      this.send(c, { type: "S2C_AUCTION_STATE", state: this.auctionStateFor(c.playerId) });
    }
  }

  private sendAuctionState(conn: Conn): void {
    this.send(conn, { type: "S2C_AUCTION_STATE", state: this.auctionStateFor(conn.playerId) });
  }

  private broadcastReveal(): void {
    const r = this.state.currentRound;
    const d = r?.revealData;
    if (!r || !d) return;
    this.broadcast({
      type: "S2C_REVEAL",
      lotId: r.lotPublic.id,
      objects: d.objects,
      total: d.total,
      winnerId: d.winnerId,
      winningBid: d.winningBid,
      profit: d.profit,
    });
    this.broadcastRoomState();
  }

  private broadcastRoulettePhase(): void {
    const rp = this.state.roulette;
    if (!rp) return;
    this.broadcast({
      type: "S2C_ROULETTE_PHASE",
      // real commitment: sha256(seed). The seed stays on the server until the spin.
      hashSeed: commitHash(rp.seed ?? ""),
      windowSec: CONFIG.roulette.windowSec,
      players: this.state.players.map(p => ({ id: p.id, money: p.money })),
    });
  }

  private broadcastRouletteResult(): void {
    const rp = this.state.roulette;
    if (!rp || rp.result === null) return;
    this.broadcast({
      type: "S2C_ROULETTE_RESULT",
      seed: rp.seed ?? "",
      result: rp.result,
      payouts: rp.payouts,
    });
    this.broadcastRoomState();
  }

  private broadcastGameOver(): void {
    const r = ranking(this.state);
    this.broadcast({
      type: "S2C_GAME_OVER",
      ranking: r,
      winnerId: this.state.winnerId ?? r[0]?.playerId ?? "",
    });
    this.broadcastRoomState();
  }
}

export function commitHash(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}
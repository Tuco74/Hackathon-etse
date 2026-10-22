import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  CONFIG,
  type AuctionState,
  type C2SMessage,
  type ErrorCode,
  type GamePhase,
  type S2CMessage,
} from "@trastero/shared";
import {
  afterReveal,
  canSpinRoulette,
  canStart,
  minNextBid,
  passRoulette,
  placeBid,
  placeRouletteBet,
  ranking,
  reveal,
  setReady,
  spinRoulette,
  startGame,
  startMatch,
  tick,
  type MatchState,
  type Rng,
} from "@trastero/game-core";
import { createClock } from "./clock.js";
import { createLogger, type Logger } from "./log.js";

/** Structural socket type so tests can use a double (no real WebSocket). */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate?(): void;
}

export interface Conn {
  id: string;
  playerId: string;
  nickname: string;
  ws: SocketLike;
  room: Room | null;
}

export interface RoomOptions {
  totalRounds?: number;
  now?: () => number;
  rng?: Rng;
  log?: Logger;
  introMs?: number;
  revealMs?: number;
}

export type RoomError = { ok: false; error: ErrorCode; message: string };
export type JoinResult = { ok: true; playerId: string; token: string } | RoomError;
export type ReconnectResult = { ok: true } | RoomError;

type Msg<T extends S2CMessage["type"]> = Extract<S2CMessage, { type: T }>;

const WS_OPEN = 1;

export function seededRng(seed: number): Rng {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

export class Room {
  readonly code: string;
  private conns = new Map<string, Conn>(); // playerId (connected) -> conn
  private tokens = new Map<string, string>(); // playerId -> reconnect token
  private state: MatchState;
  private rng: Rng;
  private now: () => number;
  private log: Logger;
  private timer: NodeJS.Timeout | null = null;
  private phaseDeadline = 0;
  private introDeadline = 0;
  private gameOverAnnounced = false;
  private lastPhase: GamePhase;
  private readonly totalRounds: number;
  private readonly introMs: number;
  private readonly revealMs: number;

  constructor(code: string, opts: RoomOptions = {}) {
    this.code = code.toUpperCase();
    this.totalRounds = opts.totalRounds ?? CONFIG.match.rounds;
    this.now = opts.now ?? createClock().now;
    this.rng = opts.rng ?? seededRng((Date.now() ^ (process.pid * 2654435761)) >>> 0);
    this.log = opts.log ?? createLogger(`room:${this.code}`);
    this.introMs = opts.introMs ?? CONFIG.server.introMs;
    this.revealMs = opts.revealMs ?? CONFIG.server.revealMs;
    this.state = startMatch([], this.code, this.rng, this.now);
    this.state.totalRounds = this.totalRounds;
    this.lastPhase = this.state.phase;
  }

  get playerCount(): number {
    return this.conns.size;
  }

  get seatCount(): number {
    return this.state.players.length;
  }

  get isEmpty(): boolean {
    return this.conns.size === 0;
  }

  get phase(): GamePhase {
    return this.state.phase;
  }

  /** True when nobody can come back: safe to drop from the rooms map. */
  canDispose(): boolean {
    if (this.conns.size > 0) return false;
    if (this.state.phase === "LOBBY" || this.state.phase === "GAME_OVER") return true;
    return this.state.players.every((p) => !p.connected && p.seatReservedUntil === null);
  }

  // ---------------------------------------------------------------- membership

  join(conn: Conn, nicknameRaw: string): JoinResult {
    const nickname = nicknameRaw.trim();
    if (this.state.phase !== "LOBBY") {
      return { ok: false, error: "GAME_ALREADY_STARTED", message: "La partida ya ha empezado" };
    }
    if (this.state.players.length >= CONFIG.match.maxPlayers) {
      return { ok: false, error: "ROOM_FULL", message: "La sala está llena" };
    }
    if (nickname.length < 1 || nickname.length > 16) {
      return { ok: false, error: "INVALID_PAYLOAD", message: "Apodo de 1–16 caracteres" };
    }
    if (this.state.players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      return { ok: false, error: "NAME_TAKEN", message: "Ese apodo ya está en uso" };
    }

    const playerId = randomUUID();
    const readyBefore = new Map(this.state.players.map((p) => [p.id, p.ready]));
    this.state = startMatch(
      [...this.state.players.map((p) => ({ id: p.id, nickname: p.nickname })), { id: playerId, nickname }],
      this.code,
      this.rng,
      this.now,
    );
    this.state.totalRounds = this.totalRounds;
    // Rejoining the lobby used to wipe everyone else's "ready" flag.
    this.state.players = this.state.players.map((p) => ({
      ...p,
      ready: readyBefore.get(p.id) ?? false,
    }));

    const token = randomBytes(32).toString("hex");
    this.tokens.set(playerId, token);
    conn.playerId = playerId;
    conn.nickname = nickname;
    conn.room = this;
    this.conns.set(playerId, conn);

    this.send(conn, {
      type: "S2C_JOINED",
      roomCode: this.code,
      playerId,
      token,
      reconnected: false,
    });
    this.log.info("join", { playerId, nickname, seats: this.state.players.length });
    this.broadcastRoomState();
    return { ok: true, playerId, token };
  }

  reconnect(conn: Conn, playerId: string, token: string): ReconnectResult {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) {
      return { ok: false, error: "RECONNECT_FAILED", message: "Asiento desconocido" };
    }
    if (!this.tokenMatches(playerId, token)) {
      if (!player.connected && player.seatReservedUntil === null) {
        return { ok: false, error: "SEAT_EXPIRED", message: "La reserva de asiento caducó" };
      }
      return { ok: false, error: "RECONNECT_FAILED", message: "Token de reconexión no válido" };
    }
    if (player.seatReservedUntil !== null && this.now() >= player.seatReservedUntil) {
      this.tokens.delete(playerId);
      return { ok: false, error: "SEAT_EXPIRED", message: "La reserva de asiento caducó" };
    }

    const previous = this.conns.get(playerId);
    if (previous && previous !== conn) {
      if (player.connected) {
        return { ok: false, error: "ALREADY_JOINED", message: "Ese jugador ya está conectado" };
      }
      // stale socket that never fired close: replace it
      previous.room = null;
      try {
        previous.ws.close(4001, "replaced");
      } catch {
        /* ignore */
      }
    }

    conn.playerId = playerId;
    conn.nickname = player.nickname;
    conn.room = this;
    this.conns.set(playerId, conn);
    this.state = {
      ...this.state,
      players: this.state.players.map((p) =>
        p.id === playerId ? { ...p, connected: true, seatReservedUntil: null } : p,
      ),
    };

    this.send(conn, {
      type: "S2C_JOINED",
      roomCode: this.code,
      playerId,
      token,
      reconnected: true,
    });
    this.log.info("reconnect", { playerId, phase: this.state.phase, round: this.state.round });
    this.broadcastRoomState();
    this.resync(conn);
    return { ok: true };
  }

  leave(conn: Conn): void {
    const playerId = conn.playerId;
    if (!playerId) return;
    if (this.conns.get(playerId) !== conn) {
      conn.room = null; // stale socket: the seat belongs to a newer connection
      return;
    }
    this.conns.delete(playerId);
    conn.room = null;

    if (this.state.phase === "LOBBY") {
      this.tokens.delete(playerId);
      this.state = {
        ...this.state,
        players: this.state.players.filter((p) => p.id !== playerId),
      };
      this.log.info("leave_lobby", { playerId });
    } else {
      this.state = {
        ...this.state,
        players: this.state.players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                connected: false,
                seatReservedUntil: this.now() + CONFIG.reconnect.seatReserveSec * 1000,
              }
            : p,
        ),
      };
      this.log.info("seat_reserved", {
        playerId,
        seconds: CONFIG.reconnect.seatReserveSec,
        phase: this.state.phase,
      });
      // A disconnected player cannot decide: auto-pass so the rest can spin.
      if (this.state.phase === "ROULETTE") {
        const res = passRoulette(this.state, playerId);
        if (res.ok) this.state = res.state;
      }
    }
    this.broadcastRoomState();
    if (this.state.phase === "ROULETTE") this.broadcastRoulettePhase();
  }

  // ------------------------------------------------------------------- inputs

  handle(conn: Conn, msg: C2SMessage, refId?: string): void {
    switch (msg.type) {
      case "C2S_SET_READY": {
        if (this.state.phase !== "LOBBY") {
          this.sendError(conn, "PHASE_INVALID", "La partida ya ha empezado", refId);
          return;
        }
        this.state = setReady(this.state, conn.playerId, msg.ready);
        this.broadcastRoomState();
        break;
      }
      case "C2S_START_GAME": {
        if (this.state.phase !== "LOBBY") {
          this.sendError(conn, "PHASE_INVALID", "La partida ya ha empezado", refId);
          return;
        }
        if (!canStart(this.state)) {
          this.sendError(conn, "NOT_ALL_READY", "Faltan jugadores o no están listos", refId);
          return;
        }
        this.state = startGame(this.state, this.rng, this.now);
        this.log.info("game_start", {
          players: this.state.players.length,
          rounds: this.state.totalRounds,
        });
        this.beginIntro();
        break;
      }
      case "C2S_BID": {
        const res = placeBid(this.state, conn.playerId, msg.amount, this.now);
        if (!res.ok) {
          this.sendError(conn, (res.error ?? "BID_TOO_LOW") as ErrorCode, "Puja rechazada", refId);
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
          this.log.info("bid", {
            playerId: conn.playerId,
            amount: a.currentBid,
            round: this.state.round,
            extensionsUsed: a.extensionsUsed,
          });
        }
        this.broadcastAuctionState();
        break;
      }
      case "C2S_ROULETTE_BET": {
        const rp = this.state.roulette;
        if (this.state.phase !== "ROULETTE" || !rp || rp.spun || this.now() >= rp.windowEndsAt) {
          this.sendError(conn, "PHASE_INVALID", "La ventana de apuestas está cerrada", refId);
          return;
        }
        const res = placeRouletteBet(this.state, conn.playerId, msg.choice, msg.amount);
        if (!res.ok) {
          this.sendError(conn, (res.error ?? "ALREADY_BET") as ErrorCode, "Apuesta rechazada", refId);
          return;
        }
        this.state = res.state;
        this.log.info("roulette_bet", {
          playerId: conn.playerId,
          choice: msg.choice,
          amount: msg.amount,
        });
        this.broadcastRoulettePhase();
        break;
      }
      case "C2S_ROULETTE_PASS": {
        const res = passRoulette(this.state, conn.playerId);
        if (!res.ok) {
          this.sendError(conn, (res.error ?? "PHASE_INVALID") as ErrorCode, "No puedes pasar", refId);
          return;
        }
        this.state = res.state;
        this.log.info("roulette_pass", { playerId: conn.playerId });
        if (canSpinRoulette(this.state) && (this.state.roulette?.bets.length ?? 0) === 0) {
          // nobody bet: skip the wheel entirely and go straight to the next lot
          this.state = spinRoulette(this.state, this.rng, this.now);
          this.finishRoulette(this.now(), true);
        } else {
          this.broadcastRoulettePhase();
        }
        break;
      }
      case "C2S_ROULETTE_SPIN": {
        if (!canSpinRoulette(this.state)) {
          this.sendError(
            conn,
            "SPIN_NOT_READY",
            "Faltan jugadores por apostar o pasar",
            refId,
          );
          return;
        }
        const skipped = (this.state.roulette?.bets.length ?? 0) === 0;
        this.state = spinRoulette(this.state, this.rng, this.now);
        this.log.info("roulette_spin_requested", { playerId: conn.playerId, skipped });
        this.finishRoulette(this.now(), skipped);
        break;
      }
      case "C2S_EMOTE": {
        if (!CONFIG.features.emotes) return;
        this.broadcast({ type: "S2C_EMOTE", playerId: conn.playerId, emoteId: msg.emoteId });
        break;
      }
      case "C2S_PING": {
        this.send(conn, { type: "S2C_PONG", clientTs: msg.clientTs, serverTs: this.now() });
        break;
      }
      default:
        break;
    }
  }

  // -------------------------------------------------------------------- timers

  startLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), CONFIG.server.tickMs);
  }

  stopLoop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One server tick. Public so integration tests can drive the fake clock. */
  tick(): void {
    const now = this.now();
    if (this.expireSeats(now)) this.broadcastRoomState();

    // Give the roulette result a beat on screen before the next lot (D-D03).
    if (this.introDeadline > 0 && now >= this.introDeadline) {
      this.introDeadline = 0;
      if (this.state.phase === "AUCTION") this.beginIntro();
    }

    if (this.state.phase === "GAME_OVER") {
      this.logPhaseChange();
      return;
    }

    if (this.state.phase === "AUCTION" || this.state.phase === "ROULETTE") {
      const before = this.state.phase;
      this.state = tick(this.state, () => now, this.rng);

      if (before === "AUCTION" && this.state.phase === "REVEAL") {
        this.state = reveal(this.state);
        this.broadcastReveal();
        this.phaseDeadline = now + this.revealMs;
        this.log.info("auction_closed", {
          round: this.state.round,
          deserted: this.state.currentRound?.deserted ?? true,
          winnerId: this.state.currentRound?.winnerId ?? null,
        });
      } else if (before === "ROULETTE" && this.state.phase !== "ROULETTE") {
        this.finishRoulette(now, (this.state.roulette?.bets.length ?? 0) === 0);
      }
    } else if (this.state.phase === "REVEAL" && this.phaseDeadline > 0 && now >= this.phaseDeadline) {
      this.phaseDeadline = 0;
      this.state = afterReveal(this.state, this.rng, () => now);

      if (this.state.phase === "ROULETTE") {
        const rp = this.state.roulette;
        this.broadcastRoulettePhase();
        this.phaseDeadline = rp?.windowEndsAt ?? now + CONFIG.roulette.windowSec * 1000;
        this.log.info("roulette_open", { round: this.state.round });
      } else if (this.state.phase !== "GAME_OVER") {
        this.beginIntro();
      }
    }

    this.announceGameOverIfNeeded();
    this.logPhaseChange();
  }

  private beginIntro(): void {
    this.logPhaseChange();
    const r = this.state.currentRound;
    if (!r) return;
    this.phaseDeadline = this.now() + this.introMs;
    this.broadcast({
      type: "S2C_ROUND_INTRO",
      round: r.round,
      lot: r.lotPublic,
      countdownSec: Math.ceil(this.introMs / 1000),
    });
    this.broadcastRoomState();
    // The auction is already open server-side: clients need canBid/minNextBid.
    this.broadcastAuctionState();
    this.log.info("round_intro", { round: r.round, objects: r.lotPublic.objectCount });
  }

  private expireSeats(now: number): boolean {
    let changed = false;
    this.state = {
      ...this.state,
      players: this.state.players.map((p) => {
        if (!p.connected && p.seatReservedUntil !== null && now >= p.seatReservedUntil) {
          this.tokens.delete(p.id);
          changed = true;
          this.log.info("seat_expired", { playerId: p.id });
          return { ...p, seatReservedUntil: null };
        }
        return p;
      }),
    };
    return changed;
  }

  private finishRoulette(now: number, skipped: boolean): void {
    this.broadcastRouletteResult(skipped);
    if (this.state.phase === "AUCTION") {
      if (skipped) this.beginIntro(); // no bets -> no animation, no pause
      else this.introDeadline = now + CONFIG.server.resultPauseMs;
    }
    this.phaseDeadline = 0;
    this.announceGameOverIfNeeded();
    this.logPhaseChange();
  }

  private announceGameOverIfNeeded(): void {
    if (this.state.phase === "GAME_OVER" && !this.gameOverAnnounced) {
      this.gameOverAnnounced = true;
      this.broadcastGameOver();
      this.log.info("game_over", { round: this.state.round });
    }
  }

  private logPhaseChange(): void {
    if (this.state.phase === this.lastPhase) return;
    this.log.info("phase", {
      from: this.lastPhase,
      to: this.state.phase,
      round: this.state.round,
    });
    this.lastPhase = this.state.phase;
  }

  /** Operational snapshot for /healthz. Never includes lot values. */
  describe(): {
    round: number;
    totalRounds: number;
    phase: GamePhase;
    seats: number;
    connected: number;
    money: Record<string, number>;
  } {
    return {
      round: this.state.round,
      totalRounds: this.state.totalRounds,
      phase: this.state.phase,
      seats: this.state.players.length,
      connected: this.state.players.filter((p) => p.connected).length,
      money: Object.fromEntries(this.state.players.map((p) => [p.nickname, p.money])),
    };
  }

  // ------------------------------------------------------------------ outbound

  private envelope(msg: S2CMessage): string {
    return JSON.stringify({ v: 1, type: msg.type, id: randomUUID(), ts: this.now(), payload: msg });
  }

  private send(conn: Conn, msg: S2CMessage): void {
    if (conn.ws.readyState === WS_OPEN) conn.ws.send(this.envelope(msg));
  }

  private sendError(conn: Conn, code: ErrorCode, message: string, refId?: string): void {
    const payload: Msg<"S2C_ERROR"> = refId
      ? { type: "S2C_ERROR", code, message, refId }
      : { type: "S2C_ERROR", code, message };
    this.send(conn, payload);
  }

  private broadcast(msg: S2CMessage): void {
    const data = this.envelope(msg);
    for (const c of this.conns.values()) {
      if (c.ws.readyState === WS_OPEN) c.ws.send(data);
    }
  }

  broadcastRoomState(): void {
    this.broadcast(this.roomStateMsg());
  }

  private roomStateMsg(): Msg<"S2C_ROOM_STATE"> {
    return {
      type: "S2C_ROOM_STATE",
      roomCode: this.code,
      phase: this.state.phase,
      round: this.state.round,
      totalRounds: this.state.totalRounds,
      players: this.state.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        money: p.money,
        ready: p.ready,
        connected: p.connected,
        seatReservedUntil: p.seatReservedUntil,
      })),
    };
  }

  private auctionStateFor(playerId: string): AuctionState {
    const r = this.state.currentRound;
    const a = r?.auction;
    const me = this.state.players.find((p) => p.id === playerId);
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
        !!me &&
        me.connected &&
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

  private roulettePhaseMsg(): Msg<"S2C_ROULETTE_PHASE"> | null {
    const rp = this.state.roulette;
    if (!rp) return null;
    const remainingMs = Math.max(0, rp.windowEndsAt - this.now());
    return {
      type: "S2C_ROULETTE_PHASE",
      // commitment: sha256(seed). The seed itself stays server-side until the spin.
      hashSeed: commitHash(rp.seed ?? ""),
      windowSec: Math.ceil(remainingMs / 1000),
      players: this.state.players.map((p) => ({ id: p.id, money: p.money })),
      bets: rp.bets.map((b) => ({ playerId: b.playerId, choice: b.choice, amount: b.amount })),
      passed: [...rp.passed],
      readyToSpin: canSpinRoulette(this.state),
    };
  }

  private broadcastRoulettePhase(): void {
    const msg = this.roulettePhaseMsg();
    if (msg) this.broadcast(msg);
  }

  private rouletteResultMsg(skipped: boolean): Msg<"S2C_ROULETTE_RESULT"> | null {
    const rp = this.state.roulette;
    if (!rp || rp.result === null) return null;
    return {
      type: "S2C_ROULETTE_RESULT",
      seed: rp.seed ?? "",
      result: rp.result,
      skipped,
      payouts: rp.payouts,
    };
  }

  private broadcastRouletteResult(skipped: boolean): void {
    const msg = this.rouletteResultMsg(skipped);
    if (!msg) return;
    this.broadcast(msg);
    this.log.info("roulette_spin", { round: this.state.round, result: msg.result, skipped });
    this.broadcastRoomState();
  }

  private gameOverMsg(): Msg<"S2C_GAME_OVER"> {
    const r = ranking(this.state);
    return {
      type: "S2C_GAME_OVER",
      ranking: r,
      winnerId: this.state.winnerId ?? r[0]?.playerId ?? "",
    };
  }

  private broadcastGameOver(): void {
    this.broadcast(this.gameOverMsg());
    this.broadcastRoomState();
  }

  /** Full public snapshot after a reconnect, so the client can resume mid-phase. */
  private resync(conn: Conn): void {
    this.send(conn, this.roomStateMsg());
    const r = this.state.currentRound;
    const now = this.now();

    if ((this.state.phase === "AUCTION" || this.state.phase === "ROUND_INTRO") && r) {
      this.send(conn, {
        type: "S2C_ROUND_INTRO",
        round: r.round,
        lot: r.lotPublic,
        countdownSec: Math.max(0, Math.ceil(((r.auction?.endsAt ?? now) - now) / 1000)),
      });
      this.sendAuctionState(conn);
    } else if (this.state.phase === "REVEAL" && r?.revealData) {
      const d = r.revealData;
      this.send(conn, {
        type: "S2C_REVEAL",
        lotId: r.lotPublic.id,
        objects: d.objects,
        total: d.total,
        winnerId: d.winnerId,
        winningBid: d.winningBid,
        profit: d.profit,
      });
    } else if (this.state.phase === "ROULETTE") {
      const rp = this.state.roulette;
      if (rp && !rp.spun) {
        const phase = this.roulettePhaseMsg();
        if (phase) this.send(conn, phase);
      } else {
        const result = this.rouletteResultMsg((this.state.roulette?.bets.length ?? 0) === 0);
        if (result) this.send(conn, result);
      }
    } else if (this.state.phase === "GAME_OVER") {
      this.send(conn, this.gameOverMsg());
    }
  }

  private tokenMatches(playerId: string, token: string): boolean {
    const expected = this.tokens.get(playerId);
    if (!expected) return false;
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(token, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

export function commitHash(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

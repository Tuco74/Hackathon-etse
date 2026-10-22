import { describe, expect, it } from "vitest";
import { CONFIG, type S2CMessage } from "@trastero/shared";
import { rouletteResultFromSeed } from "@trastero/game-core";
import { commitHash, Room, seededRng } from "./room.js";
import { decode, fakeClock, makeConn, rawText, silentLogger, type FakeSocket } from "./testing.js";

type Joined = Extract<S2CMessage, { type: "S2C_JOINED" }>;
type GameOver = Extract<S2CMessage, { type: "S2C_GAME_OVER" }>;

function lastOf<T extends S2CMessage["type"]>(
  ws: FakeSocket,
  type: T,
): Extract<S2CMessage, { type: T }> | undefined {
  const msgs = decode(ws);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (m.type === type) return m as Extract<S2CMessage, { type: T }>;
  }
  return undefined;
}

function joined(ws: FakeSocket): Joined {
  const m = lastOf(ws, "S2C_JOINED");
  if (!m) throw new Error("S2C_JOINED not received");
  return m;
}

function setup(players: number, rounds: number, seed = 42) {
  const clock = fakeClock();
  const room = new Room("ABCD", {
    totalRounds: rounds,
    now: clock.now,
    rng: seededRng(seed),
    log: silentLogger,
  });
  const conns: { conn: ReturnType<typeof makeConn>["conn"]; ws: FakeSocket }[] = [];
  for (let i = 0; i < players; i++) {
    const c = makeConn();
    const res = room.join(c.conn, `P${i + 1}`);
    if (!res.ok) throw new Error(`join failed: ${res.error}`);
    conns.push(c);
  }
  return { room, clock, conns };
}

function startGame(room: Room, conns: { conn: ReturnType<typeof makeConn>["conn"] }[]) {
  for (const c of conns) room.handle(c.conn, { type: "C2S_SET_READY", ready: true });
  room.handle(conns[0]!.conn, { type: "C2S_START_GAME" });
}

interface PlayResult {
  gameOver: GameOver | null;
  bidEvents: number;
  intros: number[];
  roulettePhases: { hashSeed: string; windowSec: number }[];
  rouletteResults: { seed: string; result: number }[];
}

/** Drives the fake clock and plays like a room full of simple bots. */
function playMatch(
  room: Room,
  clock: ReturnType<typeof fakeClock>,
  conns: { conn: ReturnType<typeof makeConn>["conn"]; ws: FakeSocket }[],
  maxTicks = 6000,
): PlayResult {
  const cursors = new Map<FakeSocket, number>();
  for (const c of conns) cursors.set(c.ws, 0);
  const roundBids = new Map<string, number>();
  const betPlaced = new Set<string>();
  const bidEvents = new Set<string>();
  const introSet = new Set<number>();
  const phaseMap = new Map<string, { hashSeed: string; windowSec: number }>();
  const resultMap = new Map<string, { seed: string; result: number }>();
  let gameOver: GameOver | null = null;

  for (let i = 0; i < maxTicks && !gameOver; i++) {
    clock.advance(CONFIG.server.tickMs);
    room.tick();

    for (const c of conns) {
      const all = decode(c.ws);
      const start = cursors.get(c.ws) ?? 0;
      cursors.set(c.ws, all.length);

      for (const m of all.slice(start)) {
        if (m.type === "S2C_ROUND_INTRO") {
          introSet.add(m.round);
          roundBids.clear();
        }
        if (m.type === "S2C_BID_EVENT") {
          bidEvents.add(`${m.playerId}:${m.amount}:${m.endsAt}`);
        }
        if (m.type === "S2C_AUCTION_STATE" && m.state.canBid) {
          const n = roundBids.get(c.conn.playerId) ?? 0;
          if (n < 3) {
            roundBids.set(c.conn.playerId, n + 1);
            room.handle(c.conn, { type: "C2S_BID", amount: m.state.minNextBid });
          }
        }
        if (m.type === "S2C_ROULETTE_PHASE") {
          phaseMap.set(m.hashSeed, { hashSeed: m.hashSeed, windowSec: m.windowSec });
          const key = `${c.conn.playerId}:${m.hashSeed}`;
          if (!betPlaced.has(key)) {
            betPlaced.add(key);
            room.handle(c.conn, { type: "C2S_ROULETTE_BET", choice: "red", amount: 10 });
          }
        }
        if (m.type === "S2C_ROULETTE_RESULT") {
          resultMap.set(m.seed, { seed: m.seed, result: m.result });
        }
        if (m.type === "S2C_GAME_OVER") gameOver = m;
      }
    }
  }

  return {
    gameOver,
    bidEvents: bidEvents.size,
    intros: [...introSet].sort((a, b) => a - b),
    roulettePhases: [...phaseMap.values()],
    rouletteResults: [...resultMap.values()],
  };
}

describe("Room lobby", () => {
  it("rejects duplicate nicknames, enforces the seat limit and preserves ready", () => {
    const clock = fakeClock();
    const room = new Room("LOBY", { totalRounds: 5, now: clock.now, rng: seededRng(7), log: silentLogger });

    const a = makeConn();
    expect(room.join(a.conn, "Ana").ok).toBe(true);
    room.handle(a.conn, { type: "C2S_SET_READY", ready: true });

    const b = makeConn();
    expect(room.join(b.conn, "Beto").ok).toBe(true);

    const lastState = lastOf(a.ws, "S2C_ROOM_STATE");
    expect(lastState?.players.find((p) => p.nickname === "Ana")?.ready).toBe(true);

    const dup = makeConn();
    expect(room.join(dup.conn, "ana")).toMatchObject({ ok: false, error: "NAME_TAKEN" });

    for (const name of ["Carla", "Dani", "Eva"]) {
      const c = makeConn();
      expect(room.join(c.conn, name).ok).toBe(true);
    }
    const sixth = makeConn();
    expect(room.join(sixth.conn, "Fran")).toMatchObject({ ok: false, error: "ROOM_FULL" });
    expect(room.seatCount).toBe(CONFIG.match.maxPlayers);
  });

  it("does not let a ready toggle leak into a running game", () => {
    const { room, conns } = setup(2, 5);
    startGame(room, conns);
    room.handle(conns[0]!.conn, { type: "C2S_SET_READY", ready: false });
    const err = lastOf(conns[0]!.ws, "S2C_ERROR");
    expect(err?.code).toBe("PHASE_INVALID");
  });
});

describe("Room full match", () => {
  it("5 clients finish 5 rounds with a verified roulette and no secret leak", () => {
    const { room, clock, conns } = setup(5, 5, 1234);
    startGame(room, conns);

    const result = playMatch(room, clock, conns);

    expect(result.gameOver).not.toBeNull();
    expect(result.gameOver?.ranking).toHaveLength(5);
    expect(result.gameOver?.ranking.every((r) => r.money >= 0)).toBe(true);
    expect(result.bidEvents).toBeGreaterThan(0);
    expect(result.intros).toEqual([1, 2, 3, 4, 5]);
    expect(result.roulettePhases.length).toBe(1);
    expect(result.rouletteResults.length).toBe(1);

    // commit-reveal must be verifiable: sha256(seed) and result derived from seed
    const phase = result.roulettePhases[0]!;
    const spin = result.rouletteResults[0]!;
    expect(phase.hashSeed).toMatch(/^[0-9a-f]{64}$/);
    expect(commitHash(spin.seed)).toBe(phase.hashSeed);
    expect(rouletteResultFromSeed(spin.seed)).toBe(spin.result);

    // no secret fields in any frame, ever
    for (const c of conns) {
      const text = rawText(c.ws);
      expect(text).not.toMatch(/trueValue|trueTotal|lotSecret/);
    }
  });

  it("resumes the next round after the round-5 roulette", () => {
    const { room, clock, conns } = setup(2, 6, 99);
    startGame(room, conns);
    const result = playMatch(room, clock, conns);

    expect(result.intros).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.roulettePhases).toHaveLength(1);
    expect(result.gameOver).not.toBeNull();
  });

  it("never broadcasts another player's reconnect token", () => {
    const { conns } = setup(3, 2);
    const tokens = conns.map((c) => joined(c.ws).token);
    expect(new Set(tokens).size).toBe(3);

    for (let i = 0; i < conns.length; i++) {
      const text = rawText(conns[i]!.ws);
      for (let j = 0; j < tokens.length; j++) {
        if (i === j) continue;
        expect(text).not.toContain(tokens[j]!);
      }
    }
  });
});

describe("Room reconnection", () => {
  it("reserves the seat, resumes mid-auction and expires after 45 s", () => {
    const { room, clock, conns } = setup(2, 5, 2024);
    startGame(room, conns);

    const [a, b] = conns as [
      { conn: ReturnType<typeof makeConn>["conn"]; ws: FakeSocket },
      { conn: ReturnType<typeof makeConn>["conn"]; ws: FakeSocket },
    ];
    const idB = joined(b.ws).playerId;
    const tokenB = joined(b.ws).token;

    room.handle(a.conn, { type: "C2S_BID", amount: 10 });

    // B disappears mid-auction
    room.leave(b.conn);
    const reserved = lastOf(a.ws, "S2C_ROOM_STATE")?.players.find((p) => p.id === idB);
    expect(reserved?.connected).toBe(false);
    expect(reserved?.seatReservedUntil).toBeGreaterThan(clock.now());

    // wrong token is rejected
    const bad = makeConn();
    expect(room.reconnect(bad.conn, idB, "0".repeat(64))).toMatchObject({
      ok: false,
      error: "RECONNECT_FAILED",
    });

    // correct token restores seat, money and auction view
    const again = makeConn();
    expect(room.reconnect(again.conn, idB, tokenB)).toEqual({ ok: true });

    const welcome = lastOf(again.ws, "S2C_JOINED");
    expect(welcome).toMatchObject({ playerId: idB, reconnected: true });
    const auction = lastOf(again.ws, "S2C_AUCTION_STATE");
    expect(auction?.state.currentBid).toBe(10);
    expect(auction?.state.canBid).toBe(true);
    const restored = lastOf(again.ws, "S2C_ROOM_STATE")?.players.find((p) => p.id === idB);
    expect(restored).toMatchObject({ connected: true, money: 1000 });

    // second disconnect: after the 45 s reserve the token is burnt
    room.leave(again.conn);
    clock.advance(CONFIG.reconnect.seatReserveSec * 1000 + 1);
    room.tick();

    const late = makeConn();
    expect(room.reconnect(late.conn, idB, tokenB)).toMatchObject({
      ok: false,
      error: "SEAT_EXPIRED",
    });
  });

  it("resyncs a spectator that reconnects during REVEAL", () => {
    const { room, clock, conns } = setup(2, 5, 5);
    startGame(room, conns);
    const [a, b] = conns as [
      { conn: ReturnType<typeof makeConn>["conn"]; ws: FakeSocket },
      { conn: ReturnType<typeof makeConn>["conn"]; ws: FakeSocket },
    ];
    const idB = joined(b.ws).playerId;
    const tokenB = joined(b.ws).token;

    // let the auction expire into REVEAL
    clock.advance(CONFIG.auction.bidTimerSec * 1000 + CONFIG.server.tickMs);
    room.tick();

    room.leave(b.conn);
    const again = makeConn();
    expect(room.reconnect(again.conn, idB, tokenB)).toEqual({ ok: true });
    expect(lastOf(again.ws, "S2C_REVEAL")).toBeDefined();
  });
});

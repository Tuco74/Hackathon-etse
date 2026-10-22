import type {
  AuctionState,
  C2SMessage,
  ErrorCode,
  GamePhase,
  LotPublic,
  PlayerPublic,
  S2CMessage,
} from "@trastero/shared";

/**
 * Offline mock transport (mock-first, ticket C3).
 *
 * It speaks the same payloads as apps/server, including timers and roulette
 * commit–reveal, so the whole client can be developed and demoed with no
 * server. Values live here (dev-only bundle chunk) and are *never* emitted
 * before S2C_REVEAL, exactly like the real room.
 */

interface MockOptions {
  rounds?: number;
  rouletteAfter?: number;
}

interface MockObject {
  id: string;
  name: string;
  silhouette: string;
  category: string;
  value: number;
}

const OBJECTS: MockObject[] = [
  { id: "tv_bw", name: "Televisor en blanco y negro", silhouette: "sil_tv", category: "electronics", value: 35 },
  { id: "tv_studio", name: "Monitor de estudio de los 80", silhouette: "sil_tv", category: "electronics", value: 420 },
  { id: "radio_bakelite", name: "Radio de baquelita", silhouette: "sil_radio", category: "electronics", value: 340 },
  { id: "toolbox_rusty", name: "Caja de herramientas oxidada", silhouette: "sil_toolbox", category: "tools", value: 30 },
  { id: "toolbox_pro", name: "Maletín de herramientas pro", silhouette: "sil_toolbox", category: "tools", value: 360 },
  { id: "drill_corded", name: "Taladro con cable", silhouette: "sil_drill", category: "tools", value: 170 },
  { id: "chair_folding", name: "Silla plegable", silhouette: "sil_chair", category: "furniture", value: 15 },
  { id: "chair_designer", name: "Silla de diseñador", silhouette: "sil_chair", category: "furniture", value: 500 },
  { id: "lamp_tiffany", name: "Lámpara Tiffany", silhouette: "sil_lamp", category: "furniture", value: 380 },
  { id: "vase_repro", name: "Jarrón réplica", silhouette: "sil_vase", category: "collectibles", value: 25 },
  { id: "vase_ming", name: "Jarrón Ming auténtico", silhouette: "sil_vase", category: "collectibles", value: 900 },
  { id: "comic_slab", name: "Cómic precintado", silhouette: "sil_comic", category: "collectibles", value: 240 },
  { id: "jacket_leather", name: "Chaqueta de cuero", silhouette: "sil_jacket", category: "clothing", value: 280 },
  { id: "sneakers_boxed", name: "Zapatillas sin estrenar", silhouette: "sil_sneaker", category: "clothing", value: 120 },
  { id: "trophy_champions", name: "Trofeo de campeón", silhouette: "sil_trophy", category: "sports", value: 650 },
  { id: "mixer_vintage", name: "Batidora vintage", silhouette: "sil_mixer", category: "kitchen", value: 450 },
  { id: "crate_locked", name: "Caja cerrada con candado", silhouette: "sil_crate", category: "mystery", value: 480 },
];

const YOU = "mock-you";
const BOTS = ["mock-bot-rosa", "mock-bot-moe"] as const;
const MIN_BID = 10;
const MIN_INCREMENT = 25;
const AUCTION_MS = 9000;
const INTRO_MS = 1800;
const REVEAL_MS = 4500;
const ROULETTE_WINDOW_MS = 8000;

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function hex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function rouletteColour(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  return RED.has(n) ? "red" : "black";
}

export interface MockServer {
  send(msg: C2SMessage): void;
  stop(): void;
}

export function createMockServer(
  emit: (msg: S2CMessage) => void,
  options: MockOptions = {},
): MockServer {
  const totalRounds = options.rounds ?? 3;
  const rouletteAfter = options.rouletteAfter ?? 2;
  const timers = new Set<number>();
  let stopped = false;
  let phase: GamePhase = "LOBBY";
  let round = 0;
  let joined = false;

  const players: PlayerPublic[] = [
    { id: YOU, nickname: "Tú", money: 1000, ready: false, connected: true },
    { id: BOTS[0], nickname: "Rosa", money: 1000, ready: true, connected: true },
    { id: BOTS[1], nickname: "Moe", money: 1000, ready: true, connected: true },
  ];

  let lot: LotPublic | null = null;
  let lotObjects: MockObject[] = [];
  let auction: AuctionState | null = null;
  let lotsWon = new Map<string, number>();
  let lotValueWon = new Map<string, number>();
  let bets = new Map<string, { choice: "red" | "black" | "green"; amount: number }>();
  let passed = new Set<string>();
  let rouletteCommit = "";
  let rouletteEnd = 0;
  let rouletteSpun = false;

  const readyToSpin = (): boolean =>
    phase === "ROULETTE" &&
    players.filter((p) => p.connected).every((p) => bets.has(p.id) || passed.has(p.id));

  const emitRoulettePhase = (): void => {
    emit({
      type: "S2C_ROULETTE_PHASE",
      hashSeed: rouletteCommit,
      windowSec: Math.max(0, Math.ceil((rouletteEnd - Date.now()) / 1000)),
      players: players.map((p) => ({ id: p.id, money: p.money })),
      bets: [...bets.entries()].map(([playerId, bet]) => ({
        playerId,
        choice: bet.choice,
        amount: bet.amount,
      })),
      passed: [...passed],
      readyToSpin: readyToSpin(),
    });
  };

  const later = (ms: number, fn: () => void): void => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!stopped) fn();
    }, ms);
    timers.add(id);
  };

  const moneyOf = (id: string): number => players.find((p) => p.id === id)?.money ?? 0;

  const roomState = (): void => {
    emit({
      type: "S2C_ROOM_STATE",
      roomCode: "MOCK",
      phase,
      round,
      totalRounds,
      players: players.map((p) => ({ ...p })),
    });
  };

  const minNextBid = (): number => (auction?.highBidderId ? (auction.currentBid ?? 0) + MIN_INCREMENT : MIN_BID);

  const auctionView = (playerId: string): AuctionState => {
    const me = players.find((p) => p.id === playerId);
    const next = minNextBid();
    return {
      lotId: lot?.id ?? "",
      currentBid: auction?.currentBid ?? 0,
      highBidderId: auction?.highBidderId ?? null,
      endsAt: auction?.endsAt ?? 0,
      extensionsUsed: 0,
      minNextBid: next,
      canBid: phase === "AUCTION" && !!me && me.connected && auction?.highBidderId !== playerId && me.money >= next,
    };
  };

  const sendAuction = (): void => {
    emit({ type: "S2C_AUCTION_STATE", state: auctionView(YOU) });
  };

  const error = (code: ErrorCode, message: string): void => {
    emit({ type: "S2C_ERROR", code, message });
  };

  const startRound = (): void => {
    round += 1;
    phase = "ROUND_INTRO";
    bets = new Map();
    lotObjects = pickLot();
    const first = lotObjects[0] ?? OBJECTS[0]!;
    lot = {
      id: `mock-lot-${round}`,
      round,
      objectCount: lotObjects.length,
      silhouettes: lotObjects.map((o) => o.silhouette),
      clues: ["huele a humedad", "pesa lo suyo"],
      category: first.category,
    };
    auction = null;
    emit({ type: "S2C_ROUND_INTRO", round, lot, countdownSec: Math.ceil(INTRO_MS / 1000) });
    roomState();
    later(INTRO_MS, beginAuction);
  };

  const beginAuction = (): void => {
    phase = "AUCTION";
    auction = {
      lotId: lot?.id ?? "",
      currentBid: 0,
      highBidderId: null,
      endsAt: Date.now() + AUCTION_MS,
      extensionsUsed: 0,
      minNextBid: MIN_BID,
      canBid: true,
    };
    roomState();
    sendAuction();
    later(1600, () => botBid(BOTS[0]));
    later(3300, () => botBid(BOTS[1]));
    later(5100, () => botBid(BOTS[0]));
    later(7000, () => botBid(BOTS[1]));
    later(AUCTION_MS, finishAuction);
  };

  const botBid = (botId: string): void => {
    if (phase !== "AUCTION" || !auction) return;
    if (auction.highBidderId === botId) return;
    const next = minNextBid();
    if (moneyOf(botId) < next) return;
    // bots stop early sometimes so a human can win
    if (Math.random() < 0.18) return;
    applyBid(botId, next);
  };

  const applyBid = (playerId: string, amount: number): void => {
    if (!auction) return;
    auction = {
      ...auction,
      currentBid: amount,
      highBidderId: playerId,
      minNextBid: amount + MIN_INCREMENT,
    };
    emit({
      type: "S2C_BID_EVENT",
      playerId,
      amount,
      endsAt: auction.endsAt,
      extensionsUsed: 0,
    });
    sendAuction();
  };

  const finishAuction = (): void => {
    if (phase !== "AUCTION" || !auction) return;
    const winner = auction.highBidderId;
    const bid = auction.currentBid;
    const total = lotObjects.reduce((sum, o) => sum + o.value, 0);
    phase = "REVEAL";
    if (winner) {
      const player = players.find((p) => p.id === winner);
      if (player) player.money += total - bid;
      lotsWon.set(winner, (lotsWon.get(winner) ?? 0) + 1);
      lotValueWon.set(winner, (lotValueWon.get(winner) ?? 0) + total);
    }
    emit({
      type: "S2C_REVEAL",
      lotId: lot?.id ?? "",
      objects: lotObjects.map((o) => ({ silhouetteId: o.silhouette, name: o.name, value: o.value })),
      total,
      winnerId: winner,
      winningBid: bid,
      profit: winner ? total - bid : null,
    });
    roomState();
    later(REVEAL_MS, afterReveal);
  };

  const afterReveal = (): void => {
    if (round === rouletteAfter && totalRounds > rouletteAfter) {
      startRoulette();
    } else if (round >= totalRounds) {
      finishMatch();
    } else {
      startRound();
    }
  };

  const startRoulette = (): void => {
    phase = "ROULETTE";
    bets = new Map();
    passed = new Set();
    rouletteSpun = false;
    rouletteCommit = hex(32);
    rouletteEnd = Date.now() + ROULETTE_WINDOW_MS;
    emitRoulettePhase();
    roomState();
    // bots decide quickly so the demo can spin without waiting the full window
    later(900, () => {
      if (phase !== "ROULETTE") return;
      if (moneyOf(BOTS[0]) >= 10) bets.set(BOTS[0], { choice: "red", amount: 10 });
      passed.add(BOTS[1]);
      emitRoulettePhase();
    });
    later(ROULETTE_WINDOW_MS, spin);
  };

  const spin = (): void => {
    if (phase !== "ROULETTE" || rouletteSpun) return;
    rouletteSpun = true;
    const result = Math.floor(Math.random() * 37);
    const colour = rouletteColour(result);
    const payouts = players.map((p) => {
      const bet = bets.get(p.id);
      let delta = 0;
      if (bet) {
        const won =
          (colour === "green" && bet.choice === "green") ||
          (colour !== "green" && bet.choice === colour);
        // 1:1 and 35:1 are net gains: stake is returned on top of the win
        delta = won ? bet.amount * (colour === "green" ? 35 : 1) : -bet.amount;
        p.money += delta;
      }
      return { playerId: p.id, delta, money: p.money };
    });
    emit({ type: "S2C_ROULETTE_RESULT", seed: hex(16), result, payouts });
    roomState();
    later(REVEAL_MS, () => {
      if (round >= totalRounds) finishMatch();
      else startRound();
    });
  };

  const finishMatch = (): void => {
    phase = "GAME_OVER";
    const ranking = [...players]
      .sort((a, b) => b.money - a.money)
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        money: p.money,
        lotsWon: lotsWon.get(p.id) ?? 0,
        lotValueWon: lotValueWon.get(p.id) ?? 0,
      }));
    const winner = ranking[0];
    emit({
      type: "S2C_GAME_OVER",
      ranking,
      winnerId: winner?.playerId ?? YOU,
    });
    roomState();
  };

  const pickLot = (): MockObject[] => {
    const count = 2 + Math.floor(Math.random() * 3);
    const pool = [...OBJECTS];
    const chosen: MockObject[] = [];
    const hook = pool.filter((o) => o.value >= 380);
    const first = hook[Math.floor(Math.random() * hook.length)];
    if (first) chosen.push(first);
    while (chosen.length < count && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      const [obj] = pool.splice(idx, 1);
      if (obj && !chosen.some((c) => c.id === obj.id)) chosen.push(obj);
    }
    return chosen;
  };

  const handle = (msg: C2SMessage): void => {
    switch (msg.type) {
      case "C2S_JOIN": {
        joined = true;
        const you = players.find((p) => p.id === YOU);
        if (you) you.nickname = msg.nickname || "Tú";
        roomState();
        break;
      }
      case "C2S_SET_READY": {
        if (!joined) return;
        const you = players.find((p) => p.id === YOU);
        if (you) you.ready = msg.ready;
        roomState();
        break;
      }
      case "C2S_START_GAME": {
        if (phase !== "LOBBY") {
          error("PHASE_INVALID", "La partida ya ha empezado");
          return;
        }
        if (!players.every((p) => p.ready)) {
          error("NOT_ALL_READY", "Faltan jugadores listos");
          return;
        }
        startRound();
        break;
      }
      case "C2S_BID": {
        if (phase !== "AUCTION" || !auction) {
          error("PHASE_INVALID", "Fuera de subasta");
          return;
        }
        if (auction.highBidderId === YOU) {
          error("NOT_YOUR_TURN", "Ya eres el mejor postor");
          return;
        }
        if (msg.amount > moneyOf(YOU)) {
          error("INSUFFICIENT_FUNDS", "No tienes fondos");
          return;
        }
        if (msg.amount < minNextBid()) {
          error("BID_TOO_LOW", `La puja mínima es ${minNextBid()} €`);
          return;
        }
        applyBid(YOU, msg.amount);
        break;
      }
      case "C2S_ROULETTE_BET": {
        if (phase !== "ROULETTE") {
          error("PHASE_INVALID", "La ruleta no está abierta");
          return;
        }
        if (bets.has(YOU)) {
          error("ALREADY_BET", "Ya has apostado esta ronda");
          return;
        }
        if (msg.amount < 10) {
          error("BET_TOO_LOW", "Apuesta mínima 10 €");
          return;
        }
        if (msg.amount > moneyOf(YOU)) {
          error("BET_TOO_HIGH", "No tienes tanto dinero");
          return;
        }
        bets.set(YOU, { choice: msg.choice, amount: msg.amount });
        emitRoulettePhase();
        break;
      }
      case "C2S_ROULETTE_PASS": {
        if (phase !== "ROULETTE") {
          error("PHASE_INVALID", "La ruleta no está abierta");
          return;
        }
        if (bets.has(YOU)) {
          error("ALREADY_BET", "Ya has apostado esta ronda");
          return;
        }
        if (passed.has(YOU)) {
          error("ALREADY_PASSED", "Ya has pasado esta ronda");
          return;
        }
        passed.add(YOU);
        emitRoulettePhase();
        break;
      }
      case "C2S_ROULETTE_SPIN": {
        if (phase !== "ROULETTE") {
          error("PHASE_INVALID", "La ruleta no está abierta");
          return;
        }
        if (!readyToSpin()) {
          error("SPIN_NOT_READY", "Faltan jugadores por apostar o pasar");
          return;
        }
        spin();
        break;
      }
      case "C2S_PING": {
        emit({ type: "S2C_PONG", clientTs: msg.clientTs, serverTs: Date.now() });
        break;
      }
      case "C2S_EMOTE": {
        break;
      }
      default:
        break;
    }
  };

  emit({
    type: "S2C_ROOM_STATE",
    roomCode: "MOCK",
    phase,
    round,
    totalRounds,
    players: players.map((p) => ({ ...p })),
  });

  return {
    send(msg: C2SMessage): void {
      if (stopped) return;
      handle(msg);
    },
    stop(): void {
      stopped = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
    },
  };
}

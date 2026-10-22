// E2E smoke: two ws clients complete a full match; asserts no pre-reveal leak.
import WebSocket from "ws";

const URL = process.env.WS_URL ?? "ws://localhost:2567/ws";
const ROOM = process.env.ROOM ?? `SM${Date.now().toString(36).slice(-3)}`.toUpperCase();
const FORBIDDEN = /"trueValue"|"trueTotal"/;
// A bot that always raises at the minimum would reset the 12 s timer forever.
const MAX_BIDS_PER_ROUND = 3;

const seen = [];
function connect(nick) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.on("error", reject);
    ws.on("open", () => {
      ws.send(JSON.stringify({ v: 1, type: "C2S_JOIN", id: crypto.randomUUID(), ts: Date.now(), payload: { type: "C2S_JOIN", nickname: nick, roomCode: ROOM } }));
      resolve(ws);
    });
  });
}

function on(ws, fn) {
  ws.on("message", (data) => {
    const text = String(data);
    if (FORBIDDEN.test(text)) {
      console.error("LEAK in payload:", text.slice(0, 300));
      process.exit(3);
    }
    seen.push(text);
    fn(JSON.parse(text).payload);
  });
}

const send = (ws, payload) =>
  ws.send(JSON.stringify({ v: 1, type: payload.type, id: crypto.randomUUID(), ts: Date.now(), payload }));

const a = await connect("Ana");
const b = await connect("Beto");

let phase = "";
let lastReveal = null;
let gameOver = null;
let bids = 0;
let roulettePhases = 0;
let rouletteResults = 0;
let rouletteBets = 0;
let commitRevealOk = true;
let bidsThisRound = { Ana: 0, Beto: 0 };

const bot = (ws, name) => (m) => {
  if (m.type === "S2C_ROUND_INTRO") {
    bidsThisRound = { Ana: 0, Beto: 0 };
  }
  if (m.type === "S2C_AUCTION_STATE" && m.state.canBid && bidsThisRound[name] < MAX_BIDS_PER_ROUND) {
    bidsThisRound[name]++;
    bids++;
    send(ws, { type: "C2S_BID", amount: m.state.minNextBid });
  }
  if (m.type === "S2C_ROULETTE_PHASE") {
    roulettePhases++;
    if (!/^[0-9a-f]{8,}$/.test(m.hashSeed ?? "")) commitRevealOk = false;
    // every player bets once; try one of each colour across phases
    const betAmount = 10;
    send(ws, { type: "C2S_ROULETTE_BET", choice: roulettePhases % 2 === 0 ? "red" : "black", amount: betAmount });
    rouletteBets++;
  }
  if (m.type === "S2C_ROULETTE_RESULT") {
    rouletteResults++;
    if (m.result < 0 || m.result > 36 || !m.seed) commitRevealOk = false;
  }
  if (m.type === "S2C_ERROR" && m.code !== "BID_TOO_LOW") {
    console.log(`${name} error:`, m.code, m.message);
  }
};

on(a, (m) => {
  bot(a, "Ana")(m);
  if (m.type === "S2C_ROOM_STATE" && m.phase === "LOBBY" && m.players.length === 2) {
    send(a, { type: "C2S_SET_READY", ready: true });
    send(b, { type: "C2S_SET_READY", ready: true });
  }
  if (m.type === "S2C_ROOM_STATE" && m.players.length === 2 && m.players.every((p) => p.ready) && m.phase === "LOBBY" && !phase) {
    phase = "starting";
    send(a, { type: "C2S_START_GAME" });
  }
  if (m.type === "S2C_REVEAL") lastReveal = m;
  if (m.type === "S2C_GAME_OVER") gameOver = m;
});

on(b, (m) => {
  bot(b, "Beto")(m);
  if (m.type === "S2C_GAME_OVER") gameOver = m;
});

const timeout = setTimeout(() => {
  console.error("TIMEOUT. phase seen:", phase, "bids:", bids, "round:", lastReveal?.lotId, "msgs:", seen.length);
  process.exit(2);
}, 240_000);

const wait = setInterval(() => {
  if (gameOver) {
    clearInterval(wait);
    clearTimeout(timeout);
    const ok = commitRevealOk && (roulettePhases === rouletteResults || roulettePhases === 0);
    console.log(JSON.stringify({
      ok,
      room: ROOM,
      messages: seen.length,
      bids,
      roulettePhases,
      rouletteResults,
      rouletteBets,
      commitRevealOk,
      ranking: gameOver.ranking,
      lastRevealTotal: lastReveal?.total ?? null,
    }, null, 2));
    a.close();
    b.close();
    process.exit(ok ? 0 : 4);
  }
}, 200);
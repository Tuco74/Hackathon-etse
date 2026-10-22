// E2E de reconexión: un cliente pierde la conexión a mitad de subasta y
// recupera su asiento con C2S_RECONNECT. También comprueba que un payload
// basura devuelve S2C_ERROR sin tumbar la conexión.
import WebSocket from "ws";

const URL = process.env.WS_URL ?? "ws://localhost:2567/ws";
const ROOM = process.env.ROOM ?? `RC${Date.now().toString(36).slice(-3)}`.toUpperCase();
const TIMEOUT_MS = Number(process.env.RECONNECT_TIMEOUT_MS ?? 60_000);

const fail = (msg) => {
  console.error(`[reconnect-smoke] FALLO: ${msg}`);
  process.exit(1);
};

function envelope(payload) {
  return JSON.stringify({
    v: 1,
    type: payload.type,
    id: crypto.randomUUID(),
    ts: Date.now(),
    payload,
  });
}

function open() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.once("error", reject);
    ws.once("open", () => resolve(ws));
  });
}

/** Collects payloads and exposes waitFor(type, predicate). */
function watch(ws) {
  const messages = [];
  const waiters = [];
  ws.on("message", (data) => {
    let payload;
    try {
      payload = JSON.parse(String(data)).payload;
    } catch {
      return;
    }
    messages.push(payload);
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w.type === payload.type && (!w.predicate || w.predicate(payload))) {
        waiters.splice(i, 1);
        clearTimeout(w.timer);
        w.resolve(payload);
      }
    }
  });
  return {
    messages,
    waitFor(type, predicate, ms = 10_000) {
      const found = messages.find((m) => m.type === type && (!predicate || predicate(m)));
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.timer === timer);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error(`timeout esperando ${type}`));
        }, ms);
        waiters.push({ type, predicate, resolve, timer });
      });
    },
  };
}

const globalTimer = setTimeout(() => fail("timeout global"), TIMEOUT_MS);

try {
  const a = await open();
  const b = await open();
  const wa = watch(a);
  const wb = watch(b);

  a.send(envelope({ type: "C2S_JOIN", nickname: "Ana", roomCode: ROOM }));
  b.send(envelope({ type: "C2S_JOIN", nickname: "Beto", roomCode: ROOM }));

  const joinedA = await wa.waitFor("S2C_JOINED");
  const joinedB = await wb.waitFor("S2C_JOINED");

  a.send(envelope({ type: "C2S_SET_READY", ready: true }));
  b.send(envelope({ type: "C2S_SET_READY", ready: true }));
  await wa.waitFor("S2C_ROOM_STATE", (m) => m.players.length === 2 && m.players.every((p) => p.ready));
  a.send(envelope({ type: "C2S_START_GAME" }));

  const auction = await wa.waitFor("S2C_AUCTION_STATE", (m) => m.state.canBid);
  a.send(envelope({ type: "C2S_BID", amount: auction.state.minNextBid }));
  const bidEvent = await wa.waitFor("S2C_BID_EVENT");

  // --- disconnect mid-auction ---
  b.close();
  await new Promise((r) => setTimeout(r, 400));

  const b2 = await open();
  const wb2 = watch(b2);
  b2.send(
    envelope({
      type: "C2S_RECONNECT",
      roomCode: ROOM,
      playerId: joinedB.playerId,
      token: joinedB.token,
    }),
  );

  const rejoined = await wb2.waitFor("S2C_JOINED");
  if (!rejoined.reconnected) fail("S2C_JOINED.reconnected !== true");
  if (rejoined.playerId !== joinedB.playerId) fail("playerId distinto tras reconectar");

  const state = await wb2.waitFor("S2C_AUCTION_STATE");
  if (state.state.currentBid !== bidEvent.amount) {
    fail(`puja no restaurada: ${state.state.currentBid} !== ${bidEvent.amount}`);
  }
  const roster = await wb2.waitFor("S2C_ROOM_STATE");
  const beto = roster.players.find((p) => p.id === joinedB.playerId);
  if (!beto?.connected) fail("el asiento no figura como conectado");
  if (beto?.money !== 1000) fail(`dinero no restaurado: ${beto?.money}`);

  // --- garbage must not kill the room ---
  a.send("esto no es json");
  const err = await wa.waitFor("S2C_ERROR");
  if (err.code !== "INVALID_PAYLOAD") fail(`código inesperado: ${err.code}`);
  a.send(envelope({ type: "C2S_PING", clientTs: Date.now() }));
  await wa.waitFor("S2C_PONG");

  clearTimeout(globalTimer);
  console.log(
    JSON.stringify(
      {
        ok: true,
        room: ROOM,
        playerId: joinedB.playerId,
        restoredBid: state.state.currentBid,
        restoredMoney: beto?.money,
        errorCode: err.code,
      },
      null,
      2,
    ),
  );
  a.close();
  b2.close();
  process.exit(0);
} catch (err) {
  clearTimeout(globalTimer);
  fail(err instanceof Error ? err.message : String(err));
}

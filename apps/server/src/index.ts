import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { CONFIG, type ErrorCode, type S2CMessage } from "@trastero/shared";
import { createClock } from "./clock.js";
import { createLogger } from "./log.js";
import { Room, type Conn } from "./room.js";
import { Dedupe, parseWire, RateLimiter } from "./wire.js";

const clock = createClock();
const log = createLogger("server");

const PORT = toPositiveInt(process.env.PORT, 2567);
const TOTAL_ROUNDS = toPositiveInt(process.env.GAME_ROUNDS, CONFIG.match.rounds);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIST = resolve(__dirname, "../../client/dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
};

const rooms = new Map<string, Room>();

/** Only positive integers from env; anything else falls back. */
function toPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function getRoom(code: string): Room {
  const key = code.toUpperCase();
  let room = rooms.get(key);
  if (!room) {
    room = new Room(key, { totalRounds: TOTAL_ROUNDS });
    room.startLoop();
    rooms.set(key, room);
    log.info("room_created", { room: key, rounds: TOTAL_ROUNDS });
  }
  return room;
}

function sweepRooms(): void {
  for (const [code, room] of rooms) {
    if (!room.canDispose()) continue;
    room.stopLoop();
    rooms.delete(code);
    log.info("room_disposed", { room: code });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/healthz") {
    // Operational snapshot: phase/round/players only, never lot values.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        rooms: rooms.size,
        players: [...rooms.values()].reduce((n, r) => n + r.playerCount, 0),
        detail: [...rooms.values()].map((r) => ({ code: r.code, ...r.describe() })),
      }),
    );
    return;
  }

  try {
    const decoded = decodeURIComponent(url.pathname);
    const requested = resolve(CLIENT_DIST, `.${decoded}`);
    // never serve outside the client bundle
    if (requested !== CLIENT_DIST && !requested.startsWith(CLIENT_DIST + sep)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    let filePath = requested;
    const info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) filePath = resolve(CLIENT_DIST, "index.html");

    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found. Ejecuta `pnpm --filter @trastero/client build` primero.");
  }
});

const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: CONFIG.server.maxPayloadBytes,
});

interface ClientCtx extends Omit<Conn, "ws"> {
  ws: WebSocket;
  dedupe: Dedupe;
  limiter: RateLimiter;
  alive: boolean;
}

const clients = new Set<ClientCtx>();

function sendRaw(ws: WebSocket, msg: S2CMessage): void {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ v: 1, type: msg.type, id: randomUUID(), ts: clock.now(), payload: msg }));
}

function sendError(ws: WebSocket, code: ErrorCode, message: string, refId?: string): void {
  const payload: S2CMessage = refId
    ? { type: "S2C_ERROR", code, message, refId }
    : { type: "S2C_ERROR", code, message };
  sendRaw(ws, payload);
}

wss.on("connection", (ws) => {
  const ctx: ClientCtx = {
    id: randomUUID(),
    playerId: "",
    nickname: "",
    ws,
    room: null,
    dedupe: new Dedupe(),
    limiter: new RateLimiter(undefined, undefined, clock.now),
    alive: true,
  };
  clients.add(ctx);

  ws.on("pong", () => {
    ctx.alive = true;
  });

  ws.on("error", (err) => {
    log.warn("ws_error", { message: err.message });
  });

  ws.on("message", (data) => {
    const text = String(data);

    if (!ctx.limiter.allow()) {
      sendError(ws, "RATE_LIMITED", "Demasiados mensajes por segundo");
      return;
    }

    const parsed = parseWire(text);
    if (!parsed.ok) {
      sendError(ws, parsed.code, parsed.detail, parsed.id);
      return;
    }

    // Retransmissions (same envelope id) are idempotent: drop the duplicate.
    if (!ctx.dedupe.accept(parsed.id)) return;
    const msg = parsed.message;

    if (msg.type === "C2S_JOIN") {
      if (ctx.room) {
        const previous = ctx.room;
        previous.leave(ctx);
        if (previous.canDispose()) sweepRooms();
      }
      const room = getRoom(msg.roomCode);
      const result = room.join(ctx, msg.nickname);
      if (!result.ok) {
        sendError(ws, result.error, result.message, parsed.id);
        return;
      }
      log.info("player_joined", {
        room: room.code,
        playerId: result.playerId,
        nickname: msg.nickname,
      });
      return;
    }

    if (msg.type === "C2S_RECONNECT") {
      if (ctx.room) {
        sendError(ws, "ALREADY_JOINED", "Ya estás en una sala", parsed.id);
        return;
      }
      const room = rooms.get(msg.roomCode.toUpperCase());
      if (!room) {
        sendError(ws, "RECONNECT_FAILED", "La sala ya no existe", parsed.id);
        return;
      }
      const result = room.reconnect(ctx, msg.playerId, msg.token);
      if (!result.ok) {
        sendError(ws, result.error, result.message, parsed.id);
        return;
      }
      log.info("player_reconnected", {
        room: room.code,
        playerId: msg.playerId,
        phase: room.phase,
      });
      return;
    }

    if (msg.type === "C2S_PING" && !ctx.room) {
      sendRaw(ws, { type: "S2C_PONG", clientTs: msg.clientTs, serverTs: clock.now() });
      return;
    }

    if (!ctx.room) {
      sendError(ws, "ROOM_NOT_FOUND", "Únete a una sala primero", parsed.id);
      return;
    }

    ctx.room.handle(ctx, msg, parsed.id);
  });

  ws.on("close", () => {
    clients.delete(ctx);
    const room = ctx.room;
    if (room) {
      room.leave(ctx);
      if (room.canDispose()) sweepRooms();
    }
  });
});

// Detect silent drops (closed laptop, lost wifi) so the 45 s seat reserve starts.
const heartbeat = setInterval(() => {
  for (const ctx of clients) {
    if (!ctx.alive) {
      log.info("heartbeat_timeout", { playerId: ctx.playerId });
      ctx.ws.terminate();
      continue;
    }
    ctx.alive = false;
    try {
      ctx.ws.ping();
    } catch {
      /* socket already gone */
    }
  }
}, CONFIG.server.heartbeatMs);
heartbeat.unref();

const sweeper = setInterval(sweepRooms, 5000);
sweeper.unref();

server.on("error", (err) => {
  log.error("http_error", { message: err.message });
  process.exitCode = 1;
  shutdown("http_error");
});
wss.on("error", (err) => log.error("wss_error", { message: err.message }));

server.listen(PORT, () => {
  log.info("listening", { port: PORT, rounds: TOTAL_ROUNDS, ws: "/ws" });
});

let shuttingDown = false;
function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutdown", { reason });
  clearInterval(heartbeat);
  clearInterval(sweeper);
  for (const room of rooms.values()) room.stopLoop();
  for (const ctx of clients) {
    try {
      ctx.ws.close(1001, "server shutdown");
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(process.exitCode ?? 0));
  setTimeout(() => process.exit(process.exitCode ?? 0), 3000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

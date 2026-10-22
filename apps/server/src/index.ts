import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { parseC2S, CONFIG } from "@trastero/shared";
import { Room } from "./room.js";

const PORT = Number(process.env.PORT ?? 2567);
const TOTAL_ROUNDS = Number(process.env.GAME_ROUNDS ?? CONFIG.match.rounds);
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
};

const rooms = new Map<string, Room>();

function getRoom(code: string): Room {
  const key = code.toUpperCase();
  let room = rooms.get(key);
  if (!room) {
    room = new Room(key, TOTAL_ROUNDS);
    room.startLoop();
    rooms.set(key, room);
  }
  return room;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (url.pathname === "/healthz") {
    // Operational snapshot: phase/round/players only, never lot values.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        rooms: rooms.size,
        detail: [...rooms.values()].map((r) => ({
          code: r.code,
          phase: r.phase,
          players: r.playerCount,
          state: r.describe(),
        })),
      }),
    );
    return;
  }

  const safePath = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(CLIENT_DIST, safePath);
  try {
    const info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) filePath = join(CLIENT_DIST, "index.html");
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found. Ejecuta `pnpm --filter @trastero/client build` primero.");
  }
});

const wss = new WebSocketServer({ server, path: "/ws" });

interface ClientCtx {
  id: string;
  playerId: string;
  nickname: string;
  ws: WebSocket;
  room: Room | null;
}

wss.on("connection", (ws) => {
  const conn: ClientCtx = { id: crypto.randomUUID(), playerId: "", nickname: "", ws, room: null };

  ws.on("message", (data) => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(data));
    } catch {
      ws.send(JSON.stringify({ v: 1, type: "S2C_ERROR", id: crypto.randomUUID(), ts: Date.now(), payload: { type: "S2C_ERROR", code: "INVALID_PAYLOAD", message: "JSON inválido" } }));
      return;
    }

    const envelope = raw as { payload?: unknown } | null;
    const message = parseC2S(envelope?.payload ?? raw);
    if (!message) {
      ws.send(JSON.stringify({ v: 1, type: "S2C_ERROR", id: crypto.randomUUID(), ts: Date.now(), payload: { type: "S2C_ERROR", code: "INVALID_PAYLOAD", message: "Mensaje no válido" } }));
      return;
    }

    if (message.type === "C2S_JOIN") {
      if (conn.room) {
        conn.room.leave(conn.playerId);
      }
      const room = getRoom(message.roomCode);
      const result = room.join(conn as never, message.nickname);
      if (typeof result !== "string") {
        ws.send(JSON.stringify({ v: 1, type: "S2C_ERROR", id: crypto.randomUUID(), ts: Date.now(), payload: { type: "S2C_ERROR", code: result.error, message: "No se pudo unir a la sala" } }));
        return;
      }
      conn.playerId = result;
      room.broadcastRoomState();
      return;
    }

    if (!conn.room) {
      ws.send(JSON.stringify({ v: 1, type: "S2C_ERROR", id: crypto.randomUUID(), ts: Date.now(), payload: { type: "S2C_ERROR", code: "ROOM_NOT_FOUND", message: "Únete a una sala primero" } }));
      return;
    }

    conn.room.handle(conn as never, message);
  });

  ws.on("close", () => {
    if (conn.room) {
      const room = conn.room;
      room.leave(conn.playerId);
      if (room.isEmpty) {
        room.stopLoop();
        rooms.delete(room.code);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Trastero Wars server en http://localhost:${PORT} (ws: /ws, rondas: ${TOTAL_ROUNDS})`);
});
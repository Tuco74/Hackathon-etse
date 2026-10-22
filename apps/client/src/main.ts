import Phaser from "phaser";
import { CONFIG, type PlayerPublic, type S2CMessage } from "@trastero/shared";
import { GameScene } from "./scenes/GameScene";
import { socket } from "./net/socket";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: CONFIG.client.internalWidth,
  height: CONFIG.client.internalHeight,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
});

const scene = () => game.scene.getScene("game") as GameScene;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const lobby = $<HTMLDivElement>("lobby");
const lobbyMsg = $<HTMLParagraphElement>("lobbyMsg");
const nickname = $<HTMLInputElement>("nickname");
const roomCode = $<HTMLInputElement>("roomCode");
const joinBtn = $<HTMLButtonElement>("joinBtn");
const hud = $<HTMLDivElement>("hud");
const playersEl = $<HTMLDivElement>("players");
const actionsEl = $<HTMLDivElement>("actions");

const SESSION_KEY = "tw.session";

interface Session {
  roomCode: string;
  playerId: string;
  token: string;
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    if (typeof s.roomCode !== "string" || typeof s.playerId !== "string" || typeof s.token !== "string") {
      return null;
    }
    return { roomCode: s.roomCode, playerId: s.playerId, token: s.token };
  } catch {
    return null;
  }
}

function writeSession(s: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("tw.playerId");
}

let session = readSession();
let me: string = session?.playerId ?? "";
let isReady = false;
let pendingJoin = false;
let gameOver = false;
let reconnectTimer: number | null = null;

nickname.value = localStorage.getItem("tw.nickname") ?? "";
const params = new URLSearchParams(location.search);
roomCode.value = (params.get("room") ?? session?.roomCode ?? "ABCD").toUpperCase();

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

async function tryReconnect(): Promise<boolean> {
  if (!session) return false;
  try {
    if (!socket.connected) await socket.connect(wsUrl());
    socket.send({
      type: "C2S_RECONNECT",
      roomCode: session.roomCode,
      playerId: session.playerId,
      token: session.token,
    });
    return true;
  } catch {
    return false;
  }
}

function scheduleReconnect(attempt = 1): void {
  if (gameOver || !session || reconnectTimer !== null) return;
  reconnectTimer = window.setTimeout(async () => {
    reconnectTimer = null;
    const sent = await tryReconnect();
    if (!sent && attempt < 8 && session) scheduleReconnect(attempt + 1);
  }, Math.min(1000 * attempt, 5000));
}

function enterGame(playerId: string, room: string): void {
  me = playerId;
  pendingJoin = false;
  localStorage.setItem("tw.playerId", playerId);
  try {
    scene().setPlayerId(playerId);
  } catch {
    /* Phaser still booting: GameScene reads tw.playerId on create */
  }
  lobby.classList.add("hidden");
  hud.classList.remove("hidden");
  history.replaceState(null, "", `?room=${room}`);
}

joinBtn.addEventListener("click", async () => {
  const nick = nickname.value.trim();
  const room = roomCode.value.trim().toUpperCase();
  if (nick.length < 1) {
    lobbyMsg.textContent = "Escribe un apodo";
    return;
  }
  if (room.length < 4) {
    lobbyMsg.textContent = "Código de 4–6 caracteres";
    return;
  }
  joinBtn.disabled = true;
  lobbyMsg.textContent = "Conectando...";
  try {
    if (!socket.connected) await socket.connect(wsUrl());
    localStorage.setItem("tw.nickname", nick);
    pendingJoin = true;
    socket.send({ type: "C2S_JOIN", nickname: nick, roomCode: room });
    // The lobby stays visible until S2C_JOINED confirms the seat.
  } catch {
    lobbyMsg.textContent = "No se pudo conectar al servidor";
    joinBtn.disabled = false;
  }
});

const lastByType = new Map<string, S2CMessage>();

function fanOut(msg: S2CMessage): void {
  // keep the latest state of each kind so a late-booting scene can catch up
  if (
    msg.type === "S2C_ROOM_STATE" ||
    msg.type === "S2C_ROUND_INTRO" ||
    msg.type === "S2C_AUCTION_STATE" ||
    msg.type === "S2C_REVEAL" ||
    msg.type === "S2C_GAME_OVER"
  ) {
    lastByType.set(msg.type, msg);
  }
  window.dispatchEvent(new CustomEvent("tw:msg", { detail: msg }));
}

window.addEventListener("tw:scene-ready", () => {
  for (const msg of lastByType.values()) {
    window.dispatchEvent(new CustomEvent("tw:msg", { detail: msg }));
  }
});

socket.on((msg) => {
  fanOut(msg);

  if (msg.type === "S2C_JOINED") {
    session = { roomCode: msg.roomCode, playerId: msg.playerId, token: msg.token };
    writeSession(session);
    enterGame(msg.playerId, msg.roomCode);
    return;
  }

  if (msg.type === "S2C_GAME_OVER") {
    gameOver = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    return;
  }

  if (msg.type === "S2C_ERROR") {
    const joinFailed =
      msg.code === "ROOM_FULL" ||
      msg.code === "ROOM_NOT_FOUND" ||
      msg.code === "NAME_TAKEN" ||
      msg.code === "GAME_ALREADY_STARTED";
    const expired = msg.code === "RECONNECT_FAILED" || msg.code === "SEAT_EXPIRED";
    const errBox = document.getElementById("error");
    if (errBox) errBox.textContent = `${msg.message} (${msg.code})`;

    if (expired) {
      clearSession();
      session = null;
      lobby.classList.remove("hidden");
      hud.classList.add("hidden");
      joinBtn.disabled = false;
      lobbyMsg.textContent = "La sesión caducó. Vuelve a entrar.";
      return;
    }

    lobbyMsg.textContent = joinFailed ? `${msg.message} (${msg.code})` : "";
    if (joinFailed) {
      if (msg.code === "NAME_TAKEN") {
        clearSession();
        session = null;
      }
      lobby.classList.remove("hidden");
      hud.classList.add("hidden");
      joinBtn.disabled = false;
    }
  }
});

socket.onClose(() => {
  if (gameOver || !session) return;
  lobbyMsg.textContent = "Conexión perdida. Reconectando...";
  scheduleReconnect(1);
});

// A stored session means the tab was reloaded (or the network dropped): resume
// the reserved seat instead of joining as a duplicate nickname.
if (session && session.roomCode === roomCode.value) {
  lobbyMsg.textContent = "Reconectando...";
  void tryReconnect().then((sent) => {
    if (!sent) {
      lobbyMsg.textContent = "No se pudo reconectar. Reintentando...";
      scheduleReconnect(1);
    }
  });
}

window.addEventListener("tw:room", (ev) => {
  const detail = (ev as CustomEvent).detail as {
    players: PlayerPublic[];
    phase: string;
    roomCode: string;
    round: number;
    totalRounds: number;
  };
  const a11y = document.getElementById("a11y");
  if (a11y) {
    a11y.textContent = `Sala ${detail.roomCode}. Ronda ${detail.round} de ${detail.totalRounds}. Fase ${detail.phase}. Jugadores: ${detail.players.map((p) => `${p.nickname} con ${p.money} euros`).join(", ")}.`;
  }
  playersEl.innerHTML = detail.players
    .map((p) => {
      const isMe = p.id === me;
      return `<div class="player ${isMe ? "me" : ""}">
        ${p.nickname} · ${p.money}€ ${p.ready ? "✔" : ""}${isMe ? " (tú)" : ""}
      </div>`;
    })
    .join("");

  if (detail.phase === "LOBBY") {
    actionsEl.dataset.mode = "lobby";
    const readyBtn = document.createElement("button");
    readyBtn.textContent = isReady ? "Cancelar listo" : "Estoy listo";
    readyBtn.onclick = () => {
      isReady = !isReady;
      socket.send({ type: "C2S_SET_READY", ready: isReady });
    };
    const startBtn = document.createElement("button");
    startBtn.textContent = "Empezar partida";
    startBtn.onclick = () => socket.send({ type: "C2S_START_GAME" });
    actionsEl.replaceChildren(readyBtn, startBtn);
  } else if (actionsEl.dataset.mode === "lobby") {
    // leaving the lobby: don't let ready/start buttons survive the transition,
    // but never wipe buttons owned by the roulette or game-over overlays
    actionsEl.replaceChildren();
    delete actionsEl.dataset.mode;
  }
});

window.addEventListener("tw:roulette", () => {
  actionsEl.innerHTML = "";
  for (const choice of ["red", "black", "green"] as const) {
    const b = document.createElement("button");
    b.textContent = choice === "red" ? "Rojo 1:1" : choice === "black" ? "Negro 1:1" : "Verde 35:1";
    b.onclick = () => {
      socket.send({ type: "C2S_ROULETTE_BET", choice, amount: 10 });
      actionsEl.innerHTML = "";
    };
    actionsEl.append(b);
  }
});

window.addEventListener("tw:gameover", () => {
  actionsEl.innerHTML = "";
  const again = document.createElement("button");
  again.textContent = "Ver sala";
  again.onclick = () => location.reload();
  actionsEl.append(again);
});

export { game, socket };

// Debug/E2E hook: the client is untrusted by design, so exposing the socket
// grants no advantage. Useful for automated checks and manual demos.
declare global {
  interface Window {
    __tw?: { socket: typeof socket };
  }
}
window.__tw = { socket };

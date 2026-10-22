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

let me: string = localStorage.getItem("tw.playerId") ?? "";
let isReady = false;
let pendingJoin = false;

nickname.value = localStorage.getItem("tw.nickname") ?? "";
const params = new URLSearchParams(location.search);
roomCode.value = (params.get("room") ?? "ABCD").toUpperCase();

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
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
    lobbyMsg.textContent = "";
    lobby.classList.add("hidden");
    hud.classList.remove("hidden");
    history.replaceState(null, "", `?room=${room}`);
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

  if (msg.type === "S2C_ERROR") {
    const fatal = msg.code === "ROOM_FULL" || msg.code === "ROOM_NOT_FOUND";
    const errBox = document.getElementById("error");
    if (errBox) errBox.textContent = `${msg.message} (${msg.code})`;
    lobbyMsg.textContent = fatal ? `${msg.message} (${msg.code})` : "";
    if (fatal) {
      lobby.classList.remove("hidden");
      hud.classList.add("hidden");
      joinBtn.disabled = false;
    }
    return;
  }

  if (msg.type === "S2C_ROOM_STATE") {
    // the server assigns ids; identify ourselves by the join we just sent
    if (!me) {
      const nick = localStorage.getItem("tw.nickname") ?? nickname.value.trim();
      const mine = msg.players.filter((p: PlayerPublic) => p.nickname === nick);
      const fresh = mine[mine.length - 1];
      if (pendingJoin && fresh) {
        me = fresh.id;
        pendingJoin = false;
        scene().setPlayerId(me);
      }
    }
  }
});

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

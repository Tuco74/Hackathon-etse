import Phaser from "phaser";
import type { PlayerPublic, S2CMessage } from "@trastero/shared";
import { assetUrl, fetchManifest, type Manifest } from "./game/manifest";
import { fetchPublicCatalog, type PublicCatalog } from "./game/catalog";
import { audio } from "./game/audio";
import { Director } from "./game/director";
import { session } from "./game/session";
import { attachIntegerScaling, integerZoom } from "./game/scaling";
import { socket, type NetStatus } from "./net/socket";
import { BootScene } from "./scenes/BootScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { GarageScene } from "./scenes/GarageScene";
import { RevealScene } from "./scenes/RevealScene";
import { RouletteScene } from "./scenes/RouletteScene";
import { ResultsScene } from "./scenes/ResultsScene";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
const mockMode = params.get("mock") === "1" || import.meta.env.VITE_MOCK === "1";

const lobby = $<HTMLDivElement>("lobby");
const lobbyMsg = $<HTMLParagraphElement>("lobbyMsg");
const nickname = $<HTMLInputElement>("nickname");
const roomCode = $<HTMLInputElement>("roomCode");
const joinBtn = $<HTMLButtonElement>("joinBtn");
const hud = $<HTMLDivElement>("hud");
const playersEl = $<HTMLDivElement>("players");
const statusEl = $<HTMLDivElement>("status");
const actionsEl = $<HTMLDivElement>("actions");
const errorEl = $<HTMLDivElement>("error");
const netEl = $<HTMLDivElement>("net");
const muteBtn = $<HTMLButtonElement>("muteBtn");

interface SavedSession {
  roomCode: string;
  playerId: string;
  token: string;
}

function readSavedSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem("tw.session");
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SavedSession>;
    if (typeof s.roomCode !== "string" || typeof s.playerId !== "string" || typeof s.token !== "string") {
      return null;
    }
    return { roomCode: s.roomCode, playerId: s.playerId, token: s.token };
  } catch {
    return null;
  }
}

const savedSession = readSavedSession();
if (savedSession) {
  session.playerId = savedSession.playerId;
  session.token = savedSession.token;
  session.roomCode = savedSession.roomCode;
}

nickname.value = localStorage.getItem("tw.nickname") ?? "";
roomCode.value = (params.get("room") ?? savedSession?.roomCode ?? "ABCD").toUpperCase();

let isReady = false;
let pendingNickname = "";
let knownIds = new Set<string>();
let game: Phaser.Game | null = null;
let director: Director | null = null;
let betAmount = 10;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

function showNet(status: NetStatus, detail?: string): void {
  const visible = status === "connecting" || status === "reconnecting" || status === "closed";
  netEl.classList.toggle("hidden", !visible);
  netEl.dataset.state = status;
  netEl.textContent =
    detail ?? (status === "connecting" ? "Conectando…" : status === "reconnecting" ? "Reconectando…" : "");
  if (status === "open" && pendingNickname) {
    // the queue flushes automatically on open; nothing else to do
    netEl.classList.add("hidden");
  }
}

function announce(text: string): void {
  const a11y = document.getElementById("a11y");
  if (a11y) a11y.textContent = text;
}

function esc(value: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
}

function renderPlayers(players: PlayerPublic[]): void {
  playersEl.innerHTML = players
    .map((player) => {
      const isMe = player.id === session.playerId;
      const high = session.auction?.highBidderId === player.id;
      const classes = ["player", isMe ? "me" : "", high ? "high" : "", player.connected ? "" : "offline"]
        .filter(Boolean)
        .join(" ");
      return `<div class="${classes}">
        ${esc(player.nickname)}${isMe ? " (tú)" : ""} · ${player.money}€ ${player.ready ? "· LISTO" : ""}
      </div>`;
    })
    .join("");
}

function setPhaseStatus(msg: S2CMessage): void {
  switch (msg.type) {
    case "S2C_ROUND_INTRO":
      statusEl.textContent = `Ronda ${msg.round}: se abre el trastero…`;
      break;
    case "S2C_AUCTION_STATE":
      statusEl.textContent = msg.state.canBid
        ? `Subasta abierta · mínimo ${msg.state.minNextBid} €`
        : "Subasta abierta · espera o sube cuando puedas";
      break;
    case "S2C_REVEAL":
      statusEl.textContent = "Revelado";
      break;
    case "S2C_ROULETTE_PHASE":
      statusEl.textContent = msg.readyToSpin
        ? "Ruleta: todos listos · pulsa Girar"
        : `Ruleta: ${msg.bets.length + msg.passed.length}/${msg.players.length} decididos`;
      break;
    case "S2C_ROULETTE_RESULT":
      statusEl.textContent = `Resultado de la ruleta: ${msg.result}`;
      break;
    case "S2C_GAME_OVER":
      statusEl.textContent = "Fin de la partida";
      break;
    default:
      break;
  }
}

function buildLobbyActions(): void {
  actionsEl.dataset.mode = "lobby";
  const readyBtn = document.createElement("button");
  readyBtn.textContent = isReady ? "Cancelar listo" : "Estoy listo";
  readyBtn.onclick = () => {
    isReady = !isReady;
    socket.send({ type: "C2S_SET_READY", ready: isReady });
    readyBtn.textContent = isReady ? "Cancelar listo" : "Estoy listo";
  };
  const startBtn = document.createElement("button");
  startBtn.textContent = "Empezar partida";
  startBtn.onclick = () => socket.send({ type: "C2S_START_GAME" });
  actionsEl.replaceChildren(readyBtn, startBtn);
}

const ROULETTE_LABEL: Record<"red" | "black" | "green", string> = {
  red: "ROJO",
  black: "NEGRO",
  green: "VERDE 0",
};

function clearRouletteActions(): void {
  if (actionsEl.dataset.mode !== "roulette") return;
  actionsEl.replaceChildren();
  delete actionsEl.dataset.mode;
}

/**
 * Roulette panel. It is re-rendered on every S2C_ROULETTE_PHASE snapshot, so
 * each player sees who has already bet/passed and the "Girar" button unlocks
 * as soon as everyone has decided. The server still auto-spins at the deadline.
 */
function buildRouletteActions(): void {
  const phase = session.roulettePhase;
  if (!phase) return;

  const moneyNow = session.money();
  const myBet = phase.bets.find((bet) => bet.playerId === session.playerId);
  const iPassed = phase.passed.includes(session.playerId);
  const decided = myBet !== undefined || iPassed;

  const options = [
    ...new Set([10, 50, 100, Math.floor(moneyNow / 2), moneyNow].filter(
      (value) => value >= 10 && value <= moneyNow,
    )),
  ];
  if (options.length === 0) options.push(10);
  if (!options.includes(betAmount)) betAmount = options[0] ?? 10;

  actionsEl.dataset.mode = "roulette";
  actionsEl.replaceChildren();

  const info = document.createElement("span");
  info.className = "roulette-info";
  if (myBet) {
    info.textContent = `Tu apuesta: ${myBet.amount} € a ${ROULETTE_LABEL[myBet.choice]}`;
  } else if (iPassed) {
    info.textContent = "Has pasado esta ruleta";
  } else if (moneyNow < 10) {
    info.textContent = "Sin saldo: pulsa Pasar";
  } else {
    info.textContent = "Elige color y cantidad";
  }
  actionsEl.append(info);

  const amounts = document.createElement("button");
  amounts.textContent = `Apuesta: ${betAmount} €`;
  amounts.disabled = decided || moneyNow < 10;
  amounts.onclick = () => {
    const index = options.indexOf(betAmount);
    betAmount = options[(index + 1) % options.length] ?? 10;
    buildRouletteActions();
  };
  actionsEl.append(amounts);

  for (const choice of ["red", "black", "green"] as const) {
    const button = document.createElement("button");
    button.textContent =
      choice === "red" ? "Rojo 1:1" : choice === "black" ? "Negro 1:1" : "Verde 35:1";
    button.disabled = decided || moneyNow < betAmount;
    button.onclick = () => {
      button.disabled = true;
      info.textContent = "Enviando apuesta…";
      socket.send({ type: "C2S_ROULETTE_BET", choice, amount: betAmount });
    };
    actionsEl.append(button);
  }

  const pass = document.createElement("button");
  pass.textContent = "Pasar";
  pass.disabled = decided;
  pass.onclick = () => {
    pass.disabled = true;
    info.textContent = "Pasando…";
    socket.send({ type: "C2S_ROULETTE_PASS" });
  };
  actionsEl.append(pass);

  const spin = document.createElement("button");
  spin.textContent = phase.readyToSpin ? "Girar ahora" : "Girar (esperando…)";
  spin.disabled = !phase.readyToSpin;
  spin.title = phase.readyToSpin
    ? "Todos han apostado o pasado: lanza la ruleta"
    : "Espera a que todos apuesten o pasen";
  spin.onclick = () => {
    spin.disabled = true;
    spin.textContent = "Girando…";
    socket.send({ type: "C2S_ROULETTE_SPIN" });
  };
  actionsEl.append(spin);
}

function onRoomState(msg: Extract<S2CMessage, { type: "S2C_ROOM_STATE" }>): void {
  if (!session.playerId && pendingNickname) {
    const sameNick = msg.players.filter((player) => player.nickname === pendingNickname);
    const fresh =
      sameNick.filter((player) => !knownIds.has(player.id)).at(-1) ?? sameNick.at(-1);
    if (fresh) {
      session.playerId = fresh.id;
      localStorage.setItem("tw.playerId", fresh.id);
      pendingNickname = "";
      hud.classList.remove("hidden");
      lobby.classList.add("hidden");
    }
  }
  errorEl.textContent = "";
  renderPlayers(msg.players);
  announce(
    `Sala ${msg.roomCode}. Ronda ${msg.round} de ${msg.totalRounds}. Fase ${msg.phase}. ` +
      msg.players.map((player) => `${player.nickname} con ${player.money} euros`).join(", "),
  );

  if (msg.phase === "LOBBY") {
    if (actionsEl.dataset.mode !== "lobby") buildLobbyActions();
  } else if (actionsEl.dataset.mode === "lobby") {
    actionsEl.replaceChildren();
    delete actionsEl.dataset.mode;
  }
}

async function join(): Promise<void> {
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
    if (!socket.connected) {
      // An explicit join starts a new seat: don't let onopen resume the old one.
      session.playerId = "";
      session.token = "";
      sessionStorage.removeItem("tw.session");
      await socket.connect(wsUrl(), {
        mock: mockMode,
        mockRounds: 3,
        mockRoulette: Number(params.get("roulette") ?? 2) || 2,
      });
    }
    session.nickname = nick;
    session.roomCode = room;
    localStorage.setItem("tw.nickname", nick);
    knownIds = new Set(session.players.map((player) => player.id));
    pendingNickname = nick;
    socket.send({ type: "C2S_JOIN", nickname: nick, roomCode: room });
    lobbyMsg.textContent = "";
    history.replaceState(null, "", `?room=${room}${mockMode ? "&mock=1" : ""}`);
  } catch {
    lobbyMsg.textContent = "No se pudo conectar al servidor. ¿Está arrancado?";
    joinBtn.disabled = false;
  }
}

joinBtn.addEventListener("click", () => void join());

/** Reload/lost connection: resume the reserved seat (the socket sends C2S_RECONNECT). */
async function resumeSession(): Promise<void> {
  if (!savedSession) return;
  joinBtn.disabled = true;
  lobbyMsg.textContent = "Reconectando…";
  try {
    if (!socket.connected) await socket.connect(wsUrl(), { mock: false });
  } catch {
    lobbyMsg.textContent = "No se pudo reconectar. Vuelve a entrar.";
    joinBtn.disabled = false;
  }
}

socket.onStatus((status, detail) => {
  showNet(status, detail);
  if (status === "closed" && !socket.isMock) {
    lobbyMsg.textContent = detail ?? "Conexión cerrada";
    joinBtn.disabled = false;
  }
});

socket.on((msg) => {
  session.apply(msg);
  setPhaseStatus(msg);

  if (msg.type === "S2C_JOINED") {
    sessionStorage.setItem(
      "tw.session",
      JSON.stringify({ roomCode: msg.roomCode, playerId: msg.playerId, token: msg.token }),
    );
    pendingNickname = "";
    knownIds.add(msg.playerId);
    lobby.classList.add("hidden");
    hud.classList.remove("hidden");
    joinBtn.disabled = false;
    lobbyMsg.textContent = "";
    errorEl.textContent = "";
    netEl.classList.add("hidden");
  }

  if (msg.type === "S2C_ERROR") {
    const joinFailed =
      msg.code === "ROOM_FULL" ||
      msg.code === "ROOM_NOT_FOUND" ||
      msg.code === "NAME_TAKEN" ||
      msg.code === "GAME_ALREADY_STARTED";
    const expired = msg.code === "RECONNECT_FAILED" || msg.code === "SEAT_EXPIRED";
    errorEl.textContent = `${msg.message} (${msg.code})`;
    window.setTimeout(() => {
      if (errorEl.textContent === `${msg.message} (${msg.code})`) errorEl.textContent = "";
    }, 4000);

    if (expired || msg.code === "NAME_TAKEN") {
      sessionStorage.removeItem("tw.session");
      session.token = "";
      if (expired) session.playerId = "";
    }

    if (expired || joinFailed) {
      lobbyMsg.textContent = expired ? "La sesión caducó. Vuelve a entrar." : `${msg.message} (${msg.code})`;
      lobby.classList.remove("hidden");
      hud.classList.add("hidden");
      joinBtn.disabled = false;
    }

    // Re-render the roulette panel so a rejected spin/bet doesn't leave it locked.
    if (
      actionsEl.dataset.mode === "roulette" &&
      ["SPIN_NOT_READY", "BET_TOO_LOW", "BET_TOO_HIGH", "ALREADY_BET", "ALREADY_PASSED", "PHASE_INVALID"].includes(msg.code)
    ) {
      buildRouletteActions();
    }
    return;
  }

  if (msg.type === "S2C_ROOM_STATE") onRoomState(msg);
  if (msg.type === "S2C_ROULETTE_PHASE") buildRouletteActions();
  if (msg.type === "S2C_ROULETTE_RESULT") clearRouletteActions();
  if (
    msg.type === "S2C_ROUND_INTRO" ||
    msg.type === "S2C_AUCTION_STATE" ||
    msg.type === "S2C_REVEAL"
  ) {
    clearRouletteActions();
  }
  if (msg.type === "S2C_GAME_OVER") {
    clearRouletteActions();
    actionsEl.innerHTML = "";
    const again = document.createElement("button");
    again.textContent = "Ver sala";
    again.onclick = () => window.location.reload();
    actionsEl.append(again);
  }

  window.dispatchEvent(new CustomEvent("tw:msg", { detail: msg }));
});

window.addEventListener("tw:clock", (event) => {
  const detail = (event as CustomEvent<{ offset: number; rtt: number }>).detail;
  session.clockOffset = detail.offset;
  session.rttMs = detail.rtt;
});

window.addEventListener("tw:assets-error", (event) => {
  const detail = (event as CustomEvent<{ key: string }>).detail;
  netEl.classList.remove("hidden");
  netEl.dataset.state = "closed";
  netEl.textContent = `No se pudo cargar el arte (${detail.key}). Recarga la página.`;
});

window.addEventListener("online", () => socket.retryNow());

muteBtn.addEventListener("click", () => {
  const muted = audio.toggle();
  muteBtn.textContent = muted ? "SONIDO OFF" : "SONIDO ON";
  muteBtn.setAttribute("aria-pressed", String(muted));
});
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "m" && !(event.target instanceof HTMLInputElement)) {
    const muted = audio.toggle();
    muteBtn.textContent = muted ? "SONIDO OFF" : "SONIDO ON";
  }
});

function startGameShell(manifest: Manifest, catalog: PublicCatalog): void {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: 480,
    height: 270,
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    backgroundColor: "#14111d",
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      zoom: integerZoom(),
    },
    scene: [BootScene, LobbyScene, GarageScene, RevealScene, RouletteScene, ResultsScene],
    callbacks: {
      preBoot: (phaserGame) => {
        phaserGame.registry.set("manifest", manifest);
        phaserGame.registry.set("catalog", catalog);
      },
    },
  });
  attachIntegerScaling(game);

  window.addEventListener("tw:booted", () => {
    if (!game) return;
    director = new Director(game);
    director.start();
    joinBtn.disabled = false;
    lobbyMsg.textContent = "";
    if (mockMode) {
      autoJoinMock();
    } else if (savedSession && savedSession.roomCode === roomCode.value) {
      void resumeSession();
    }
  });
}

async function autoJoinMock(): Promise<void> {
  nickname.value = params.get("nick") ?? "Tú";
  roomCode.value = "MOCK";
  await join();
  socket.send({ type: "C2S_SET_READY", ready: true });
  isReady = true;
  window.setTimeout(() => socket.send({ type: "C2S_START_GAME" }), 900);
}

async function boot(): Promise<void> {
  joinBtn.disabled = true;
  lobbyMsg.textContent = "Cargando arte…";
  try {
    const manifest = await fetchManifest();
    const catalog = await fetchPublicCatalog(assetUrl(manifest.catalog));
    startGameShell(manifest, catalog);
  } catch (error) {
    console.error(error);
    lobbyMsg.textContent = "No se pudieron cargar los assets. Recarga la página.";
    joinBtn.disabled = false;
    joinBtn.onclick = () => window.location.reload();
  }
}

void boot();

declare global {
  interface Window {
    __tw?: { socket: typeof socket; session: typeof session; game: Phaser.Game | null };
  }
}
window.__tw = {
  socket,
  session,
  get game() {
    return game;
  },
};

import Phaser from "phaser";
import type { S2CMessage } from "@trastero/shared";
import { assetUrl, fetchManifest } from "./game/manifest";
import { fetchPublicCatalog } from "./game/catalog";
import { audio } from "./game/audio";
import { Director } from "./game/director";
import { session } from "./game/session";
import { attachIntegerScaling, integerZoom } from "./game/scaling";
import { socket } from "./net/socket";
import { mountUi } from "./ui";
import type { Manifest } from "./game/manifest";
import type { PublicCatalog } from "./game/catalog";
import { BootScene } from "./scenes/BootScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { GarageScene } from "./scenes/GarageScene";
import { RevealScene } from "./scenes/RevealScene";
import { RouletteScene } from "./scenes/RouletteScene";
import { ResultsScene } from "./scenes/ResultsScene";

const params = new URLSearchParams(location.search);
const mockMode = params.get("mock") === "1" || import.meta.env.VITE_MOCK === "1";

function fatal(message: string): void {
  const host = document.getElementById("ui") ?? document.body;
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;inset:0;display:grid;place-items:center;background:#14111d;color:#f6f3fa;" +
    "font-family:monospace;padding:24px;text-align:center;z-index:100";
  box.innerHTML = `<div><p>${message}</p><button style="font:inherit;padding:8px 14px;margin-top:12px">Recargar</button></div>`;
  box.querySelector("button")?.addEventListener("click", () => location.reload());
  host.append(box);
}

async function boot(): Promise<void> {
  let manifest: Manifest;
  let catalog: PublicCatalog;
  try {
    manifest = await fetchManifest();
    catalog = await fetchPublicCatalog(assetUrl(manifest.catalog));
  } catch (error) {
    console.error(error);
    fatal("No se pudieron cargar los assets del juego.");
    return;
  }

  // C's scenes read this shared snapshot. D's DOM interface has its own state
  // reducer; both are fed from the same socket so they can never disagree.
  socket.on((msg: S2CMessage) => {
    session.apply(msg);
    if (msg.type === "S2C_BID_EVENT") audio.play("sfx_bid");
  });

  if (mockMode) {
    // Pre-connect so D's lobby join() reuses the mock transport instead of
    // opening a real WebSocket.
    await socket.connect("", {
      mock: true,
      mockRounds: 3,
      mockRoulette: Number(params.get("roulette") ?? 2) || 2,
      mockNoBets: params.get("nobets") === "1",
    });
  }

  const game = new Phaser.Game({
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

  // D owns every readable element: lobby, HUD, reveal, roulette and results.
  mountUi({ socket });

  window.addEventListener("tw:booted", () => {
    new Director(game).start();
  });

  window.__tw = {
    socket,
    session,
    get game() {
      return game;
    },
  };
}

void boot();

declare global {
  interface Window {
    __tw?: {
      socket: typeof socket;
      session: typeof session;
      readonly game: Phaser.Game;
    };
  }
}

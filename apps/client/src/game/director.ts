import Phaser from "phaser";
import type { S2CMessage } from "@trastero/shared";
import { session } from "./session";

type SceneKey = "lobby" | "garage" | "reveal" | "roulette" | "results";

function sceneForPhase(): SceneKey {
  switch (session.phase) {
    case "LOBBY":
      return "lobby";
    case "ROUND_INTRO":
    case "AUCTION":
      return "garage";
    case "REVEAL":
      return "reveal";
    case "ROULETTE":
      return "roulette";
    case "GAME_OVER":
      return "results";
    default:
      return "lobby";
  }
}

/**
 * One scene at a time, driven by the server phase. Scenes read the shared
 * session state on create, so a message arriving mid-boot is never lost.
 */
export class Director {
  private current: SceneKey | "" = "";

  constructor(private readonly game: Phaser.Game) {}

  start(): void {
    window.addEventListener("tw:msg", this.onMessage);
    const active = this.game.scene.getScenes(true)[0];
    if (active) this.current = active.scene.key as SceneKey;
    this.route();
  }

  stop(): void {
    window.removeEventListener("tw:msg", this.onMessage);
  }

  private onMessage = (event: Event): void => {
    const msg = (event as CustomEvent<S2CMessage>).detail;
    if (
      msg.type === "S2C_ROOM_STATE" ||
      msg.type === "S2C_ROUND_INTRO" ||
      msg.type === "S2C_REVEAL" ||
      msg.type === "S2C_ROULETTE_PHASE" ||
      msg.type === "S2C_GAME_OVER"
    ) {
      this.route();
    }
  };

  private route(): void {
    const target = sceneForPhase();
    if (target === this.current) return;

    for (const scene of this.game.scene.getScenes(true)) {
      if (scene.scene.key !== target) this.game.scene.stop(scene.scene.key);
    }
    this.game.scene.start(target);
    this.current = target;
  }
}

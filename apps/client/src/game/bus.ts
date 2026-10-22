import Phaser from "phaser";
import type { S2CMessage } from "@trastero/shared";
import type { Manifest } from "./manifest";
import type { PublicCatalog } from "./catalog";

export function getManifest(scene: Phaser.Scene): Manifest {
  return scene.registry.get("manifest") as Manifest;
}

export function getCatalog(scene: Phaser.Scene): PublicCatalog {
  return scene.registry.get("catalog") as PublicCatalog;
}

/** Subscribe to the shared message bus for the lifetime of the scene. */
export function onGameMessage(
  scene: Phaser.Scene,
  handler: (msg: S2CMessage) => void,
): void {
  const listener = (event: Event): void => {
    handler((event as CustomEvent<S2CMessage>).detail);
  };
  window.addEventListener("tw:msg", listener);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    window.removeEventListener("tw:msg", listener);
  });
}

import type { S2CMessage } from "@trastero/shared";
import type { GameSocket } from "../net/socket";
import { wireMessages } from "./bus";
import { UiRoot } from "./root";

export interface MountOptions {
  socket: GameSocket;
  /** Element that hosts the DOM interface. Defaults to #ui or <body>. */
  parent?: HTMLElement;
}

/**
 * Mounts the whole interface (lobby, HUD, reveal, roulette, results) and wires
 * it to the socket. The Phaser scene keeps drawing the stage behind it.
 */
export function mountUi({ socket, parent }: MountOptions): UiRoot {
  const host = parent ?? document.getElementById("ui") ?? document.body;
  const root = new UiRoot(socket);
  root.mount(host);
  wireMessages(socket, (message: S2CMessage) => root.receive(message));
  return root;
}

export type { UiRoot };

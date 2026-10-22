import Phaser from "phaser";
import type { Manifest } from "../game/manifest";
import { DEPTH } from "./stage";

export interface Backdrop {
  update(delta: number): void;
  /** unit currently on screen, for reveal/roulette scenes that keep the room */
  unit: string;
}

const UNITS = ["unit_a", "unit_b", "unit_c"] as const;

export function unitForRound(round: number): string {
  return UNITS[Math.max(0, (round - 1) % UNITS.length)] ?? "unit_a";
}

/**
 * Storage room with three parallax layers, warm light, vignette and dust.
 * Everything is drawn from E's generated PNGs; no geometry rules live here.
 */
export function createBackdrop(
  scene: Phaser.Scene,
  manifest: Manifest,
  unit: string,
): Backdrop {
  const resolved = manifest.backgrounds[unit] ? unit : "unit_a";
  const layers = manifest.backgrounds[resolved] ?? manifest.backgrounds.unit_a!;
  const depth = DEPTH.room;

  const back = scene.add.image(0, 0, `bg_${resolved}_back`).setOrigin(0, 0).setDepth(depth);
  const mid = scene.add.image(0, 0, `bg_${resolved}_mid`).setOrigin(0, 0).setDepth(depth + 1);
  const light = scene.add
    .image(0, 0, "light_cone")
    .setOrigin(0, 0)
    .setDepth(depth + 2)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(0.55);

  // dust: a few 16x16 sheets animated at 8 fps, snapped to whole pixels
  if (scene.anims.exists("dust") && scene.textures.exists("dust")) {
    for (let i = 0; i < 7; i += 1) {
      const x = 40 + ((i * 71) % 400);
      const y = 60 + ((i * 43) % 140);
      const dust = scene.add
        .sprite(x, y, "dust", 0)
        .setDepth(DEPTH.dust)
        .setAlpha(0.5)
        .setScale(1)
        .play("dust");
      dust.setData("drift", 4 + (i % 3) * 3);
    }
  }

  const front = scene.add.image(0, 0, `bg_${resolved}_front`).setOrigin(0, 0).setDepth(DEPTH.hud - 2);
  const vignette = scene.add
    .image(0, 0, "vignette")
    .setOrigin(0, 0)
    .setDepth(DEPTH.hud - 1)
    .setAlpha(0.9);

  const [backFactor = 0, midFactor = 0.35, frontFactor = 0.6] = layers.parallax;
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };

  const onPointer = (pointer: Phaser.Input.Pointer): void => {
    const nx = pointer.x / scene.scale.width - 0.5;
    const ny = pointer.y / scene.scale.height - 0.5;
    target.x = Phaser.Math.Clamp(nx * 2, -1, 1);
    target.y = Phaser.Math.Clamp(ny * 2, -1, 1);
  };
  scene.input.on("pointermove", onPointer);

  return {
    unit: resolved,
    update(delta: number): void {
      const ease = Math.min(1, delta / 260);
      current.x += (target.x - current.x) * ease;
      current.y += (target.y - current.y) * ease;
      // round to whole pixels: sub-pixel movement would blur the pixel art
      mid.x = Math.round(-current.x * 4 * midFactor);
      mid.y = Math.round(-current.y * 2 * midFactor);
      front.x = Math.round(-current.x * 6 * frontFactor);
      front.y = Math.round(-current.y * 3 * frontFactor);
      // the front frame and the vignette stay put: moving them would expose
      // the canvas edge and break the room illusion
      light.x = Math.round(-current.x * 3 * backFactor);
      front.x = 0;
      vignette.x = 0;
    },
  };
}

import Phaser from "phaser";
import { audio } from "../game/audio";
import { assetUrl, type Manifest } from "../game/manifest";

function must(value: string | undefined, name: string): string {
  if (!value) throw new Error(`assets/manifest.json sin ${name}`);
  return value;
}

/**
 * Preloads every generated asset (atlases, font, rooms, audio) behind a pixel
 * loading bar. On failure it reports to the DOM shell, which offers a retry.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    const manifest = this.registry.get("manifest") as Manifest;
    const width = 480;
    const height = 270;

    this.cameras.main.setBackgroundColor(0x14111d);
    this.add
      .text(width / 2, height / 2 - 18, "Abriendo el trastero…", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f6f3fa",
      })
      .setOrigin(0.5);
    this.add.rectangle(width / 2, height / 2 + 8, 204, 12, 0x0b0910).setStrokeStyle(1, 0x4d4560);
    const bar = this.add
      .rectangle(width / 2 - 100, height / 2 + 8, 1, 8, 0xffd166)
      .setOrigin(0, 0.5);

    this.load.on("progress", (progress: number) => {
      bar.width = Math.max(1, Math.round(200 * progress));
    });
    this.load.on("loaderror", (file: { key: string }) => {
      window.dispatchEvent(
        new CustomEvent("tw:assets-error", { detail: { key: file.key } }),
      );
    });

    for (const [key, atlas] of Object.entries(manifest.atlases)) {
      this.load.atlas(key, assetUrl(atlas.image), assetUrl(atlas.data));
    }
    this.load.bitmapFont(
      "pixel",
      assetUrl(manifest.font.image),
      assetUrl(manifest.font.data),
    );

    for (const [id, bg] of Object.entries(manifest.backgrounds)) {
      this.load.image(`bg_${id}_back`, assetUrl(bg.back));
      this.load.image(`bg_${id}_mid`, assetUrl(bg.mid));
      this.load.image(`bg_${id}_front`, assetUrl(bg.front));
    }
    this.load.image("light_cone", assetUrl(must(manifest.overlays.light, "overlays.light")));
    this.load.image("vignette", assetUrl(must(manifest.overlays.vignette, "overlays.vignette")));

    const dust = manifest.animations.dust;
    if (dust && "image" in dust) {
      this.load.spritesheet("dust", assetUrl(dust.image), {
        frameWidth: dust.frameWidth,
        frameHeight: dust.frameHeight,
      });
    }

    for (const [key, ref] of Object.entries(manifest.audio)) {
      this.load.audio(key, assetUrl(ref.file));
    }
  }

  create(): void {
    const manifest = this.registry.get("manifest") as Manifest;
    const dust = manifest.animations.dust;
    if (dust && "image" in dust && !this.anims.exists("dust")) {
      this.anims.create({
        key: "dust",
        frames: this.anims.generateFrameNumbers("dust", { start: 0, end: dust.frames - 1 }),
        frameRate: dust.fps,
        repeat: -1,
      });
    }

    audio.attach(this, manifest);
    audio.startMusic();
    audio.setMuted(audio.muted);

    this.scene.start("lobby");
    window.dispatchEvent(new CustomEvent("tw:booted"));
  }
}

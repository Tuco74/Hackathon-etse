import Phaser from "phaser";

export const DEPTH = {
  room: 0,
  dust: 12,
  lot: 20,
  hud: 40,
  overlay: 60,
} as const;

export const WHITE = 0xf6f3fa;
export const GOLD = 0xffd166;
export const GREEN = 0x8fcf74;
export const RED = 0xe35d68;
export const GREY = 0xcfc9d9;

export function addPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  frame = "panel",
): Phaser.GameObjects.NineSlice {
  return scene.add.nineslice(x, y, "ui", frame, w, h, 8, 8, 8, 8).setOrigin(0, 0);
}

export function addLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  tint = WHITE,
  origin: [number, number] = [0, 0],
): Phaser.GameObjects.BitmapText {
  return scene.add.bitmapText(x, y, "pixel", text, 14).setOrigin(origin[0], origin[1]).setTint(tint);
}

export function money(amount: number): string {
  return `${amount.toLocaleString("de-DE")} €`;
}

interface ButtonOptions {
  w?: number;
  h?: number;
  frame?: string;
  onClick?: () => void;
  tint?: number;
}

/** 9-slice pixel button with a disabled state that always has a visible reason. */
export class PixelButton {
  readonly go: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.NineSlice;
  private readonly txt: Phaser.GameObjects.BitmapText;
  private readonly baseFrame: string;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    options: ButtonOptions = {},
  ) {
    const w = options.w ?? 96;
    const h = options.h ?? 22;
    this.baseFrame = options.frame ?? "button";
    this.bg = scene.add.nineslice(0, 0, "ui", this.baseFrame, w, h, 8, 8, 8, 8).setOrigin(0.5);
    this.txt = scene.add
      .bitmapText(0, 0, "pixel", text, 14)
      .setOrigin(0.5)
      .setTint(options.tint ?? WHITE);
    this.go = scene.add.container(x, y, [this.bg, this.txt]);
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on("pointerover", () => {
      if (this.enabled && this.baseFrame === "button") this.bg.setFrame("button_hover");
    });
    this.bg.on("pointerout", () => {
      if (this.enabled) this.bg.setFrame(this.baseFrame);
    });
    this.bg.on("pointerdown", () => {
      if (this.enabled) options.onClick?.();
    });
  }

  setLabel(text: string): void {
    this.txt.setText(text);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.bg.setFrame(enabled ? this.baseFrame : "button_disabled");
    this.txt.setAlpha(enabled ? 1 : 0.55);
    this.bg.disableInteractive();
    if (enabled) this.bg.setInteractive({ useHandCursor: true });
  }

  destroy(): void {
    this.go.destroy(true);
  }
}

/** Small header/status chip used for players and totals. */
export function addChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  text: string,
  frame = "panel_dark",
): { root: Phaser.GameObjects.Container; label: Phaser.GameObjects.BitmapText } {
  const bg = scene.add.nineslice(0, 0, "ui", frame, w, 18, 8, 8, 8, 8).setOrigin(0.5);
  const label = scene.add.bitmapText(0, 0, "pixel", text, 14).setOrigin(0.5);
  const root = scene.add.container(x, y, [bg, label]);
  return { root, label };
}

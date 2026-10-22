import type Phaser from "phaser";
import type { Manifest } from "./manifest";

const STORAGE_KEY = "tw.muted";

/**
 * SFX/music from E's manifest. Mute is persistent and also toggled with the
 * M key (documented in docs/ART.md).
 */
class AudioManager {
  private scene: Phaser.Scene | null = null;
  private manifest: Manifest | null = null;
  private music: Phaser.Sound.BaseSound | null = null;
  muted = localStorage.getItem(STORAGE_KEY) === "1";

  attach(scene: Phaser.Scene, manifest: Manifest): void {
    this.scene = scene;
    this.manifest = manifest;
    scene.sound.mute = this.muted;
  }

  play(key: string): void {
    const ref = this.manifest?.audio[key];
    if (!ref || !this.scene || this.muted) return;
    this.scene.sound.play(key, { volume: ref.volume, loop: false });
  }

  startMusic(): void {
    const ref = this.manifest?.audio.music_loop;
    if (!ref || !this.scene || this.music) return;
    this.music = this.scene.sound.add("music_loop", {
      volume: ref.volume,
      loop: true,
    });
    this.music.play();
    if (this.muted) this.music.pause();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    if (this.scene) this.scene.sound.mute = muted;
    if (this.music) {
      if (muted) this.music.pause();
      else if (!this.music.isPlaying) this.music.resume();
    }
    window.dispatchEvent(new CustomEvent("tw:mute", { detail: { muted } }));
  }

  toggle(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }
}

export const audio = new AudioManager();

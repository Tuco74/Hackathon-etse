"""Chiptune SFX + one music loop, synthesised from scratch (no samples).

Output: mono 16-bit 22.05 kHz WAV.  Deterministic: the noise generator is
seeded, so a rebuild produces byte-identical files.
"""

import math
import os
import random
import struct
import wave

SR = 22050


def _env(i, n, attack=0.005, release=0.06):
    a = int(attack * SR)
    r = int(release * SR)
    if i < a:
        return i / max(a, 1)
    if i > n - r:
        return max(0.0, (n - i) / max(r, 1))
    return 1.0


def tone(freq, dur, kind="square", vol=0.4, duty=0.5, slide=0.0, release=0.05):
    n = int(dur * SR)
    out = []
    phase = 0.0
    for i in range(n):
        f = freq * (1.0 + slide * i / max(n, 1))
        phase += f / SR
        p = phase % 1.0
        if kind == "square":
            s = 1.0 if p < duty else -1.0
        elif kind == "tri":
            s = 4.0 * abs(p - 0.5) - 1.0
        elif kind == "saw":
            s = 2.0 * p - 1.0
        else:  # sine
            s = math.sin(2 * math.pi * p)
        out.append(s * vol * _env(i, n, release=release))
    return out


def noise(dur, vol=0.4, release=0.05, seed=1):
    rnd = random.Random(seed)
    n = int(dur * SR)
    return [(rnd.uniform(-1, 1) * vol * _env(i, n, release=release)) for i in range(n)]


def silence(dur):
    return [0.0] * int(dur * SR)


def mix(*tracks):
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for t in tracks:
        for i, v in enumerate(t):
            out[i] += v
    return out


def seq(*parts):
    out = []
    for p in parts:
        out.extend(p)
    return out


def gain(track, g):
    return [v * g for v in track]


def write(path, samples, loop=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = 0.89 / peak if peak > 0.89 else 1.0
    frames = b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s * scale)) * 32767)) for s in samples)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(frames)
    if loop:
        # no metadata support in stdlib; documented in manifest
        pass


def build(out_dir):
    files = {}

    files["sfx_bid"] = seq(
        tone(1046, 0.05, "square", 0.35),
        silence(0.01),
        tone(1568, 0.06, "square", 0.3, release=0.03),
    )
    files["sfx_gavel"] = mix(
        noise(0.06, 0.5, release=0.03, seed=4),
        tone(110, 0.22, "square", 0.45, slide=-0.35, release=0.12),
        silence(0.02),
    )
    files["sfx_coin"] = seq(
        tone(1318, 0.055, "square", 0.3),
        tone(1568, 0.055, "square", 0.3),
        tone(2093, 0.09, "square", 0.28, release=0.05),
    )
    clicks = []
    t = 0.0
    while t < 1.6:
        clicks.append(tone(1200, 0.012, "square", 0.18, release=0.005))
        clicks.append(silence(0.05 + t * 0.12))
        t += 0.1
    files["sfx_spin"] = seq(*clicks)
    files["sfx_tension"] = seq(
        tone(110, 0.5, "tri", 0.3, release=0.05),
        tone(110, 0.5, "tri", 0.3, release=0.05),
        tone(147, 0.5, "tri", 0.3, release=0.05),
        tone(110, 0.5, "tri", 0.3, release=0.05),
    )
    files["sfx_win"] = seq(
        tone(523, 0.11, "square", 0.32),
        tone(659, 0.11, "square", 0.32),
        tone(784, 0.11, "square", 0.32),
        tone(1046, 0.3, "square", 0.34, release=0.2),
    )
    files["sfx_lose"] = seq(
        tone(392, 0.14, "tri", 0.35),
        tone(330, 0.14, "tri", 0.35),
        tone(262, 0.14, "tri", 0.35),
        tone(196, 0.35, "tri", 0.35, release=0.2),
    )
    files["sfx_roulette"] = seq(
        mix(noise(0.05, 0.3, seed=9), tone(180, 0.18, "square", 0.3, slide=-0.4, release=0.1)),
        silence(0.03),
        tone(1568, 0.06, "square", 0.25),
        tone(2093, 0.08, "square", 0.25),
    )

    # 120 bpm, 16 beats ≈ 8 s loop
    beat = 0.5
    bass_notes = [55, 55, 82.4, 73.4] * 4
    arp_notes = [220, 277.2, 329.6, 440, 329.6, 277.2] * 4
    music = []
    for b in range(16):
        music.append(tone(bass_notes[b], beat * 0.9, "tri", 0.18, release=0.08))
        music.append(mix(
            tone(arp_notes[b * 2 % len(arp_notes)], beat * 0.25, "square", 0.09, duty=0.25, release=0.03),
            tone(arp_notes[(b * 2 + 1) % len(arp_notes)], beat * 0.25, "square", 0.07, duty=0.25, release=0.03),
            noise(0.03, 0.05, release=0.02, seed=100 + b),
        ))
        music.append(silence(beat * 0.25))
    files["music_loop"] = seq(*music)

    for name, samples in files.items():
        write(os.path.join(out_dir, f"{name}.wav"), samples, loop=name == "music_loop")
    return {name: os.path.join(out_dir, f"{name}.wav") for name in files}

#!/usr/bin/env python3
"""Makes the music and sound effects for the Daksha videos.

Every sound is synthesised here from sine waves and noise. There are no samples and no
recordings, so there is nothing to license. The sounds are timed from the edits themselves:
../src/timeline.js (launch film), ../demo/timeline.js (demo walkthrough) and
../film2/timeline.js (the second launch film), so if an edit changes, run this again.

    python3 video/launch/audio/make-audio.py --out video/launch/build/audio

Writes launch.wav, demo.wav and film2.wav: 48 kHz stereo, mastered to about -16 LUFS with a true peak
under -1.5 dBTP. Needs Python 3 with numpy, Node (to read the timelines) and ffmpeg.
"""
import argparse
import json
import os
import re
import subprocess
import wave

import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
LAUNCH_DIR = os.path.dirname(HERE)
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
rng = np.random.RandomState(7)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def times(n):
    return np.arange(n) / SR


# ---------------------------------------------------------------- reading the edits

def read_launch():
    path = os.path.join(LAUNCH_DIR, "src", "timeline.js")
    js = (
        "const vm=require('vm'),fs=require('fs');const c={};vm.createContext(c);"
        "vm.runInContext(fs.readFileSync(%s,'utf8')+"
        "';this.T=buildTimeline(new Proxy({},{get:()=>0}),\"h\")',c);"
        "console.log(JSON.stringify(c.T))" % json.dumps(path)
    )
    return json.loads(subprocess.check_output(["node", "-e", js]).decode())


def read_film2():
    path = os.path.join(LAUNCH_DIR, "film2", "timeline.js")
    js = "console.log(JSON.stringify(require(%s).buildFilm2('h')))" % json.dumps(path)
    return json.loads(subprocess.check_output(["node", "-e", js]).decode())


def read_demo():
    path = os.path.join(LAUNCH_DIR, "demo", "timeline.js")
    js = "console.log(JSON.stringify(require(%s).buildDemo()))" % json.dumps(path)
    return json.loads(subprocess.check_output(["node", "-e", js]).decode())


# ---------------------------------------------------------------- building blocks

class Bus:
    """A stereo buffer that starts PRE seconds before time 0, so notes can ring in."""

    PRE = 3.0

    def __init__(self, dur):
        self.n = int((dur + self.PRE + 6) * SR)
        self.x = np.zeros((self.n, 2))

    def add(self, t, sig, gain=1.0, pan=0.0):
        i = int(round((t + self.PRE) * SR))
        if i >= self.n:
            return
        if i < 0:
            sig = sig[-i:]
            i = 0
        sig = sig[: self.n - i]
        if sig.ndim == 1:
            left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            sig = np.stack([sig * left, sig * right], axis=1) * np.sqrt(2)
        self.x[i:i + len(sig)] += sig * gain

    def crop(self, dur):
        i = int(self.PRE * SR)
        return self.x[i:i + int(dur * SR)]


def band_noise(n, lo, hi):
    spec = np.fft.rfft(rng.randn(n))
    f = np.fft.rfftfreq(n, 1.0 / SR)
    spec[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(spec, n)
    return y / (np.abs(y).max() + 1e-9)


def fade_edges(y, a=0.004, r=0.03):
    n = len(y)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    y = y.copy()
    shape = (-1,) + (1,) * (y.ndim - 1)
    y[:na] *= np.linspace(0, 1, na).reshape(shape)
    if nr:
        y[-nr:] *= np.linspace(1, 0, nr).reshape(shape)
    return y


def reverb(x, seconds=1.8, wet=0.25):
    n = int(seconds * SR)
    t = times(n)
    ir = np.stack([rng.randn(n), rng.randn(n)], axis=1) * np.exp(-t * 6.9 / seconds)[:, None]
    ir[: int(0.012 * SR)] = 0  # a little pre-delay
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    out = np.fft.irfft(np.fft.rfft(x, size, axis=0) * np.fft.rfft(ir, size, axis=0), size, axis=0)[: len(x)]
    out /= np.sqrt((ir ** 2).sum(axis=0))[None, :]
    return x + out * wet


def ping_pong(x, delay, fb=0.35, taps=5):
    d = int(delay * SR)
    out = x.copy()
    g = 1.0
    for k in range(1, taps + 1):
        g *= fb
        src = x[:, 0] + x[:, 1]
        ch = k % 2
        out[k * d:, ch] += src[: len(x) - k * d] * g * 0.5
    return out


# ---------------------------------------------------------------- instruments

def pad_note(f, dur, bright=1.0):
    n = int((dur + 1.2) * SR)
    t = times(n)
    env = np.minimum(1, t / 0.45) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.35))
    out = np.zeros((n, 2))
    for ch, cents in ((0, -7), (1, 7)):
        ff = f * 2 ** (cents / 1200.0)
        vib = 0.0015 * np.sin(2 * np.pi * (0.3 + 0.1 * ch) * t)
        for k in range(1, 8):
            amp = (1.0 / k ** 1.6) * np.exp(-k * ff / (1800.0 * bright))
            out[:, ch] += amp * np.sin(2 * np.pi * ff * k * t * (1 + vib) + rng.rand() * 6.28)
    return out * env[:, None]


def bass_note(f, dur):
    n = int((dur + 0.08) * SR)
    t = times(n)
    y = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    env = np.minimum(1, t / 0.006) * np.exp(-t / 0.45)
    y = np.tanh(1.4 * y * env) / np.tanh(1.4)
    return fade_edges(y, r=0.06)


def pluck_note(f, dur=0.7):
    n = int(dur * SR)
    t = times(n)
    y = np.zeros(n)
    for k in range(1, 7):
        y += (1.0 / k) * np.exp(-t * (3.5 + 3.2 * k)) * np.sin(2 * np.pi * f * k * t)
    y += 0.15 * band_noise(n, 2000, 8000) * np.exp(-t * 400)
    return fade_edges(y, a=0.002)


def bell_note(f, dur=2.6, decay=1.0):
    n = int(dur * SR)
    t = times(n)
    y = np.zeros(n)
    for ratio, amp, d in ((1.0, 1.0, 1.1), (2.0, 0.45, 1.8), (2.76, 0.32, 2.6), (4.07, 0.18, 3.6), (5.4, 0.1, 5.0)):
        y += amp * np.exp(-t * d / decay) * np.sin(2 * np.pi * f * ratio * t)
    return fade_edges(y, a=0.002)


def kick():
    n = int(0.4 * SR)
    t = times(n)
    f = 46 + 95 * np.exp(-t * 32)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5) * np.minimum(1, t / 0.002)
    return fade_edges(y)


def snare():
    n = int(0.3 * SR)
    t = times(n)
    y = band_noise(n, 900, 6500) * np.exp(-t * 20) * 0.8 + 0.35 * np.sin(2 * np.pi * 195 * t) * np.exp(-t * 28)
    return fade_edges(y, a=0.001)


def hat(open_=False):
    n = int((0.2 if open_ else 0.06) * SR)
    t = times(n)
    return fade_edges(band_noise(n, 7000, 16000) * np.exp(-t * (22 if open_ else 75)), a=0.001)


# ---------------------------------------------------------------- sound effects

def whoosh(dur=0.7, lo=250, hi=3500, peak=0.6, rising=False):
    """Noise through a band-pass filter that sweeps up and down."""
    n = int(dur * SR)
    noise = rng.randn(n)
    u = np.linspace(0, 1, n)
    shape = u / peak if rising else np.where(u < peak, u / peak, 1 - (u - peak) / (1 - peak))
    shape = np.clip(shape, 0, 1)
    fc = lo * (hi / lo) ** shape
    g = np.tan(np.pi * fc / SR)
    q = 1.4
    ic1 = ic2 = 0.0
    y = np.zeros(n)
    for i in range(n):  # state-variable filter, band-pass output
        gi = g[i]
        a1 = 1.0 / (1 + gi * (gi + 1.0 / q))
        v3 = noise[i] - ic2
        v1 = a1 * ic1 + gi * a1 * v3
        v2 = ic2 + gi * v1
        ic1, ic2 = 2 * v1 - ic1, 2 * v2 - ic2
        y[i] = v1
    env = u ** 2 if rising else np.sin(np.pi * shape / 2) ** 2
    y = y * env
    y /= np.abs(y).max() + 1e-9
    pan = np.linspace(-0.5, 0.5, n)
    return fade_edges(np.stack([y * np.cos((pan + 1) * np.pi / 4), y * np.sin((pan + 1) * np.pi / 4)], axis=1) * np.sqrt(2), r=0.05)


def pop(f0=1100, f1=560):
    n = int(0.16 * SR)
    t = times(n)
    f = f1 + (f0 - f1) * np.exp(-t * 60)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 38)
    return fade_edges(y, a=0.001)


def tap():
    n = int(0.07 * SR)
    t = times(n)
    y = 0.7 * np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 140) + 0.5 * band_noise(n, 2500, 9000) * np.exp(-t * 600)
    return fade_edges(y, a=0.0005)


def chime(bus, t, root=77, gain=0.5):
    for k, m in enumerate((root, root + 7, root + 12, root + 16)):  # F, C, F, A
        bus.add(t + k * 0.075, bell_note(hz(m), 3.4, decay=0.8), gain * (0.9 - 0.12 * k), pan=-0.3 + 0.2 * k)


# ---------------------------------------------------------------- the music

# F major: Fadd9, Am7, Dm7, Bbmaj7. One chord a bar.
CHORDS = [
    {"pad": [53, 57, 60, 67], "bass": 41, "arp": [65, 69, 72, 79]},
    {"pad": [57, 60, 64, 67], "bass": 45, "arp": [64, 69, 72, 76]},
    {"pad": [57, 60, 62, 65], "bass": 38, "arp": [62, 65, 69, 74]},
    {"pad": [58, 62, 65, 69], "bass": 46, "arp": [62, 65, 70, 74]},
]
ARP = [[0, 2, 1, 3, 2, 1, None, 2], [3, None, 2, 1, 2, 3, 1, 2]]
# A small tune over four bars: (bar, beat, midi, beats long)
MOTIF = [(0, 0, 72, 1.5), (0, 1.5, 69, 0.5), (0, 2, 72, 1), (0, 3, 77, 1),
         (1, 0, 76, 2), (1, 2.5, 72, 1.5),
         (2, 0, 74, 1.5), (2, 1.5, 72, 0.5), (2, 2, 74, 1), (2, 3, 77, 1),
         (3, 0, 69, 2), (3, 2.5, 72, 1.5)]


def inside(t, wins):
    return any(a - 1e-6 <= t < b for a, b in wins)


def music(dur, origin, end_hit, plan):
    """origin: a downbeat. end_hit: the downbeat where the last chord rings out.
    plan: for each layer, the time windows where it plays."""
    bars = max(1, int(round((end_hit - origin) / (4 * 60 / 105.0))))
    bar = (end_hit - origin) / bars
    beat = bar / 4
    pads, plucks, bass, drums, lead = (Bus(dur) for _ in range(5))
    first = -int(np.ceil((origin + Bus.PRE) / bar))
    for b in range(first, bars):
        t0 = origin + b * bar
        ch = CHORDS[b % 4]
        if inside(t0, plan["pad"]) or inside(t0 + bar - 0.01, plan["pad"]):
            for m in ch["pad"]:
                pads.add(t0, pad_note(hz(m), bar * 0.98), 0.16)
        for i in range(8):
            t = t0 + i * beat / 2
            idx = ARP[(b // 2) % 2][i]
            if idx is not None and inside(t, plan["arp"]):
                plucks.add(t, pluck_note(hz(ch["arp"][idx])), 0.22, pan=0.35 if i % 2 else -0.35)
            elif i % 2 == 0 and idx is not None and inside(t, plan.get("arp_sparse", [])):
                plucks.add(t, pluck_note(hz(ch["arp"][idx])), 0.18, pan=0.35 if i % 4 else -0.35)
        for pos, length in ((0, 1.4), (1.5, 0.45), (2, 1.4), (3.5, 0.45)):
            t = t0 + pos * beat
            if inside(t, plan["bass"]):
                bass.add(t, bass_note(hz(ch["bass"]), length * beat), 0.42)
        for i in range(8):
            t = t0 + i * beat / 2
            if not inside(t, plan["drums"]):
                continue
            if i in (0, 4):
                drums.add(t, kick(), 0.55)
            if i in (2, 6):
                drums.add(t, snare(), 0.16, pan=0.05)
            drums.add(t, hat(open_=(i == 7)), 0.09 if i % 2 else 0.05, pan=0.3)
        for (bb, bt, m, ln) in MOTIF:
            if b % 4 != bb:
                continue
            t = t0 + bt * beat
            if inside(t, plan["lead"]):
                lead.add(t, bell_note(hz(m + 12), 1.2 + ln * beat, decay=1.3), 0.075, pan=0.15)
    # The last chord, long, with the bass, at end_hit.
    ch = CHORDS[0]
    for m in ch["pad"] + [ch["pad"][0] + 12]:
        pads.add(end_hit, pad_note(hz(m), 3.2, bright=1.3), 0.17)
    bass.add(end_hit, bass_note(hz(ch["bass"]), 2.5), 0.4)
    drums.add(end_hit, kick(), 0.45)
    wet = reverb(pads.x * 0.8 + ping_pong(plucks.x, beat * 0.75) + lead.x, 2.2, 0.35)
    mix = wet + bass.x + reverb(drums.x, 0.8, 0.12)
    return mix, bar


def master(mix, dur, path):
    """Fades, gentle limiting, then two-pass loudness normalisation with ffmpeg."""
    n = int(dur * SR)
    y = mix[:n].copy()
    t = times(n)
    y *= np.minimum(1, t / 0.25)[:, None]
    y *= np.clip((dur - t) / 2.5, 0, 1)[:, None] ** 1.5
    y /= np.abs(y).max()
    y = np.tanh(1.6 * y) / np.tanh(1.6)  # soft knee, keeps peaks round
    raw = path + ".raw.wav"
    write_wav(raw, y * 0.7)
    filt = "loudnorm=I=-16:TP=-1.5:LRA=11"
    log = subprocess.run([FFMPEG, "-hide_banner", "-i", raw, "-af", filt + ":print_format=json", "-f", "null", "-"],
                         stderr=subprocess.PIPE).stderr.decode()
    m = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", log).group(0))
    filt2 = (filt + ":measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:"
             "measured_thresh={input_thresh}:offset={target_offset}:linear=true").format(**m)
    subprocess.check_call([FFMPEG, "-v", "error", "-y", "-i", raw, "-af", filt2, "-ar", str(SR), "-c:a", "pcm_s24le", path])
    os.remove(raw)


def write_wav(path, y):
    data = (np.clip(y, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


# ---------------------------------------------------------------- the two edits

def launch_audio(path):
    T = read_launch()
    D = T["D"]
    origin, end_hit = 5.0, 64.0  # "Meet Daksha." and the end card
    bar = (end_hit - origin) / round((end_hit - origin) / (4 * 60 / 105.0))
    talk = next(b["t0"] for b in T["text"] if b.get("lines") and b["lines"][0]["text"].startswith("Talk"))
    br0 = origin + np.ceil((talk - origin) / bar) * bar  # one quiet bar when "Talk to it" starts
    last = end_hit - bar
    plan = {
        "pad": [(-3, end_hit)],
        "arp_sparse": [(-3, 3.5)],
        "arp": [(origin, last)],
        "bass": [(origin, end_hit)],
        "drums": [(origin + bar, br0), (br0 + bar, last)],
        "lead": [(origin + 10 * bar, last)],
    }
    mix, bar = music(D, origin, end_hit, plan)
    sfx = Bus(D)
    sfx.add(2.1, whoosh(1.5, 200, 5000, rising=True), 0.22)  # build into the red wipe
    for w in T["wipes"]:
        sfx.add(w["t0"] - 0.12, whoosh(w["t1"] - w["t0"] + 0.5), 0.38)
    sfx.add(4.3, pop(700, 380), 0.5)  # the tomato pops in
    sfx.add(4.35, bell_note(hz(84), 1.6), 0.12, pan=0.2)
    sfx.add(7.5, whoosh(1.0, 150, 1800, peak=0.5), 0.22)  # the phone rises
    for s in T["screen"][1:]:
        sfx.add(s["t0"] - 0.1, whoosh(0.55, 400, 4200, peak=0.45), 0.2)
    for b in T["text"]:
        if b.get("url"):
            sfx.add(b["t0"] + 0.05, pop(1300, 700), 0.4)
        elif b["t0"] < 4:
            sfx.add(b["t0"] + 0.05, pop(900, 500), 0.28)
            for ln in b["lines"][1:]:
                sfx.add(b["t0"] + ln.get("delay", 0) + 0.05, pop(1150, 620), 0.32)
        elif b["t0"] > 63:
            continue  # the end card has the chime
        elif b["t0"] > 6:
            sfx.add(b["t0"] + 0.05, pop(950, 520), 0.26)
    for c in T["callouts"]:
        sfx.add(c["t0"] + 0.04, pop(1250, 680), 0.3, pan=-0.3)
        sfx.add(c["t0"] + 0.78, tap(), 0.22, pan=0.25)
    sfx.add(63.0, pop(700, 380), 0.5)
    chime(sfx, end_hit, gain=0.42)
    master(crop(mix + sfx.x, D), D, path)
    return {"duration": D, "bar": bar, "cuts": [s["t0"] for s in T["screen"][1:]] + [w["t0"] for w in T["wipes"]]}


def crop(x, dur):
    i = int(Bus.PRE * SR)
    return x[i:i + int(dur * SR)]


def demo_audio(path):
    T = read_demo()
    D, F = T["D"], T["footEnd"]
    origin, end_hit = T["intro"], F + 0.76  # footage starts; the tomato pops on the end card
    bar = (end_hit - origin) / round((end_hit - origin) / (4 * 60 / 105.0))
    talk = next(s["t0"] for s in T["steps"] if s["title"].startswith("Talk"))
    br0 = origin + np.ceil((talk - origin) / bar) * bar
    last = end_hit - bar
    plan = {
        "pad": [(-3, end_hit)],
        "arp_sparse": [(-3, origin)],
        "arp": [(origin, last)],
        "bass": [(origin, end_hit)],
        "drums": [(origin + bar, br0), (br0 + bar, last)],
        "lead": [(origin + 8 * bar, last)],
    }
    mix, bar = music(D, origin, end_hit, plan)
    sfx = Bus(D)
    sfx.add(0.3, pop(900, 500), 0.28)
    sfx.add(2.6, whoosh(1.1, 150, 2500, peak=0.55), 0.32)  # paper opens, phone rises
    steps = T["steps"]
    sfx.add(steps[0]["t0"] + 0.55, pop(950, 520), 0.26)
    for s in steps[1:]:
        sfx.add(s["t0"] - 0.15, whoosh(0.6, 400, 4200, peak=0.45), 0.24)
        sfx.add(s["t0"] + 0.15, pop(950, 520), 0.26)
    step_times = [s["t0"] for s in steps]
    for g in T["segs"][1:]:
        if g["jump"] and min(abs(g["t0"] - x) for x in step_times) > 0.4:
            sfx.add(g["t0"] - 0.1, whoosh(0.5, 400, 4200, peak=0.45), 0.18)
    for t in T["taps"]:
        sfx.add(t, tap(), 0.34, pan=0.35)
    sfx.add(F, whoosh(1.0), 0.36)
    sfx.add(F + 0.75, pop(700, 380), 0.5)
    chime(sfx, end_hit, gain=0.42)
    sfx.add(F + 1.35 + 1.2, pop(1300, 700), 0.4)
    master(crop(mix + sfx.x, D), D, path)
    return {"duration": D, "bar": bar, "cuts": step_times[1:], "taps": T["taps"]}


# ---------------------------------------------------------------- film2: brighter, faster

# D major, I V vi IV: D, A, Bm, G. One chord a bar, about 118 beats a minute.
CHORDS2 = [
    {"pad": [62, 66, 69, 74], "bass": 38, "arp": [74, 78, 81, 86]},
    {"pad": [61, 64, 69, 73], "bass": 45, "arp": [73, 76, 81, 85]},
    {"pad": [62, 66, 71, 74], "bass": 47, "arp": [74, 78, 83, 86]},
    {"pad": [62, 67, 71, 74], "bass": 43, "arp": [74, 79, 83, 86]},
]
ARP2 = [0, 2, 1, 3, 2, 1, 3, 2]
MOTIF2 = [(0, 0, 78, 1), (0, 1, 81, 0.5), (0, 1.5, 78, 0.5), (0, 2.5, 76, 1.5),
          (1, 0, 76, 1), (1, 1, 73, 1), (1, 2.5, 69, 1.5),
          (2, 0, 74, 1), (2, 1, 78, 0.5), (2, 1.5, 81, 1), (2, 2.5, 83, 1.5),
          (3, 0, 81, 1.5), (3, 2, 78, 1), (3, 3, 74, 1)]
PENTA = [74, 76, 78, 81, 83, 86, 88, 90]


def clap():
    n = int(0.25 * SR)
    t = times(n)
    y = np.zeros(n)
    for k, d in enumerate((0.0, 0.011, 0.022)):
        i = int(d * SR)
        y[i:] += band_noise(n - i, 900, 7000) * np.exp(-times(n - i) * (90 if k < 2 else 22)) * (0.6 if k < 2 else 1)
    return fade_edges(y * 0.8, a=0.0005)


def marimba(f, dur=0.5):
    n = int(dur * SR)
    t = times(n)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t * 9) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 30)
    return fade_edges(y, a=0.001)


def tick(f=3200, d=0.025):
    n = int(d * SR)
    t = times(n)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t * 260) + 0.4 * band_noise(n, 3000, 10000) * np.exp(-t * 500)
    return fade_edges(y, a=0.0005, r=0.005)


def riser(dur):
    n = int(dur * SR)
    t = times(n)
    f = 300 * (8 ** (t / dur))
    tone = 0.25 * np.sin(2 * np.pi * np.cumsum(f) / SR)
    y = (band_noise(n, 2000, 12000) * 0.5 + tone) * (t / dur) ** 2
    return fade_edges(y, r=0.01)


def music2(dur, origin, end_hit, plan):
    bars = max(1, int(round((end_hit - origin) / (4 * 60 / 118.0))))
    bar = (end_hit - origin) / bars
    beat = bar / 4
    pads, plucks, bass, drums, lead = (Bus(dur) for _ in range(5))
    first = -int(np.ceil((origin + Bus.PRE) / bar))
    for b in range(first, bars):
        t0 = origin + b * bar
        ch = CHORDS2[b % 4]
        if inside(t0 + 0.01, plan["pad"]):
            for m in ch["pad"]:
                pads.add(t0, pad_note(hz(m), bar * 0.98, bright=1.6), 0.11)
        for i in range(8):
            t = t0 + i * beat / 2
            if inside(t, plan["arp"]):
                plucks.add(t, pluck_note(hz(ch["arp"][ARP2[i]])), 0.2, pan=0.4 if i % 2 else -0.4)
            elif i % 2 == 0 and inside(t, plan.get("arp_sparse", [])):
                plucks.add(t, pluck_note(hz(ch["arp"][ARP2[i]])), 0.16, pan=0.3 if i % 4 else -0.3)
        for i in range(8):
            t = t0 + i * beat / 2
            if inside(t, plan["bass"]):
                m = ch["bass"] + (12 if i % 2 else 0)
                bass.add(t, bass_note(hz(m), beat * 0.42), 0.36 if i % 2 == 0 else 0.22)
        for i in range(16):
            t = t0 + i * beat / 4
            if not inside(t, plan["drums"]):
                if i % 4 == 0 and inside(t, plan.get("kick_only", [])):
                    drums.add(t, kick(), 0.42)
                continue
            if i % 4 == 0:
                drums.add(t, kick(), 0.55)
            if i in (4, 12):
                drums.add(t, clap(), 0.2, pan=0.05)
            if i % 4 == 2:
                drums.add(t, hat(open_=True), 0.07, pan=0.3)
            drums.add(t, hat(), 0.035 if i % 2 else 0.05, pan=-0.25)
        for (bb, bt, m, ln) in MOTIF2:
            if b % 4 != bb:
                continue
            t = t0 + bt * beat
            if inside(t, plan["lead"]):
                lead.add(t, marimba(hz(m), 0.6), 0.16, pan=0.15)
                lead.add(t, bell_note(hz(m + 12), 0.8 + ln * beat, decay=0.7), 0.035, pan=-0.15)
    ch = CHORDS2[0]
    for m in ch["pad"] + [ch["pad"][0] + 12]:
        pads.add(end_hit, pad_note(hz(m), 3.4, bright=1.6), 0.13)
    bass.add(end_hit, bass_note(hz(ch["bass"]), 2.5), 0.4)
    drums.add(end_hit, kick(), 0.5)
    wet = reverb(pads.x * 0.8 + ping_pong(plucks.x, beat * 0.75, fb=0.3) + lead.x, 1.8, 0.3)
    mix = wet + bass.x + reverb(drums.x, 0.6, 0.1)
    return mix, bar


def film2_audio(path):
    T = read_film2()
    D, S = T["D"], T["S"]
    origin = T["texts"][2]["lines"][0]["times"][0]  # the beat drops on the first "Daksha remembers"
    end_hit = S["end"]["t0"] + S["end"]["logo"]
    bars = int(round((end_hit - origin) / (4 * 60 / 118.0)))
    bar = (end_hit - origin) / bars
    snap = lambda x: origin + np.round((x - origin) / bar) * bar
    drop = origin
    talk0, talk1 = snap(S["talk"]["t0"]), snap(S["talk"]["t0"] + S["talk"]["out"])
    done = S["approve"]["t0"] + S["approve"]["done"]
    fin = snap(T["texts"][-1]["t0"])
    plan = {
        "pad": [(-3, end_hit)],
        "arp_sparse": [(-3, drop)],
        "arp": [(drop, fin)],
        "bass": [(drop, talk0), (talk1, fin)],
        "kick_only": [(drop - 2 * bar, drop)],
        "drums": [(drop, talk0), (talk1, snap(done) - bar), (snap(done), fin)],
        "lead": [(drop + 4 * bar, talk0), (talk1, fin)],
    }
    mix, bar = music2(D, origin, end_hit, plan)
    sfx = Bus(D)
    r = np.random.RandomState(3)
    for c in T["cues"]:
        t, k = c["t"], c["k"]
        if k == "word":
            m = PENTA[(c["n"] + c["b"]) % 5]
            sfx.add(t, pop(hz(m) * 1.0, hz(m) * 0.55), 0.13, pan=r.uniform(-0.3, 0.3))
        elif k == "glyph":
            sfx.add(t, pop(1500, 700), 0.24, pan=r.uniform(-0.3, 0.3))
            sfx.add(t + 0.02, bell_note(hz(PENTA[(c["n"] + 3) % 8] + 12), 0.9, decay=0.5), 0.07)
        elif k == "type":
            n = int(c["d"] / 0.055)
            for i in range(n):
                sfx.add(t + i * 0.055 + r.uniform(0, 0.02), tick(r.uniform(2600, 3800)), r.uniform(0.04, 0.08), pan=0.2)
        elif k == "pop":
            sfx.add(t, pop(1100, 560), 0.3)
        elif k == "chip":
            sfx.add(t, pop(1700, 900), 0.2, pan=r.uniform(-0.4, 0.4))
        elif k == "tap":
            sfx.add(t, tap(), 0.38, pan=0.1)
        elif k == "whoosh":
            sfx.add(t - 0.12, whoosh(0.6, 400, 5000, peak=0.45), 0.24)
        elif k == "swish":
            sfx.add(t - 0.05, whoosh(0.4, 1200, 8000, peak=0.4), 0.16)
        elif k == "out":
            sfx.add(t - 0.05, whoosh(0.45, 300, 2500, peak=0.5), 0.12)
        elif k == "ding":
            sfx.add(t, bell_note(hz(86), 1.4, decay=0.5), 0.12, pan=0.2)
            sfx.add(t + 0.08, bell_note(hz(93), 1.4, decay=0.5), 0.1, pan=0.25)
        elif k == "burst":
            sfx.add(t - 0.1, whoosh(0.7, 300, 6000, peak=0.3), 0.26)
            for i in range(8):
                sfx.add(t + 0.035 * i + 0.08, pop(1200 + 90 * i, 650 + 40 * i), 0.13, pan=-0.6 + 0.17 * i)
        elif k == "flip":
            for i in range(3):
                sfx.add(t + 0.12 * i + 0.1, whoosh(0.16, 2000, 9000, peak=0.5) * 0.9, 0.16)
                sfx.add(t + 0.12 * i + 0.18, tick(1800, 0.03), 0.12)
        elif k == "check":
            sfx.add(t - 1.2, riser(1.2), 0.12)
            sfx.add(t + 0.32, tick(2400, 0.04), 0.4)
            chime(sfx, t + 0.3, root=81, gain=0.3)
        elif k == "sparkle":
            many = 10 if c.get("small") else 26
            for i in range(many):
                sfx.add(t + r.uniform(0, 1.3 if many > 10 else 0.5), bell_note(hz(PENTA[r.randint(8)] + 12), 0.7, decay=0.35),
                        r.uniform(0.03, 0.07), pan=r.uniform(-0.8, 0.8))
            if many > 10:
                sfx.add(t - 0.02, pop(900, 300), 0.35)
        elif k == "logo":
            sfx.add(t, pop(700, 380), 0.45)
            chime(sfx, t, root=74, gain=0.38)
    master(crop(mix + sfx.x, D), D, path)
    return {"duration": D, "bar": bar, "drop": drop, "talk": [talk0, talk1], "end": end_hit}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", choices=["launch", "demo", "film2"])
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    info = {}
    if a.only in (None, "launch"):
        info["launch"] = launch_audio(os.path.join(a.out, "launch.wav"))
    if a.only in (None, "demo"):
        info["demo"] = demo_audio(os.path.join(a.out, "demo.wav"))
    if a.only in (None, "film2"):
        info["film2"] = film2_audio(os.path.join(a.out, "film2.wav"))
    with open(os.path.join(a.out, "cues.json"), "w") as f:
        json.dump(info, f, indent=1)
    print(json.dumps(info))

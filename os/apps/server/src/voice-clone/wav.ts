// Plain sound in memory, and the WAV file format around it. A WAV file is a
// short header and then the samples, so reading and writing one is a few lines;
// every other format is decoded by a library (see decode.ts).
//
// The voice copy needs one clip of 10 to 30 seconds of only the chosen person
// talking. pickClipRanges chooses which stretches to use, cutAndJoin cuts them
// out of the sound and joins them with a short silence in between.

export type Pcm = { sampleRate: number; samples: Float32Array };

export class WavError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WavError";
  }
}

/** Mix any number of channels down to one. */
export function toMono(channels: Float32Array[], sampleRate: number): Pcm {
  const first = channels[0];
  if (!first || channels.length === 1) return { sampleRate, samples: first ?? new Float32Array(0) };
  const length = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (const channel of channels) for (let i = 0; i < length; i++) out[i] = (out[i] ?? 0) + (channel[i] ?? 0) / channels.length;
  return { sampleRate, samples: out };
}

/** Read a PCM or float WAV file into one channel. Throws WavError on anything else. */
export function readWav(bytes: Uint8Array): Pcm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new WavError("This is not a WAV file.");
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      // WAVE_FORMAT_EXTENSIBLE: the real format is the first two bytes of the sub-format.
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true);
    } else if (id === "data") {
      if (!channels || !sampleRate) throw new WavError("The WAV file has no format.");
      const end = Math.min(bytes.byteLength, body + size);
      const step = bits / 8;
      const frames = Math.floor((end - body) / (step * channels));
      const read = sampleReader(view, format, bits);
      const out: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(frames));
      for (let f = 0; f < frames; f++)
        for (let c = 0; c < channels; c++) (out[c] as Float32Array)[f] = read(body + (f * channels + c) * step);
      return toMono(out, sampleRate);
    }
    offset = body + size + (size % 2);
  }
  throw new WavError("The WAV file has no sound in it.");
}

function sampleReader(view: DataView, format: number, bits: number): (at: number) => number {
  if (format === 3 && bits === 32) return (at) => view.getFloat32(at, true);
  if (format !== 1) throw new WavError("This WAV file uses a kind of sound I can't read.");
  if (bits === 8) return (at) => (view.getUint8(at) - 128) / 128;
  if (bits === 16) return (at) => view.getInt16(at, true) / 32768;
  if (bits === 24)
    return (at) => {
      const v = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16);
      return v / 8388608;
    };
  if (bits === 32) return (at) => view.getInt32(at, true) / 2147483648;
  throw new WavError("This WAV file uses a kind of sound I can't read.");
}

/** A mono 16-bit WAV file. */
export function writeWav(pcm: Pcm): Uint8Array {
  const data = pcm.samples.length * 2;
  const out = new Uint8Array(44 + data);
  const view = new DataView(out.buffer);
  const put = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i);
  };
  put(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, pcm.sampleRate, true);
  view.setUint32(28, pcm.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  put(36, "data");
  view.setUint32(40, data, true);
  for (let i = 0; i < pcm.samples.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm.samples[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return out;
}

export const CLIP_MIN_SECONDS = 10;
export const CLIP_MAX_SECONDS = 30;
/** Stretches shorter than this are mostly "hm" and "yes": not useful for a voice. */
const MIN_STRETCH_SECONDS = 1.2;
const GAP_SECONDS = 0.3;

export type Range = { start: number; end: number };

/**
 * Which stretches to cut for the clip: the longest ones first, until there is
 * enough sound, then put back in time order. Each stretch is trimmed a little at
 * both ends, so a word from the other person at the edge is less likely to stay.
 * Null when there is less than CLIP_MIN_SECONDS in total.
 */
export function pickClipRanges(ranges: Range[], max = CLIP_MAX_SECONDS, min = CLIP_MIN_SECONDS): Range[] | null {
  const trimmed = ranges
    .map((r) => ({ start: r.start + 0.1, end: r.end - 0.1 }))
    .filter((r) => r.end - r.start >= MIN_STRETCH_SECONDS)
    .sort((a, b) => b.end - b.start - (a.end - a.start));
  const picked: Range[] = [];
  let total = 0;
  for (const r of trimmed) {
    if (total >= max) break;
    const room = max - total - (picked.length ? GAP_SECONDS : 0);
    if (room < MIN_STRETCH_SECONDS) break;
    const length = Math.min(r.end - r.start, room);
    picked.push({ start: r.start, end: r.start + length });
    total += length + (picked.length > 1 ? GAP_SECONDS : 0);
  }
  const speech = picked.reduce((sum, r) => sum + (r.end - r.start), 0);
  if (speech < min) return null;
  return picked.sort((a, b) => a.start - b.start);
}

/** Cut the ranges out of the sound and join them, with a short silence between each. */
export function cutAndJoin(pcm: Pcm, ranges: Range[], gapSeconds = GAP_SECONDS): Pcm {
  const rate = pcm.sampleRate;
  const pieces = ranges.map((r) => {
    const from = Math.max(0, Math.floor(r.start * rate));
    const to = Math.min(pcm.samples.length, Math.ceil(r.end * rate));
    return pcm.samples.subarray(from, Math.max(from, to));
  });
  return joinPieces(pieces, rate, gapSeconds);
}

/**
 * Keeps only the wanted stretches while a long recording is decoded piece by
 * piece, so a one-hour call never sits whole in memory. Ranges must be in time order.
 */
export class RangeCollector {
  private position = 0;
  private rate = 0;
  private pieces: Float32Array[] = [];
  private frames: { from: number; to: number }[] = [];

  constructor(private readonly ranges: Range[]) {}

  /** One decoded piece, in order. */
  push(channels: Float32Array[], sampleRate: number) {
    if (!this.rate) {
      this.rate = sampleRate;
      this.frames = this.ranges.map((r) => ({ from: Math.max(0, Math.floor(r.start * sampleRate)), to: Math.ceil(r.end * sampleRate) }));
      this.pieces = this.frames.map((f) => new Float32Array(Math.max(0, f.to - f.from)));
    }
    const mono = toMono(channels, sampleRate).samples;
    const start = this.position;
    const end = start + mono.length;
    this.frames.forEach((f, i) => {
      const from = Math.max(f.from, start);
      const to = Math.min(f.to, end);
      if (to > from) (this.pieces[i] as Float32Array).set(mono.subarray(from - start, to - start), from - f.from);
    });
    this.position = end;
  }

  /** True once every wanted stretch has gone by: the rest need not be decoded. */
  get full() {
    const last = this.frames.at(-1);
    return Boolean(this.rate && last && this.position >= last.to);
  }

  result(gapSeconds = GAP_SECONDS): Pcm {
    if (!this.rate) return { sampleRate: 16000, samples: new Float32Array(0) };
    // A stretch past the end of the sound is cut short.
    const pieces = this.pieces.map((p, i) => p.subarray(0, Math.max(0, Math.min(p.length, this.position - (this.frames[i]?.from ?? 0)))));
    return joinPieces(pieces, this.rate, gapSeconds);
  }
}

function joinPieces(pieces: Float32Array[], rate: number, gapSeconds: number): Pcm {
  const gap = Math.round(gapSeconds * rate);
  const length = pieces.reduce((sum, p) => sum + p.length, 0) + gap * Math.max(0, pieces.length - 1);
  const out = new Float32Array(length);
  let at = 0;
  pieces.forEach((p, i) => {
    if (i > 0) at += gap;
    out.set(p, at);
    at += p.length;
  });
  return { sampleRate: rate, samples: out };
}

export const seconds = (pcm: Pcm) => pcm.samples.length / pcm.sampleRate;

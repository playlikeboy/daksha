// Turning a recording back into plain sound, so the chosen person's stretches
// can be cut out for a voice copy. WAV is read by hand (wav.ts). The others use
// wasm-audio-decoders (MIT, https://github.com/eshaz/wasm-audio-decoders):
//   ogg-opus-decoder           WhatsApp voice notes (.opus, .ogg with Opus inside)
//   mpg123-decoder             .mp3
//   @wasm-audio-decoders/flac  .flac
// They run in Node, which is where the API runs (a container, not a Worker).
// They are loaded only when a voice copy is made, so nothing else pays for them.
//
// m4a, aac, webm, 3gp and video are not cut. Their words are still used; the
// person is asked for a voice note, mp3 or wav for the voice copy.
import { type Pcm, type Range, RangeCollector, cutAndJoin, readWav } from "./wav.ts";

export type CutFormat = "wav" | "opus" | "mp3" | "flac";

/** Which decoder a file type needs, or null when the voice copy cannot be cut from it. */
export function cutFormat(mimeType: string): CutFormat | null {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (["audio/wav", "audio/x-wav", "audio/wave"].includes(base)) return "wav";
  if (["audio/ogg", "audio/opus"].includes(base)) return "opus";
  if (["audio/mpeg", "audio/mp3"].includes(base)) return "mp3";
  if (["audio/flac", "audio/x-flac"].includes(base)) return "flac";
  return null;
}

export const CANT_CUT =
  "I can't cut a voice sample out of this kind of file. Its words are still used. For a voice copy, add a voice note, an mp3 or a wav file.";

/** The decoders' shared answer shape. */
type Decoded = { channelData: Float32Array[]; samplesDecoded: number; sampleRate: number };
interface StreamDecoder {
  readonly ready: Promise<void>;
  decode(bytes: Uint8Array): Decoded | Promise<Decoded>;
  flush?(): Decoded | Promise<Decoded>;
  free(): void | Promise<void>;
}

async function decoderFor(format: Exclude<CutFormat, "wav">): Promise<StreamDecoder> {
  if (format === "opus") {
    const { OggOpusDecoder } = await import("ogg-opus-decoder");
    // 48 kHz, its default. Only the wanted stretches are kept, so memory stays small.
    return new OggOpusDecoder() as unknown as StreamDecoder;
  }
  if (format === "mp3") {
    const { MPEGDecoder } = await import("mpg123-decoder");
    return new MPEGDecoder() as unknown as StreamDecoder;
  }
  const { FLACDecoder } = await import("@wasm-audio-decoders/flac");
  return new FLACDecoder() as unknown as StreamDecoder;
}

const CHUNK = 256 * 1024;

/**
 * The chosen ranges of a recording, joined into one mono clip. Compressed files
 * are decoded piece by piece and only the wanted stretches are kept. Throws on a
 * file the decoder cannot read.
 */
export async function cutClip(bytes: Uint8Array, format: CutFormat, ranges: Range[]): Promise<Pcm> {
  if (format === "wav") return cutAndJoin(readWav(bytes), ranges);
  const decoder = await decoderFor(format);
  try {
    await decoder.ready;
    const keep = new RangeCollector(ranges);
    const take = (d: Decoded) => {
      if (d.samplesDecoded > 0) keep.push(d.channelData.map((c) => c.subarray(0, d.samplesDecoded)), d.sampleRate);
    };
    for (let at = 0; at < bytes.byteLength && !keep.full; at += CHUNK) take(await decoder.decode(bytes.subarray(at, at + CHUNK)));
    if (!keep.full && decoder.flush) take(await decoder.flush());
    return keep.result();
  } finally {
    await decoder.free();
  }
}

import { describe, expect, it } from "vitest";
import { pcmOf, readOwnKeyTts } from "./own-key-tts.ts";
import { SpeakableBuffer } from "./speakable-stream.ts";

const KEY = "k".repeat(24);

describe("readOwnKeyTts", () => {
  it("is off without a provider, or without its key", () => {
    expect(readOwnKeyTts({})).toBeNull();
    expect(readOwnKeyTts({ VOICE_TTS_PROVIDER: "openai" })).toBeNull();
    expect(readOwnKeyTts({ VOICE_TTS_PROVIDER: "openai", ELEVENLABS_API_KEY: KEY })).toBeNull();
    expect(readOwnKeyTts({ VOICE_TTS_PROVIDER: "someone-else", OPENAI_API_KEY: KEY })).toBeNull();
  });
  it("picks the provider, its key and a voice", () => {
    expect(readOwnKeyTts({ VOICE_TTS_PROVIDER: "openai", OPENAI_API_KEY: KEY })).toEqual({ provider: "openai", key: KEY, voice: "marin" });
    expect(readOwnKeyTts({ VOICE_TTS_PROVIDER: "Gemini", GEMINI_API_KEY: KEY, VOICE_TTS_PROVIDER_VOICE: "Puck" })).toEqual({
      provider: "gemini",
      key: KEY,
      voice: "Puck",
    });
  });
  it("ElevenLabs needs a voice id", () => {
    expect(readOwnKeyTts({ VOICE_TTS_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: KEY })).toBeNull();
    expect(readOwnKeyTts({ VOICE_TTS_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: KEY, VOICE_TTS_PROVIDER_VOICE: "abc" })?.voice).toBe("abc");
  });
});

function wav(sampleRate: number, samples: number[]): Uint8Array {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(s, i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([header, data]));
}

describe("pcmOf", () => {
  it("passes raw PCM through and takes the sound out of a 24 kHz WAV", () => {
    const raw = new Uint8Array([1, 2, 3, 4]);
    expect(pcmOf({ bytes: raw, mime: "audio/pcm" })).toBe(raw);
    expect([...pcmOf({ bytes: wav(24_000, [1, -1]), mime: "audio/wav" })]).toEqual([1, 0, 255, 255]);
  });
  it("refuses audio it cannot play", () => {
    expect(() => pcmOf({ bytes: wav(16_000, [1]), mime: "audio/wav" })).toThrow(/cannot play/);
    expect(() => pcmOf({ bytes: new Uint8Array([1, 2, 3]), mime: "audio/mpeg" })).toThrow();
  });
});

describe("SpeakableBuffer", () => {
  it("says whole sentences in plain words, and holds a code block until it ends", () => {
    const buffer = new SpeakableBuffer();
    expect(buffer.push("Here is **the plan")).toBe("");
    expect(buffer.push("**. Next")).toBe("Here is the plan. ");
    expect(buffer.push(" see [the page](https://example.com).\n```ts\nconst x = 1;")).toBe("Next see the page. ");
    expect(buffer.push("\n```\nDone.")).toMatch(/^\. \(a TypeScript code block\)\. $/);
    expect(buffer.flush()).toBe("Done. ");
  });
});

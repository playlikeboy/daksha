// Optional speaking voices on the operator's own key: ElevenLabs, OpenAI, Gemini or DeepSeek.
//
// Off unless VOICE_TTS_PROVIDER names one of them AND that provider's key is set on the agent.
// Without both, calls speak through LiveKit Inference (Cartesia Sonic-3) as before. The
// adapters that talk to each provider are copied from OpenMausBot (Apache-2.0) and live in
// third_party/openmausbot/tts; this file only picks one and turns its audio into LiveKit frames.
//
// Keys are read from the environment, never logged and never sent to the room.
import { AudioByteStream, tts } from "@livekit/agents";
import { z } from "zod";
import * as deepseek from "../third_party/openmausbot/tts/deepseek.ts";
import * as elevenlabs from "../third_party/openmausbot/tts/elevenlabs.ts";
import * as gemini from "../third_party/openmausbot/tts/gemini.ts";
import * as openai from "../third_party/openmausbot/tts/openai.ts";
import { speakable } from "../third_party/openmausbot/tts/speech-text.ts";
import { DEFAULT_DEEPSEEK_VOICE } from "../third_party/openmausbot/shared/deepseek-voice.ts";
import { DEFAULT_OPENAI_VOICE } from "../third_party/openmausbot/shared/openai-voice.ts";

/** Every provider here returns 24 kHz, 16-bit, one-channel audio. */
export const SAMPLE_RATE = 24_000;

export const OWN_KEY_PROVIDERS = ["elevenlabs", "openai", "gemini", "deepseek"] as const;
export type OwnKeyProvider = (typeof OWN_KEY_PROVIDERS)[number];

const KEY_ENV: Record<OwnKeyProvider, string> = {
  elevenlabs: "ELEVENLABS_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

const DEFAULT_VOICE: Record<OwnKeyProvider, string | undefined> = {
  // ElevenLabs has no voice everyone can use by name: VOICE_TTS_PROVIDER_VOICE is required for it.
  elevenlabs: undefined,
  openai: DEFAULT_OPENAI_VOICE,
  gemini: "Kore",
  deepseek: DEFAULT_DEEPSEEK_VOICE,
};

export type OwnKeyChoice = { provider: OwnKeyProvider; key: string; voice: string };

/** The provider to speak with, or null when it is not fully set up (then LiveKit Inference speaks). */
export function readOwnKeyTts(env: Record<string, string | undefined> = process.env): OwnKeyChoice | null {
  const provider = z.enum(OWN_KEY_PROVIDERS).safeParse(env.VOICE_TTS_PROVIDER?.trim().toLowerCase());
  if (!provider.success) return null;
  const key = env[KEY_ENV[provider.data]]?.trim();
  if (!key || key.length < 16) return null;
  const voice = env.VOICE_TTS_PROVIDER_VOICE?.trim() || DEFAULT_VOICE[provider.data];
  if (!voice) return null;
  return { provider: provider.data, key, voice };
}

/** Raw 16-bit PCM at 24 kHz from what an adapter returned: plain PCM, or a WAV file holding it. */
export function pcmOf(audio: { bytes: Uint8Array; mime: string }): Uint8Array {
  if (audio.mime === "audio/pcm") return audio.bytes;
  const info = deepseek.readWav(audio.bytes);
  if (!info || info.format !== 1 || info.channels !== 1 || info.bitsPerSample !== 16 || info.sampleRate !== SAMPLE_RATE)
    throw new Error("The voice service sent audio in a shape this call cannot play.");
  // Find the data chunk; readWav checked it fits.
  const view = new DataView(audio.bytes.buffer, audio.bytes.byteOffset, audio.bytes.byteLength);
  for (let at = 12; at + 8 <= audio.bytes.byteLength; ) {
    const size = view.getUint32(at + 4, true);
    const tag = String.fromCharCode(...audio.bytes.subarray(at, at + 4));
    if (tag === "data") return audio.bytes.subarray(at + 8, at + 8 + size);
    at = at + 8 + size + (size % 2);
  }
  throw new Error("The voice service sent audio with no sound in it.");
}

export type Speak = (choice: OwnKeyChoice, text: string, signal: AbortSignal) => Promise<Uint8Array>;

/** Ask the chosen provider to say one piece of text. */
export const speakWithProvider: Speak = async (choice, text, signal) => {
  switch (choice.provider) {
    case "elevenlabs": {
      const api = (process.env.ELEVENLABS_API || "https://api.elevenlabs.io/v1").replace(/\/+$/, "");
      return pcmOf(await elevenlabs.synthesize(text, choice.voice, choice.key, api, false, signal).audio);
    }
    case "openai":
      return pcmOf(await openai.synthesize(text, choice.voice, choice.key, signal));
    case "gemini":
      return pcmOf(await gemini.synthesize(text, choice.voice, choice.key, gemini.DEFAULT_GEMINI_MODEL, signal));
    case "deepseek":
      return pcmOf(await deepseek.synthesize(text, choice.voice, choice.key, signal));
  }
};

/**
 * A LiveKit voice that speaks through one own-key provider. It says one piece of text at a
 * time (no streaming); the agent framework splits replies into sentences for it.
 */
export class OwnKeyTTS extends tts.TTS {
  label = "daksha.OwnKeyTTS";
  readonly choice: OwnKeyChoice;
  readonly speak: Speak;

  constructor(choice: OwnKeyChoice, speak: Speak = speakWithProvider) {
    super(SAMPLE_RATE, 1, { streaming: false });
    this.choice = choice;
    this.speak = speak;
  }

  override get provider(): string {
    return this.choice.provider;
  }

  synthesize(text: string, connOptions?: Parameters<tts.TTS["synthesize"]>[1], abortSignal?: AbortSignal): tts.ChunkedStream {
    return new OwnKeyChunk(text, this, connOptions, abortSignal);
  }

  stream(): tts.SynthesizeStream {
    throw new Error("This voice speaks one piece at a time; the agent wraps it for streaming.");
  }
}

class OwnKeyChunk extends tts.ChunkedStream {
  label = "daksha.OwnKeyChunk";
  readonly #voice: OwnKeyTTS;
  readonly #text: string;

  constructor(text: string, voice: OwnKeyTTS, connOptions?: Parameters<tts.TTS["synthesize"]>[1], abortSignal?: AbortSignal) {
    super(text, voice, connOptions, abortSignal);
    this.#voice = voice;
    this.#text = text;
  }

  protected async run(): Promise<void> {
    const said = speakable(this.#text);
    if (!said) {
      this.queue.close();
      return;
    }
    const pcm = await this.#voice.speak(this.#voice.choice, said, this.abortSignal);
    const requestId = crypto.randomUUID();
    const bytes = new AudioByteStream(SAMPLE_RATE, 1);
    for (const frame of [...bytes.write(pcm), ...bytes.flush()])
      this.queue.put({ requestId, segmentId: requestId, frame, final: false });
    this.queue.close();
  }
}

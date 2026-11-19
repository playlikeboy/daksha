// Who said what in a recording ("speaker separation"). The engine is Cloudflare
// Workers AI running Deepgram Nova-3 with `diarize` and `utterances` on:
// https://developers.cloudflare.com/workers-ai/models/nova-3/
// Each word comes back with a speaker number (0, 1, 2...), and the words are
// grouped into utterances: one stretch of one person talking.
//
// The audio sent is the small 16 kHz mono mp3 that debo/audio.ts makes. The
// engine sits behind an interface so tests use a fake and never call anyone.
// Never log the text that comes back. Ids and counts only.
import { z } from "zod";

export const DIARIZE_MODEL = "@cf/deepgram/nova-3";

export type Utterance = {
  /** The engine's speaker number, as a string: "0", "1"... */
  speaker: string;
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  text: string;
};

export type Diarization = { language: string | null; utterances: Utterance[] };

/** "en", "hi", or empty to let the engine find the language. */
export type DiarizeOptions = { language?: string; signal?: AbortSignal };

export interface Diarizer {
  readonly name: string;
  diarize(audio: Uint8Array, contentType: string, options?: DiarizeOptions): Promise<Diarization>;
}

/** A failure the caller may report. Its message is safe to log: no words from the audio. */
export class DiarizeError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "DiarizeError";
  }
}

/** The settings sent with every request. Only documented Nova-3 options. */
export function diarizeSettings(language?: string): Record<string, string> {
  return {
    diarize: "true",
    utterances: "true",
    punctuate: "true",
    smart_format: "true",
    ...(language && /^[a-z]{2,3}$/.test(language) ? { language } : { detect_language: "true" }),
  };
}

/**
 * Through the Worker's AI binding (ai.internal). POST <url>/diarize with the
 * audio as the body; the Worker passes it to Nova-3 as `{ body, contentType }`
 * (see os/infra/cloudflare/api/src/media.ts, handleDiarize).
 */
export function bindingDiarizer(url: string, fetchImpl: typeof fetch = fetch): Diarizer {
  return nova3(`${url.replace(/\/$/, "")}/diarize`, {}, fetchImpl);
}

/**
 * Through the Workers AI REST API with CF_AI_API_TOKEN. The audio is the raw
 * request body with its own Content-Type, and the settings go in the query.
 */
export function restDiarizer(config: { accountId: string; apiToken: string }, fetchImpl: typeof fetch = fetch): Diarizer {
  return nova3(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai/run/${DIARIZE_MODEL}`,
    { Authorization: `Bearer ${config.apiToken}` },
    fetchImpl,
  );
}

function nova3(url: string, auth: Record<string, string>, fetchImpl: typeof fetch): Diarizer {
  return {
    name: "Cloudflare Workers AI (Deepgram Nova-3)",
    async diarize(audio, contentType, options = {}) {
      const target = new URL(url);
      for (const [k, v] of Object.entries(diarizeSettings(options.language))) target.searchParams.set(k, v);
      let response: Response;
      try {
        response = await fetchImpl(target, {
          method: "POST",
          headers: { ...auth, "Content-Type": contentType },
          body: new Uint8Array(audio),
          signal: options.signal ?? AbortSignal.timeout(10 * 60_000),
        });
      } catch {
        throw new DiarizeError("The speaker service did not answer.", true);
      }
      if (response.status === 429 || response.status >= 500)
        throw new DiarizeError(`The speaker service was busy (${response.status}).`, true);
      if (!response.ok) throw new DiarizeError(`The speaker service refused the audio (${response.status}).`, false);
      return readDiarization(await response.json().catch(() => null));
    },
  };
}

const Word = z.object({
  word: z.string().optional(),
  punctuated_word: z.string().optional(),
  start: z.number(),
  end: z.number(),
  speaker: z.number().int().min(0).optional(),
});
const RawUtterance = z.object({
  start: z.number(),
  end: z.number(),
  transcript: z.string(),
  speaker: z.number().int().min(0).optional(),
});
const Results = z.object({
  results: z.object({
    channels: z
      .array(
        z.object({
          detected_language: z.string().optional(),
          alternatives: z.array(z.object({ words: z.array(Word).optional(), languages: z.array(z.string()).optional() })).optional(),
        }),
      )
      .optional(),
    utterances: z.array(RawUtterance).optional(),
  }),
});

/** A pause this long between two words of one speaker starts a new utterance. */
const PAUSE_SECONDS = 1.5;

/**
 * Read Nova-3's answer without trusting its shape. Works on the REST answer
 * ({ success, result: { results } }), the Worker's answer (same), and the bare
 * Deepgram shape ({ results }). Uses `utterances` when present, else groups the
 * words by speaker.
 */
export function readDiarization(raw: unknown): Diarization {
  const outer = (raw ?? {}) as { success?: boolean; result?: unknown };
  if (outer.success === false) throw new DiarizeError("The speaker service could not read the audio.", false);
  const parsed = Results.safeParse(outer.result ?? raw);
  if (!parsed.success) throw new DiarizeError("The speaker service sent back something I could not read.", false);
  const { channels = [], utterances: rawUtterances = [] } = parsed.data.results;
  const channel = channels[0];
  const alt = channel?.alternatives?.[0];
  const language = (channel?.detected_language ?? alt?.languages?.[0] ?? "").trim().toLowerCase().slice(0, 8) || null;

  let utterances: Utterance[] = rawUtterances
    .filter((u) => u.transcript.trim() && u.end > u.start)
    .map((u) => ({ speaker: String(u.speaker ?? 0), start: round(u.start), end: round(u.end), text: u.transcript.trim() }));

  if (utterances.length === 0) {
    utterances = [];
    for (const w of alt?.words ?? []) {
      const text = (w.punctuated_word ?? w.word ?? "").trim();
      if (!text || !(w.end >= w.start)) continue;
      const speaker = String(w.speaker ?? 0);
      const last = utterances.at(-1);
      if (last && last.speaker === speaker && w.start - last.end < PAUSE_SECONDS) {
        last.text += ` ${text}`;
        last.end = round(w.end);
      } else utterances.push({ speaker, start: round(w.start), end: round(w.end), text });
    }
  }
  utterances.sort((a, b) => a.start - b.start);
  return { language, utterances };
}

export type SpeakerSummary = {
  /** The engine's number for this voice. */
  speaker: string;
  /** How many seconds this voice talks, in total. */
  seconds: number;
  lineCount: number;
  /** A few of the longest lines, so the person can tell who this is. Scrubbed by the caller. */
  sampleLines: string[];
  /** Two or three short stretches (under 8 seconds) to play as a sample. */
  samples: { start: number; end: number }[];
};

/** One summary per voice, the voice that talks most first. */
export function summariseSpeakers(utterances: Utterance[], lines = 3, samples = 3): SpeakerSummary[] {
  const by = new Map<string, Utterance[]>();
  for (const u of utterances) by.set(u.speaker, [...(by.get(u.speaker) ?? []), u]);
  return [...by.entries()]
    .map(([speaker, list]) => {
      const longest = [...list].sort((a, b) => b.text.length - a.text.length);
      const clips = [...list]
        .filter((u) => u.end - u.start >= 1.5)
        .sort((a, b) => b.end - b.start - (a.end - a.start))
        .slice(0, samples)
        .map((u) => ({ start: u.start, end: round(Math.min(u.end, u.start + 8)) }))
        .sort((a, b) => a.start - b.start);
      return {
        speaker,
        seconds: round(list.reduce((sum, u) => sum + (u.end - u.start), 0)),
        lineCount: list.length,
        sampleLines: longest.slice(0, lines).map((u) => u.text.slice(0, 200)),
        samples: clips,
      };
    })
    .sort((a, b) => b.seconds - a.seconds);
}

/** A stand-in for tests and sample mode. Never calls anyone. */
export function fakeDiarizer(result: Diarization | (() => Diarization | Promise<Diarization>)): Diarizer & { calls: number } {
  const fake = {
    name: "Sample engine (no real speaker separation)",
    calls: 0,
    async diarize() {
      fake.calls += 1;
      return typeof result === "function" ? result() : result;
    },
  };
  return fake;
}

const round = (n: number) => Math.round(n * 100) / 100;

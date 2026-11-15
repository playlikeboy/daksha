// Makes the short voice samples the app plays in voice settings
// (os/apps/mobile/assets/voices/*.mp3). Each sample is spoken by the same model and
// voice a call uses: Cartesia Sonic-3 through LiveKit Inference, with the same
// LIVEKIT_API_KEY and LIVEKIT_API_SECRET the voice agent uses. No other account.
//
// Run from apps/voice-agent after changing the voice list in
// os/apps/server/src/talk-settings.ts (VOICES), then commit the new files:
//
//   node --env-file=../../.env scripts/make-voice-samples.mjs
//
// Needs ffmpeg on the PATH to turn the raw sound into small mp3 files.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inference, initializeLogger } from "@livekit/agents";

/** Keep in step with VOICES in os/apps/server/src/talk-settings.ts. */
const VOICES = {
  jacqueline: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
  robyn: "f31cc6a7-c1e8-4764-980c-60a361443dd1",
  daniela: "5c5ad5e7-1020-476b-8b91-fdcbe9cc313c",
  blake: "a167e0f3-df7e-4d52-a9c3-f949145efdab",
};
/** One fixed sentence. Nothing about any person. */
const TEXT = "Hi, it's me. Tell me about your day, and I'll keep it safe for you.";
/** The voice agent's default language (VOICE_TTS_LANGUAGE in src/main.ts), so it sounds like a call. */
const LANGUAGE = "hi";
const RATE = 24000;

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../../os/apps/mobile/assets/voices");
const work = mkdtempSync(path.join(tmpdir(), "debo-voices-"));
initializeLogger({ pretty: false, level: "warn" });

try {
  for (const [name, voice] of Object.entries(VOICES)) {
    const tts = new inference.TTS({ model: "cartesia/sonic-3", voice, language: LANGUAGE, sampleRate: RATE });
    const stream = tts.stream();
    stream.pushText(TEXT);
    stream.flush();
    stream.endInput();
    const chunks = [];
    for await (const event of stream) {
      if (typeof event === "symbol") break;
      const { data } = event.frame;
      chunks.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    }
    await tts.close();
    const raw = path.join(work, `${name}.pcm`);
    writeFileSync(raw, Buffer.concat(chunks));
    // Trim the quiet at both ends, then a small mono mp3 (about 35 KB for five seconds).
    const trim = "silenceremove=start_periods=1:start_threshold=-50dB,areverse";
    execFileSync("ffmpeg", [
      "-loglevel", "error", "-y",
      "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", raw,
      "-af", `${trim},${trim}`,
      "-c:a", "libmp3lame", "-b:a", "64k",
      path.join(out, `${name}.mp3`),
    ]);
    console.log(`${name}.mp3 written`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(0);

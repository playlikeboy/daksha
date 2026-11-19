// Daksha's voice worker, run by LiveKit Cloud.
//
// daksha.life signs a short-lived room token for a signed-in person, with the
// person's user id as the participant identity, and asks LiveKit to send this
// agent ("debo-voice") into the room. The agent hears the person (Deepgram
// Nova-3 through LiveKit Inference, English and Hindi mixed), asks Daksha's
// brain for the answer (the same agent as chat), and speaks it (Cartesia Sonic-3 through LiveKit
// Inference). Interrupting stops the answer at once. When Daksha is talking as a
// custom person with a voice copy, it speaks in that voice instead, through the
// Cartesia plugin with the key Daksha's server sends (see voice-copy.ts).
//
// Audio is never stored by Daksha. Based on livekit-examples/agent-starter-node (MIT).
import { ServerOptions, cli, defineAgent, inference, voice } from "@livekit/agents";
import * as cartesia from "@livekit/agents-plugin-cartesia";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DeboVoiceAgent } from "./agent.ts";
import { readVoiceChoice } from "./brain.ts";
import { chooseTts, fetchVoiceCopy, greeting } from "./voice-copy.ts";

const Env = z.object({
  // The Daksha app's server. Voice runs through the same agent as chat there.
  // Set as DAKSHA_URL, or DEBO_URL, its name from before the rename (see readEnv).
  DEBO_URL: z.string().url().default("https://api.daksha.life"),
  VOICE_AGENT_SECRET: z.string().min(32),
  VOICE_TTS_VOICE: z.string().min(1).default("9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"),
  VOICE_TTS_LANGUAGE: z.string().min(2).default("hi"),
  // "off" stops Daksha from changing her feeling per reply (if the voice service ever rejects it).
  VOICE_EMOTION: z.enum(["on", "off"]).default("on"),
  VOICE_TTS_SPEED: z.coerce.number().min(0.6).max(1.5).optional(),
});

/** The settings, with the optional new name DAKSHA_URL read before DEBO_URL (docs/RENAME.md). */
function readEnv(source: Record<string, string | undefined> = process.env) {
  return Env.parse({ ...source, DEBO_URL: source.DAKSHA_URL || source.DEBO_URL || undefined });
}

const UserId = z.string().uuid();

export default defineAgent({
  entry: async (ctx) => {
    const env = readEnv();
    await ctx.connect();
    const participant = await ctx.waitForParticipant();
    // The identity was set by daksha.life when it signed the token, not by the browser.
    const userId = UserId.safeParse(participant.identity);
    if (!userId.success) {
      console.error("voice: participant is not a Daksha user, leaving", { room: ctx.room.name });
      ctx.shutdown("not a Daksha user");
      return;
    }
    const sessionId = randomUUID();

    // The voice and speed this person chose (Settings), else the env defaults.
    const chosen = readVoiceChoice(participant.metadata);
    const speed = chosen?.speed ?? env.VOICE_TTS_SPEED;
    // A custom person's copied voice, if Daksha is talking as one that has it. Asked over the agent's
    // secret; the key stays in this process and is never sent to the room.
    const copy = await fetchVoiceCopy({ deboUrl: env.DEBO_URL, secret: env.VOICE_AGENT_SECRET }, userId.data);
    const picked = chooseTts<inference.TTS<"cartesia/sonic-3"> | cartesia.TTS>(copy, {
      inference: () =>
        new inference.TTS({
          model: "cartesia/sonic-3",
          voice: chosen?.voice ?? env.VOICE_TTS_VOICE,
          language: env.VOICE_TTS_LANGUAGE,
          ...(speed ? { modelOptions: { speed } } : {}),
        }),
      cartesia: (c) =>
        new cartesia.TTS({
          apiKey: c.apiKey,
          model: "sonic-3",
          voice: c.voiceId,
          language: c.language,
          ...(speed ? { speed } : {}),
        }),
    });
    const tts = picked.tts;
    if (tts instanceof cartesia.TTS) ctx.addShutdownCallback(async () => tts.close());
    const session = new voice.AgentSession({
      stt: new inference.STT({ model: "deepgram/nova-3", language: "multi" }),
      // Never used for answers: DeboVoiceAgent.llmNode asks Daksha's brain.
      // The framework needs an LLM object to run the reply pipeline.
      llm: new inference.LLM({ model: "google/gemma-4-31b-it" }),
      tts,
      turnHandling: {
        turnDetection: new inference.TurnDetector(),
        // Answer sooner than the 500 ms default after the person stops talking.
        endpointing: { minDelay: 350, maxDelay: 2500 },
        // Do not give up a reply for a cough or "mm-hm", and carry on after one.
        interruption: { falseInterruptionTimeout: 1500, resumeFalseInterruption: true },
        // Off on purpose: the brain can run tools (save, search, apps), and a
        // guessed-early run would repeat them if the person kept talking.
        preemptiveGeneration: { enabled: false },
      },
    });

    await session.start({
      agent: new DeboVoiceAgent({
        deboUrl: env.DEBO_URL,
        secret: env.VOICE_AGENT_SECRET,
        userId: userId.data,
        sessionId,
        room: ctx.room,
        // A copied voice keeps one steady feeling: only Daksha's own voices change per reply.
        ...(tts instanceof inference.TTS ? { tts } : {}),
        emotion: env.VOICE_EMOTION === "on" && !picked.copied,
        speed,
      }),
      room: ctx.room,
    });

    // The "Stop Daksha" button on the Talk page: stop speaking now.
    ctx.room.localParticipant?.registerRpcMethod("debo.interrupt", async () => {
      try {
        await session.interrupt().await;
      } catch {
        // Nothing was playing, or it already stopped.
      }
      return "ok";
    });

    // In a copied voice, the first words always say this is Daksha's AI version of the person.
    session.say(greeting(copy));
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "debo-voice",
  }),
);

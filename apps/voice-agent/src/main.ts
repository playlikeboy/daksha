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
// Phone calls (docs/PHONE.md) join the same way, as a SIP participant with no sign-in. They
// go through the PIN check in phone-gate.ts first; only then does the brain hear them.
//
// Audio is never stored by Daksha. Based on livekit-examples/agent-starter-node (MIT).
import { ServerOptions, cli, defineAgent, inference, voice } from "@livekit/agents";
import * as cartesia from "@livekit/agents-plugin-cartesia";
import { ParticipantKind } from "@livekit/rtc-node";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DeboVoiceAgent } from "./agent.ts";
import { readVoiceChoice } from "./brain.ts";
import { OwnKeyTTS, readOwnKeyTts } from "./own-key-tts.ts";
import { callerNumberOf, phoneApi, readPhoneJob, type StartAnswer } from "./phone.ts";
import { PhoneGate, PhoneGateAgent, type Step } from "./phone-gate.ts";
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

type Tts = inference.TTS<"cartesia/sonic-3"> | cartesia.TTS | OwnKeyTTS;

export default defineAgent({
  entry: async (ctx) => {
    const env = readEnv();
    await ctx.connect();
    const participant = await ctx.waitForParticipant();
    const api = { deboUrl: env.DEBO_URL, secret: env.VOICE_AGENT_SECRET };

    // A phone call: the PIN check first, then Daksha as that person.
    if (participant.kind === ParticipantKind.SIP) {
      const job = readPhoneJob(ctx.job.metadata);
      let start: StartAnswer | null = null;
      if (job) start = { callToken: job.callToken, ask: "pin" };
      else {
        const number = callerNumberOf(participant.attributes);
        start = number ? await phoneApi.start(api, number) : { callToken: "x".repeat(20), ask: "unknown" };
      }
      const session = makeSession(phoneVoice(env));
      if (!start) {
        await session.start({ agent: new voice.Agent({ instructions: "Daksha's phone check." }), room: ctx.room });
        await hangUp(ctx, session, "Sorry, I can't take calls right now. Please try again later. Goodbye.");
        return;
      }
      const first = PhoneGate.opening(start, Boolean(job));
      const gate = new PhoneGate(start, {
        code: (token, digits) => phoneApi.code(api, token, digits),
        pin: (token, digits) => phoneApi.pin(api, token, digits),
      });
      const onStep = (step: Step) => {
        if (step.then === "hangup") {
          void hangUp(ctx, session, "");
          return;
        }
        if (step.then === "listen") return;
        // The PIN was right. From here on it is a normal Daksha call, saved like the others.
        const userId = UserId.safeParse(step.then.userId);
        if (!userId.success) {
          void hangUp(ctx, session, "Sorry, something went wrong. Goodbye.");
          return;
        }
        ctx.addShutdownCallback(async () => {
          await phoneApi.ended(api, userId.data);
        });
        session.updateAgent(
          new DeboVoiceAgent({
            deboUrl: env.DEBO_URL,
            secret: env.VOICE_AGENT_SECRET,
            userId: userId.data,
            sessionId: randomUUID(),
            room: ctx.room,
            emotion: false,
          }),
        );
        session.say(job ? `Thanks. ${job.opening} Anything else?` : "Thanks, you're in. What's on your mind?");
      };
      await session.start({ agent: new PhoneGateAgent(gate, onStep), room: ctx.room });
      if (first.then === "hangup") await hangUp(ctx, session, first.say);
      else session.say(first.say);
      return;
    }

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
    const copy = await fetchVoiceCopy(api, userId.data);
    // An optional voice on the operator's own key (VOICE_TTS_PROVIDER and its key), else LiveKit Inference.
    const ownKey = readOwnKeyTts();
    const picked = chooseTts<Tts>(copy, {
      inference: () =>
        ownKey
          ? new OwnKeyTTS(ownKey)
          : new inference.TTS({
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
    const session = makeSession(tts);

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

function makeSession(tts: Tts) {
  return new voice.AgentSession({
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
}

/** A phone call speaks in the default voice, or the operator's own-key voice if one is set. */
function phoneVoice(env: z.infer<typeof Env>): Tts {
  const ownKey = readOwnKeyTts();
  return ownKey
    ? new OwnKeyTTS(ownKey)
    : new inference.TTS({ model: "cartesia/sonic-3", voice: env.VOICE_TTS_VOICE, language: env.VOICE_TTS_LANGUAGE });
}

/** Say a last line (if any), wait for it to finish, then end the call for everyone. */
async function hangUp(ctx: { deleteRoom(): Promise<void>; shutdown(reason?: string): void }, session: voice.AgentSession, line: string) {
  try {
    if (line) await session.say(line, { allowInterruptions: false }).waitForPlayout();
    // A line from the gate is already being said; give it a moment to finish.
    else await new Promise((resolve) => setTimeout(resolve, 6_000));
  } catch {
    // The caller already hung up.
  }
  await ctx.deleteRoom().catch(() => undefined);
  ctx.shutdown("phone call ended");
}

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "debo-voice",
  }),
);

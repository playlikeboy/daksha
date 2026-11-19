// Which voice a call speaks in. Usually one of Debo's own voices through
// LiveKit Inference. When Debo is talking as a custom person who has a voice
// copy, Debo's server says so once at the start of the call (POST
// /api/voice/session, over the agent's secret), with the private Cartesia voice
// id and the key that can speak it. That voice is not on LiveKit's own Cartesia
// account, so the call then speaks through the Cartesia plugin
// (@livekit/agents-plugin-cartesia) with that key.
//
// The key is never logged and never sent to the room. The copied voice is only
// used for this call's own replies, never for anything outbound.
import { z } from "zod";

export const VoiceCopy = z.object({
  voiceId: z.string().min(1).max(200),
  apiKey: z.string().min(16).max(400),
  personName: z.string().max(200),
  language: z.string().regex(/^[a-z]{2,3}$/),
  /** Said first, before anything else: this is Debo's AI version of the person. */
  opening: z.string().min(1).max(400),
});
export type VoiceCopy = z.infer<typeof VoiceCopy>;

/** Ask Debo's server which voice to use. Any failure means "no voice copy": the call goes on in Debo's voice. */
export async function fetchVoiceCopy(
  config: { deboUrl: string; secret: string },
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VoiceCopy | null> {
  try {
    const response = await fetchImpl(new URL("/api/voice/session", config.deboUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.secret}` },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as { voiceCopy?: unknown } | null;
    const parsed = VoiceCopy.safeParse(body?.voiceCopy);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Pick the speaking voice. The Cartesia plugin only when there is a voice copy;
 * LiveKit Inference otherwise. The makers are passed in so tests need no network.
 */
export function chooseTts<T>(
  copy: VoiceCopy | null,
  makers: { inference: () => T; cartesia: (copy: VoiceCopy) => T },
): { tts: T; copied: boolean } {
  return copy ? { tts: makers.cartesia(copy), copied: true } : { tts: makers.inference(), copied: false };
}

/** The first words of a call. In a copied voice, they always say it is Debo's AI version. */
export function greeting(copy: VoiceCopy | null): string {
  return copy ? `${copy.opening} What's on your mind?` : "Hey! I'm here. What's on your mind?";
}

// Voice notes and call recordings of a custom person, and the optional voice
// copy. See service.ts for the flow and docs/VOICE.md for the whole story.
import { bindingDiarizer, type Diarizer, restDiarizer } from "./diarize.ts";

export { voiceCopyRoutes } from "./routes.ts";
export { type CallVoice, VoiceCopyService, type VoiceCopyDeps } from "./service.ts";
export { type CustomPeopleGlue, customPeopleGlue } from "./glue.ts";

/**
 * Daksha's speaker separation, from the same settings as speech (see debo/index.ts):
 * AI_BACKEND=binding with AI_BINDING_URL (the Worker's AI binding), else
 * CF_AI_API_TOKEN with R2_ACCOUNT_ID (the REST API). Neither: not set up.
 */
export function diarizerFromEnv(env: Record<string, string | undefined>): Diarizer | undefined {
  const aiUrl = env.AI_BINDING_URL?.trim();
  if (env.AI_BACKEND?.trim() === "binding" && aiUrl) return bindingDiarizer(aiUrl);
  const apiToken = env.CF_AI_API_TOKEN?.trim();
  const accountId = env.R2_ACCOUNT_ID?.trim();
  if (apiToken && accountId) return restDiarizer({ accountId, apiToken });
  return undefined;
}

/** CARTESIA_API_KEY: Daksha's own Cartesia account, used for voice copies when the person has no key. Optional. */
export function deboCartesiaKey(env: Record<string, string | undefined>): string | undefined {
  const key = env.CARTESIA_API_KEY?.trim();
  return key && key.length >= 16 ? key : undefined;
}

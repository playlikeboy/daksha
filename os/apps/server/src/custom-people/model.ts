// The real model calls for custom people, through @debo/llm (the one door for model calls).
// With the person's own Anthropic key, both calls go to Anthropic on their key only. Otherwise
// Daksha's own setup is used (ANTHROPIC_API_KEY, then the Neon AI Gateway).
import { createLlm } from "@debo/llm";
import type { PersonModel } from "./profile.ts";

/** True when Daksha itself can make these calls. */
export function personModelConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim() || (env.NEON_AI_GATEWAY_BASE_URL?.trim() && env.NEON_AI_GATEWAY_TOKEN?.trim()));
}

export function llmPersonModel(env: Record<string, string | undefined>): PersonModel {
  const llm = createLlm(env);
  return {
    async describePhoto(bytes, mimeType, signal) {
      return (await llm.describePhoto(bytes, mimeType, { signal })).text;
    },
    async buildProfile(request, signal) {
      return (await llm.buildPersonProfile(request, { signal })).profile;
    },
  };
}

/**
 * Which model a person's upload uses: their own Anthropic key if they set one, else Daksha's.
 * Undefined when neither is set up.
 */
export function personModelFor(
  env: Record<string, string | undefined>,
  ownAnthropicKey: (owner: string) => Promise<string | undefined>,
) {
  return async (owner: string): Promise<PersonModel | undefined> => {
    const key = await ownAnthropicKey(owner).catch(() => undefined);
    if (key) return llmPersonModel({ ANTHROPIC_API_KEY: key });
    if (!personModelConfigured(env)) return undefined;
    const set = (name: string) => env[name]?.trim() || undefined;
    return llmPersonModel({
      ANTHROPIC_API_KEY: set("ANTHROPIC_API_KEY"),
      NEON_AI_GATEWAY_BASE_URL: set("NEON_AI_GATEWAY_BASE_URL"),
      NEON_AI_GATEWAY_TOKEN: set("NEON_AI_GATEWAY_TOKEN"),
    });
  };
}

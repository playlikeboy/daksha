// The optional "why this may interest you" line, through @debo/llm (the one door for model
// calls). With the person's own Anthropic key, the call goes to Anthropic on their key only.
// Otherwise Daksha's own setup is used. Only headlines, snippets and topic words are sent.
import { createLlm } from "@debo/llm";

export type NewsWhy = (
  owner: string,
  stories: { title: string; snippet?: string; topic: string }[],
  signal?: AbortSignal,
) => Promise<string[] | undefined>;

export function newsWhyFor(
  env: Record<string, string | undefined>,
  ownAnthropicKey: (owner: string) => Promise<string | undefined>,
): NewsWhy {
  const set = (name: string) => env[name]?.trim() || undefined;
  const ours =
    set("ANTHROPIC_API_KEY") || (set("NEON_AI_GATEWAY_BASE_URL") && set("NEON_AI_GATEWAY_TOKEN"))
      ? {
          ANTHROPIC_API_KEY: set("ANTHROPIC_API_KEY"),
          NEON_AI_GATEWAY_BASE_URL: set("NEON_AI_GATEWAY_BASE_URL"),
          NEON_AI_GATEWAY_TOKEN: set("NEON_AI_GATEWAY_TOKEN"),
        }
      : undefined;
  return async (owner, stories, signal) => {
    const key = await ownAnthropicKey(owner).catch(() => undefined);
    const env = key ? { ANTHROPIC_API_KEY: key } : ours;
    if (!env) return undefined;
    return (await createLlm(env).newsWhy(stories, { signal })).lines;
  };
}

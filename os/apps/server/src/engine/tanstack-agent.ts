import { randomUUID } from "node:crypto";
import { type BaseEvent, EventType, type RunAgentInput } from "@ag-ui/core";
import {
  BuiltInAgent,
  convertInputToTanStackAI,
  defineTool,
  type ToolDefinition,
} from "@copilotkit/runtime/v2";
import {
  chat,
  isContentPartArray,
  maxIterations,
  type SchemaInput,
  toolDefinition,
} from "@tanstack/ai";
import { type AnthropicChatModel, anthropicText, createAnthropicChat } from "@tanstack/ai-anthropic";
import { type GeminiTextModel, geminiText } from "@tanstack/ai-gemini";
import {
  createOpenaiChatCompletions,
  type OpenAIChatModel,
  openaiChatCompletions,
  openaiText,
} from "@tanstack/ai-openai";
import { map, mergeMap, type Observable } from "rxjs";
import { z } from "zod";
import { MODEL_MAX_RETRIES } from "../config.ts";

/** OpenRouter speaks the OpenAI Chat Completions format: https://openrouter.ai/docs */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Same "provider/model" strings, env vars and base URL formats as the AI SDK resolver in
// @copilotkit/runtime. Each provider SDK retries transient failures up to MODEL_MAX_RETRIES times.
// `apiKey` is a person's own key (own-keys/service.ts): it goes straight to that provider, never
// through Daksha's base URL or gateway, and is never logged.
export function adapter(spec: string, apiKey?: string) {
  const [, provider = "", model = ""] = spec.trim().match(/^([^/:]*)[/:](.*)$/) ?? [];
  if (!provider || !model.trim())
    throw new Error(
      `Invalid model string "${spec}". Use "openai/gpt-5", "anthropic/claude-sonnet-4.5", or "google/gemini-2.5-pro".`,
    );
  const id = model.trim();
  switch (provider.toLowerCase()) {
    case "openai":
      // OpenAI-compatible endpoints that do not implement the Responses API
      // tool loop (e.g. DeepSeek) can opt into the Chat Completions wire format.
      if (process.env.OPENAI_CHAT_COMPLETIONS === "true")
        return openaiChatCompletions(id as OpenAIChatModel, {
          baseURL: process.env.OPENAI_BASE_URL,
          maxRetries: MODEL_MAX_RETRIES,
        });
      return openaiText(id as OpenAIChatModel, {
        baseURL: process.env.OPENAI_BASE_URL,
        maxRetries: MODEL_MAX_RETRIES,
      });
    case "openrouter": {
      const key = apiKey ?? process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("An openrouter/ model needs a key: the person's own, or OPENROUTER_API_KEY.");
      // Chat Completions with tools; OpenRouter does not run the Responses API tool loop.
      return createOpenaiChatCompletions(id as OpenAIChatModel, key, {
        // OPENROUTER_BASE_URL is for tests and self-hosted proxies only.
        baseURL: process.env.OPENROUTER_BASE_URL?.trim() || OPENROUTER_BASE_URL,
        maxRetries: MODEL_MAX_RETRIES,
      });
    }
    case "anthropic":
      if (apiKey) return createAnthropicChat(id as AnthropicChatModel, apiKey, { maxRetries: MODEL_MAX_RETRIES });
      // The AI SDK base URL ends in /v1; the Anthropic SDK adds /v1 itself.
      return anthropicText(id as AnthropicChatModel, {
        baseURL: process.env.ANTHROPIC_BASE_URL?.replace(/\/v1\/?$/, ""),
        maxRetries: MODEL_MAX_RETRIES,
      });
    case "google":
    case "gemini":
    case "google-gemini":
      // The AI SDK base URL ends in /v1beta; @google/genai adds the API version itself.
      return geminiText(id as GeminiTextModel, {
        httpOptions: {
          baseUrl: process.env.GOOGLE_GENERATIVE_AI_BASE_URL?.replace(/\/v1beta\/?$/, ""),
          // @google/genai counts the first call in `attempts`.
          retryOptions: { attempts: MODEL_MAX_RETRIES + 1 },
        },
      });
    default:
      throw unknownProvider(provider, spec);
  }
}

/** With OPENAI_BASE_URL set, a gateway model ID most likely needs the openai/ prefix. */
export function unknownProvider(
  provider: string,
  spec: string,
  baseUrl = process.env.OPENAI_BASE_URL,
) {
  const hint = baseUrl?.trim()
    ? ` For a model on your OPENAI_BASE_URL gateway, use "openai/${spec.trim()}".`
    : "";
  return new Error(
    `Unknown provider "${provider}" in "${spec}". Supported: openai, anthropic, google (gemini), openrouter.${hint}`,
  );
}

// The classic BuiltInAgent always offers these two state tools. The converter turns their
// results into STATE_SNAPSHOT / STATE_DELTA events.
const stateTools = [
  defineTool({
    name: "AGUISendStateSnapshot",
    description: "Replace the entire application state with a new snapshot",
    parameters: z.object({ snapshot: z.any().describe("The complete new state object") }),
    execute: async ({ snapshot }) => ({ success: true, snapshot }),
  }),
  defineTool({
    name: "AGUISendStateDelta",
    description: "Apply incremental updates to application state using JSON Patch operations",
    parameters: z.object({
      delta: z
        .array(
          z.object({
            op: z.enum(["add", "replace", "remove"]).describe("The operation to perform"),
            path: z.string().describe("JSON Pointer path (e.g., '/foo/bar')"),
            value: z
              .any()
              .optional()
              .describe(
                "The value to set. Required for 'add' and 'replace' operations, ignored for 'remove'.",
              ),
          }),
        )
        .describe("Array of JSON Patch operations"),
    }),
    execute: async ({ delta }) => ({ success: true, delta }),
  }),
];

/** A BuiltInAgent in TanStack factory mode with the options of the classic AI SDK mode. */
export function tanstackAgent(options: {
  model: string;
  /** A person's own key for that provider. Without it, Daksha's own key from the environment. */
  apiKey?: string;
  maxSteps: number;
  tools: ToolDefinition[];
  prompt: string;
  /** Checked between model turns, after the current turn's tools have settled. */
  shouldContinue?: () => boolean;
  /** Said when the step limit, not the model, ends a run; otherwise the reply just stops. */
  stepLimitNote?: string;
}) {
  const agent = new BuiltInAgent({
    type: "tanstack",
    factory: ({ input, abortController }) => {
      const converted = convertInputToTanStackAI(input);
      // Build the system prompt like the classic mode. It does not forward system messages.
      let system = options.prompt;
      if (input.context.length) {
        system += "\n## Context from the application\n";
        for (const ctx of input.context) system += `${ctx.description}:\n${ctx.value}\n`;
      }
      if (
        input.state !== undefined &&
        input.state !== null &&
        !(typeof input.state === "object" && Object.keys(input.state).length === 0)
      )
        system += `\n## Application State\nThis is state from the application that you can edit by calling AGUISendStateSnapshot or AGUISendStateDelta.\n\`\`\`json\n${JSON.stringify(input.state, null, 2)}\n\`\`\`\n`;
      return chat({
        adapter: adapter(options.model, options.apiKey),
        messages: converted.messages,
        systemPrompts: system ? [system] : [],
        tools: [
          ...converted.tools,
          ...[...options.tools, ...stateTools].map((tool) =>
            toolDefinition({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.parameters as SchemaInput,
            }).server((args) => (tool.execute as (args: unknown) => Promise<unknown>)(args)),
          ),
        ],
        agentLoopStrategy: (state) =>
          maxIterations(options.maxSteps)(state) && (options.shouldContinue?.() ?? true),
        abortController,
      });
    },
  });
  const run = agent.run.bind(agent);
  agent.run = (input: RunAgentInput) => {
    const events = splitTextAtToolCalls(run(objectToolArguments(input))).pipe(
      map(textOnlyToolResult),
    );
    return options.stepLimitNote
      ? reportStepLimit(events, options.maxSteps, options.stepLimitNote)
      : events;
  };
  return agent;
}

/**
 * A tool that takes no input is saved in the chat with empty arguments (""), not "{}".
 * Sent back to the model on the next turn, that is refused ("tool_use.input: Input should
 * be an object") and the whole chat stops answering. Give every saved tool call an object.
 */
export function objectToolArguments(input: RunAgentInput): RunAgentInput {
  const isObject = (text: unknown) => {
    if (typeof text !== "string") return false;
    try {
      const value: unknown = JSON.parse(text);
      return typeof value === "object" && value !== null && !Array.isArray(value);
    } catch {
      return false;
    }
  };
  let changed = false;
  const messages = input.messages.map((message) => {
    const calls = (message as { toolCalls?: { function?: { arguments?: unknown } }[] }).toolCalls;
    if (message.role !== "assistant" || !calls?.some((call) => !isObject(call.function?.arguments)))
      return message;
    changed = true;
    return {
      ...message,
      toolCalls: calls.map((call) =>
        isObject(call.function?.arguments)
          ? call
          : { ...call, function: { ...call.function, arguments: "{}" } },
      ),
    } as typeof message;
  });
  return changed ? { ...input, messages } : input;
}

/**
 * A tool can return TanStack content parts, e.g. text plus a screenshot. Inside the run
 * the adapters send them to the model as multimodal tool results. The AG-UI result event
 * would carry the same parts JSON-encoded, image data included, into the stored thread,
 * and later turns replay that history as plain text. Keep only the text parts there.
 */
export function textOnlyToolResult(event: BaseEvent): BaseEvent {
  if (event.type !== EventType.TOOL_CALL_RESULT) return event;
  const content = (event as { content?: unknown }).content;
  if (typeof content !== "string" || !content.startsWith("[")) return event;
  let parts: unknown;
  try {
    parts = JSON.parse(content);
  } catch {
    return event;
  }
  if (!isContentPartArray(parts)) return event;
  const text = parts.flatMap((part) => (part.type === "text" ? [part.content] : []));
  return { ...event, content: text.join("\n") } as BaseEvent;
}

/**
 * maxIterations ends the loop after the last allowed tool step without a final model reply.
 * When a run ends that way, add a short assistant message so it does not stop silently.
 */
export function reportStepLimit(events: Observable<BaseEvent>, maxSteps: number, note: string) {
  let steps = 0;
  let phase: "text" | "calling" | "results" = "text";
  return events.pipe(
    mergeMap((event): BaseEvent[] => {
      if (event.type === EventType.TOOL_CALL_START) {
        // Parallel calls of one model step arrive together; results end the step.
        if (phase !== "calling") steps++;
        phase = "calling";
      } else if (event.type === EventType.TOOL_CALL_RESULT) phase = "results";
      else if (event.type === EventType.TEXT_MESSAGE_CHUNK) phase = "text";
      else if (event.type === EventType.RUN_FINISHED && phase === "results" && steps >= maxSteps)
        return [
          {
            type: EventType.TEXT_MESSAGE_CHUNK,
            messageId: randomUUID(),
            role: "assistant",
            delta: note,
          } as BaseEvent,
          event,
        ];
      return [event];
    }),
  );
}

// ponytail: the TanStack converter in @copilotkit/runtime 1.70.1 uses one message ID for the
// whole run. Remove this when it starts a new ID for each step, like the classic mode does.
// Text after a tool call gets a new message ID, so each step's text is a separate message.
function splitTextAtToolCalls(events: Observable<BaseEvent>) {
  let messageId: string | undefined;
  let afterToolCall = false;
  return events.pipe(
    map((event) => {
      if (event.type === EventType.TEXT_MESSAGE_CHUNK) {
        if (!messageId || afterToolCall) messageId = randomUUID();
        afterToolCall = false;
        return { ...event, messageId };
      }
      if (event.type === EventType.TOOL_CALL_START) {
        afterToolCall = true;
        return messageId ? { ...event, parentMessageId: messageId } : event;
      }
      if (event.type === EventType.TOOL_CALL_RESULT) afterToolCall = true;
      return event;
    }),
  );
}

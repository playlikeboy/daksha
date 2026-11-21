// A message from SMS, WhatsApp or Telegram runs as one turn of the person's main chat, through
// the runner chat uses, so it shows in the app like anything they typed there. Built the same
// way as voice/engine-brain.ts, but it collects the reply as text instead of speaking it.
import { randomUUID } from "node:crypto";
import { type BaseEvent, EventType, type Message } from "@ag-ui/client";
import type { AgentRunner } from "@copilotkit/runtime/v2";
import type { Config } from "../config.ts";
import { ConversationAgent } from "../engine/conversation.ts";
import type { AgentService } from "../engine/service.ts";
import { threadOwner } from "../thread-runner.ts";
import type { ThreadStore } from "../threads.ts";
import type { ChannelBrain } from "./service.ts";

const CONTEXT_MESSAGES = 40;
const REPLY_TIMEOUT_MS = 180_000;
export const REVIEW_NOTE = "I've put that in the Daksha app for you to approve.";

export class EngineChannelBrain implements ChannelBrain {
  constructor(
    private readonly config: Config,
    private readonly service: AgentService,
    private readonly runner: AgentRunner,
    private readonly threads: ThreadStore,
  ) {}

  async reply(owner: string, _channel: string, text: string): Promise<string> {
    const threadId = await this.threads.mainThreadId(owner);
    await this.threads.ensure(owner, threadId, "default");
    let earlier: Message[] = [];
    try {
      earlier = (await this.threads.history(owner, threadId)).messages.slice(-CONTEXT_MESSAGES);
    } catch {
      // No history yet.
    }
    while (earlier.length > 0 && earlier[0]?.role !== "user") earlier = earlier.slice(1);
    const messages: Message[] = [...earlier, { id: randomUUID(), role: "user", content: text }];
    const agent = new ConversationAgent(this.config, this.service, owner, undefined, "chat");
    agent.setMessages(messages);
    agent.threadId = threadId;
    const runId = randomUUID();
    let out = "";
    let review = false;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        subscription.unsubscribe();
        void threadOwner.run(owner, () => this.runner.stop({ threadId, runId })).catch(() => undefined);
        resolve();
      }, REPLY_TIMEOUT_MS);
      const subscription = threadOwner.run(owner, () =>
        this.runner
          .run({ threadId, agent, input: { threadId, runId, messages, tools: [], context: [], state: {}, forwardedProps: {} } })
          .subscribe({
            next: (event: BaseEvent) => {
              if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
                const delta = (event as { delta?: unknown }).delta;
                if (typeof delta === "string") out += delta;
              } else if (event.type === EventType.TEXT_MESSAGE_END) {
                out += "\n";
              } else if (event.type === EventType.TOOL_CALL_RESULT && awaitsReview((event as { content?: unknown }).content)) {
                review = true;
              }
            },
            error: (error) => {
              clearTimeout(timer);
              reject(error instanceof Error ? error : new Error("channel run failed"));
            },
            complete: () => {
              clearTimeout(timer);
              resolve();
            },
          }),
      );
    });
    const reply = out.replace(/\n{3,}/g, "\n\n").trim();
    return review && !/approve/i.test(reply) ? `${reply}\n\n${REVIEW_NOTE}`.trim() : reply;
  }
}

function awaitsReview(content: unknown) {
  let value = content;
  if (typeof value === "string")
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return typeof record.actionId === "string" && record.status === "awaiting_review";
}

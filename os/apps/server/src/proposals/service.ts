// Review-first suggestions: lines worth remembering, and skill drafts, that wait for the person's
// yes. Nothing is saved to memory or skills until they tap Save (decision 39).
//
// Rewritten in TypeScript from suparagent (Apache-2.0, see third_party/suparagent/SOURCE.md):
//   - memory suggestions follow backend/app/services/memory_proposals.py: once a chat has been
//     quiet for two minutes, only the person's own messages are read for statements meant to
//     last ("remember that ...", "from now on ...", "I prefer ...", "my ... is ..."). The
//     person's words are quoted, never rewritten; questions are skipped; a line that held
//     anything like a secret is never suggested; a rejected line is never suggested again.
//   - skill drafts follow backend/app/services/skill_learning.py: one finished exchange becomes a
//     draft with fixed sections, redacted before it is cut to size, with warnings.
// No model is called. Records: kind "proposals" (one per suggestion) and "proposal-state".
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import type { ThreadStore } from "../threads.ts";
import { redactSecrets, skillWarnings } from "./redact.ts";

const KIND = "proposals";
const STATE = "proposal-state";
export const QUIET_MS = 120_000;
export const MAX_PENDING = 50;
const MAX_DECIDED = 500;
const MAX_PER_CONVERSATION = 5;
const SENTENCE_MAX = 300;
const SCAN_THREADS = 20;

const LASTING = [
  /\b(?:please\s+)?remember(?:\s+that)?\s*[:,]?\s+(?<s>[^.!?\n]{6,})/i,
  /\b(?:from now on|going forward|in future|in the future)\s*,?\s+(?<s>[^.!?\n]{6,})/i,
  /(?<s>\bI\s+(?:always|never|usually|prefer|like|love|hate|dislike|don't like|do not like|am allergic to|am vegetarian|am vegan|live in|work at|work for|work as)\b[^.!?\n]*)/i,
  /(?<s>\bmy\s+[a-z][a-z' -]{1,30}\s+(?:is|are)\s+[^.!?\n]{2,})/i,
];
const QUESTION = /^\s*(?:do|does|did|can|could|would|will|should|is|are|what|why|how|when|where|who)\b/i;

/** Two lines are the same suggestion when they differ only in case, spacing and a final full stop. */
export const identity = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean).join(" ").replace(/\.$/, "");

/** The lasting statements in one of the person's messages, in order. Questions are never statements. */
export function statements(text: string): string[] {
  const found: string[] = [];
  for (const raw of text.match(/[^.!?\n]+[.!?]?/g) ?? []) {
    const sentence = raw.trim();
    if (!sentence || sentence.endsWith("?") || QUESTION.test(sentence)) continue;
    for (const pattern of LASTING) {
      const match = pattern.exec(sentence);
      if (!match?.groups?.s) continue;
      const clean = match.groups.s.split(/\s+/).join(" ").replace(/^[\s,;:.!-]+|[\s,;:.!-]+$/g, "").slice(0, SENTENCE_MAX);
      if (clean.length < 6) continue;
      if (found.some((f) => identity(f).includes(identity(clean)) || identity(clean).includes(identity(f)))) continue;
      found.push(clean);
    }
  }
  return found;
}

export interface Proposal {
  id: string;
  kind: "memory" | "skill";
  /** memory: the person's own words. */
  text?: string;
  /** skill: a draft to edit. */
  skill?: { name: string; description: string; body: string };
  warnings: string[];
  from: { threadId: string; title: string };
  createdAt: string;
}

type State = { id: "state"; scanned: Record<string, number>; decided: string[]; lastSweep?: string };

type Message = { role?: string; content?: unknown };
const textOf = (m: Message) => (typeof m.content === "string" ? m.content : "");

export const acceptInput = z.object({
  /** The person may fix the line before saving. */
  text: z.string().trim().min(1).max(2000).optional(),
  skill: z.object({ name: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,47}$/), description: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20_000) }).optional(),
});

export class ProposalService {
  constructor(
    private readonly db: Store,
    private readonly threads: Pick<ThreadStore, "list" | "history">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async state(owner: string): Promise<State> {
    return (await this.db.get<State>(owner, STATE, "state")) ?? { id: "state", scanned: {}, decided: [] };
  }

  async pending(owner: string): Promise<Proposal[]> {
    return (await this.db.list<Proposal>(owner, KIND)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Read conversations that went quiet since they were last read, and queue what they suggest. */
  async sweep(owner: string): Promise<number> {
    const state = await this.state(owner);
    const now = this.now().getTime();
    if (state.lastSweep && now - Date.parse(state.lastSweep) < QUIET_MS) return 0;
    const queued = await this.pending(owner);
    const known = new Set([...queued.filter((p) => p.text).map((p) => identity(p.text!)), ...state.decided]);
    const saved = new Set((await this.db.list<{ text?: string }>(owner, "memories")).map((m) => identity(m.text ?? "")));
    let added = 0;
    let pendingCount = queued.length;
    for (const thread of (await this.threads.list(owner, { limit: SCAN_THREADS })).threads) {
      if (now - Date.parse(thread.updatedAt) < QUIET_MS) continue;
      const messages = (await this.threads.history(owner, thread.id)).messages as Message[];
      const through = state.scanned[thread.id] ?? 0;
      if (messages.length <= through) continue;
      let here = 0;
      for (const message of messages.slice(through)) {
        if (message.role !== "user") continue; // never the assistant's replies
        for (const sentence of statements(textOf(message))) {
          const { text, count } = redactSecrets(sentence);
          const key = identity(text);
          if (count || known.has(key) || saved.has(key)) continue;
          if (pendingCount >= MAX_PENDING || here >= MAX_PER_CONVERSATION) break;
          const title = (thread.name ?? "a chat").split(/\s+/).join(" ").slice(0, 60);
          await this.db.put<Proposal>(owner, KIND, {
            id: randomUUID(),
            kind: "memory",
            text,
            warnings: [],
            from: { threadId: thread.id, title },
            createdAt: this.now().toISOString(),
          });
          known.add(key);
          added += 1;
          here += 1;
          pendingCount += 1;
        }
      }
      state.scanned[thread.id] = messages.length;
    }
    await this.db.put(owner, STATE, { ...state, lastSweep: this.now().toISOString() });
    return added;
  }

  /** A skill draft from the last finished exchange in one conversation. Saved only as a suggestion. */
  async draftSkill(owner: string, threadId: string): Promise<Proposal> {
    const messages = (await this.threads.history(owner, threadId)).messages as Message[];
    let answerAt = -1;
    for (let i = messages.length - 1; i >= 0; i--)
      if (messages[i]?.role === "assistant" && textOf(messages[i]!).trim()) {
        answerAt = i;
        break;
      }
    let askAt = -1;
    for (let i = answerAt - 1; i >= 0; i--)
      if (messages[i]?.role === "user" && textOf(messages[i]!).trim()) {
        askAt = i;
        break;
      }
    if (answerAt < 0 || askAt < 0) throw new AppError("Finish a request with a reply first, then ask me to turn it into a skill.", 409);
    if ((await this.pending(owner)).length >= MAX_PENDING) throw new AppError("You have a lot of suggestions waiting. Look through them first.", 409);
    // Redact before cutting, so a secret split by the limit cannot leak its start.
    const asked = redactSecrets(textOf(messages[askAt]!));
    const answered = redactSecrets(textOf(messages[answerAt]!));
    const cut = (text: string, max: number) => new TextDecoder().decode(new TextEncoder().encode(text).slice(0, max)).replace(/�$/, "");
    const truncated = new TextEncoder().encode(asked.text).length > 3000 || new TextEncoder().encode(answered.text).length > 6000;
    const request = cut(asked.text, 3000);
    const result = cut(answered.text, 6000);
    const description = request.split(/\s+/).join(" ").slice(0, 160);
    const name = description.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "") || "my-skill";
    // Quoted so the source cannot close a code block by accident.
    const reference = result.split("\n").map((line) => `> ${line}`).join("\n");
    const body = `## Purpose
${request}

## Required inputs
- Replace this with what a new run needs. Do not reuse the old run's details without saying so.

## Steps
1. Write the steps that can be reused, from the reply below. Replace one-off details with inputs.

## Checks
- Check the result against the inputs and say what is missing or out of date.

## Output
Describe how you want the answer to look next time.

## Approval
Taps still apply. Ask before anything that leaves Daksha; this skill gives no permission.

## The reply it came from: read before reuse
This finished reply is reference, not checked instructions. Remove private or one-off details before saving.

${reference}
`;
    const warnings = ["Read and change the steps before saving. One good reply does not make a skill that always works."];
    warnings.push(...skillWarnings(`${request}\n${result}`));
    if (truncated) warnings.push("The source was cut to fit. Read the whole conversation before you rely on it.");
    if (asked.count + answered.count) warnings.push("Something that looked like a password or key was replaced.");
    const proposal: Proposal = {
      id: randomUUID(),
      kind: "skill",
      skill: { name, description, body },
      warnings,
      from: { threadId, title: "this chat" },
      createdAt: this.now().toISOString(),
    };
    await this.db.put(owner, KIND, proposal);
    return proposal;
  }

  /** The person said yes. A memory goes to What Daksha knows; a skill to their skills. */
  async accept(owner: string, id: string, raw: unknown) {
    const edits = acceptInput.parse(raw ?? {});
    const proposal = await this.take(owner, id);
    const at = this.now().toISOString();
    if (proposal.kind === "memory") {
      const { text, count } = redactSecrets(edits.text ?? proposal.text ?? "");
      if (count) throw new AppError("That looks like it holds a password or key. Take it out first.", 422);
      const memory = { id: createHash("sha256").update(`proposal\n${identity(text)}`).digest("hex"), text, source: `You said this in "${proposal.from.title}" and chose to keep it`, createdAt: at };
      await this.db.insertIfAbsent(owner, "memories", memory);
      return { saved: "memory" as const, memory };
    }
    const skill = edits.skill ?? proposal.skill!;
    const body = redactSecrets(skill.body).text;
    const saved = { id: randomUUID(), name: skill.name, description: redactSecrets(skill.description).text, body, source: "skill draft you approved", createdAt: at };
    await this.db.put(owner, "skills", saved);
    return { saved: "skill" as const, skill: saved };
  }

  async reject(owner: string, id: string) {
    await this.take(owner, id);
    return { ok: true };
  }

  private async take(owner: string, id: string): Promise<Proposal> {
    const proposal = await this.db.get<Proposal>(owner, KIND, id);
    if (!proposal) throw new AppError("That suggestion is gone.", 404);
    await this.db.remove(owner, KIND, id);
    const state = await this.state(owner);
    if (proposal.text) state.decided = [...state.decided, identity(proposal.text)].slice(-MAX_DECIDED);
    await this.db.put(owner, STATE, state);
    return proposal;
  }
}

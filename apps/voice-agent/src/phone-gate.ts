// The first part of every phone call: no brain, no memories, nothing personal until the
// caller has said the right PIN (see phone.ts for why). This is plain code with fixed lines,
// so nothing the caller says can talk its way past it.
import { type llm, voice } from "@livekit/agents";
import { ReadableStream } from "node:stream/web";
import { type CheckAnswer, spokenDigits, type StartAnswer } from "./phone.ts";

export const LINES = {
  askPin: "Hi, it's Daksha. To keep this private, please say your PIN, one digit at a time.",
  askPinOutbound: "Hi, it's Daksha calling. To keep this private, please say your PIN, one digit at a time.",
  askCode: "Hi, it's Daksha. Please say the six-digit code the app shows you, one digit at a time.",
  unknown: "Hi, it's Daksha. I don't know this number yet. To link it, open Settings, then Phone, in the Daksha app. Goodbye.",
  noPin: "Hi, it's Daksha. This number is linked, but there's no PIN yet. Set one in Settings, then Phone, in the app, and call again. Goodbye.",
  noDigits: "Sorry, I didn't catch any numbers. Please say the digits one at a time.",
  wrongPin: "That PIN didn't match. Please try again.",
  wrongCode: "That code didn't match. Please check the app and try again.",
  locked: "That's too many tries, so I've paused this number for a while. Goodbye.",
  verifiedAskPin: "Thanks, your number is linked. Now please say your PIN.",
  verifiedNoPin: "Thanks, your number is linked. Set a PIN in the app under Phone, then call again. Goodbye.",
  trouble: "Sorry, I can't check that right now. Please try again later. Goodbye.",
  tooManyEmpty: "I couldn't hear the numbers. Please call again when it's quieter. Goodbye.",
} as const;

export type Step = { say: string; then: "listen" | "hangup" | { userId: string } };

export type Checker = {
  code(callToken: string, digits: string): Promise<CheckAnswer | null>;
  pin(callToken: string, digits: string): Promise<CheckAnswer | null>;
};

/** What to ask for, and what to do with each thing the caller says. */
export class PhoneGate {
  #ask: "pin" | "code" | "done";
  #empty = 0;
  readonly #token: string;
  readonly #check: Checker;

  constructor(start: StartAnswer, check: Checker) {
    this.#token = start.callToken;
    this.#check = check;
    this.#ask = start.ask === "code" ? "code" : start.ask === "pin" ? "pin" : "done";
  }

  /** The first line of the call. */
  static opening(start: StartAnswer, outbound: boolean): Step {
    if (start.ask === "pin") return { say: outbound ? LINES.askPinOutbound : LINES.askPin, then: "listen" };
    if (start.ask === "code") return { say: LINES.askCode, then: "listen" };
    return { say: start.ask === "no-pin" ? LINES.noPin : LINES.unknown, then: "hangup" };
  }

  async hear(text: string): Promise<Step> {
    if (this.#ask === "done") return { say: LINES.trouble, then: "hangup" };
    const digits = spokenDigits(text);
    if (!digits) {
      this.#empty += 1;
      return this.#empty >= 3 ? { say: LINES.tooManyEmpty, then: "hangup" } : { say: LINES.noDigits, then: "listen" };
    }
    if (this.#ask === "code") {
      const answer = await this.#check.code(this.#token, digits);
      if (!answer) return this.#stop(LINES.trouble);
      if (answer.locked) return this.#stop(LINES.locked);
      if (!answer.ok) return { say: LINES.wrongCode, then: "listen" };
      if (!answer.pinSet) return this.#stop(LINES.verifiedNoPin);
      this.#ask = "pin";
      return { say: LINES.verifiedAskPin, then: "listen" };
    }
    const answer = await this.#check.pin(this.#token, digits);
    if (!answer) return this.#stop(LINES.trouble);
    if (answer.locked) return this.#stop(LINES.locked);
    if (!answer.ok || !answer.userId) return { say: LINES.wrongPin, then: "listen" };
    this.#ask = "done";
    return { say: "", then: { userId: answer.userId } };
  }

  #stop(say: string): Step {
    this.#ask = "done";
    return { say, then: "hangup" };
  }
}

/**
 * The LiveKit side of the gate: each time the caller finishes speaking, the gate decides the
 * reply. When the PIN is right, `onVerified` swaps in Daksha's usual voice agent.
 */
export class PhoneGateAgent extends voice.Agent {
  readonly #gate: PhoneGate;
  readonly #onStep: (step: Step) => void;

  constructor(gate: PhoneGate, onStep: (step: Step) => void) {
    super({ instructions: "Daksha's phone check. Replies come from fixed lines, not a model." });
    this.#gate = gate;
    this.#onStep = onStep;
  }

  override async llmNode(
    chatCtx: llm.ChatContext,
    _toolCtx: llm.ToolContext,
    _modelSettings: voice.ModelSettings,
  ): Promise<ReadableStream<string>> {
    const last = [...chatCtx.items].reverse().find((item) => item.type === "message" && item.role === "user");
    const heard = last?.type === "message" ? (last.textContent ?? "") : "";
    const step = await this.#gate.hear(heard);
    this.#onStep(step);
    return new ReadableStream<string>({
      start(controller) {
        if (step.say) controller.enqueue(step.say);
        controller.close();
      },
    });
  }
}

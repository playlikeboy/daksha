// The live call as a plain object, with no screens in it.
//
// It owns the voice connection (microphone, LiveKit room, Debo's audio) and what
// the call shows (state, captions, sources). The app creates one of these above
// every screen (see debo-talk-session.tsx). The full-screen popup and the small
// bar shown while the call is minimised both read it, so collapsing the popup, or
// moving between Chat, Journal, Apps and the rest, never touches the call.
//
// What ends a call, and nothing else: `end()` (the End button), the other side
// hanging up or the connection closing, and `dispose()` (signing out). The
// microphone is turned off in all three. There is deliberately no method for
// "close the popup" here: that is not the call's business.
import type { FuseApi } from "./api";
import type { AgentState, VoiceChip, VoiceConnection, VoiceHandlers, VoiceLevels } from "./debo-voice-engine";

export type TalkStatus = "idle" | "connecting" | "live" | "ended" | "error";
export interface TalkLine {
  id: string;
  who: "you" | "debo";
  text: string;
  sources: VoiceChip[];
}
export interface TalkState {
  status: TalkStatus;
  /** A call is connecting or live: the microphone may be on, so it must stay visible. */
  active: boolean;
  micOn: boolean;
  agentState: AgentState;
  reconnecting: boolean;
  lines: TalkLine[];
  problem: string;
  /** The person is making sound right now. For the ring around Debo. */
  youActive: boolean;
}

export type TalkEngine = (api: FuseApi, handlers: VoiceHandlers) => Promise<VoiceConnection>;

export interface TalkDeps {
  api: FuseApi;
  engine: TalkEngine;
  /** Plain words for a call that could not start. */
  describeError(error: unknown): string;
  /** A short message on screen ("The conversation ended. Microphone off."). */
  notify(text: string): void;
  /** Audio levels, for Debo's face and the halo. */
  onLevels?(levels: VoiceLevels): void;
}

const MIC_BLOCKED = "Debo can't use your microphone. Allow it in your settings, or type to Debo below.";

/** The words under Debo. Short, and always true to what is happening. */
export function stateWords(input: Pick<TalkState, "status" | "micOn" | "agentState" | "reconnecting">): string {
  const { status, micOn, agentState, reconnecting } = input;
  if (status === "idle") return "Tap to start";
  if (status === "connecting") return "Connecting…";
  if (status === "ended") return "Conversation ended";
  if (status === "error") return "Not connected";
  if (reconnecting) return "Trying to reconnect…";
  if (agentState === "speaking") return "Debo is speaking";
  if (agentState === "thinking") return "Thinking…";
  if (!micOn) return "Microphone off";
  if (agentState === "listening") return "Listening";
  return "Getting ready…";
}

/** What a screen reader hears. It says the microphone state every time. */
export function spokenStatus(input: Pick<TalkState, "status" | "micOn" | "agentState" | "reconnecting">): string {
  const { status, micOn, agentState, reconnecting } = input;
  const agentWords: Record<string, string> = {
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    initializing: "Getting ready",
  };
  return status === "idle"
    ? "Microphone off. Debo is not listening."
    : status === "connecting"
      ? "Connecting. Microphone off for now."
      : status === "ended"
        ? "Conversation ended. Microphone off."
        : status === "error"
          ? "Not connected. Microphone off."
          : reconnecting
            ? "Trying to reconnect."
            : micOn
              ? `Microphone on. ${agentWords[agentState] ?? "Waiting for Debo to join"}.`
              : "Microphone off. Debo can't hear you, but you can type.";
}

/** The label of the minimised bar: always whether the microphone is on, and how to open it. */
export function pillLabel(state: Pick<TalkState, "status" | "micOn" | "agentState" | "reconnecting">): string {
  return `Talking with Debo. ${spokenStatus(state)} Tap to open the conversation.`;
}

/** Reviews Debo prepared that wait for a tap on screen. Voice can never give that yes. */
export function reviewsWaiting<T extends { status: string }>(actions: readonly T[]): T[] {
  return actions.filter((a) => a.status === "awaiting_review");
}

export class TalkCall {
  private state: TalkState = {
    status: "idle",
    active: false,
    micOn: false,
    agentState: "",
    reconnecting: false,
    lines: [],
    problem: "",
    youActive: false,
  };
  private connection: VoiceConnection | undefined;
  private cancelStart = false;
  private popupIsOpen = false;
  private disposed = false;
  /** end() is running: the engine's own "ended" callback is ours, not the other side hanging up. */
  private ending = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: TalkDeps) {}

  // ---- Reading ----

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = (): TalkState => this.state;

  private set(patch: Partial<TalkState>) {
    const next = { ...this.state, ...patch };
    next.active = next.status === "live" || next.status === "connecting";
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }

  // ---- The call ----

  async start(): Promise<void> {
    if (this.state.active || this.disposed) return;
    this.cancelStart = false;
    this.set({ problem: "", lines: [], status: "connecting" });
    try {
      const next = await this.deps.engine(this.deps.api, {
        onLine: (id, who, text) => this.upsert(id, who, text),
        onSources: (chips) => this.attachSources(chips),
        onAgentState: (agentState) => this.set({ agentState }),
        onLevels: (levels) => {
          this.deps.onLevels?.(levels);
          const talking = this.state.youActive ? levels.you > 0.04 : levels.you > 0.1;
          if (talking !== this.state.youActive) this.set({ youActive: talking });
        },
        onConnection: (state) => this.set({ reconnecting: state === "reconnecting" }),
        onEnded: () => this.remoteEnded(),
      });
      if (this.cancelStart || this.disposed) {
        void next.end().catch(() => {});
        return;
      }
      this.connection = next;
      this.set({
        micOn: !next.microphoneBlocked,
        status: "live",
        problem: next.microphoneBlocked ? MIC_BLOCKED : "",
      });
    } catch (error) {
      this.set({ micOn: false, status: "error", problem: this.deps.describeError(error) });
    }
  }

  /** The connection closed by itself: Debo hung up, or the network is gone. */
  private remoteEnded() {
    if (this.ending) return;
    this.connection = undefined;
    if (this.state.status === "error") return;
    if (this.popupIsOpen) {
      this.set({ micOn: false, reconnecting: false, agentState: "", status: "ended" });
      return;
    }
    // Nobody is looking at the popup: say so, and be ready for the next call.
    this.set({ micOn: false, reconnecting: false, agentState: "", lines: [], status: "idle" });
    this.deps.notify("The conversation ended. Microphone off.");
  }

  async toggleMicrophone(): Promise<void> {
    const next = !this.state.micOn;
    try {
      await this.connection?.setMicrophone(next);
      this.set({ micOn: next, problem: "" });
    } catch {
      this.set({ micOn: false, problem: MIC_BLOCKED });
    }
  }

  async send(text: string): Promise<void> {
    const clean = text.trim();
    if (!clean || !this.connection) return;
    this.upsert(`typed-${Date.now()}`, "you", clean);
    await this.connection.sendText(clean).catch(() => this.set({ problem: "That message didn't send. Try again." }));
  }

  async stopDebo(): Promise<void> {
    await this.connection?.stopDebo();
  }

  /** Hang up. The microphone turns off and the room closes. */
  async end(): Promise<void> {
    this.cancelStart = true;
    this.ending = true;
    const open = this.connection;
    this.connection = undefined;
    try {
      await open?.end().catch(() => {});
    } finally {
      this.ending = false;
    }
    this.set({ micOn: false, reconnecting: false, agentState: "", lines: [], status: "idle", youActive: false });
    this.deps.onLevels?.({ you: 0, debo: 0, real: false });
  }

  /** Signing out or leaving the app screen for good. Ends the call without a message. */
  dispose() {
    this.disposed = true;
    this.cancelStart = true;
    const open = this.connection;
    this.connection = undefined;
    void open?.end().catch(() => {});
  }

  /** Counterpart of dispose(), for a mount that comes straight after an unmount (React's strict mode). */
  revive() {
    this.disposed = false;
  }

  /** Forget a finished call so the popup starts fresh. Does nothing during a call. */
  reset() {
    if (this.state.active) return;
    this.set({ status: "idle", problem: "", lines: [], micOn: false });
  }

  setProblem(problem: string) {
    this.set({ problem });
  }

  /** The popup says whether it is open, so a call that ends in the background is announced. */
  popupOpen(open: boolean) {
    this.popupIsOpen = open;
  }

  // ---- What the call shows ----

  private upsert(id: string, who: TalkLine["who"], text: string) {
    const all = this.state.lines;
    const at = all.findIndex((line) => line.id === id);
    this.set({
      lines: at === -1 ? [...all, { id, who, text, sources: [] }] : all.map((line, i) => (i === at ? { ...line, text } : line)),
    });
  }

  // Sources belong to Debo's answer to the latest question. Show them right under it.
  private attachSources(chips: VoiceChip[]) {
    const all = this.state.lines;
    const lastYou = all.map((line) => line.who).lastIndexOf("you");
    if (lastYou === -1 || chips.length === 0) return;
    const next = [...all];
    next.splice(lastYou + 1, 0, { id: `sources-${Date.now()}`, who: "debo", text: "", sources: chips });
    this.set({ lines: next });
  }
}

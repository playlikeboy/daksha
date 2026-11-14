// Holds the live call above the screens (see debo-talk-call.ts for the call itself).
//
// Mount one TalkSessionProvider high in the app, above every screen. The popup
// (debo-talk.tsx) and the minimised bar (debo-talk-pill.tsx) read it with
// useTalkSession(). Because it sits above the screens, moving between Chat,
// Journal, Apps and the rest does not touch the call. Unmounting it (signing
// out) ends the call and turns the microphone off.
import { createContext, type ReactNode, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { type TalkEngine, TalkCall, type TalkState } from "./debo-talk-call";
import { deboLevels, deboMood } from "./debo-mood-store";
import { startProblem, startVoice } from "./debo-voice-engine";
import { useWorkspace } from "./workspace";

export type { TalkLine, TalkState, TalkStatus } from "./debo-talk-call";
export { pillLabel, spokenStatus, stateWords } from "./debo-talk-call";

/** How often the workspace is refreshed during a call, so a review Debo prepared shows up. */
const REVIEW_REFRESH_MS = 6000;

const Context = createContext<TalkCall | undefined>(undefined);

export function TalkSessionProvider({
  children,
  engine = startVoice,
}: {
  children: ReactNode;
  /** The voice connection to use. Only the developer gallery passes a different one. */
  engine?: TalkEngine;
}) {
  const { api, notify, refresh } = useWorkspace();
  const latest = useRef({ api, notify, engine });
  latest.current = { api, notify, engine };
  const call = useRef<TalkCall | undefined>(undefined);
  if (!call.current) {
    call.current = new TalkCall({
      get api() {
        return latest.current.api;
      },
      engine: (a, handlers) => latest.current.engine(a, handlers),
      describeError: startProblem,
      notify: (text) => latest.current.notify(text),
      onLevels: (levels) => {
        deboLevels.debo.setValue(levels.debo);
        deboLevels.you.setValue(levels.you);
        deboLevels.real.setValue(levels.real ? 1 : 0);
      },
    });
  }
  const current = call.current;

  const state = useSyncExternalStore(current.subscribe, current.getSnapshot, current.getSnapshot);
  const live = state.status === "live";

  // The face follows the call, also while the popup is collapsed.
  useEffect(() => {
    const agent = state.agentState === "initializing" ? "" : state.agentState;
    deboMood.emit({ type: "voice", state: live && !state.reconnecting && agent ? agent : "idle" });
  }, [state.agentState, live, state.reconnecting]);

  // A review Debo prepares during the call (anything that sends, posts or changes) needs a tap on
  // screen. Keep the workspace fresh so the minimised bar can show it.
  useEffect(() => {
    if (!state.active) return;
    const timer = setInterval(() => void refresh().catch(() => {}), REVIEW_REFRESH_MS);
    return () => clearInterval(timer);
  }, [state.active, refresh]);

  // Web: tell the browser or the operating system there is a call, so its media controls and the
  // tab say so. Switching tabs or minimising the window does not touch the call; closing the tab does.
  useEffect(() => {
    if (Platform.OS !== "web" || !state.active) return;
    const session = (globalThis.navigator as Navigator | undefined)?.mediaSession;
    const Metadata = (globalThis as { MediaMetadata?: new (init: { title: string; artist: string }) => MediaMetadata })
      .MediaMetadata;
    if (!session || !Metadata) return;
    try {
      session.metadata = new Metadata({ title: "Talking with Debo", artist: "Microphone on" });
      session.playbackState = "playing";
    } catch {
      // Not every browser allows it. The call does not depend on it.
    }
    return () => {
      try {
        session.metadata = null;
        session.playbackState = "none";
      } catch {
        // Nothing to clean up.
      }
    };
  }, [state.active]);

  // Leaving for good (signing out) ends the call.
  useEffect(() => {
    current.revive();
    return () => current.dispose();
  }, [current]);

  return <Context.Provider value={current}>{children}</Context.Provider>;
}

/** The call itself, for actions (start, end, microphone, send). */
export function useTalkCall(): TalkCall {
  const call = useContext(Context);
  if (!call) throw new Error("useTalkCall needs a TalkSessionProvider above it.");
  return call;
}

/** What the call shows right now. Re-renders when it changes. */
export function useTalkState(): TalkState {
  const call = useTalkCall();
  return useSyncExternalStore(call.subscribe, call.getSnapshot, call.getSnapshot);
}

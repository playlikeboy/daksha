// Phone: keep the screen on while something is recording (expo-keep-awake).
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect } from "react";

const TAG = "debo-recording";

export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active) return;
    void activateKeepAwakeAsync(TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(TAG).catch(() => {});
    };
  }, [active]);
}

/** The phone has no tab to close. Leaving the recorder asks first (its back button, see debo-recorder.tsx). */
export function useWarnBeforeLeaving(_active: boolean) {}

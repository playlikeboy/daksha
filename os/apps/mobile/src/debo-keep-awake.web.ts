// Web: keep the screen on while something is recording (the Screen Wake Lock API).
// Browsers without it simply let the screen sleep as usual.
import { useEffect } from "react";

type WakeLock = { release(): Promise<void> };
type WakeLockApi = { request(type: "screen"): Promise<WakeLock> };

export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const api = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;
    if (!api) return;
    let lock: WakeLock | undefined;
    let done = false;
    const take = () => {
      void api
        .request("screen")
        .then((next) => {
          if (done) void next.release().catch(() => {});
          else lock = next;
        })
        .catch(() => {});
    };
    take();
    // The browser drops the lock when the tab is hidden: take it again on return.
    const again = () => document.visibilityState === "visible" && take();
    document.addEventListener("visibilitychange", again);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", again);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

/** Ask before the tab is closed or reloaded while `active`. The browser shows its own words. */
export function useWarnBeforeLeaving(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}

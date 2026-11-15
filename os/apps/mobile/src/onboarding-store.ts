// Whether the welcome steps are open, so the menu can open them again from anywhere.
// Whether the person has seen them lives on the server (GET /api/onboarding), so it
// follows them to every device; this only holds "open right now".
import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

export const onboarding = {
  open() {
    open = true;
    emit();
  },
  close() {
    open = false;
    emit();
  },
  isOpen: () => open,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useOnboardingOpen() {
  return useSyncExternalStore(onboarding.subscribe, onboarding.isOpen, onboarding.isOpen);
}

/** The reply of GET /api/onboarding. */
export interface OnboardingReply {
  onboarding: { status: "finished" | "skipped"; updatedAt: string } | null;
}

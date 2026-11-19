// Plain words for the status values the server sends ("awaiting_review", "succeeded"),
// so a chip or a line never shows a raw code. Unknown values are tidied, not hidden.
const words: Record<string, string> = {
  // Actions that need a yes (send an email, add an event).
  awaiting_review: "Waiting for your yes",
  executing: "Doing it now",
  succeeded: "Done",
  failed: "Didn't work",
  outcome_unknown: "Not sure it worked",
  denied: "You said no",
  cancelled: "Stopped",
  expired: "Ran out of time",
  // Tasks.
  queued: "Waiting to start",
  running: "Working on it",
  waiting_approval: "Waiting for your yes",
  waiting_input: "Needs a detail from you",
  // Steps and browser sessions.
  pending: "Not started",
  done: "Done",
  skipped: "Skipped",
  active: "Open",
  idle: "Paused",
  closed: "Closed",
  error: "Something went wrong",
};

/** "awaiting_review" becomes "Waiting for your yes"; an unknown "some_thing" becomes "Some thing". */
export function statusWords(value: string): string {
  return words[value] ?? value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

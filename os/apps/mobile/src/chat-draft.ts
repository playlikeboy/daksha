// Words waiting to be put into the chat's message box, so Home or a quick action can start
// a message ("Make a picture of ") without sending it. The chat picks them up, puts them
// in the box and moves the caret there. Nothing is sent until the person presses Send.
type Listener = (text: string) => void;
let waiting: string | undefined;
const listeners = new Set<Listener>();

export const chatDraft = {
  /** Put these words in the message box (now, or as soon as the chat is on screen). */
  set(text: string) {
    waiting = text;
    for (const listener of listeners) listener(text);
  },
  /** The chat calls this to take the words; they are given out once. */
  take(): string | undefined {
    const text = waiting;
    waiting = undefined;
    return text;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

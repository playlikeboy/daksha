// Web: nothing to do. A browser tab keeps its call while it is open, and the
// tab and the media controls already show it (see debo-talk-session.tsx).
export async function keepCallRunning(_onEnd: () => void): Promise<() => Promise<void>> {
  return async () => {};
}

/**
 * What a list screen shows. "Nothing here yet" only once the list has loaded and is
 * really empty; before that it shows that it is loading, so it never flashes empty.
 */
export function listState(loaded: boolean, count: number): "loading" | "empty" | "list" {
  if (count > 0) return "list";
  return loaded ? "empty" : "loading";
}

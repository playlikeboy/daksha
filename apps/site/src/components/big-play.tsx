import { PlayIcon } from "./icons";

// The big round play button drawn over a film's poster. Shared by the poster
// (film-player.tsx) and the loaded player (film-player-vjs.tsx), so they match.
export function BigPlay() {
  return (
    <span className="film-player__play" aria-hidden="true">
      <PlayIcon width={28} height={28} fill="currentColor" />
    </span>
  );
}

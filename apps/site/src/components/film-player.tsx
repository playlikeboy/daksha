"use client";

// A film on the page. Until the film comes near the screen, this is only the
// poster and a play button, so the page stays light. Near the screen, it loads
// the real player (film-player-vjs.tsx) in the background and swaps it in.
// Nothing plays by itself: the film starts, with sound, only when pressed.
// Without JavaScript, the poster is a plain link to the film file.
import { type ComponentType, useEffect, useRef, useState } from "react";
import type { Film } from "../media";
import type { ThemedPlayerProps } from "./film-player-vjs";
import { BigPlay } from "./big-play";

type Player = ComponentType<ThemedPlayerProps>;

// One download of the player code, shared by every film on the page.
let playerCode: Promise<Player> | null = null;
function loadPlayer() {
  playerCode ??= import("./film-player-vjs").then((m) => m.default);
  return playerCode;
}

export function FilmPlayer({ film, describedBy }: { film: Film; describedBy: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [Player, setPlayer] = useState<Player | null>(null);
  const [startNow, setStartNow] = useState(false);

  useEffect(() => {
    let live = true;
    const show = () =>
      loadPlayer()
        .then((p) => live && setPlayer(() => p))
        // If the code cannot load, the poster stays a link to the film file.
        .catch(() => {});
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) {
      show();
      return () => {
        live = false;
      };
    }
    // Start loading about a screen before the film scrolls into view.
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          watch.disconnect();
          show();
        }
      },
      { rootMargin: "800px 0px" },
    );
    watch.observe(el);
    return () => {
      live = false;
      watch.disconnect();
    };
  }, []);

  return (
    <div ref={box} className="film-player">
      {Player ? (
        <Player film={film} describedBy={describedBy} startNow={startNow} />
      ) : (
        <a
          className="film-player__poster"
          href={film.mp4}
          aria-label={`Play ${film.title}`}
          aria-describedby={describedBy}
          onClick={(event) => {
            event.preventDefault();
            setStartNow(true);
            loadPlayer()
              .then((p) => setPlayer(() => p))
              // The player could not load, so open the film file instead.
              .catch(() => window.location.assign(film.mp4));
          }}
        >
          {/* The film's own poster, decorative: the link's label says what it is. */}
          <img src={film.poster} alt="" width={film.width} height={film.height} loading="lazy" decoding="async" />
          <BigPlay />
        </a>
      )}
    </div>
  );
}

"use client";

// The real player, built on Video.js (see DESIGN.md for why). This file and its
// stylesheet are only fetched when a film comes near the screen: film-player.tsx
// imports it on demand, so the rest of the page never loads player code.
import "@videojs/react/video/neutral-skin.css";
import { PlayButton } from "@videojs/react";
import { NeutralVideoSkin, Video, VideoPlayer } from "@videojs/react/video";
import { useEffect, useRef } from "react";
import type { Film } from "../media";
import { BigPlay } from "./big-play";

export type ThemedPlayerProps = {
  film: Film;
  // The id of the hidden paragraph that describes the film for screen readers.
  describedBy: string;
  // True when the person pressed play before the player had loaded.
  startNow: boolean;
};

export default function ThemedPlayer({ film, describedBy, startNow }: ThemedPlayerProps) {
  const media = useRef<HTMLVideoElement>(null);

  // The person already pressed play on the poster: keep their place and start
  // the film with sound. If the browser wants a second press, the play button
  // is right there, so a refusal is not an error.
  useEffect(() => {
    if (!startNow) return;
    const video = media.current;
    if (!video) return;
    video.closest<HTMLElement>('[role="group"]')?.focus({ preventScroll: true });
    video.play().catch(() => {});
  }, [startNow]);

  return (
    <VideoPlayer poster={film.poster} title={film.title}>
      <NeutralVideoSkin className="film-player__skin">
        <Video
          ref={media}
          playsInline
          // Nothing of the film is downloaded until the person presses play.
          preload="none"
          width={film.width}
          height={film.height}
          aria-label={film.title}
          aria-describedby={describedBy}
        >
          <source src={film.mp4} type="video/mp4" />
          <source src={film.webm} type="video/webm" />
          {film.captions ? (
            <track kind="subtitles" src={film.captions.src} srcLang="en" label={film.captions.label} />
          ) : null}
        </Video>
        {/* The same big play button as the poster in film-player.tsx, so nothing jumps when the
            player arrives. It goes away once the film has started; the control bar has its own. */}
        <PlayButton className="film-player__big" label={`Play ${film.title}`}>
          <BigPlay />
        </PlayButton>
      </NeutralVideoSkin>
    </VideoPlayer>
  );
}

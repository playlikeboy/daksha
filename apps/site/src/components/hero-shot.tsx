"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND } from "../brand";

// The app screenshot inside the hero's phone. Home is the best first look, but
// its file may not be on the site yet, so the picture falls back, in order, to
// the next file that exists. All are 780x1688 (docs/MEDIA.md), and the frame
// keeps that shape in CSS, so a fallback never moves the page.
// Each alt says exactly what that picture shows; change it with the file.
const SHOTS = [
  {
    src: "/shots/home.webp",
    alt: `The ${BRAND} app's Home screen: a greeting that asks how ${BRAND} can help, a box to ask anything, and tiles for the main things you can do.`,
  },
  {
    src: "/shots/journal.webp",
    alt: `The ${BRAND} journal: a writing box that asks what happened today, with buttons to speak, record a voice note or a video, and save the entry.`,
  },
  {
    src: "/shots/journal-light.webp",
    alt: `The ${BRAND} journal: a writing box that asks what happened today, with buttons to speak, record a voice note or a video, and save the entry.`,
  },
];

export function HeroShot() {
  const [index, setIndex] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // A file that failed before React started never fires onError again, so check once on mount.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setIndex((i) => Math.min(i + 1, SHOTS.length - 1));
  }, []);

  const shot = SHOTS[index] ?? SHOTS[SHOTS.length - 1];
  return (
    <img
      ref={imgRef}
      key={shot.src}
      src={shot.src}
      alt={shot.alt}
      width={780}
      height={1688}
      fetchPriority="high"
      decoding="async"
      onError={() => setIndex((i) => Math.min(i + 1, SHOTS.length - 1))}
    />
  );
}

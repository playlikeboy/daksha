"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __revealReady?: boolean;
  }
}

// Runs once, after React has taken over the page:
// - shows each [data-reveal] block as it scrolls into view (site.css draws the
//   movement, and skips it when the person asks for reduced motion);
// - gives the header a thin line once the page has scrolled.
// Only server-rendered blocks carry data-reveal, so React never re-renders the
// class this adds.
export function RevealScript() {
  useEffect(() => {
    window.__revealReady = true;
    const blocks = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    let observer: IntersectionObserver | undefined;
    if ("IntersectionObserver" in window) {
      // A block hidden with clip-path has no visible area, so the browser never
      // sees it arrive. For those, watch the block's parent instead.
      const watched = new Map<Element, HTMLElement[]>();
      for (const block of blocks) {
        const target = block.dataset.reveal === "clip" && block.parentElement ? block.parentElement : block;
        watched.set(target, [...(watched.get(target) ?? []), block]);
      }
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              for (const block of watched.get(entry.target) ?? []) block.classList.add("is-in");
              observer?.unobserve(entry.target);
            }
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
      );
      for (const target of watched.keys()) observer.observe(target);
    } else {
      for (const block of blocks) block.classList.add("is-in");
    }

    const header = document.querySelector(".site-header");
    const onScroll = () => header?.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}

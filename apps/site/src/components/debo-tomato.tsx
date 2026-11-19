"use client";

import { useEffect, useRef } from "react";

// Daksha, the red tomato: the same shapes as public/debo.svg (the master drawing
// is docs/assets/debo.svg), drawn inline so parts of it can move.
// - The eyes follow the pointer. This is the page's one playful moment.
// - It breathes, blinks and its leaves sway (site.css).
// - Pressing it makes it hop.
// With reduced motion, all of that stops and the eyes rest in the centre.
// It is decoration, so screen readers skip it.
const MAX_LOOK = 6; // how far the eyes move, in drawing units (the drawing is 240 wide)

export function DeboTomato({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const eyes = eyesRef.current;
    if (!svg || !eyes) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    function look(x: number, y: number) {
      if (!svg || !eyes || still.matches) return;
      const box = svg.getBoundingClientRect();
      const dx = x - (box.left + box.width / 2);
      const dy = y - (box.top + box.height * 0.55);
      const distance = Math.hypot(dx, dy) || 1;
      const pull = Math.min(1, distance / 320);
      const tx = (dx / distance) * MAX_LOOK * pull;
      const ty = (dy / distance) * MAX_LOOK * 0.7 * pull;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        eyes.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`;
      });
    }

    const onMove = (event: PointerEvent) => look(event.clientX, event.clientY);
    const onLeave = () => {
      eyes.style.transform = "";
    };
    const onMotionChange = () => {
      if (still.matches) eyes.style.transform = "";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    still.addEventListener("change", onMotionChange);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      still.removeEventListener("change", onMotionChange);
    };
  }, []);

  function hop() {
    const svg = svgRef.current;
    if (!svg) return;
    svg.classList.remove("is-hopping");
    // Reading layout restarts the animation when it is pressed again quickly.
    void svg.getBoundingClientRect();
    svg.classList.add("is-hopping");
  }

  return (
    <svg
      ref={svgRef}
      className={`debo-svg ${className ?? ""}`}
      viewBox="0 0 240 240"
      width="240"
      height="240"
      aria-hidden="true"
      focusable="false"
      onPointerDown={hop}
      onAnimationEnd={(event) => {
        if (event.animationName === "hop") svgRef.current?.classList.remove("is-hopping");
      }}
    >
      <ellipse cx="120" cy="226" rx="70" ry="8" fill="#1b1b1b" opacity="0.14" />
      <g className="debo-body">
        <path
          d="M120 66C150 52 204 60 221 118C234 174 190 218 120 218C50 218 6 174 19 118C36 60 90 52 120 66Z"
          fill="#e5392b"
        />
        <path
          d="M221 118C234 174 190 218 120 218C62 218 22 188 17 142C40 190 100 200 150 186C196 172 214 150 221 118Z"
          fill="#c42a20"
        />
        <ellipse cx="56" cy="112" rx="17" ry="8" fill="#ffffff" opacity="0.4" transform="rotate(-48 56 112)" />
        <circle cx="45" cy="134" r="4.5" fill="#ffffff" opacity="0.4" />
        <g className="debo-leaves">
          <g fill="#3f9b45">
            <path d="M120 66C108 58 84 56 64 70C86 76 106 76 120 66Z" />
            <path d="M120 66C132 58 156 56 176 70C154 76 134 76 120 66Z" />
            <path d="M120 66C102 66 82 78 76 96C98 94 114 84 120 66Z" />
            <path d="M120 66C138 66 158 78 164 96C142 94 126 84 120 66Z" />
          </g>
          <path d="M120 70C112 82 114 96 120 104C126 96 128 82 120 70Z" fill="#2f7d33" />
          <path
            d="M120 70C119 56 122 46 130 38"
            fill="none"
            stroke="#2f7d33"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </g>
        <ellipse cx="60" cy="158" rx="16" ry="10" fill="#ffb0a8" opacity="0.85" />
        <ellipse cx="180" cy="158" rx="16" ry="10" fill="#ffb0a8" opacity="0.85" />
        <g ref={eyesRef} className="debo-eyes">
          <ellipse cx="88" cy="136" rx="13" ry="16" fill="#1b1b1b" />
          <circle cx="93" cy="130" r="5" fill="#ffffff" />
          <circle cx="84" cy="142" r="2.2" fill="#ffffff" />
          <ellipse cx="152" cy="136" rx="13" ry="16" fill="#1b1b1b" />
          <circle cx="157" cy="130" r="5" fill="#ffffff" />
          <circle cx="148" cy="142" r="2.2" fill="#ffffff" />
        </g>
        <g className="debo-lids" fill="#e5392b">
          <ellipse cx="88" cy="136" rx="20" ry="21" />
          <ellipse cx="152" cy="136" rx="20" ry="21" />
        </g>
        <path
          d="M106 158Q120 174 134 158"
          fill="none"
          stroke="#1b1b1b"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
